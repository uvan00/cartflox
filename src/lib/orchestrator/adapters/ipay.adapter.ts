import crypto from 'crypto';
import {
    IPaymentProvider,
    PaymentRequest,
    PaymentResponse,
    PaymentStatus,
    WebhookResult
} from '../types';

/**
 * iPay Money (iFutur, Niger) : https://docs.i-pay.money/
 *
 * Mobile Money par POUSSEE DIRECTE : on cree le paiement avec le numero du
 * client, iPay lui envoie la demande a valider sur son telephone, et nous
 * interrogeons l'etat (ou recevons le webhook). Les cartes passent par une
 * page hebergee (external_payments) qui renvoie une URL.
 *
 * - Un seul hote pour tout : c'est l'en-tete Ipay-Target-Environment
 *   (sandbox ou live) qui choisit l'environnement.
 * - En-tetes : Authorization: Bearer <cle secrete>, et Ipay-Payment-Type sur
 *   CHAQUE appel, lecture de statut comprise (sinon « Missing params ») :
 *   « mobile » pour le Mobile Money (iPay reconnait l'operateur d'apres le
 *   numero ; les codes par operateur sont refuses), « external_payment » pour
 *   la page hebergee.
 * - Pays : Niger et Benin. Devise : XOF, montants entiers. Reference de
 *   transaction limitee a 40 caracteres ; celle d'une page hebergee doit au
 *   contraire faire au moins 32 caracteres ALEATOIRES (128 bits).
 * - Webhook : en-tete Secret-Hash = secret defini par le marchand
 *   (verifie dans lib/webhook-verify.ts).
 */
interface IPayConfig {
    secretKey: string;
    webhookSecret?: string;
    mode?: 'test' | 'live';
}

const BASE = 'https://i-pay.money/api/v1';

const INDICATIFS: Record<string, string> = { NE: '227', BJ: '229' };

export class IPayAdapter implements IPaymentProvider {
    readonly name = 'iPay Money';

    constructor(private config: IPayConfig) {}

