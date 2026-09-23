import {
    IPaymentProvider,
    PaymentRequest,
    PaymentResponse,
    PaymentStatus,
    WebhookResult
} from '../types';

/**
 * PayTech (Senegal, Intech) : https://docs.intech.sn/doc_paytech.php
 *
 * Page de paiement hebergee : on demande un jeton, PayTech renvoie l'URL de sa
 * page, l'acheteur y regle avec son operateur, puis PayTech nous previent par
 * IPN (formulaire signe par HMAC, verifie dans lib/webhook-verify.ts).
 *
 * - Cles : API_KEY et API_SECRET en en-tetes, sur chaque appel.
 * - L'environnement « test » de PayTech preleve tout de meme un petit montant
 *   (100 a 150 F) : il ne s'agit pas d'un vrai bac a sable.
 * - Pays : Senegal d'abord, puis Cote d'Ivoire, Mali et Benin. Devises XOF,
 *   EUR, USD, CAD, GBP, MAD.
 */
interface PayTechConfig {
    apiKey: string;
    apiSecret: string;
    mode?: 'test' | 'live';
}

const BASE = 'https://paytech.sn/api';

/** Operateur preselectionne sur la page PayTech, d'apres notre code de moyen. */
const CIBLE: [RegExp, string][] = [
    [/card/, 'Carte Bancaire'],
    [/orange-ci/, 'Orange Money CI'], [/mtn-ci/, 'Mtn Money CI'], [/moov-ci/, 'Moov Money CI'], [/wave-ci/, 'Wave CI'],
    [/orange-ml/, 'Orange Money ML'], [/moov-ml/, 'Moov Money ML'],
    [/mtn-bj/, 'Mtn Money BJ'], [/moov-bj/, 'Moov Money BJ'],
    [/orange/, 'Orange Money'], [/wave/, 'Wave'], [/free/, 'Free Money'], [/wizall/, 'Wizall'], [/e-?money/, 'Emoney'],
];

export class PayTechAdapter implements IPaymentProvider {
    readonly name = 'PayTech';

    constructor(private config: PayTechConfig) {}

    private entetes() {
        return {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'API_KEY': this.config.apiKey || '',
            'API_SECRET': this.config.apiSecret || '',
        };
    }

    /**
     * PayTech ne documente pas la reponse de get-status : on lit les champs
     * usuels et on reconnait l'etat par motif. Un etat inconnu reste en attente,
     * jamais un succes.
     */
    private statut(data: any): PaymentStatus {
        const brut = String(
            data?.type_event || data?.status || data?.payment_status || data?.state || data?.data?.status || data?.payment?.status || ''
        ).toLowerCase();
        // L'echec d'abord : « unpaid », « not_paid », « invalid_token » contiennent
        // « paid » et « valid », ils tombaient en succes.
        if (/cancel|annul|fail|[eé]chec|[eé]chou|reject|refus|expir|unpaid|not_?paid|invalid/.test(brut)) return 'FAILED';
        if (/^(sale_complete|success|succ[eè]s|paid|pay[eé]e?|completed?|valid|validated)$/.test(brut)) return 'SUCCESS';
        return 'PENDING';
    }

    private message(data: any): string {
        const e = data?.errors || data?.error || data?.message;
        if (Array.isArray(e)) return e.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(', ');
        return typeof e === 'string' ? e : '';
    }

