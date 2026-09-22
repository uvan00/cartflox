import {
    IPaymentProvider,
    PaymentRequest,
    PaymentResponse,
    PaymentStatus,
    WebhookResult
} from '../types';

/**
 * Hub2 Payment Provider Adapter
 * Documentation: https://docs.hub2.io/integration/en/payments/payments_integration
 * 
 * Direct Mobile Money flow (stays on YOUR checkout):
 *   1. POST /payment-intents            → get intentId + token
 *   2. POST /payment-intents/:id/payments → attempt with msisdn + provider
 *      Returns: processing (USSD push sent) | action_required (OTP needed)
 * 
 * Supported Payment Methods:
 * - Orange Money (CI, SN, ML, BF, CM)
 * - MTN MoMo (CI, BJ, CM, GH)
 * - Moov Money (BJ, TG, CI, BF)
 * - Wave (CI, SN, BF)
 * - T-Money (TG)
 * 
 * Currency: XOF, XAF, GHS
 */

/** Un couple d'identifiants Hub2, tel que fourni pour un pays donne. */
interface CompteHub2 {
    merchantId: string;
    apiKey: string;
}

interface Hub2Config extends Partial<CompteHub2> {
    apiKey: string;
    merchantId: string;
    /**
     * Hub2 ouvre un compte marchand PAR PAYS : chacun a son propre merchantId
     * et sa propre cle API. Sans cette table, un marchand present dans sept
     * pays ne pouvait en encaisser qu'un seul. Les champs a plat ci-dessus
     * restent le compte par defaut, pour qui n'opere que dans un pays.
     */
    comptesPays?: Record<string, CompteHub2>;
    mode?: 'test' | 'live';
}

/**
 * Pays de chaque intention de paiement deja creee. `verifyPayment` et
 * `submitOtp` ne recoivent qu'un identifiant d'intention, jamais le pays :
 * sans cette memoire, ils interrogeraient le mauvais compte marchand et
 * Hub2 repondrait que l'intention n'existe pas. Perdue au redemarrage, d'ou
 * le repli qui essaie les comptes l'un apres l'autre.
 */
const PAYS_DE_L_INTENTION = new Map<string, string>();

/** La tentative de paiement en cours : la derniere de la liste renvoyee par Hub2. */
const paiementCourant = (intention: any) => {
    const p = intention?.payments;
    return Array.isArray(p) && p.length ? p[p.length - 1] : undefined;
};

/** Code USSD qui genere le code de paiement Orange Money, par pays. */
const USSD_CODE_ORANGE: Record<string, string> = { CI: '#144*82#', SN: '#144*77#', ML: '#144#', BF: '*144*4*6*#' };

/**
 * Ce que l'acheteur doit faire, en francais, selon l'operateur et la suite que
 * Hub2 attend (« Parcours client paiement marchand » de Hub2, Cote d'Ivoire) :
 * Orange = code a generer puis a saisir dans le formulaire ; MTN CI = l'acheteur
 * compose lui-meme *133# (rien n'est pousse) ; Moov = demande poussee sur le
 * telephone ; Wave = lien ou application. Le message anglais de Hub2 reste en
 * repli quand aucune consigne n'est connue.
 */
function consignePour(provider: string, country: string, nextAction: any): string | undefined {
    const p = String(provider || '').toLowerCase();
    const type = nextAction?.type;
    if (type === 'otp' || p === 'orange') {
        return `Composez ${USSD_CODE_ORANGE[country] || '#144#'} sur votre téléphone pour obtenir votre code de paiement Orange Money, puis saisissez-le ici.`;
    }
    if (p === 'mtn' && country === 'CI') {
        return 'Composez *133# sur votre téléphone, choisissez « Valider retrait et paiement », puis confirmez avec votre code secret MTN MoMo.';
    }
    if (p === 'moov') return 'Une demande de confirmation arrive sur votre téléphone : validez-la avec votre code secret Moov Money.';
    if (type === 'ussd' && nextAction?.message) return String(nextAction.message);
    return undefined;
}

