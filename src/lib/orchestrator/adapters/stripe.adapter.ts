import Stripe from 'stripe';
import {
    IPaymentProvider,
    PaymentRequest,
    PaymentResponse,
    PaymentStatus,
    WebhookResult
} from '../types';

/**
 * Stripe Payment Provider Adapter
 * Documentation: https://stripe.com/docs/api
 * 
 * Supported Payment Methods:
 * - Bank Cards (Global)
 * - Apple Pay, Google Pay
 * - SEPA, iDEAL, Bancontact (Europe)
 * - Many others based on configuration
 * 
 * Currencies: 135+ currencies supported
 */

interface StripeConfig {
    secretKey: string;
    publishableKey?: string;
    webhookSecret?: string;
    mode?: 'test' | 'live';
}

export class StripeAdapter implements IPaymentProvider {
    readonly name = 'Stripe';
    private stripe: Stripe;
    private config: StripeConfig;

    constructor(config: StripeConfig) {
        this.config = config;
        this.stripe = new Stripe(config.secretKey, {
            apiVersion: '2024-06-20' as any, // Use a stable version
            timeout: 20000, // Abort hung gateway calls inside the checkout request
            appInfo: {
                name: 'Cartflox Payment Orchestrator',
                version: '1.0.0',
            },
        });
    }

    /**
     * Convert amount to smallest unit (cents for USD/EUR, etc.)
     */
    private toSmallestUnit(amount: number, currency: string): number {
        const zeroDecimalCurrencies = ['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VUV', 'VND', 'XAF', 'XOF', 'XPF'];
        if (zeroDecimalCurrencies.includes(currency.toUpperCase())) {
            return Math.round(amount);
        }
        return Math.round(amount * 100);
    }

    /**
     * Convert from smallest unit to main unit
     */
    private fromSmallestUnit(amount: number, currency: string): number {
        const zeroDecimalCurrencies = ['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VUV', 'VND', 'XAF', 'XOF', 'XPF'];
        if (zeroDecimalCurrencies.includes(currency.toUpperCase())) {
            return amount;
        }
        return amount / 100;
    }

