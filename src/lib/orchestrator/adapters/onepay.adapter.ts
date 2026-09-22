import {
    IPaymentProvider,
    PaymentRequest,
    PaymentResponse,
    PaymentStatus,
    WebhookResult
} from '../types';

/**
 * Magma OnePay : https://docs.magmaonepay.com/
 *
 * Mobile Money DIRECT : l'initialisation avec le numero, puis « process »,
 * poussent la demande sur le telephone de l'acheteur, qui reste sur notre
 * page (code a usage unique saisi chez nous quand l'operateur l'exige).
 * Wave, la carte, ou un compte qui impose sa page, passent par payment_url.
 * Le meme hote sert la production et le bac a sable : ce sont les
 * identifiants (de test ou de production) qui font la difference.
 *
 * - En-tetes : Authorization: Bearer TOKEN et X-User-Secret: SECRET_KEY.
 * - Montants entiers en XOF/XAF, de 200 a 1 500 000.
 * - Pays : Benin, Cote d'Ivoire, Togo, Senegal, Mali, Burkina Faso, Cameroun.
 * - Webhook signe (X-SIGNATURE), verifie dans lib/webhook-verify.ts.
 */
interface OnePayConfig {
    token: string;
    secret: string;
    mode?: 'test' | 'live';
}

const BASE = 'https://api.magmaonepay.com/v1';

/** Moyen OnePay d'apres notre code de moyen (orange-ci-onepay, mtn-bj-onepay...). */
const METHODE: [RegExp, string][] = [
    [/orange-ci/, 'ORANGE_CI'], [/mtn-ci/, 'MTN_CI'], [/moov-ci/, 'MOOV_CI'], [/wave-ci/, 'WAVE_CI'],
    [/orange-sn/, 'ORANGE_SN'], [/wave-sn/, 'WAVE_SN'], [/free-sn/, 'FREE_SN'], [/expresso-sn/, 'EXPRESSO_SN'],
    [/mtn-bj/, 'MTN_BJ'], [/moov-bj/, 'MOOV_BJ'],
    [/tmoney-tg/, 'TMONEY_TG'], [/moov-tg/, 'MOOV_TG'],
    [/orange-ml/, 'ORANGE_ML'], [/moov-ml/, 'MOOV_ML'],
    [/orange-bf/, 'ORANGE_BF'], [/moov-bf/, 'MOOV_BF'],
    [/mtn-cm/, 'MTN_CM'], [/orange-cm/, 'ORANGE_CM'],
];

export class OnePayAdapter implements IPaymentProvider {
    readonly name = 'Magma OnePay';

    constructor(private config: OnePayConfig) {}