/** L'intention attend-elle encore la reponse de l'operateur (aucune suite connue) ? */
const suiteConnue = (intention: any) => {
    const statut = intention?.status;
    if (statut === 'successful' || statut === 'failed' || statut === 'canceled') return true;
    const paiement = paiementCourant(intention);
    return !!(paiement?.nextAction || intention?.nextAction || paiement?.status === 'failed');
};

// Map method codes → Hub2 provider + country
const METHOD_MAP: Record<string, { provider: string; country: string }> = {
    'orange-ci-hub2':   { provider: 'orange', country: 'CI' },
    'mtn-ci-hub2':      { provider: 'mtn',    country: 'CI' },
    'moov-ci-hub2':     { provider: 'moov',   country: 'CI' },
    'wave-ci-hub2':     { provider: 'wave',   country: 'CI' },
    'orange-sn-hub2':   { provider: 'orange', country: 'SN' },
    'wave-sn-hub2':     { provider: 'wave',   country: 'SN' },
    'mtn-bj-hub2':      { provider: 'mtn',    country: 'BJ' },
    'moov-bj-hub2':     { provider: 'moov',   country: 'BJ' },
    'orange-ml-hub2':   { provider: 'orange', country: 'ML' },
    'moov-ml-hub2':     { provider: 'moov',   country: 'ML' },
    'orange-bf-hub2':   { provider: 'orange', country: 'BF' },
    'moov-bf-hub2':     { provider: 'moov',   country: 'BF' },
    'tmoney-tg-hub2':   { provider: 'togocom', country: 'TG' },
    'moov-tg-hub2':     { provider: 'moov',   country: 'TG' },
    'mtn-cm-hub2':      { provider: 'mtn',    country: 'CM' },
    'mtn-gh-hub2':      { provider: 'mtn',    country: 'GH' },
};

export class Hub2Adapter implements IPaymentProvider {
    readonly name = 'Hub2';
    private config: Hub2Config;
    private baseUrl = 'https://api.hub2.io';

    constructor(config: Hub2Config) {
        this.config = config;
    }

    private getEnvironment(): string {
        return this.config.mode === 'live' ? 'live' : 'sandbox';
    }

    /** Le compte du pays demande, ou le compte par defaut s'il n'y en a pas. */
    private compte(pays?: string | null): CompteHub2 {
        const table = this.config.comptesPays || {};
        const code = (pays || '').toUpperCase();
        const trouve = code ? table[code] : undefined;
        if (trouve?.merchantId && trouve?.apiKey) return trouve;
        return { merchantId: this.config.merchantId, apiKey: this.config.apiKey };
    }

    /** Les pays reellement configures, compte par defaut compris. */
    private paysConfigures(): (string | null)[] {
        const codes = Object.entries(this.config.comptesPays || {})
            .filter(([, c]) => c?.merchantId && c?.apiKey)
            .map(([code]) => code);
        return this.config.merchantId && this.config.apiKey ? [null, ...codes] : codes;
    }

    private getHeaders(pays?: string | null) {
        const c = this.compte(pays);
        return {
            'Content-Type': 'application/json',
            'ApiKey': c.apiKey,
            'MerchantId': c.merchantId,
            'Environment': this.getEnvironment(),
        };
    }

    private generateReference(orderId: string): string {
        return `H2_${orderId}_${Date.now()}`;
    }

