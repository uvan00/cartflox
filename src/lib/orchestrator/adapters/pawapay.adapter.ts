import {
    IPaymentProvider,
    PaymentRequest,
    PaymentResponse,
    PaymentStatus,
    WebhookResult,
    PayoutRequest,
    PayoutResponse
} from '../types';
import { DEVISES_SANS_CENTIMES } from '@/lib/devises';
import { getPawaPayActiveCorrespondents } from "@/lib/orchestrator/pawapay-availability";

/**
 * PawaPay Payment Provider Adapter
 * Documentation: https://docs.pawapay.io/
 *
 * Uses:
 *  - v2 Payment Page  (POST /v2/paymentpage) → redirect flow
 *  - v1 Direct Deposit (POST /deposits)       → USSD push flow
 *  - v1 Deposit Status (GET  /deposits/{id})  → verification
 *  - v1 Active Config  (GET  /v1/active-conf) → credential check
 */

interface PawaPayConfig {
    apiKey: string;
    mode: 'test' | 'live';
}

/** ISO 3166-1 alpha-2 → alpha-3 for PawaPay country parameter */
const COUNTRY_MAP: Record<string, string> = {
    CI: 'CIV', SN: 'SEN', BJ: 'BEN', ML: 'MLI', BF: 'BFA', TG: 'TGO',
    GN: 'GIN', NE: 'NER', CM: 'CMR', GA: 'GAB', CG: 'COG', CD: 'COD',
    TD: 'TCD', CF: 'CAF', GH: 'GHA', NG: 'NGA', KE: 'KEN', TZ: 'TZA',
    RW: 'RWA', UG: 'UGA', ZA: 'ZAF', MG: 'MDG', SL: 'SLE', GW: 'GNB',
    MR: 'MRT', ZM: 'ZMB', MW: 'MWI', MZ: 'MOZ', AO: 'AGO', ET: 'ETH',
};

/** Map Cartflox methodCode + country to PawaPay correspondent codes (for direct deposit) */
const CORRESPONDENT_MAP: Record<string, Record<string, string>> = {
    CI: { mtn_money: 'MTN_MOMO_CIV', orange_money: 'ORANGE_CIV', moov_money: 'MOOV_CIV', wave: 'WAVE_CIV' },
    SN: { orange_money: 'ORANGE_SEN', free_money: 'FREE_SEN', wave: 'WAVE_SEN', emoney: 'EMONEY_SEN' },
    BJ: { mtn_money: 'MTN_MOMO_BEN', moov_money: 'MOOV_BEN' },
    BF: { orange_money: 'ORANGE_BFA', moov_money: 'MOOV_BFA' },
    TG: { moov_money: 'MOOV_TGO', tmoney: 'TMONEY_TGO' },
    ML: { orange_money: 'ORANGE_MLI', moov_money: 'MOOV_MLI' },
    GH: { mtn_money: 'MTN_MOMO_GHA', vodafone_cash: 'VODAFONE_GHA', airtel_tigo: 'AIRTELTIGO_GHA' },
    KE: { mpesa: 'MPESA_KEN' },
    TZ: { mpesa: 'MPESA_TZA', airtel_money: 'AIRTEL_TZA', tigo_pesa: 'TIGO_TZA' },
    // Airtel Ouganda/Zambie : identifiants officiels PawaPay avec suffixe OAPI
    // (AIRTEL_UGA/AIRTEL_ZMB sont rejetés par l'API : "Invalid currency").
    UG: { mtn_money: 'MTN_MOMO_UGA', airtel_money: 'AIRTEL_OAPI_UGA' },
    RW: { mtn_money: 'MTN_MOMO_RWA', airtel_money: 'AIRTEL_RWA' },
    CM: { mtn_money: 'MTN_MOMO_CMR', orange_money: 'ORANGE_CMR' },
    CD: { mpesa: 'VODACOM_MPESA_COD', orange_money: 'ORANGE_COD', airtel_money: 'AIRTEL_COD' },
    ZM: { mtn_money: 'MTN_MOMO_ZMB', airtel_money: 'AIRTEL_OAPI_ZMB', zamtel: 'ZAMTEL_ZMB' },
    NG: { mtn_money: 'MTN_MOMO_NGA' },
    // Gabon : seul Airtel est actif chez PawaPay (dépôt direct XAF). Sans cette
    // entrée, le Gabon tombait sur la PaymentPage (redirection) qui n'aboutit
    // jamais → 0 paiement Gabon réussi. Le dépôt direct, lui, marche (cf. CM).
    GA: { airtel_money: 'AIRTEL_GAB', airtel: 'AIRTEL_GAB' },
    CG: { mtn_money: 'MTN_MOMO_COG', airtel_money: 'AIRTEL_COG' },
};