    private entetes() {
        return {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${this.config.token || ''}`,
            'X-User-Secret': this.config.secret || '',
        };
    }

    /** Etats OnePay : new, pending, success, failed, cancelled, refunded. */
    private statut(brut: any): PaymentStatus {
        const s = String(brut || '').toLowerCase();
        if (s === 'success' || s === 'refunded') return 'SUCCESS';
        if (s === 'failed' || s === 'cancelled' || s === 'canceled') return 'FAILED';
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
        try {
            const code = String(request.metadata?.methodCode || '').toLowerCase();
            const channel = /card/.test(code) ? 'credit_card' : /wave/.test(code) ? 'wave' : 'mobile_money';
            const methode = METHODE.find(([motif]) => motif.test(code))?.[1];
            const chiffres = String(request.customerPhone || '').replace(/\D/g, '');
            const [prenom, ...reste] = String(request.customerName || '').trim().split(/\s+/);
            const corps: Record<string, any> = {
                merchant_transaction_id: request.orderId,
                amount: Math.round(request.amount),
                currency: (request.currency || 'XOF').toUpperCase(),
                description: request.metadata?.description || `Paiement ${request.orderId}`,
                channel,
                ...(methode ? { payment_method: methode } : {}),
                ...(chiffres ? { payee: `+${chiffres}` } : {}),
                ...(prenom ? { payee_first_name: prenom, payee_last_name: reste.join(' ') || prenom } : {}),
                webhook_url: request.callbackUrl,
                success_url: request.returnUrl,
                error_url: request.cancelUrl || request.returnUrl,
                custom_field: request.orderId,
            };
            const reponse = await fetch(`${BASE}/payment/init`, {
                method: 'POST', headers: this.entetes(), body: JSON.stringify(corps), signal: AbortSignal.timeout(25000),
            });
            const data: any = await reponse.json().catch(() => ({}));
            if (reponse.status === 401 || reponse.status === 403) {
                return echec(`Magma OnePay a refusé les identifiants (${this.message(data) || reponse.status})`, data);
            }
            const d = data?.data || {};
            if (!reponse.ok || !d.payment_token) {
                return echec(this.message(data) || `Magma OnePay a répondu ${reponse.status}`, data);
            }
            const meta = d.meta || {};
            const instructions = [meta.before_payment_instructions, meta.after_payment_instructions].filter(Boolean).join(' ');
            // Mobile Money avec numero : le paiement se joue SUR NOTRE PAGE. OnePay
            // pousse la demande sur le telephone des l'appel de « process » (apres
            // le code a usage unique si l'operateur en exige un). Wave, la carte,
            // ou un compte qui impose sa page, gardent l'URL hebergee.
            const direct = channel === 'mobile_money' && !!chiffres && !meta.redirect_customer_to_url_processing
                && (d.direct_pay === true || d.payment_type === 'direct' || !d.payment_url);
            if (direct) {
                if (meta.otp) {
                    return {
                        transactionId: request.orderId, providerReference: d.payment_token, status: 'PENDING',
                        rawData: { ...data, _otp_requis: true, _otp_longueur: meta.otp_length, _instructions: instructions },
                    };
                }
                const suite = await this.traiter(d.payment_token);
                if (suite.status === 'FAILED') return echec(String(suite.rawData?.error || 'Magma OnePay a refusé la demande'), suite.rawData);
                return { ...suite, transactionId: request.orderId, rawData: { ...suite.rawData, _instructions: instructions } };
            }
            return {
                transactionId: request.orderId,
                providerReference: d.payment_token,
                status: d.payment_url ? 'PENDING' : this.statut(d.payment_status),
                checkoutUrl: d.payment_url || undefined,
                rawData: data,
            };
        } catch (error: any) {
            console.error('[OnePay] initiatePayment error:', error);
            return echec(error?.message || 'Magma OnePay injoignable');
        }
    }

    /** POST /payment/process : declenche la demande sur le telephone (avec le code si exige). */
    private async traiter(paymentToken: string, otp?: string): Promise<PaymentResponse> {
        try {
            const reponse = await fetch(`${BASE}/payment/process`, {
                method: 'POST', headers: this.entetes(),
                body: JSON.stringify({ payment_token: paymentToken, ...(otp ? { otp_code: otp } : {}) }),
                signal: AbortSignal.timeout(25000),
            });
            const data: any = await reponse.json().catch(() => ({}));
            const d = data?.data || {};
            if (!reponse.ok) {
                return { transactionId: paymentToken, providerReference: paymentToken, status: 'FAILED', rawData: { ...data, error: this.message(data) || `Magma OnePay a répondu ${reponse.status}` } };
            }
            return { transactionId: d.merchant_transaction_id || paymentToken, providerReference: d.payment_token || paymentToken, status: this.statut(d.payment_status), rawData: data };
        } catch (error: any) {
            return { transactionId: paymentToken, providerReference: paymentToken, status: 'FAILED', rawData: { error: error?.message || 'Magma OnePay injoignable' } };
        }
    }

    /** Code de confirmation saisi sur notre page. */
    async soumettreCode(providerReference: string, otp: string): Promise<PaymentResponse> {
        return this.traiter(providerReference, otp);
    }

    async verifyPayment(providerReference: string): Promise<PaymentResponse> {
        try {
            const reponse = await fetch(`${BASE}/payment/${encodeURIComponent(providerReference)}`, {
                headers: this.entetes(), signal: AbortSignal.timeout(20000),
            });
            const data: any = await reponse.json().catch(() => ({}));
            const d = data?.data || {};
            if (!reponse.ok) {
                return { transactionId: providerReference, providerReference, status: 'PENDING', rawData: { ...data, error: this.message(data) || `Magma OnePay a répondu ${reponse.status}` } };
            }
            return {
                transactionId: d.merchant_transaction_id || providerReference,
                providerReference: d.payment_token || providerReference,
                status: this.statut(d.payment_status),
                rawData: data,
            };
        } catch (error: any) {
            return { transactionId: providerReference, providerReference, status: 'PENDING', rawData: { error: error?.message } };
        }
    }

    /** Webhook : { event: "payment.success.webhook", data: { payment_token, merchant_transaction_id, payment_status } }. */
    async handleWebhook(payload: any): Promise<WebhookResult> {
        const d = payload?.data || payload || {};
        const evenement = String(payload?.event || '');
        const status = d.payment_status ? this.statut(d.payment_status)
            : /success/.test(evenement) ? 'SUCCESS' : /fail/.test(evenement) ? 'FAILED' : 'PENDING';
        return {
            transactionId: d.merchant_transaction_id || '',
            providerReference: d.payment_token || '',
            status,
            rawData: payload,
        };
    }

    async validateCredentials(): Promise<{ success: boolean; message?: string }> {
        if (!this.config.token || !this.config.secret) return { success: false, message: 'Token et clé secrète Magma OnePay requis' };
        try {
            const reponse = await fetch(`${BASE}/misc/balance`, { headers: this.entetes(), signal: AbortSignal.timeout(15000) });
            if (reponse.status === 401 || reponse.status === 403) {
                const data: any = await reponse.json().catch(() => ({}));
                return { success: false, message: `Magma OnePay refuse ces identifiants (${this.message(data) || reponse.status})` };
            }
            return { success: true };
        } catch (error: any) {
            return { success: false, message: `Magma OnePay injoignable : ${error?.message || 'réseau'}` };
        }
    }
}
