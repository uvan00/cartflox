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
        const token = String(this.config.token || '').trim();
        const companyId = String(this.config.companyId || '').trim();
        return {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...(companyId ? { 'X-Company-Id': companyId } : {}),
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

    /**
     * Lit la reponse. Devant l'API, Djamo a un pare-feu Cloudflare qui repond
     * 403 avec une page HTML (« Sorry, you have been blocked ») quand l'adresse
     * IP de l'appelant n'est pas admise, ce qui arrive surtout sur staging. Ce
     * 403 ne dit RIEN des cles : on le distingue du 403 JSON de l'API.
     */
    private async lire(reponse: Response): Promise<{ data: any; bloque: boolean }> {
        const texte = await reponse.text().catch(() => '');
        let data: any = {};
        try { data = texte ? JSON.parse(texte) : {}; } catch { data = {}; }
        const html = /^\s*</.test(texte) || /text\/html/i.test(reponse.headers.get('content-type') || '');
        const bloque = reponse.status === 403 && html && /cloudflare|you have been blocked|attention required/i.test(texte);
        return { data, bloque };
    }

    private get environnement() {
        return this.config.mode === 'test' ? 'test (staging)' : 'production';
    }

    /** Message lisible pour un refus d'acces (401, 403, blocage du pare-feu). */
    private refus(status: number, data: any, bloque: boolean): string {
        if (bloque) {
            // ADRESSES_IP_SORTIE : les adresses du serveur a donner a Djamo (IPv4 ET
            // IPv6 : Node sort en IPv6 quand il le peut), ex. « 203.0.113.7 et 2001:db8::7 ».
            const adresses = String(process.env.ADRESSES_IP_SORTIE || '').trim();
            return `Le pare-feu de Djamo bloque l'adresse IP du serveur sur l'environnement ${this.environnement} `
                + `(${this.base.replace(/\/v1$/, '')}) : vos clés ne sont pas en cause. Demandez à votre contact Djamo Business `
                + `d'autoriser ${adresses || "l'adresse IP publique du serveur"}, puis vérifiez à nouveau.`;
        }
        const detail = this.message(data) || String(status);
        if (status === 401) {
            const conseil = this.config.mode === 'test'
                ? "Si Djamo vous a remis des clés de production, choisissez le mode Live"
                : "Si ce sont les clés de test remises par Djamo, choisissez le mode Test : elles ne fonctionnent que sur staging";
            return `Djamo ne reconnaît pas cet Access Token en ${this.environnement} (${detail}). ${conseil}`;
        }
        return `Djamo refuse l'accès avec ces identifiants (${detail}) : vérifiez le Company ID et les droits du token`;
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
            const { data, bloque } = await this.lire(reponse);
            if (reponse.status === 401 || reponse.status === 403) {
                return echec(this.refus(reponse.status, data, bloque), data);
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
            const { data, bloque } = await this.lire(reponse);
            const d = data?.data || data || {};
            if (!reponse.ok) {
                const error = bloque || reponse.status === 401 ? this.refus(reponse.status, data, bloque) : (this.message(data) || `Djamo a répondu ${reponse.status}`);
                return { transactionId: providerReference, providerReference, status: 'PENDING', rawData: { ...data, error } };
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
        const token = String(this.config.token || '').trim();
        if (!token) return { success: false, message: 'Access Token Djamo requis' };
        if (!String(this.config.companyId || '').trim()) return { success: false, message: 'Company ID Djamo requis' };
        try {
            // Une demande inexistante : seul le refus d'authentification compte.
            const reponse = await fetch(`${this.base}/charges/cartflox-verification`, { headers: this.entetes(), signal: AbortSignal.timeout(15000) });
            if (reponse.status === 401 || reponse.status === 403) {
                const { data, bloque } = await this.lire(reponse);
                return { success: false, message: this.refus(reponse.status, data, bloque) };
            }
            return { success: true };
        } catch (error: any) {
            return { success: false, message: `Djamo injoignable : ${error?.message || 'réseau'}` };
        }
    }
}