    private entetes(type: 'mobile' | 'external_payment' = 'mobile') {
        return {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${this.config.secretKey || ''}`,
            'Ipay-Target-Environment': this.config.mode === 'test' ? 'sandbox' : 'live',
            'Ipay-Payment-Type': type,
        };
    }

    /** Etats iPay : initiated, pending, succeeded, failed, refunded (et created au webhook). */
    private statut(brut: any): PaymentStatus {
        const s = String(brut || '').toLowerCase();
        if (s === 'succeeded' || s === 'success' || s === 'refunded') return 'SUCCESS';
        if (s === 'failed' || s === 'cancelled' || s === 'canceled') return 'FAILED';
        return 'PENDING';
    }

    private message(data: any): string {
        const m = data?.message || data?.error || data?.errors || data?.detail;
        if (Array.isArray(m)) return m.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(', ');
        if (m && typeof m === 'object') return JSON.stringify(m);
        return typeof m === 'string' ? m : '';
    }

    /** Numero international sans « + » : 227XXXXXXXX (Niger) ou 229XXXXXXXX (Benin). */
    private msisdn(brut: string | undefined, pays: string): string {
        const chiffres = String(brut || '').replace(/\D/g, '').replace(/^00/, '');
        if (!chiffres) return '';
        const indicatif = INDICATIFS[pays] || '';
        if (indicatif && !chiffres.startsWith(indicatif) && chiffres.length <= 10) return `${indicatif}${chiffres}`;
        return chiffres;
    }

    async initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
        const echec = (error: string, rawData?: any): PaymentResponse => ({
            transactionId: request.orderId, providerReference: '', status: 'FAILED', rawData: { ...(rawData || {}), error },
        });
        const devise = (request.currency || 'XOF').toUpperCase();
        if (devise !== 'XOF') return echec(`iPay Money n'encaisse qu'en XOF (paiement demandé en ${devise})`);
        try {
            const code = String(request.metadata?.methodCode || '').toLowerCase();
            const paysClient = String(request.metadata?.country || '').toUpperCase();
            const pays = /-ne-/.test(code) ? 'NE' : /-bj-/.test(code) ? 'BJ' : (paysClient === 'BJ' ? 'BJ' : 'NE');
            const reference = String(request.orderId).slice(0, 40);
            const montant = Math.round(request.amount);

            // Cartes : page hebergee iPay, l'acheteur y saisit sa carte. La reference
            // exigee est un secret aleatoire : on la garde comme reference fournisseur.
            if (/card/.test(code)) {
                const referencePage = crypto.randomBytes(16).toString('hex');
                const corps = {
                    title: request.metadata?.description || `Paiement ${request.orderId}`,
                    description: `Commande ${request.orderId}`,
                    amount: montant,
                    reference: referencePage,
                    on_success_redirection_url: request.returnUrl,
                    on_failed_redirection_url: request.cancelUrl || request.returnUrl,
                };
                const reponse = await fetch(`${BASE}/external_payments`, {
                    method: 'POST', headers: this.entetes('external_payment'), body: JSON.stringify(corps), signal: AbortSignal.timeout(20000),
                });
                const data: any = await reponse.json().catch(() => ({}));
                if (reponse.status === 401 || reponse.status === 403) {
                    return echec(`iPay Money a refusé les identifiants (${this.message(data) || reponse.status})`, data);
                }
                const d = data?.data || data || {};
                if (!reponse.ok || !d.page_url) return echec(this.message(data) || `iPay Money a répondu ${reponse.status}`, data);
                return { transactionId: request.orderId, providerReference: d.reference || referencePage, status: 'PENDING', checkoutUrl: d.page_url, rawData: data };
            }

            // Mobile Money : poussee directe sur le numero du client.
            const msisdn = this.msisdn(request.customerPhone, pays);
            if (!msisdn) return echec('Numéro Mobile Money requis pour iPay Money');
            const corps = {
                customer_name: request.customerName || 'Client',
                currency: 'XOF',
                country: pays,
                amount: montant,
                transaction_id: reference,
                msisdn,
            };
            const reponse = await fetch(`${BASE}/payments`, {
                method: 'POST', headers: this.entetes('mobile'), body: JSON.stringify(corps), signal: AbortSignal.timeout(25000),
            });
            const data: any = await reponse.json().catch(() => ({}));
            if (reponse.status === 401 || reponse.status === 403) {
                return echec(`iPay Money a refusé les identifiants (${this.message(data) || reponse.status})`, data);
            }
            const d = data?.data || data || {};
            if (!reponse.ok || (!d.reference && !d.status)) return echec(this.message(data) || `iPay Money a répondu ${reponse.status}`, data);
            const status = this.statut(d.status);
            return {
                transactionId: request.orderId,
                providerReference: d.reference || reference,
                status: status === 'FAILED' ? 'FAILED' : status,
                rawData: data,
            };
        } catch (error: any) {
            console.error('[iPay] initiatePayment error:', error);
            return echec(error?.message || 'iPay Money injoignable');
        }
    }

    async verifyPayment(providerReference: string): Promise<PaymentResponse> {
        try {
            // On ne sait plus ici si la reference vient d'une poussee Mobile Money
            // ou d'une page hebergee : on demande d'abord en « mobile », puis en
            // « external_payment » si iPay refuse le type.
            let reponse = await fetch(`${BASE}/payments/${encodeURIComponent(providerReference)}`, {
                headers: this.entetes('mobile'), signal: AbortSignal.timeout(20000),
            });
            let data: any = await reponse.json().catch(() => ({}));
            if (reponse.status === 400 && /payment type|missing params/i.test(this.message(data))) {
                reponse = await fetch(`${BASE}/payments/${encodeURIComponent(providerReference)}`, {
                    headers: this.entetes('external_payment'), signal: AbortSignal.timeout(20000),
                });
                data = await reponse.json().catch(() => ({}));
            }
            const d = data?.data || data || {};
            if (!reponse.ok) {
                return { transactionId: providerReference, providerReference, status: 'PENDING', rawData: { ...data, error: this.message(data) || `iPay Money a répondu ${reponse.status}` } };
            }
            return {
                transactionId: d.external_reference || providerReference,
                providerReference: d.reference || providerReference,
                status: this.statut(d.status),
                rawData: data,
            };
        } catch (error: any) {
            return { transactionId: providerReference, providerReference, status: 'PENDING', rawData: { error: error?.message } };
        }
    }

    /** Webhook : { data: { external_reference, reference, status, amount, ... } }. */
    async handleWebhook(payload: any): Promise<WebhookResult> {
        const d = payload?.data || payload || {};
        return {
            transactionId: d.external_reference || '',
            providerReference: d.reference || '',
            status: this.statut(d.status),
            rawData: payload,
        };
    }

    async validateCredentials(): Promise<{ success: boolean; message?: string }> {
        if (!this.config.secretKey) return { success: false, message: 'Clé API secrète iPay Money requise' };
        try {
            // Une reference inexistante : seul le refus d'authentification compte
            // (401 « No Valid Key » avec une mauvaise cle, 404 avec une bonne).
            const reponse = await fetch(`${BASE}/payments/cartflox-verification`, { headers: this.entetes('mobile'), signal: AbortSignal.timeout(15000) });
            if (reponse.status === 401 || reponse.status === 403) {
                const data: any = await reponse.json().catch(() => ({}));
                return { success: false, message: `iPay Money refuse cette clé (${this.message(data) || reponse.status})` };
            }
            return { success: true };
        } catch (error: any) {
            return { success: false, message: `iPay Money injoignable : ${error?.message || 'réseau'}` };
        }
    }
}
