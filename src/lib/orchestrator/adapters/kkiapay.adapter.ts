import {
    IPaymentProvider,
    PaymentRequest,
    PaymentResponse,
    PaymentStatus,
    WebhookResult
} from '../types';
import crypto from 'crypto';

/**
 * Kkiapay Payment Provider Adapter
 * Documentation: https://docs.kkiapay.me/
 * 
 * Supported Countries:
 * - Benin (Primary)
 * - Togo
 * - Côte d'Ivoire
 * 
 * Payment Methods:
 * - Mobile Money (MTN, Moov, Flooz)
 * - Cards (Visa, MasterCard)
 */

interface KkiapayConfig {
    publicKey: string;
    privateKey: string;
    secret: string;
    mode?: 'test' | 'live';
}

const API_KKIAPAY = { sandbox: 'https://api-sandbox.kkiapay.me', live: 'https://api.kkiapay.me' };
const DELAI_KKIAPAY_MS = 15_000;

/**
 * Ce que faisait le SDK @kkiapay-org/nodejs-sdk, en fetch : un POST JSON
 * authentifie par trois en-tetes. Le SDK tirait axios (versions vulnerables)
 * pour ce seul appel, et testait le code 4003 de Kkiapay contre le statut
 * HTTP : toute erreur devenait « Transaction Not Found ».
 */
async function appelKkiapay(config: KkiapayConfig, chemin: string, corps: unknown): Promise<{ http: number; donnees: any }> {
    const base = config.mode === 'live' ? API_KKIAPAY.live : API_KKIAPAY.sandbox;
    const r = await fetch(`${base}${chemin}`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-api-key': config.publicKey || '',
            'x-secret-key': config.secret || '',
            'x-private-key': config.privateKey || '',
        },
        body: JSON.stringify(corps),
        signal: AbortSignal.timeout(DELAI_KKIAPAY_MS),
    });
    const texte = await r.text();
    let donnees: any = null;
    try { donnees = texte ? JSON.parse(texte) : null; } catch { donnees = { brut: texte.slice(0, 300) }; }
    return { http: r.status, donnees };
}

export class KkiapayAdapter implements IPaymentProvider {
    readonly name = 'Kkiapay';
    private config: KkiapayConfig;

    constructor(config: KkiapayConfig) {
        this.config = config;
    }




    /**
     * Kkiapay is primarily widget-based. 
     * We return a standard widget URL that can be used for redirection.
     */
    async initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
        try {
            const data = {
                amount: request.amount,
                key: this.config.publicKey,
                callback: request.returnUrl,
                sandbox: this.config.mode !== 'live',
                phone: request.customerPhone,
                name: request.customerName,
                email: request.customerEmail,
                transaction_id: `KK_${request.orderId}_${Date.now()}`,
                metadata: JSON.stringify({
                    orderId: request.orderId,
                    ...request.metadata
                })
            };

            // Structure the widget URL
            // Format: https://widget.kkiapay.me/?amount=xxx&url=...&key=...&sandbox=true
            const params = new URLSearchParams({
                amount: data.amount.toString(),
                key: data.key || this.config.publicKey,
                callback: data.callback,
                sandbox: data.sandbox.toString(),
                phone: data.phone || '',
                name: data.name || '',
                email: data.email || '',
                partner_id: data.transaction_id
            });


            const checkoutUrl = `https://widget.kkiapay.me/?${params.toString()}`;

            return {
                transactionId: data.transaction_id,
                providerReference: '',
                status: 'PENDING' as PaymentStatus,
                checkoutUrl,
                rawData: data,
            };
        } catch (error: any) {
            console.error('[Kkiapay] initiatePayment error:', error);
            return {
                transactionId: '',
                providerReference: '',
                status: 'FAILED' as PaymentStatus,
                rawData: { error: error.message },
            };
        }
    }

    /**
     * Statut d'une transaction chez Kkiapay. Une erreur d'appel revient en
     * rawData.error : applyVerificationResult l'ignore, elle ne fait jamais
     * passer un paiement en echec.
     */
    async verifyPayment(providerReference: string): Promise<PaymentResponse> {
        const erreur = (message: string): PaymentResponse => ({
            transactionId: providerReference,
            providerReference,
            status: 'FAILED' as PaymentStatus,
            rawData: { error: message },
        });
        if (!providerReference) return erreur('Référence Kkiapay manquante');
        try {
            // providerReference : l'identifiant de transaction Kkiapay rendu apres paiement.
            const { http, donnees } = await appelKkiapay(this.config, '/api/v1/transactions/status', { transactionId: providerReference });
            if (http < 200 || http >= 300) return erreur(donnees?.reason ? String(donnees.reason) : `Kkiapay HTTP ${http}`);

            let status: PaymentStatus = 'PENDING';
            if (donnees?.status === 'SUCCESS') {
                status = 'SUCCESS';
            } else if (donnees?.status === 'FAILED') {
                status = 'FAILED';
            }

            return {
                transactionId: providerReference,
                providerReference,
                status,
                rawData: donnees,
            };
        } catch (error: any) {
            return erreur(error?.name === 'TimeoutError' ? 'Kkiapay injoignable (délai dépassé)' : (error?.message || 'Kkiapay injoignable'));
        }
    }

    /**
     * Process Kkiapay webhook
     */
    async handleWebhook(payload: any, headers?: any): Promise<WebhookResult> {
        try {
            // Verify signature if secret is provided
            // Kkiapay uses x-kkiapay-secret header which is HMAC-SHA256(payload, secret)
            if (headers && headers['x-kkiapay-secret'] && this.config.secret) {
                const signature = headers['x-kkiapay-secret'];
                const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
                const hmac = crypto.createHmac('sha256', this.config.secret);
                const digest = hmac.update(body).digest('hex');

                if (signature !== digest) {
                    throw new Error('Invalid Kkiapay webhook signature');
                }
            }

            const transactionId = payload.transactionId || payload.transaction_id;
            const status = payload.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED';

            return {
                transactionId,
                providerReference: transactionId,
                status: status as PaymentStatus,
                rawData: payload,
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
     * Validate credentials (limited check with Kkiapay)
     */
    async validateCredentials(): Promise<{ success: boolean; message?: string }> {
        try {
            if (!this.config.publicKey || !this.config.privateKey) {
                return { success: false, message: 'Public Key and Private Key are required' };
            }

            // Pas d'appel « ping » chez Kkiapay : on demande le statut d'une
            // transaction qui n'existe pas. Des cles refusees repondent HTTP 401
            // (code 4003 « Invalid API KEY », constate le 23/09/2026) ; des cles
            // acceptees repondent autre chose, la transaction etant inconnue.
            // Avant, le SDK avalait l'erreur et toute cle passait pour valide.
            const { http, donnees } = await appelKkiapay(this.config, '/api/v1/transactions/status', { transactionId: 'cartflox-verification-cles' });
            if (http === 401 || http === 403) {
                const mode = this.config.mode === 'live' ? 'production' : 'test (sandbox)';
                return { success: false, message: `Kkiapay refuse ces clés en mode ${mode}${donnees?.reason ? ` : ${donnees.reason}` : ''}.` };
            }
            return { success: true };
        } catch (error: any) {
            return { success: false, message: 'Kkiapay injoignable, réessayez dans un instant.' };
        }
    }
}
