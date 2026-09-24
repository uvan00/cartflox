import {
    IPaymentProvider,
    PaymentRequest,
    PaymentResponse,
    PaymentStatus,
    WebhookResult
} from '../types';

/**
 * PayPal, par l'API Orders v2 (page hebergee).
 * Documentation : https://developer.paypal.com/docs/api/orders/v2/
 *
 * - initiatePayment cree une commande (intent CAPTURE) et renvoie le lien
 *   « payer-action » : l'acheteur paie avec son compte PayPal ou une carte,
 *   puis revient sur notre page de retour.
 * - verifyPayment relit la commande et la CAPTURE si elle est approuvee : la
 *   capture est idempotente (une commande deja capturee est relue). C'est
 *   ainsi que le sondage de la page de retour, le cron et le webhook
 *   finalisent le paiement, sans croire le corps d'un webhook.
 * - refundPayment rembourse la capture de la commande.
 *
 * Devises : PayPal n'encaisse ni le XOF ni le XAF ; l'initiation convertit
 * la zone franc en euros (parite fixe) et les autres devises inconnues en
 * dollars, voir devisePourPayPal.
 */
interface PayPalConfig {
    clientId: string;
    clientSecret: string;
    webhookId?: string;
    mode?: 'test' | 'live';
}

/** Les devises que PayPal accepte (liste officielle des Orders v2). */
export const DEVISES_PAYPAL = new Set([
    'AUD', 'BRL', 'CAD', 'CNY', 'CZK', 'DKK', 'EUR', 'HKD', 'HUF', 'ILS', 'JPY', 'MYR',
    'MXN', 'TWD', 'NZD', 'NOK', 'PHP', 'PLN', 'GBP', 'SGD', 'SEK', 'CHF', 'THB', 'USD',
]);
const SANS_CENTIMES = new Set(['HUF', 'JPY', 'TWD']);

/** La devise dans laquelle PayPal encaisse : la meme s'il la connait, l'euro pour la zone franc, le dollar sinon. */
export function devisePourPayPal(devise: string): string {
    const d = String(devise || '').toUpperCase();
    if (DEVISES_PAYPAL.has(d)) return d;
    if (d === 'XOF' || d === 'XAF') return 'EUR';
    return 'USD';
}

const DELAI_MS = 20_000;

export class PayPalAdapter implements IPaymentProvider {
    readonly name = 'PayPal';
    private config: PayPalConfig;
    private jeton: { valeur: string; expire: number } | null = null;

    constructor(config: PayPalConfig) {
        this.config = config;
    }

    private get base(): string {
        return this.config.mode === 'test' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
    }

    /** Jeton OAuth (client_credentials), garde en memoire jusqu'a 30 s avant son expiration. */
    private async jetonAcces(): Promise<string> {
        if (this.jeton && this.jeton.expire > Date.now() + 30_000) return this.jeton.valeur;
        if (!this.config.clientId || !this.config.clientSecret) throw new Error('PayPal : Client ID et Secret requis');
        const auth = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64');
        const r = await fetch(`${this.base}/v1/oauth2/token`, {
            method: 'POST',
            headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
            body: 'grant_type=client_credentials',
            signal: AbortSignal.timeout(DELAI_MS),
        });
        const d: any = await r.json().catch(() => ({}));
        if (!r.ok || !d?.access_token) {
            throw new Error(d?.error_description || d?.error || `PayPal : identifiants refusés (HTTP ${r.status})`);
        }
        this.jeton = { valeur: String(d.access_token), expire: Date.now() + (Number(d.expires_in) || 3600) * 1000 };
        return this.jeton.valeur;
    }

