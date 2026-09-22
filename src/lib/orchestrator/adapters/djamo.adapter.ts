import {
    IPaymentProvider,
    PaymentRequest,
    PaymentResponse,
    PaymentStatus,
    WebhookResult
} from '../types';

/**
 * Djamo Business : https://docs.djamo.com/
 *
 * Encaissement de compte Djamo a compte Djamo : on cree une demande (charge),
 * Djamo renvoie un lien, l'acheteur l'ouvre, confirme dans son application,
 * puis Djamo le ramene chez nous. Aucun numero de telephone a saisir.
 *
 * - Un compte Djamo Business est ouvert PAR PAYS, chacun avec son hote :
 *   Cote d'Ivoire (api-civ) ou Senegal (api-sen). Le pays vient de la passerelle.
 * - En-tetes : Authorization: Bearer <access token, prefixe at_> et
 *   X-company-Id: <identifiant d'entreprise>.
 * - Montants entiers, XOF seulement. Une demande impayee expire au bout d'une
 *   heure (etat « dropped »).
 * - Webhook signe (x-djamo-hmac-sha256, base64), verifie dans lib/webhook-verify.ts.
 */
interface DjamoConfig {
    token: string;
    companyId?: string;
    pays?: string;
    webhookSecret?: string;
    mode?: 'test' | 'live';
}

const HOTES: Record<string, { live: string; test: string }> = {
    CI: { live: 'https://api-civ.djamo.com', test: 'https://apibusiness-staging-civ.djamo.io' },
    SN: { live: 'https://api-sen.djamo.com', test: 'https://apibusiness-staging-sen.djamo.io' },
};

export class DjamoAdapter implements IPaymentProvider {
    readonly name = 'Djamo';
    private base: string;

    constructor(private config: DjamoConfig) {
        const pays = String(config.pays || 'CI').toUpperCase();
        const hote = HOTES[pays] || HOTES.CI;
        this.base = `${config.mode === 'test' ? hote.test : hote.live}/v1`;
    }

    private entetes() {
        return {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${this.config.token || ''}`,
            ...(this.config.companyId ? { 'X-company-Id': this.config.companyId } : {}),
        };
    }

    /** Etats d'une demande : created, due, paid, refunded, refunded_partially, dropped. */
    private statut(brut: any): PaymentStatus {
        const s = String(brut || '').toLowerCase();
        if (s === 'paid' || s === 'refunded' || s === 'refunded_partially') return 'SUCCESS';
        if (s === 'dropped' || s === 'failed' || s === 'canceled' || s === 'cancelled') return 'FAILED';
        return 'PENDING';
    }

    private message(data: any): string {
        const m = data?.message || data?.error || data?.errors;
        if (Array.isArray(m)) return m.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(', ');
        if (m && typeof m === 'object') return JSON.stringify(m);
        return typeof m === 'string' ? m : '';
    }

    async initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
        const echec = (error: string, rawData?: any): PaymentResponse => ({
            transactionId: request.orderId, providerReference: '', status: 'FAILED', rawData: { ...(rawData || {}), error },
        });
        const devise = (request.currency || 'XOF').toUpperCase();
        if (devise !== 'XOF') return echec(`Djamo n'encaisse qu'en XOF (paiement demandé en ${devise})`);
        try {
            const corps = {
                amount: Math.round(request.amount),
                externalId: request.orderId,
                description: request.metadata?.description || `Paiement ${request.orderId}`,
                onCompletedRedirectionUrl: request.returnUrl,
                onCanceledRedirectionUrl: request.cancelUrl || request.returnUrl,
                metadata: { orderId: request.orderId },
            };
            const reponse = await fetch(`${this.base}/charges`, {
                method: 'POST', headers: this.entetes(), body: JSON.stringify(corps), signal: AbortSignal.timeout(20000),
            });
            const data: any = await reponse.json().catch(() => ({}));
            if (reponse.status === 401 || reponse.status === 403) {
                return echec(`Djamo a refusé les identifiants (${this.message(data) || reponse.status})`, data);
            }
            const d = data?.data || data || {};
            if (!reponse.ok || !d.paymentUrl) {
                return echec(this.message(data) || `Djamo a répondu ${reponse.status}`, data);
            }
            return {
                transactionId: request.orderId,
                providerReference: d.id,
                status: 'PENDING',
                checkoutUrl: d.paymentUrl,
                // Lien d'application : notre page l'affiche (bouton, QR code) et surveille l'etat.
                rawData: { ...data, _application: 'Djamo' },
            };
        } catch (error: any) {
            console.error('[Djamo] initiatePayment error:', error);
            return echec(error?.message || 'Djamo injoignable');
        }
    }

    async verifyPayment(providerReference: string): Promise<PaymentResponse> {
        try {
            const reponse = await fetch(`${this.base}/charges/${encodeURIComponent(providerReference)}`, {
                headers: this.entetes(), signal: AbortSignal.timeout(20000),
            });
            const data: any = await reponse.json().catch(() => ({}));
            const d = data?.data || data || {};
            if (!reponse.ok) {
                return { transactionId: providerReference, providerReference, status: 'PENDING', rawData: { ...data, error: this.message(data) || `Djamo a répondu ${reponse.status}` } };
            }
            return {
                transactionId: d.externalId || providerReference,
                providerReference: d.id || providerReference,
                status: this.statut(d.status),
                rawData: data,
            };
        } catch (error: any) {
            return { transactionId: providerReference, providerReference, status: 'PENDING', rawData: { error: error?.message } };
        }
    }

    /** Evenement charge/events : { id, externalId, status, amount, paid, ... }, parfois sous data. */
    async handleWebhook(payload: any): Promise<WebhookResult> {
        const d = payload?.data || payload?.charge || payload || {};
        return {
            transactionId: d.externalId || '',
            providerReference: d.id || '',
            status: this.statut(d.status),
            rawData: payload,
        };
    }

    async validateCredentials(): Promise<{ success: boolean; message?: string }> {
        if (!this.config.token) return { success: false, message: 'Access Token Djamo requis' };
        try {
            // Une demande inexistante : seul le refus d'authentification compte.
            const reponse = await fetch(`${this.base}/charges/cartflox-verification`, { headers: this.entetes(), signal: AbortSignal.timeout(15000) });
            if (reponse.status === 401 || reponse.status === 403) {
                const data: any = await reponse.json().catch(() => ({}));
                return { success: false, message: `Djamo refuse ces identifiants (${this.message(data) || reponse.status})` };
            }
            return { success: true };
        } catch (error: any) {
            return { success: false, message: `Djamo injoignable : ${error?.message || 'réseau'}` };
        }
    }
}