/**
 * Par défaut : push USSD direct (le client saisit son PIN sur son téléphone, SANS
 * page hébergée) → expérience 100% native. On tente le dépôt direct EN PREMIER
 * pour tous, avec repli automatique sur la PaymentPage s'il est refusé (jamais
 * pire que la page). EXCEPTIONS : opérateurs qui n'ont PAS de push USSD et exigent
 * une redirection → on va directement à la PaymentPage (évite une tentative vaine).
 *  - Wave : paiement par app/QR, pas de push USSD.
 *  - ORANGE_BFA : exige un code de pré-autorisation (dépôt direct rejeté).
 */
/**
 * Ce que l'acheteur doit faire sur son telephone, par operateur. PawaPay le
 * publie dans sa configuration active (v2, textes en francais) avec le mode
 * de sollicitation : MANUAL = rien n'est envoye, l'acheteur compose lui-meme
 * (Orange CI : #120# ; MTN CI : *133#). Notre page affichait pour tout
 * « Orange » la consigne du code #144*82#, valable chez PayDunya et Hub2
 * seulement : 5 paiements Orange CI par PawaPay sur 5 ont expire sans
 * validation. Repli statique pour la Cote d'Ivoire si la configuration
 * n'est pas lisible.
 */
const CONSIGNES_STATIQUES: Record<string, { manuel: boolean; etapes: string[] }> = {
    ORANGE_CIV: { manuel: true, etapes: ['Composez #120#', 'Entrez le code PIN'] },
    MTN_MOMO_CIV: { manuel: true, etapes: ['Composez *133#', 'Sélectionnez 1 - Valider retrait et paiement', 'Sélectionnez votre transaction en attente', 'Entrez le code PIN'] },
};
const CONF_ACTIVE = new Map<string, { quand: number; conf: any | null }>();
const CONF_ACTIVE_TTL_MS = 60 * 60 * 1000;
const CONF_ACTIVE_ECHEC_MS = 5 * 60 * 1000;
const empreinte = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(16); };

function phraserConsigne(manuel: boolean, etapes: string[]): string | null {
    const pas = etapes.map((e) => String(e).trim().replace(/\.$/, '')).filter(Boolean)
        // Une seule phrase : majuscule au premier pas seulement.
        .map((e, i) => (i === 0 ? e : e.charAt(0).toLowerCase() + e.slice(1)));
    if (pas.length === 0) return null;
    const suite = pas.length === 1 ? pas[0] : `${pas.slice(0, -1).join(', ')}, puis ${pas[pas.length - 1]}`;
    return `${manuel ? "Rien n'est envoyé automatiquement sur votre téléphone. " : "Une demande de validation arrive sur votre téléphone. Si elle n'apparaît pas : "}${suite}.`;
}

const FORCE_PAGE_FIRST = new Set<string>([
    'WAVE_CIV', 'WAVE_SEN', 'ORANGE_BFA',
]);