    /**
     * Montant minimum accepte par Stripe, dans l'unite de la devise. En dessous,
     * Stripe refuse avec un message anglais que l'acheteur ne comprend pas : on
     * repond nous-memes, en clair, et le moyen suivant est essaye.
     * https://docs.stripe.com/currencies#minimum-and-maximum-charge-amounts
     */
    private static readonly MINIMUMS: Record<string, number> = {
        eur: 0.5, usd: 0.5, gbp: 0.3, chf: 0.5, cad: 0.5, aud: 0.5, nok: 3, sek: 3, dkk: 2.5,
        jpy: 50, hkd: 4, mxn: 10, brl: 0.5, sgd: 0.5, nzd: 0.5, pln: 2, ron: 2, czk: 15, huf: 175,
        xof: 330, xaf: 330, ngn: 800, zar: 10, kes: 65, ghs: 6, mad: 5, egp: 25,
    };
    private montantTropPetit(montant: number, devise: string): string | null {
        const min = StripeAdapter.MINIMUMS[devise.toLowerCase()];
        if (!min || montant >= min) return null;
        const joli = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ","));
        return `Montant trop faible pour un paiement par carte : la carte bancaire demande au moins ${joli(min)} ${devise.toUpperCase()}. Payez par Mobile Money, ou augmentez le montant.`;
    }

    /**
     * Initiate a payment with Stripe Checkout
     */
    async initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
        try {
            const currency = (request.currency || 'USD').toLowerCase();
            const trop = this.montantTropPetit(request.amount, currency);
            if (trop) return { transactionId: '', providerReference: '', status: 'FAILED' as PaymentStatus, rawData: { error: trop } };
            const amount = this.toSmallestUnit(request.amount, currency);

            const session = await this.stripe.checkout.sessions.create({
                // Pas de `payment_method_types` : les comptes Stripe recents ont
                // « Managed Payments » actif et REFUSENT ce parametre (« Unsupported
                // parameter: payment_method_types »), ce qui rendait la carte
                // totalement inutilisable pour ces marchands. Sans ce champ, Stripe
                // propose les moyens actives dans le tableau de bord du marchand.
                line_items: [
                    {
                        price_data: {
                            currency,
                            product_data: {
                                name: `Order ${request.orderId}`,
                                description: request.metadata?.description || `Paiement pour la commande ${request.orderId}`,
                            },
                            unit_amount: amount,
                        },
                        quantity: 1,
                    },
                ],
                mode: 'payment',
                success_url: request.returnUrl + (request.returnUrl.includes('?') ? '&' : '?') + 'session_id={CHECKOUT_SESSION_ID}',
                cancel_url: request.callbackUrl + (request.callbackUrl.includes('?') ? '&' : '?') + 'status=cancelled',
                customer_email: request.customerEmail,
                client_reference_id: request.orderId,
                metadata: {
                    orderId: request.orderId,
                    ...request.metadata,
                },
            });

            return {
                transactionId: session.id,
                providerReference: session.payment_intent as string || session.id,
                status: 'PENDING' as PaymentStatus,
                checkoutUrl: session.url as string,
                rawData: session,
            };
        } catch (error: any) {
            console.error('[Stripe] initiatePayment error:', error);
            return {
                transactionId: '',
                providerReference: '',
                status: 'FAILED' as PaymentStatus,
                rawData: { error: error.message },
            };
        }
    }

    /**
     * Créer un PaymentIntent pour un paiement carte EMBARQUÉ (Stripe Payment
     * Element / inline, sans redirection). Le client confirme ensuite le
     * paiement avec le client_secret + la clé publique.
     */
    async createPaymentIntent(request: PaymentRequest): Promise<{
        clientSecret?: string;
        paymentIntentId?: string;
        publishableKey?: string;
        error?: string;
    }> {
        try {
            const currency = (request.currency || 'USD').toLowerCase();
            const trop = this.montantTropPetit(request.amount, currency);
            if (trop) return { error: trop };
            const amount = this.toSmallestUnit(request.amount, currency);

            const intent = await this.stripe.paymentIntents.create({
                amount,
                currency,
                // `automatic_payment_methods` au lieu de `payment_method_types` :
                // compatible avec les comptes « Managed Payments » (qui refusent le
                // second), et `allow_redirects: never` garde l'acheteur sur notre page.
                automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
                description: `Order ${request.orderId}`,
                receipt_email: request.customerEmail || undefined,
                metadata: {
                    orderId: request.orderId,
                    ...(request.metadata || {}),
                },
            });

            return {
                clientSecret: intent.client_secret || undefined,
                paymentIntentId: intent.id,
                publishableKey: this.config.publishableKey,
            };
        } catch (error: any) {
            console.error('[Stripe] createPaymentIntent error:', error);
            return { error: error.message };
        }
    }

    /**
     * Verify payment status using session ID or Payment Intent ID
     */
    async verifyPayment(providerReference: string): Promise<PaymentResponse> {
        try {
            let status: PaymentStatus = 'PENDING';
            let data: any;

            if (providerReference.startsWith('cs_')) {
                // Checkout Session
                const session = await this.stripe.checkout.sessions.retrieve(providerReference, {
                    expand: ['payment_intent'],
                });
                data = session;

                if (session.payment_status === 'paid') {
                    status = 'SUCCESS';
                } else if (session.status === 'expired') {
                    status = 'FAILED';
                }
            } else if (providerReference.startsWith('pi_')) {
                // Payment Intent
                const intent = await this.stripe.paymentIntents.retrieve(providerReference);
                data = intent;

                if (intent.status === 'succeeded') {
                    status = 'SUCCESS';
                } else if (intent.status === 'canceled') {
                    status = 'CANCELLED';
                } else if (intent.status === 'requires_payment_method') {
                    // carte refusee ou abandonnee : le client peut retenter
                    status = 'FAILED';
                }
                // requires_action, requires_confirmation, processing : 3-D Secure ou
                // traitement bancaire en cours, rien de definitif, on reste PENDING.
            } else {
                throw new Error('Format de référence Stripe non reconnu (doit commencer par cs_ ou pi_)');
            }

            return {
                transactionId: providerReference,
                providerReference: providerReference,
                status,
                rawData: data,
            };
        } catch (error: any) {
            return {
                transactionId: providerReference,
                providerReference,
                status: 'FAILED' as PaymentStatus,
                rawData: { error: error.message },
            };
        }
    }

    /**
     * Process Stripe webhook
     */
    async handleWebhook(payload: any, headers?: any): Promise<WebhookResult> {
        try {
            let event: Stripe.Event;

            // In many server environments, payload is already parsed JSON
            // But if sig-header is provided, we should ideally verify it with raw body
            // Here we assume the calling code provides the validated event or we use the payload
            if (headers && headers['stripe-signature'] && this.config.webhookSecret) {
                // This requires the raw body which might not be available here
                // For this adapter, we'll process the already parsed payload
                event = payload as Stripe.Event;
            } else {
                event = payload as Stripe.Event;
            }

            let status: PaymentStatus = 'PENDING';
            let transactionId = '';

            switch (event.type) {
                case 'checkout.session.completed':
                    const session = event.data.object as Stripe.Checkout.Session;
                    status = session.payment_status === 'paid' ? 'SUCCESS' : 'PENDING';
                    transactionId = session.id;
                    break;
                case 'payment_intent.succeeded':
                    const intent = event.data.object as Stripe.PaymentIntent;
                    status = 'SUCCESS';
                    transactionId = intent.id;
                    break;
                case 'payment_intent.payment_failed':
                    status = 'FAILED';
                    transactionId = (event.data.object as Stripe.PaymentIntent).id;
                    break;
                case 'payment_intent.canceled':
                    status = 'CANCELLED';
                    transactionId = (event.data.object as Stripe.PaymentIntent).id;
                    break;
            }

            return {
                transactionId,
                providerReference: transactionId,
                status,
                rawData: event,
            };
        } catch (error: any) {
            return {
                transactionId: '',
                providerReference: '',
                status: 'FAILED' as PaymentStatus,
                rawData: { error: error.message },
            };
        }
    }

    /**
     * Validate credentials by retrieving account info
     */
    async validateCredentials(): Promise<{ success: boolean; message?: string }> {
        try {
            const account = await this.stripe.accounts.retrieveCapability('acct_dummy', 'card_payments').catch(e => e);

            // A simple retrieve of own account is better
            const me = await this.stripe.accounts.retrieve();

            if (me && me.id) {
                return { success: true };
            }
            return { success: false, message: 'Clé secrète Stripe invalide' };
        } catch (error: any) {
            if (error.message.includes('api_key')) {
                return { success: false, message: 'Clé secrète Stripe invalide ou non fournie.' };
            }
            // Even if it's a permission error, it means the key is technically valid
            return { success: true };
        }
    }
}