    /**
     * Step 1: Create a payment intent
     * Returns intentId + token (needed for step 2)
     */
    async initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
        try {
            const reference = this.generateReference(request.orderId);

            // Le pays est resolu AVANT la creation de l'intention : elle appartient
            // au compte marchand qui la cree, et c'est ce meme compte qui devra la
            // regler puis la verifier.
            const codeMoyen = request.metadata?.methodCode || '';
            const correspondance = METHOD_MAP[codeMoyen];
            const paysDuPaiement = (correspondance?.country || request.metadata?.country || 'CI').toUpperCase();

            const intentRes = await fetch(`${this.baseUrl}/payment-intents`, {
                method: 'POST',
                headers: this.getHeaders(paysDuPaiement),
                body: JSON.stringify({
                    customerReference: request.customerEmail || request.orderId,
                    purchaseReference: reference,
                    amount: request.amount,
                    currency: request.currency || 'XOF',
                }),
                signal: AbortSignal.timeout(20000),
            });

            const intent: any = await intentRes.json();

            if (!intentRes.ok || !intent?.id) {
                return { transactionId: reference, providerReference: '', status: 'FAILED', rawData: intent };
            }

            // Step 2: Attempt the payment with phone number and provider
            PAYS_DE_L_INTENTION.set(intent.id, paysDuPaiement);
            const phone = (request.customerPhone || '').replace(/^\+/, '');
            const provider = correspondance?.provider || this.detectProvider(codeMoyen);
            const country  = paysDuPaiement;

            const attemptRes = await fetch(`${this.baseUrl}/payment-intents/${intent.id}/payments`, {
                method: 'POST',
                headers: this.getHeaders(paysDuPaiement),
                body: JSON.stringify({
                    token: intent.token,
                    paymentMethod: 'mobile_money',
                    country,
                    provider,
                    mobileMoney: {
                        msisdn: phone,
                        // Wave est un moyen a REDIRECTION : Hub2 exige les deux liens
                        // DANS l'objet mobileMoney (reference « Attempt a payment »).
                        // Envoyes a la racine, ils etaient ignores et Hub2 repondait
                        // 400 « liens de redirection requis » a chaque paiement Wave.
                        ...(provider === 'wave' ? {
                            onSuccessRedirectionUrl: request.returnUrl,
                            onFailedRedirectionUrl: request.cancelUrl || request.returnUrl,
                        } : {}),
                    },
                }),
                signal: AbortSignal.timeout(20000),
            });

            const attempt: any = await attemptRes.json();

            if (!attemptRes.ok) {
                return { transactionId: reference, providerReference: intent.id, status: 'FAILED', rawData: attempt };
            }

            // Hub2 repond souvent AVANT d'avoir la reponse de l'operateur : la demande
            // de code (Orange) ou la consigne arrive dans les secondes qui suivent. On
            // relit l'intention quelques fois plutot que de laisser l'acheteur devant
            // un message generique « validez sur votre telephone ».
            let intention: any = attempt;
            for (let i = 0; i < 3 && !suiteConnue(intention); i++) {
                await new Promise((r) => setTimeout(r, 1200));
                const relue = await this.lireIntention(intent.id);
                if (relue.ok && relue.data?.id) intention = relue.data;
            }
            return this.interpreter(intention, reference, provider, country);
        } catch (error: any) {
            console.error('[Hub2] initiatePayment error:', error);
            return { transactionId: '', providerReference: '', status: 'FAILED', rawData: { error: error.message } };
        }
    }

    /**
     * L'intention chez Hub2. Une intention n'existe que pour le compte marchand
     * qui l'a creee : on interroge d'abord le pays memorise ; apres un
     * redemarrage la memoire est vide, on essaie alors les comptes configures
     * jusqu'a ce que l'un reconnaisse l'intention. Sans cela, un marchand
     * multi-pays verrait ses paiements rester indefiniment en attente.
     */
    private async lireIntention(intentId: string): Promise<{ ok: boolean; data: any; pays: string | null | undefined }> {
        const memorise = PAYS_DE_L_INTENTION.get(intentId);
        const aEssayer: (string | null | undefined)[] = memorise !== undefined ? [memorise] : this.paysConfigures();
        if (aEssayer.length === 0) return { ok: false, data: { error: 'Aucun compte Hub2 configure' }, pays: undefined };
        let response!: Response;
        let pays: string | null | undefined = memorise;
        for (const p of aEssayer) {
            response = await fetch(`${this.baseUrl}/payment-intents/${intentId}`, {
                method: 'GET',
                headers: this.getHeaders(p),
                signal: AbortSignal.timeout(20000),
            });
            pays = p;
            if (response.ok) {
                if (p) PAYS_DE_L_INTENTION.set(intentId, p);
                break;
            }
        }
        const data: any = await response.json().catch(() => ({}));
        return { ok: response.ok, data, pays };
    }

    /**
     * Code de paiement (Orange Money) : Hub2 l'attend sur
     * POST /payment-intents/{id}/authentication avec { token, confirmationCode }.
     * L'ancien appel (/payments/{paymentId}/authenticate avec { otp }) n'existe
     * pas chez Hub2 (404) : aucun code n'a jamais pu etre valide. `paymentId`
     * reste dans la signature ; le jeton de l'intention est relu chez Hub2.
     */
    async submitOtp(intentId: string, _paymentId: string, otp: string): Promise<PaymentResponse> {
        try {
            const { data: intention, pays } = await this.lireIntention(intentId);
            const token = intention?.token;
            if (!token) {
                return { transactionId: intentId, providerReference: intentId, status: 'FAILED', rawData: { error: 'Intention Hub2 introuvable', ...(intention || {}) } };
            }
            const res = await fetch(`${this.baseUrl}/payment-intents/${intentId}/authentication`, {
                method: 'POST',
                headers: this.getHeaders(pays),
                body: JSON.stringify({ token, confirmationCode: String(otp || '').trim() }),
                signal: AbortSignal.timeout(20000),
            });
            const data: any = await res.json().catch(() => ({}));
            if (!res.ok) {
                // Code refuse : on le redemande plutot que d'abandonner le paiement.
                const message = data?.message || data?.error || `Hub2 ${res.status}`;
                return { transactionId: intentId, providerReference: intentId, status: 'PENDING', rawData: { ...data, _hub2_otp_required: true, _hub2_otp_message: message, error: message } };
            }
            // Code accepte : l'intention passe en processing puis successful ; refuse :
            // elle reste en action_required et le code est redemande.
            const lue = this.interpreter(data, intentId);
            return lue.status === 'CANCELLED' ? { ...lue, status: 'FAILED' } : lue;
        } catch (error: any) {
            return { transactionId: intentId, providerReference: intentId, status: 'FAILED', rawData: { error: error.message } };
        }
    }

    /**
     * Une intention Hub2 lue en reponse Cartflox : statut, redirection (Wave),
     * code a saisir (Orange, `_hub2_otp_required`) ou consigne (`_instructions`).
     * Meme lecture a l'initiation, au sondage et apres la saisie du code.
     */
    private interpreter(intention: any, reference: string, provider?: string, country?: string): PaymentResponse {
        const statut = intention?.status;
        const paiement = paiementCourant(intention);
        const operateur = String(provider || paiement?.provider || '').toLowerCase();
        const pays = String(country || paiement?.country || PAYS_DE_L_INTENTION.get(intention?.id) || '').toUpperCase();
        const base = { transactionId: reference, providerReference: intention?.id || reference };
        if (statut === 'successful') return { ...base, status: 'SUCCESS', rawData: intention };
        if (statut === 'failed') return { ...base, status: 'FAILED', rawData: intention };
        if (statut === 'canceled') return { ...base, status: 'CANCELLED', rawData: intention };
        // L'intention reste « payment_required » quand la tentative echoue (Wave non
        // active chez Hub2, delai passe...) : pour nous, chaque tentative a sa propre
        // intention, donc c'est un echec, avec le motif de Hub2 pour l'acheteur.
        if (paiement?.status === 'failed') {
            const failure = paiement.failure || {};
            return { ...base, status: 'FAILED', rawData: { ...intention, failure, message: failure.message || 'Le paiement a été refusé.' } };
        }

        const nextAction = paiement?.nextAction || intention?.nextAction;
        // Hub2 decrit la redirection dans nextAction { type: 'redirection', data: { url } } ;
        // les autres champs restent en repli.
        const redirection = nextAction?.data?.url || nextAction?.redirectUrl || nextAction?.url || intention?.redirectUrl || null;
        if (redirection) {
            return {
                ...base,
                status: 'PENDING',
                checkoutUrl: redirection,
                // Lien Wave (pay.wave.com) : l'acheteur reste sur notre page, avec le
                // bouton d'ouverture et le QR code, comme avec l'adaptateur Wave direct.
                rawData: operateur === 'wave' ? { ...intention, _application: 'Wave' } : intention,
            };
        }
        // Wave sans lien : Hub2 n'a rien envoye sur le telephone, le lien arrive (ou la
        // tentative sera refusee, par exemple Wave non active sur le compte Hub2).
        // Sans cette consigne, la page affichait « une demande vient de vous etre envoyee ».
        const instructions = operateur === 'wave'
            ? "Votre lien de paiement Wave est en préparation et s'affichera ici dans quelques secondes. Si rien ne vient, choisissez un autre moyen de paiement."
            : consignePour(operateur, pays, nextAction);
        if (nextAction?.type === 'otp' || (statut === 'action_required' && operateur === 'orange')) {
            return {
                ...base,
                status: 'PENDING',
                rawData: {
                    ...intention,
                    _hub2_otp_required: true,
                    _hub2_otp_message: instructions,
                    _hub2_otp_ussd: USSD_CODE_ORANGE[pays] || null,
                    _hub2_payment_id: paiement?.id,
                    _instructions: instructions,
                },
            };
        }
        return { ...base, status: 'PENDING', rawData: instructions ? { ...intention, _instructions: instructions } : intention };
    }

    async verifyPayment(providerReference: string): Promise<PaymentResponse> {
        try {
            const { data } = await this.lireIntention(providerReference);
            return this.interpreter(data, providerReference);
        } catch (error: any) {
            return { transactionId: providerReference, providerReference, status: 'FAILED', rawData: { error: error.message } };
        }
    }

    async handleWebhook(payload: any, _headers?: any): Promise<WebhookResult> {
        try {
            // Enveloppe Hub2 : { type: 'payment_intent.*', data: { id: 'pi_…' }, id: 'evt_…' }
            // ou { type: 'payment.*', data: { id: 'pay_…', intentId: 'pi_…' } }.
            // `payload.id` est l'identifiant de l'EVENEMENT, jamais celui de l'intention.
            const candidats = [payload?.data?.id, payload?.data?.intentId, payload?.data?.paymentIntentId, payload?.id, payload?.reference];
            const reference = candidats.find((c) => typeof c === 'string' && c.startsWith('pi_')) || payload?.reference;
            if (!reference) throw new Error('Missing reference in Hub2 webhook');
            const verification = await this.verifyPayment(reference);
            return { transactionId: reference, providerReference: verification.providerReference, status: verification.status, rawData: { webhook_original: payload, verification_data: verification.rawData } };
        } catch (error: any) {
            return { transactionId: '', providerReference: '', status: 'FAILED', rawData: { error: error.message } };
        }
    }

    async validateCredentials(): Promise<{ success: boolean; message?: string }> {
        // Un marchand peut n'avoir aucun compte « par defaut » et ne declarer que
        // des comptes par pays : c'est une configuration valide.
        if (this.paysConfigures().length === 0) {
            return { success: false, message: 'Merchant ID et clé API Hub2 requis, pour au moins un pays' };
        }
        return { success: true };
    }

    private detectProvider(methodCode: string): string {
        const c = methodCode.toLowerCase();
        if (c.includes('orange')) return 'orange';
        if (c.includes('mtn'))    return 'mtn';
        if (c.includes('moov'))   return 'moov';
        if (c.includes('wave'))   return 'wave';
        if (c.includes('tmoney') || c.includes('togocom')) return 'togocom';
        return 'mtn';
    }
}