const sanitizePawaPayText = (value: string, maxLength: number): string =>
    value
        .replace(/[^a-zA-Z0-9 ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);

const sanitizeMsisdn = (value: string): string =>
    value.replace(/\D/g, '');

/** PawaPay veut le montant en chaine : entier pour les francs, deux decimales ailleurs. */
const montantPawaPay = (montant: number, devise: string): string =>
    DEVISES_SANS_CENTIMES.has((devise || '').toUpperCase()) ? String(Math.round(montant)) : (Math.round(montant * 100) / 100).toFixed(2);

const normalizeLookupKey = (value: string): string =>
    value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

/** Cote d'Ivoire : le prefixe designe l'operateur (01 Moov, 05 MTN, 07 Orange). */
const OPERATEUR_CIV: Record<string, string> = { '01': 'MOOV_CIV', '05': 'MTN_MOMO_CIV', '07': 'ORANGE_CIV' };

/**
 * Renvoie le correspondant impose par le prefixe du numero, ou null si le
 * pays n'a pas de plan de numerotation strict. Wave n'est pas concerne :
 * c'est un portefeuille, pas un reseau, et il accepte tous les prefixes.
 */
function operateurSelonPrefixe(pays: string, numero: string, choisi: string | null): string | null {
    if (pays !== 'CI' || choisi === 'WAVE_CIV') return null;
    if (!/^225\d{10}$/.test(numero)) return null;
    const attendu = OPERATEUR_CIV[numero.slice(3, 5)];
    return attendu && attendu !== choisi ? attendu : null;
}

/** Predictions deja obtenues, pour ne pas rappeler PawaPay a chaque tentative. */
const predictions = new Map<string, { correspondant: string | null; a: number }>();
const PREDICTION_TTL_MS = 10 * 60_000;

/**
 * L'operateur a qui appartient VRAIMENT ce numero, d'apres PawaPay
 * (`/v2/predict-provider`, 0,12 % d'erreur annonce).
 *
 * ⚠️ Pourquoi : un payeur qui choisit le mauvais operateur n'a AUCUNE chance.
 * Le marchand Panga a essaye deux fois M-Pesa depuis un numero Airtel
 * (243 98...) : la demande de code est partie chez Vodacom pour un numero qui
 * n'est pas chez Vodacom, et s'est eteinte en « demande non validee a temps ».
 * La table de prefixes ne couvrait que la Cote d'Ivoire ; ceci couvre les 20
 * pays de PawaPay sans tenir de table a jour nous-memes.
 *
 * Ne leve jamais et n'attend pas : sans reponse, le choix du payeur est garde.
 */
async function operateurPredit(baseUrl: string, cle: string, numero: string): Promise<string | null> {
    const connu = predictions.get(numero);
    if (connu && Date.now() - connu.a < PREDICTION_TTL_MS) return connu.correspondant;
    try {
        const r = await fetch(`${baseUrl}/v2/predict-provider`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${cle}`, 'content-type': 'application/json' },
            body: JSON.stringify({ phoneNumber: numero }),
            signal: AbortSignal.timeout(2500),
        });
        const d: any = await r.json().catch(() => ({}));
        const correspondant = r.ok && typeof d?.provider === 'string' ? d.provider : null;
        predictions.set(numero, { correspondant, a: Date.now() });
        return correspondant;
    } catch {
        return null;
    }
}

/** Deux correspondants du meme pays ? Le suffixe PawaPay porte le pays (`_COD`). */
const memePays = (a: string, b: string) => a.slice(a.lastIndexOf('_')) === b.slice(b.lastIndexOf('_'));

export class PawaPayAdapter implements IPaymentProvider {
    readonly name = 'PawaPay';
    private config: PawaPayConfig;
    private baseUrl: string;
    /**
     * La derniere raison donnee par PawaPay pendant les tentatives. Sans elle,
     * l'echec final disait « aucune methode disponible » meme quand la cle du
     * marchand etait refusee : le payeur ne comprenait rien, le marchand non plus.
     */
    private derniereErreur: string | null = null;

    constructor(config: PawaPayConfig) {
        this.config = { ...config, mode: config.mode || 'live' };
        this.baseUrl = this.config.mode === 'live'
            ? 'https://api.pawapay.io'
            : 'https://api.sandbox.pawapay.io';
    }

    /**
     * Initiate a deposit using the v2 Payment Page (redirect flow).
     * Falls back to v1 Direct Deposit if correspondent can be resolved.
     */
    async initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
        this.derniereErreur = null;
        const depositId = request.metadata?.depositId || crypto.randomUUID();
        const phone = sanitizeMsisdn(request.customerPhone || '');
        const countryAlpha2 = (request.metadata?.country || '').toUpperCase();
        const countryAlpha3 = COUNTRY_MAP[countryAlpha2] || countryAlpha2;
        const reason = sanitizePawaPayText(`Paiement ${request.orderId}`, 22) || 'Payment';
        const statementDescription = sanitizePawaPayText(`Pay ${request.orderId}`, 22) || 'Payment';
        const methodCode = (request.metadata?.methodCode || '').toLowerCase();
        let correspondent = this.resolveCorrespondent(countryAlpha2, methodCode);

        const redresse = operateurSelonPrefixe(countryAlpha2, phone, correspondent);
        if (redresse) {
            console.log(`[PawaPay] operateur redresse: ${correspondent} → ${redresse} (numero ${phone})`);
            correspondent = redresse;
        } else if (correspondent && phone) {
            // Le numero designe son operateur mieux que le choix du payeur.
            // On ne corrige que DANS LE MEME PAYS, et seulement vers un
            // correspondant que notre compte sert : sinon on garde le choix.
            const predit = await operateurPredit(this.baseUrl, this.config.apiKey, phone);
            if (predit && predit !== correspondent && memePays(predit, correspondent)) {
                const actifs = await getPawaPayActiveCorrespondents(this.config.apiKey).catch(() => null);
                if (!actifs || actifs.has(predit)) {
                    console.log(`[PawaPay] operateur corrige par le numero: ${correspondent} → ${predit} (${phone})`);
                    correspondent = predit;
                }
            }
        }

        const ctx = {
            request, depositId, phone, countryAlpha2, countryAlpha3,
            reason, statementDescription, correspondent,
        };

        // Natif d'abord (push USSD, le client paie sur son téléphone) pour tous les
        // correspondants résolus, SAUF ceux qui exigent une redirection (Wave, Orange
        // BFA). Repli automatique sur la PaymentPage si le dépôt direct est refusé.
        const preferDirect = !!correspondent && !FORCE_PAGE_FIRST.has(correspondent);
        const attempts = preferDirect
            ? [() => this.tryDirectDeposit(ctx), () => this.tryPaymentPage(ctx)]
            : [() => this.tryPaymentPage(ctx), () => this.tryDirectDeposit(ctx)];

        for (const attempt of attempts) {
            const result = await attempt();
            if (result) return result;
        }

        return {
            transactionId: depositId,
            providerReference: depositId,
            status: 'FAILED',
            rawData: {
                error: this.derniereErreur || `PawaPay: aucune methode disponible (country=${countryAlpha2} method=${methodCode})`,
                code: this.derniereErreur && /identifiants/i.test(this.derniereErreur) ? 'AUTHENTICATION_ERROR' : undefined,
            },
        };
    }

    /** v2 Payment Page (flux redirection). Renvoie null si refusée → on tentera le dépôt direct. */
    private async tryPaymentPage(ctx: any): Promise<PaymentResponse | null> {
        const { request, depositId, phone, countryAlpha3, reason } = ctx;
        try {
            const body: Record<string, any> = {
                depositId,
                returnUrl: request.returnUrl,
                amountDetails: {
                    amount: montantPawaPay(request.amount, request.currency),
                    currency: request.currency,
                },
                phoneNumber: phone,
                language: 'FR',
                reason,
                metadata: [
                    { fieldName: 'orderId', fieldValue: request.orderId },
                    { fieldName: 'customerName', fieldValue: request.customerName || '', isPII: true },
                    { fieldName: 'customerEmail', fieldValue: request.customerEmail || '', isPII: true },
                ],
            };
            if (countryAlpha3.length === 3) body.country = countryAlpha3;

            console.log(`[PawaPay] v2 PaymentPage request: depositId=${depositId} phone=${phone} country=${countryAlpha3}`);

            const res = await fetch(`${this.baseUrl}/v2/paymentpage`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`,
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(20000),
            });

            const data = await res.json();

            if (res.ok && (data.redirectUrl || data.redirectURL)) {
                return {
                    transactionId: depositId,
                    providerReference: depositId,
                    status: 'PENDING',
                    checkoutUrl: (data.redirectUrl || data.redirectURL),
                    rawData: data,
                };
            }

            console.error(`[PawaPay] v2 PaymentPage FAILED: status=${res.status} body=${JSON.stringify(data)}`);
            this.derniereErreur = this.libellerErreur(res.status, data);
            return null;
        } catch (err: any) {
            console.error(`[PawaPay] v2 PaymentPage exception: ${err.message}`);
            this.derniereErreur = `PawaPay injoignable : ${err.message}`;
            return null;
        }
    }

    /** La configuration active v2 du compte (operateurs, sollicitation, consignes), en cache une heure. */
    private async configurationActive(): Promise<any | null> {
        const cle = `${this.baseUrl}|${empreinte(String(this.config.apiKey || ''))}`;
        const memo = CONF_ACTIVE.get(cle);
        if (memo && Date.now() - memo.quand < (memo.conf ? CONF_ACTIVE_TTL_MS : CONF_ACTIVE_ECHEC_MS)) return memo.conf;
        try {
            const res = await fetch(`${this.baseUrl}/v2/active-conf`, {
                headers: { 'Authorization': `Bearer ${this.config.apiKey}` },
                signal: AbortSignal.timeout(8000),
            });
            const conf = res.ok ? await res.json() : null;
            CONF_ACTIVE.set(cle, { quand: Date.now(), conf });
            return conf;
        } catch {
            CONF_ACTIVE.set(cle, { quand: Date.now(), conf: null });
            return null;
        }
    }

    /** Consigne en francais pour l'acheteur, selon l'operateur (voir CONSIGNES_STATIQUES). */
    private async consigneOperateur(correspondent: string | undefined, currency?: string): Promise<string | null> {
        const code = String(correspondent || '').toUpperCase();
        if (!code) return null;
        const conf = await this.configurationActive();
        for (const pays of (conf?.countries || [])) {
            const prov = (pays.providers || []).find((p: any) => p.provider === code);
            if (!prov) continue;
            const devise = (prov.currencies || []).find((c: any) => !currency || c.currency === String(currency).toUpperCase()) || prov.currencies?.[0];
            const depot = devise?.operationTypes?.DEPOSIT;
            const canal = depot?.pinPromptInstructions?.channels?.[0];
            const etapes = (canal?.instructions?.fr || canal?.instructions?.en || []).map((i: any) => i?.text).filter(Boolean);
            const phrase = phraserConsigne(depot?.pinPrompt === 'MANUAL', etapes);
            if (phrase) return phrase;
        }
        const statique = CONSIGNES_STATIQUES[code];
        return statique ? phraserConsigne(statique.manuel, statique.etapes) : null;
    }

    /** v1 Direct Deposit (push USSD). Renvoie null si non résolu/refusé → repli PaymentPage. */
    private async tryDirectDeposit(ctx: any): Promise<PaymentResponse | null> {
        const {
            request, depositId, phone, countryAlpha2, countryAlpha3,
            statementDescription, correspondent,
        } = ctx;
        if (!correspondent) {
            console.error(`[PawaPay] Direct Deposit: correspondant introuvable (country=${countryAlpha2} method=${request.metadata?.methodCode})`);
            return null;
        }
        try {
            const body = {
                depositId,
                amount: montantPawaPay(request.amount, request.currency),
                currency: request.currency,
                correspondent,
                payer: {
                    type: 'MSISDN',
                    address: { value: phone },
                },
                customerTimestamp: new Date().toISOString(),
                statementDescription,
                country: countryAlpha3,
                metadata: [
                    { fieldName: 'orderId', fieldValue: request.orderId },
                    { fieldName: 'customerName', fieldValue: request.customerName || '', isPII: true },
                ],
            };

            console.log(`[PawaPay] v1 Direct Deposit: depositId=${depositId} correspondent=${correspondent} phone=${phone}`);

            const res = await fetch(`${this.baseUrl}/deposits`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`,
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(20000),
            });

            const data = await res.json();

            if (!res.ok || data.status === 'REJECTED') {
                console.error(`[PawaPay] v1 Direct Deposit FAILED: status=${res.status} body=${JSON.stringify(data)}`);
                this.derniereErreur = this.libellerErreur(res.status, data);
                return null;
            }

            const consigne = await this.consigneOperateur(correspondent, request.currency);
            return {
                transactionId: depositId,
                providerReference: depositId,
                status: this.mapStatus(data.status),
                rawData: consigne ? { ...data, _instructions: consigne } : data,
            };
        } catch (error: any) {
            console.error(`[PawaPay] v1 Direct Deposit exception: ${error.message}`);
            this.derniereErreur = `PawaPay injoignable : ${error.message}`;
            return null;
        }
    }

    /**
     * Verify deposit status — GET /deposits/{depositId}
     */
    async verifyPayment(providerReference: string): Promise<PaymentResponse> {
        try {
            const res = await fetch(`${this.baseUrl}/deposits/${providerReference}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${this.config.apiKey}` },
                signal: AbortSignal.timeout(20000),
            });

            if (!res.ok) {
                throw new Error(`PawaPay verify error: ${res.status} ${res.statusText}`);
            }

            const data = await res.json();
            const record = Array.isArray(data) ? data[0] : data;

            const status = this.mapStatus(record?.status);
            // Tant que le depot attend l'acheteur, la page et le widget redisent quoi faire.
            const consigne = status === 'PENDING' ? await this.consigneOperateur(record?.correspondent, record?.currency) : null;
            return {
                transactionId: providerReference,
                providerReference,
                status,
                rawData: consigne ? { ...record, _instructions: consigne } : record,
            };
        } catch (error: any) {
            return {
                transactionId: providerReference,
                providerReference,
                status: 'FAILED',
                rawData: { error: error.message },
            };
        }
    }

    /**
     * Refund a completed deposit — POST /refunds
     * `providerReference` is the depositId. Omitting amount refunds in full,
     * but we always send it explicitly for auditability.
     * Initial response status is ACCEPTED (processing) — poll verifyRefund
     * for the final COMPLETED/FAILED state.
     */
    async refundPayment(providerReference: string, options?: { amount?: number; currency?: string }): Promise<PaymentResponse> {
        const refundId = crypto.randomUUID();
        try {
            const body: Record<string, any> = {
                refundId,
                depositId: providerReference,
            };
            if (options?.amount != null) body.amount = String(options.amount);

            console.log(`[PawaPay] Refund request: refundId=${refundId} depositId=${providerReference} amount=${body.amount ?? 'FULL'}`);

            const res = await fetch(`${this.baseUrl}/refunds`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`,
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(20000),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok || data.status === 'REJECTED' || data.status === 'DUPLICATE_IGNORED') {
                console.error(`[PawaPay] Refund FAILED: status=${res.status} body=${JSON.stringify(data)}`);
                return {
                    transactionId: refundId,
                    providerReference: refundId,
                    status: 'FAILED',
                    rawData: data,
                };
            }

            return {
                transactionId: refundId,
                providerReference: refundId,
                status: this.mapStatus(data.status),
                rawData: data,
            };
        } catch (error: any) {
            return {
                transactionId: refundId,
                providerReference: refundId,
                status: 'FAILED',
                rawData: { error: error.message },
            };
        }
    }

    /**
     * Check refund status — GET /refunds/{refundId}
     */
    async verifyRefund(refundReference: string): Promise<PaymentResponse> {
        try {
            const res = await fetch(`${this.baseUrl}/refunds/${refundReference}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${this.config.apiKey}` },
                signal: AbortSignal.timeout(20000),
            });

            if (!res.ok) {
                throw new Error(`PawaPay refund verify error: ${res.status} ${res.statusText}`);
            }

            const data = await res.json();
            const record = Array.isArray(data) ? data[0] : data;

            return {
                transactionId: refundReference,
                providerReference: refundReference,
                status: this.mapStatus(record?.status),
                rawData: record,
            };
        } catch (error: any) {
            return {
                transactionId: refundReference,
                providerReference: refundReference,
                status: 'FAILED',
                rawData: { error: error.message },
            };
        }
    }

    /**
     * Handle PawaPay deposit callback webhook.
     * The callback body is not signed by default and the depositId is exposed
     * to the payer's browser — never trust the status it carries: always
     * re-fetch the deposit from the PawaPay API before confirming.
     */
    async handleWebhook(payload: any, _headers?: any): Promise<WebhookResult> {
        const depositId = payload.depositId;
        if (!depositId) {
            return { transactionId: '', providerReference: '', status: 'PENDING', rawData: payload };
        }

        const verification = await this.verifyPayment(depositId);
        const verifyErrored = !!verification.rawData?.error;

        return {
            transactionId: depositId,
            providerReference: depositId,
            // If the API check itself errored, stay PENDING — the cron reconciles later.
            status: verifyErrored ? 'PENDING' : verification.status,
            rawData: { callback: payload, verification: verification.rawData },
        };
    }

    /**
     * Validate API credentials via GET /v1/active-conf
     */
    async validateCredentials(): Promise<{ success: boolean; message?: string }> {
        const tryHost = async (host: string) => {
            const res = await fetch(`${host}/v1/active-conf`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${this.config.apiKey}` },
                signal: AbortSignal.timeout(20000),
            });
            return res;
        };

        const primary = this.baseUrl;
        const fallback = primary === 'https://api.pawapay.io'
            ? 'https://api.sandbox.pawapay.io'
            : 'https://api.pawapay.io';

        try {
            const res = await tryHost(primary);
            if (res.ok) return { success: true };
            if (res.status === 401 || res.status === 403 || res.status === 500) {
                // Key may belong to the other environment — try it once.
                const alt = await tryHost(fallback);
                if (alt.ok) return { success: true };
            }
            const data = await res.json().catch(() => ({}));
            return { success: false, message: data.message || `Erreur PawaPay (${res.status})` };
        } catch (error: any) {
            return { success: false, message: 'Impossible de contacter PawaPay.' };
        }
    }

    /* ─── Argent sortant (payouts) ─────────────────────────────── */

    /**
     * L'operateur PawaPay pour un pays et un code Cartflox, SANS approximation.
     * Pour un depot, se tromper d'operateur echoue sans dommage ; pour un envoi
     * ce serait payer la mauvaise personne. Null si ce n'est pas exact.
     */
    static correspondant(countryAlpha2: string, operateur: string): string | null {
        const pays = (countryAlpha2 || '').toUpperCase();
        const brut = (operateur || '').trim();
        const majuscule = brut.toUpperCase();
        const suffixe = majuscule.match(/^[A-Z0-9]+(?:_[A-Z0-9]+)*_([A-Z]{3})$/);
        if (suffixe && COUNTRY_MAP[pays] === suffixe[1]) return majuscule;
        const table = CORRESPONDENT_MAP[pays];
        if (!table) return null;
        const cle = normalizeLookupKey(brut);
        if (!cle) return null;
        for (const [k, v] of Object.entries(table)) {
            if (normalizeLookupKey(k) === cle || normalizeLookupKey(v) === cle) return v;
        }
        return null;
    }

    /**
     * Envoi vers un compte Mobile Money : POST /v2/payouts. Un refus se renvoie
     * en FAILED ; une panne reseau se LANCE, parce qu'on ne sait alors pas si
     * l'envoi est parti et qu'il ne faut surtout pas le renvoyer.
     */
    async initiatePayout(request: PayoutRequest): Promise<PayoutResponse> {
        const pays = (request.country || '').toUpperCase();
        let correspondant = PawaPayAdapter.correspondant(pays, request.operator);
        if (!correspondant) {
            return { providerReference: request.reference, status: 'FAILED', failureCode: 'OPERATEUR_INCONNU', failureMessage: `PawaPay ne dessert pas « ${request.operator} » en ${pays}.` };
        }
        const phone = sanitizeMsisdn(request.phone);
        // En Cote d'Ivoire le prefixe designe l'operateur : c'est lui qui a raison.
        const redresse = operateurSelonPrefixe(pays, phone, correspondant);
        if (redresse) {
            console.log(`[PawaPay] transfert : operateur redresse ${correspondant} → ${redresse} (numero ${phone})`);
            correspondant = redresse;
        }
        const body = {
            payoutId: request.reference,
            amount: montantPawaPay(request.amount, request.currency),
            currency: (request.currency || '').toUpperCase(),
            recipient: { type: 'MMO', accountDetails: { phoneNumber: phone, provider: correspondant } },
            customerMessage: sanitizePawaPayText(request.description || 'Transfert', 22) || 'Transfert',
            metadata: [
                { fieldName: 'reference', fieldValue: request.reference },
                ...(request.recipientName ? [{ fieldName: 'beneficiaire', fieldValue: request.recipientName, isPII: true }] : []),
            ],
        };
        console.log(`[PawaPay] payout: reference=${request.reference} provider=${correspondant} amount=${body.amount} ${body.currency}`);
        let res: Response;
        try {
            res = await fetch(`${this.baseUrl}/v2/payouts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.config.apiKey}` },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(20000),
            });
        } catch (error: any) {
            throw new Error(`PawaPay injoignable : ${error.message}`);
        }
        const data: any = await res.json().catch(() => ({}));
        const statut = String(data.status || '').toUpperCase();
        if (res.ok && (statut === 'ACCEPTED' || statut === 'ENQUEUED' || statut === 'DUPLICATE_IGNORED')) {
            return { providerReference: request.reference, status: 'PENDING', providerCode: correspondant, rawData: data };
        }
        const raison = data.failureReason || {};
        console.error(`[PawaPay] payout REFUSE: status=${res.status} body=${JSON.stringify(data).slice(0, 500)}`);
        return {
            providerReference: request.reference,
            status: 'FAILED',
            providerCode: correspondant,
            failureCode: raison.failureCode || data.errorId || `HTTP_${res.status}`,
            failureMessage: raison.failureMessage || data.errorMessage || data.message || `PawaPay a refusé le transfert (${res.status}).`,
            rawData: data,
        };
    }

    /** Etat d'un envoi : GET /v2/payouts/{payoutId}. NOT_FOUND = jamais recu par PawaPay. */
    async verifyPayout(providerReference: string): Promise<PayoutResponse> {
        const res = await fetch(`${this.baseUrl}/v2/payouts/${providerReference}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${this.config.apiKey}` },
            signal: AbortSignal.timeout(20000),
        });
        if (!res.ok) throw new Error(`PawaPay verify payout: ${res.status} ${res.statusText}`);
        const data: any = await res.json();
        if (String(data.status || '').toUpperCase() === 'NOT_FOUND') {
            return { providerReference, status: 'PENDING', notFound: true, rawData: data };
        }
        const d = data.data || data;
        const raison = d.failureReason || {};
        return {
            providerReference,
            status: this.mapStatus(d.status),
            providerCode: d.recipient?.accountDetails?.provider,
            providerTransactionId: d.providerTransactionId,
            failureCode: raison.failureCode,
            failureMessage: raison.failureMessage,
            rawData: d,
        };
    }

    // ─── Private helpers ────────────────────────────────────────

    /** Une raison lisible. Un 401 dit une chose precise : la cle du marchand est refusee. */
    private libellerErreur(status: number, data: any): string {
        const code = String(data?.failureReason?.failureCode || data?.errorCode || '');
        const message = String(data?.failureReason?.failureMessage || data?.errorMessage || data?.message || '');
        if (status === 401 || status === 403 || /AUTHENTICATION/i.test(code) || /authentication/i.test(message)) {
            return "Identifiants PawaPay refusés (clé API invalide, expirée ou du mauvais environnement) : le marchand doit vérifier sa passerelle.";
        }
        return message || `PawaPay a refusé la demande (${status}).`;
    }

    private mapStatus(pawapayStatus: string | undefined): PaymentStatus {
        switch ((pawapayStatus || '').toUpperCase()) {
            case 'COMPLETED':
                return 'SUCCESS';
            case 'FAILED':
            case 'REJECTED':
                return 'FAILED';
            case 'CANCELLED':
                return 'CANCELLED';
            case 'ACCEPTED':
            case 'SUBMITTED':
            case 'PENDING':
            case 'ENQUEUED':
                return 'PENDING';
            default:
                return 'PENDING';
        }
    }

    private resolveCorrespondent(countryAlpha2: string, methodCode: string): string | null {
        // Le front envoie parfois DIRECTEMENT le code opérateur PawaPay
        // (ex. AIRTEL_GAB, MTN_MOMO_CMR) : le suffixe est l'alpha-3 du pays. Si le
        // code se termine par un alpha-3 connu, on l'utilise tel quel — ça force
        // le dépôt direct (USSD) même pour les pays absents de CORRESPONDENT_MAP
        // (Gabon...) au lieu de la PaymentPage (redirection) qui n'aboutit pas.
        const rawUpper = (methodCode || '').toUpperCase();
        const suffixMatch = rawUpper.match(/^[A-Z0-9]+(?:_[A-Z0-9]+)*_([A-Z]{3})$/);
        if (suffixMatch && Object.values(COUNTRY_MAP).includes(suffixMatch[1])) {
            return rawUpper;
        }

        const countryCorrespondents = CORRESPONDENT_MAP[countryAlpha2];
        if (!countryCorrespondents) return null;
        const normalizedMethod = normalizeLookupKey(methodCode);

        // Exact match
        if (countryCorrespondents[methodCode]) return countryCorrespondents[methodCode];

        // Exact match if the UI already sends the provider code (e.g. MTN_MOMO_CMR)
        for (const value of Object.values(countryCorrespondents)) {
            if (normalizeLookupKey(value) === normalizedMethod) {
                return value;
            }
        }

        // Fuzzy match: try partial key matching (e.g. "mtn" matches "mtn_money")
        for (const [key, value] of Object.entries(countryCorrespondents)) {
            const normalizedKey = normalizeLookupKey(key);
            const normalizedValue = normalizeLookupKey(value);
            if (
                normalizedKey.includes(normalizedMethod) ||
                normalizedMethod.includes(normalizedKey) ||
                normalizedValue.includes(normalizedMethod) ||
                normalizedMethod.includes(normalizedValue)
            ) {
                return value;
            }
        }

        // Return first available correspondent for the country as last resort
        const values = Object.values(countryCorrespondents);
        return values.length > 0 ? values[0] : null;
    }
}