    private async appel(chemin: string, options: { method?: string; body?: unknown; requestId?: string } = {}): Promise<{ http: number; donnees: any }> {
        const jeton = await this.jetonAcces();
        const entetes: Record<string, string> = { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json', Accept: 'application/json', Prefer: 'return=representation' };
        if (options.requestId) entetes['PayPal-Request-Id'] = options.requestId;
        const r = await fetch(`${this.base}${chemin}`, {
            method: options.method || 'GET',
            headers: entetes,
            body: options.body === undefined ? undefined : JSON.stringify(options.body),
            signal: AbortSignal.timeout(DELAI_MS),
        });
        const texte = await r.text();
        let donnees: any = null;
        try { donnees = texte ? JSON.parse(texte) : null; } catch { donnees = { brut: texte.slice(0, 500) }; }
        return { http: r.status, donnees };
    }

    private static erreurDe(donnees: any, http: number): string {
        const detail = Array.isArray(donnees?.details) && donnees.details[0] ? ` : ${donnees.details[0].issue || ''} ${donnees.details[0].description || ''}`.trimEnd() : '';
        return `${donnees?.message || donnees?.name || donnees?.error_description || donnees?.error || `PayPal HTTP ${http}`}${detail}`;
    }

    private static montant(valeur: number, devise: string): string {
        return SANS_CENTIMES.has(devise) ? String(Math.round(valeur)) : (Math.round(valeur * 100) / 100).toFixed(2);
    }

    /** Statut Cartflox d'une commande PayPal, captures comprises. */
    private static statutCommande(commande: any): PaymentStatus {
        const statut = String(commande?.status || '').toUpperCase();
        const captures: any[] = commande?.purchase_units?.[0]?.payments?.captures || [];
        if (captures.some((c) => String(c?.status).toUpperCase() === 'COMPLETED')) return 'SUCCESS';
        if (captures.length && captures.every((c) => ['DECLINED', 'FAILED'].includes(String(c?.status).toUpperCase()))) return 'FAILED';
        if (statut === 'COMPLETED') return 'SUCCESS';
        if (statut === 'VOIDED') return 'FAILED';
        return 'PENDING';
    }

    private static captureDe(commande: any): string | null {
        const captures: any[] = commande?.purchase_units?.[0]?.payments?.captures || [];
        const faite = captures.find((c) => String(c?.status).toUpperCase() === 'COMPLETED') || captures[0];
        return faite?.id ? String(faite.id) : null;
    }

    async initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
        const echec = (message: string, rawData: any = {}): PaymentResponse => ({ transactionId: '', providerReference: '', status: 'FAILED', rawData: { ...rawData, error: message } });
        const devise = String(request.currency || '').toUpperCase();
        if (!DEVISES_PAYPAL.has(devise)) {
            return echec(`PayPal n'encaisse pas en ${devise} : le paiement doit être converti (EUR ou USD) avant l'initiation.`);
        }
        try {
            const corps = {
                intent: 'CAPTURE',
                purchase_units: [{
                    reference_id: 'default',
                    custom_id: String(request.orderId).slice(0, 127),
                    description: String(request.metadata?.description || `Commande ${request.orderId}`).slice(0, 127),
                    amount: { currency_code: devise, value: PayPalAdapter.montant(request.amount, devise) },
                }],
                payment_source: {
                    paypal: {
                        ...(request.customerEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.customerEmail) ? { email_address: request.customerEmail } : {}),
                        experience_context: {
                            locale: 'fr-FR',
                            landing_page: 'LOGIN',
                            user_action: 'PAY_NOW',
                            shipping_preference: 'NO_SHIPPING',
                            return_url: request.returnUrl,
                            cancel_url: request.cancelUrl || request.returnUrl,
                        },
                    },
                },
            };
            const { http, donnees } = await this.appel('/v2/checkout/orders', { method: 'POST', body: corps, requestId: `${request.orderId}-${Date.now()}` });
            if (http < 200 || http >= 300 || !donnees?.id) {
                console.error('[PayPal] initiatePayment refus :', donnees);
                return echec(PayPalAdapter.erreurDe(donnees, http), donnees);
            }
            const liens: any[] = donnees.links || [];
            const lien = liens.find((l) => l?.rel === 'payer-action')?.href || liens.find((l) => l?.rel === 'approve')?.href;
            if (!lien) return echec('PayPal n\'a pas renvoyé de lien de paiement.', donnees);
            return { transactionId: String(donnees.id), providerReference: String(donnees.id), status: 'PENDING', checkoutUrl: lien, rawData: donnees };
        } catch (error: any) {
            console.error('[PayPal] initiatePayment erreur :', error?.message || error);
            return echec(error?.message || 'PayPal injoignable');
        }
    }

    /**
     * Relit la commande et la capture si l'acheteur l'a approuvee. Une erreur
     * d'appel revient en rawData.error : elle ne fait jamais echouer le paiement.
     */
    async verifyPayment(providerReference: string): Promise<PaymentResponse> {
        const erreur = (message: string): PaymentResponse => ({ transactionId: providerReference, providerReference, status: 'FAILED', rawData: { error: message } });
        if (!providerReference) return erreur('Référence PayPal manquante');
        try {
            let { http, donnees } = await this.appel(`/v2/checkout/orders/${encodeURIComponent(providerReference)}`);
            if (http < 200 || http >= 300) return erreur(PayPalAdapter.erreurDe(donnees, http));
            if (String(donnees?.status).toUpperCase() === 'APPROVED') {
                const capture = await this.appel(`/v2/checkout/orders/${encodeURIComponent(providerReference)}/capture`, { method: 'POST', body: {}, requestId: `capture-${providerReference}` });
                if (capture.http >= 200 && capture.http < 300) {
                    donnees = capture.donnees;
                } else if (capture.http === 422 && String(capture.donnees?.details?.[0]?.issue || '').includes('ALREADY_CAPTURED')) {
                    ({ http, donnees } = await this.appel(`/v2/checkout/orders/${encodeURIComponent(providerReference)}`));
                    if (http < 200 || http >= 300) return erreur(PayPalAdapter.erreurDe(donnees, http));
                } else {
                    // Capture refusee (fonds, risque) : la commande reste approuvee, le
                    // prochain sondage retentera ; on ne conclut pas a un echec definitif.
                    console.warn('[PayPal] capture refusee :', capture.donnees);
                    return { transactionId: providerReference, providerReference, status: 'PENDING', rawData: { ...donnees, capture_refusee: capture.donnees } };
                }
            }
            return {
                transactionId: providerReference,
                providerReference,
                status: PayPalAdapter.statutCommande(donnees),
                rawData: { ...donnees, captureId: PayPalAdapter.captureDe(donnees) },
            };
        } catch (error: any) {
            return erreur(error?.message || 'PayPal injoignable');
        }
    }

    /**
     * Evenement PayPal (webhook). Le corps n'est pas signe localement : la route
     * relit l'etat aupres de PayPal sur notre reference avant toute decision.
     */
    async handleWebhook(payload: any): Promise<WebhookResult> {
        const type = String(payload?.event_type || '').toUpperCase();
        const ressource = payload?.resource || {};
        const commande = ressource?.supplementary_data?.related_ids?.order_id
            || (type.startsWith('CHECKOUT.ORDER') ? ressource?.id : '')
            || '';
        let status: PaymentStatus = 'PENDING';
        if (type === 'PAYMENT.CAPTURE.COMPLETED' || type === 'CHECKOUT.ORDER.COMPLETED') status = 'SUCCESS';
        else if (type === 'PAYMENT.CAPTURE.DENIED' || type === 'PAYMENT.CAPTURE.DECLINED' || type === 'CHECKOUT.ORDER.VOIDED') status = 'FAILED';
        return { transactionId: String(commande), providerReference: String(commande), status, rawData: payload };
    }

    async validateCredentials(): Promise<{ success: boolean; message?: string }> {
        if (!this.config.clientId || !this.config.clientSecret) return { success: false, message: 'Client ID et Secret PayPal requis' };
        try {
            await this.jetonAcces();
            return { success: true };
        } catch (e: any) {
            const mode = this.config.mode === 'test' ? 'sandbox' : 'production';
            return { success: false, message: `PayPal refuse ces identifiants en mode ${mode} : ${e?.message || 'refus'}` };
        }
    }

    /** Rembourse la capture de la commande (totalement, ou du montant demande). */
    async refundPayment(providerReference: string, options?: { amount?: number; currency?: string }): Promise<PaymentResponse> {
        const echec = (message: string, rawData: any = {}): PaymentResponse => ({ transactionId: providerReference, providerReference, status: 'FAILED', rawData: { ...rawData, error: message } });
        try {
            const commande = await this.appel(`/v2/checkout/orders/${encodeURIComponent(providerReference)}`);
            if (commande.http < 200 || commande.http >= 300) return echec(PayPalAdapter.erreurDe(commande.donnees, commande.http));
            const captureId = PayPalAdapter.captureDe(commande.donnees);
            if (!captureId) return echec('Aucune capture à rembourser sur cette commande PayPal.');
            const captureDevise = String(commande.donnees?.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.currency_code || '').toUpperCase();
            // Le montant de la transaction est dans la devise du marchand ; la capture,
            // dans celle de PayPal (EUR pour un paiement en XOF). On ne rembourse un
            // montant partiel que si les devises coincident, sinon on rembourse tout.
            const partiel = options?.amount && options.currency && String(options.currency).toUpperCase() === captureDevise
                ? { amount: { value: PayPalAdapter.montant(options.amount, captureDevise), currency_code: captureDevise } }
                : {};
            const { http, donnees } = await this.appel(`/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, { method: 'POST', body: partiel, requestId: `refund-${captureId}` });
            if (http < 200 || http >= 300 || !donnees?.id) return echec(PayPalAdapter.erreurDe(donnees, http), donnees);
            const statut = String(donnees.status || '').toUpperCase();
            return { transactionId: providerReference, providerReference: String(donnees.id), status: statut === 'COMPLETED' ? 'SUCCESS' : statut === 'CANCELLED' || statut === 'FAILED' ? 'FAILED' : 'PENDING', rawData: donnees };
        } catch (error: any) {
            return echec(error?.message || 'PayPal injoignable');
        }
    }

    async verifyRefund(refundReference: string): Promise<PaymentResponse> {
        try {
            const { http, donnees } = await this.appel(`/v2/payments/refunds/${encodeURIComponent(refundReference)}`);
            if (http < 200 || http >= 300) return { transactionId: refundReference, providerReference: refundReference, status: 'FAILED', rawData: { error: PayPalAdapter.erreurDe(donnees, http) } };
            const statut = String(donnees?.status || '').toUpperCase();
            return { transactionId: refundReference, providerReference: refundReference, status: statut === 'COMPLETED' ? 'SUCCESS' : statut === 'CANCELLED' || statut === 'FAILED' ? 'FAILED' : 'PENDING', rawData: donnees };
        } catch (error: any) {
            return { transactionId: refundReference, providerReference: refundReference, status: 'FAILED', rawData: { error: error?.message || 'PayPal injoignable' } };
        }
    }
}