    async initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
        const echec = (error: string, rawData?: any): PaymentResponse => ({
            transactionId: request.orderId, providerReference: '', status: 'FAILED', rawData: { ...(rawData || {}), error },
        });
        try {
            const code = String(request.metadata?.methodCode || '').toLowerCase();
            const cible = CIBLE.find(([motif]) => motif.test(code))?.[1];
            const devise = (request.currency || 'XOF').toUpperCase();
            const sansCentimes = devise === 'XOF' || devise === 'XAF';
            const corps: Record<string, any> = {
                item_name: request.metadata?.description || `Commande ${request.orderId}`,
                item_price: sansCentimes ? Math.round(request.amount) : Number(request.amount.toFixed(2)),
                currency: devise,
                ref_command: request.orderId,
                command_name: `Paiement ${request.orderId}`,
                env: this.config.mode === 'test' ? 'test' : 'prod',
                ipn_url: request.callbackUrl,
                success_url: request.returnUrl,
                cancel_url: request.cancelUrl || request.returnUrl,
                custom_field: JSON.stringify({ orderId: request.orderId }),
                ...(cible ? { target_payment: cible } : {}),
            };
            const reponse = await fetch(`${BASE}/payment/request-payment`, {
                method: 'POST', headers: this.entetes(), body: JSON.stringify(corps), signal: AbortSignal.timeout(20000),
            });
            const data: any = await reponse.json().catch(() => ({}));
            if (reponse.status === 401 || reponse.status === 403) {
                return echec(`PayTech a refusé les identifiants (${this.message(data) || reponse.status})`, data);
            }
            const url = data?.redirect_url || data?.redirectUrl;
            if (!reponse.ok || Number(data?.success) !== 1 || !url) {
                return echec(this.message(data) || `PayTech a répondu ${reponse.status}`, data);
            }
            // Numero saisi chez nous et operateur unique : la page PayTech arrive
            // pre-remplie et se soumet toute seule (nac=1), l'acheteur n'a plus qu'a
            // confirmer sur son telephone. Jamais pour la carte, qui se saisit la-bas.
            const chiffres = String(request.customerPhone || '').replace(/\D/g, '');
            let urlFinale = url;
            if (cible && cible !== 'Carte Bancaire' && chiffres) {
                const indicatif = ['221', '225', '223', '229', '226'].find((i) => chiffres.startsWith(i)) || '';
                const q = new URLSearchParams({ pn: `+${chiffres}`, nn: indicatif ? chiffres.slice(indicatif.length) : chiffres, fn: request.customerName || '', tp: cible, nac: '1' });
                urlFinale = `${url}${url.includes('?') ? '&' : '?'}${q.toString()}`;
            }
            return {
                transactionId: request.orderId,
                providerReference: data.token || request.orderId,
                status: 'PENDING',
                checkoutUrl: urlFinale,
                rawData: data,
            };
        } catch (error: any) {
            console.error('[PayTech] initiatePayment error:', error);
            return echec(error?.message || 'PayTech injoignable');
        }
    }

    async verifyPayment(providerReference: string): Promise<PaymentResponse> {
        try {
            const reponse = await fetch(`${BASE}/payment/get-status?token_payment=${encodeURIComponent(providerReference)}`, {
                headers: this.entetes(), signal: AbortSignal.timeout(20000),
            });
            const data: any = await reponse.json().catch(() => ({}));
            if (!reponse.ok) {
                return { transactionId: providerReference, providerReference, status: 'PENDING', rawData: { ...data, error: this.message(data) || `PayTech a répondu ${reponse.status}` } };
            }
            return {
                transactionId: data?.ref_command || data?.data?.ref_command || providerReference,
                providerReference,
                status: this.statut(data),
                rawData: data,
            };
        } catch (error: any) {
            return { transactionId: providerReference, providerReference, status: 'PENDING', rawData: { error: error?.message } };
        }
    }

    /** IPN : formulaire avec type_event (sale_complete / sale_canceled), ref_command, token. */
    async handleWebhook(payload: any): Promise<WebhookResult> {
        const p = payload?.data || payload || {};
        const status: PaymentStatus = p.type_event === 'sale_complete' ? 'SUCCESS'
            : p.type_event === 'sale_canceled' ? 'FAILED'
            : this.statut(p);
        return {
            transactionId: p.ref_command || '',
            providerReference: p.token || p.ref_command || '',
            status,
            rawData: payload,
        };
    }

    async validateCredentials(): Promise<{ success: boolean; message?: string }> {
        if (!this.config.apiKey || !this.config.apiSecret) return { success: false, message: 'Clé API et clé secrète PayTech requises' };
        try {
            // Pas d'appel « qui suis-je » chez PayTech : on interroge un jeton
            // inexistant, seul le refus d'authentification nous interesse.
            const reponse = await fetch(`${BASE}/payment/get-status?token_payment=cartflox-verification`, {
                headers: this.entetes(), signal: AbortSignal.timeout(15000),
            });
            const data: any = await reponse.json().catch(() => ({}));
            const texte = this.message(data);
            if (reponse.status === 401 || reponse.status === 403 || /api_?key|api_?secret|cl[eé] (api|secr)|unauthori|non autoris|invalid(e)? (key|secret|cl)/i.test(texte)) {
                return { success: false, message: `PayTech refuse ces clés${texte ? ` : ${texte}` : ''}` };
            }
            return { success: true };
        } catch (error: any) {
            return { success: false, message: `PayTech injoignable : ${error?.message || 'réseau'}` };
        }
    }
}
