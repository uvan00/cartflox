import {
    IPaymentProvider,
    PaymentRequest,
    PaymentResponse,
    PaymentStatus,
    WebhookResult
} from '../types';

/**
 * FeexPay Payment Provider Adapter
 * Documentation: https://docs.feexpay.me/
 * 
 * Supported Payment Methods:
 * - Mobile Money (MTN, Moov)
 * - Bank Cards (Visa, MasterCard)
 * - E-Wallets
 * 
 * Primary Countries:
 * - Benin (Main)
 * - Togo
 * - Côte d'Ivoire
 * - Senegal
 * - Congo
 * 
 * Currency: XOF (FCFA)
 */

interface FeexPayConfig {
    shopId: string;      // ID de la boutique
    apiKey: string;      // Token API (fp_...)
    mode: 'SANDBOX' | 'LIVE';
}

interface FeexPayTransactionResponse {
    financialTransactionId?: string;
    externalId?: string;
    amount?: string;
    currency?: string;
    payer?: {
        partyIdType?: string;
        partyId?: string;
    };
    payerMessage?: string;
    payeeNote?: string;
    status?: 'PENDING' | 'SUCCESSFUL' | 'FAILED' | 'IN PENDING STATE';
    reason?: string;
}

interface FeexPayLinkResponse {
    success?: boolean;
    message?: string;
    link?: string;
    reference?: string;
}

/** Code USSD qui genere un code de paiement Orange Money (ancienne regle, si FeexPay le reclame encore). */
const USSD_ORANGE: Record<string, string> = { orange_ci: '#144*82#', orange_bf: '*144*4*6*#' };

/**
 * Segment de reseau de l'API v2 d'apres notre code de moyen (« mtn-ci-feexpay »),
 * tel que documente sur docs.feexpay.me (Payin, un onglet par pays) :
 * Benin mtn, moov, celtiis_bj, coris ; Togo togocom_tg, moov_tg ; Cote d'Ivoire
 * mtn_ci, moov_ci, wave_ci, orange_ci ; Congo mtn_cg ; Senegal orange_sn, wave_sn,
 * free_sn ; Burkina moov_bf, orange_bf, wave_bf ; Mali orange_ml, mobicash_ml.
 * null = pas de demande poussee (carte : page hebergee FeexLink v2).
 */
function reseauFeexPay(code: string): string | null {
    const m = code.toLowerCase().match(/^(mtn|moov|flooz|orange|free|celtiis|coris|wave|mobicash|tmoney|t-money|togocom)-([a-z]{2})-/);
    if (!m) return null;
    const pays = m[2];
    let operateur = m[1];
    if (operateur === 'flooz') operateur = 'moov';
    if (operateur === 'tmoney' || operateur === 't-money') operateur = 'togocom';
    if (pays === 'bj') return operateur === 'celtiis' ? 'celtiis_bj' : operateur;
    return `${operateur}_${pays}`;
}

/** Les refus de FeexPay (codes d'erreur et motifs documentes), dits en francais. */
const MESSAGES_FEEXPAY: [RegExp, string][] = [
    [/LOW_BALANCE|INSUFFICIENT|solde insuffisant/i, "Solde insuffisant, plafond atteint ou paiement non autorisé sur ce compte"],
    [/PAYER_NOT_FOUND|ERR_INVALID_PHONE|invalid phone/i, "Ce numéro n'est pas reconnu par l'opérateur pour ce réseau"],
    [/ERR_INVALID_AMOUNT|invalid amount|minimum|maximum/i, "Montant hors limites FeexPay (100 à 2 000 000 XOF)"],
    [/channel not configured|NETWORK_UNAVAILABLE|ERR_NETWORK|maintenance|not supported/i, "Ce réseau n'est pas activé sur votre boutique FeexPay, ou il est en maintenance"],
    [/DUPLICATE/i, "Transaction en double chez FeexPay : vérifiez la précédente avant de réessayer"],
    [/UNAUTHORIZED|ERR_INVALID_API_KEY|Token invalide|invalid api key/i, "Identifiants FeexPay refusés : vérifiez la clé API"],
    [/IP_NOT|ERR_IP/i, "Adresse IP du serveur non autorisée dans FeexPay (menu Développeur, liste blanche)"],
    [/ACCESS_DENIED|FORBIDDEN/i, "Accès refusé par FeexPay : pays ou réseau bloqué pour cette boutique"],
    [/Shop (not found|is disabled|introuvable)|ERR_SHOP|Merchant or Shop/i, "Boutique FeexPay introuvable ou désactivée : vérifiez le Shop ID"],
    [/RATE_LIMIT/i, "Trop de demandes envoyées à FeexPay : réessayez dans un instant"],
    [/^HTTP 502$|Bad Gateway/i, "FeexPay n'a pas pu joindre l'opérateur (erreur 502) : réessayez dans un instant"],
    [/^HTTP 503$/i, "Réseau en maintenance chez FeexPay : réessayez plus tard"],
];
function messageFeexPay(data: any, httpStatus?: number): string {
    const brut = String(data?.reason || data?.message || data?.error?.message || (typeof data?.error === 'string' ? data.error : '') || data?.code || (httpStatus ? `HTTP ${httpStatus}` : '')).trim();
    for (const [motif, texte] of MESSAGES_FEEXPAY) if (motif.test(brut)) return texte;
    if (brut && !/^HTTP \d+$/.test(brut)) return `FeexPay : ${brut}`;
    return httpStatus ? `FeexPay a répondu ${httpStatus}` : 'FeexPay a refusé la demande sans détail';
}

export class FeexPayAdapter implements IPaymentProvider {
    readonly name = 'FeexPay';
    private config: FeexPayConfig;
    // API v2 seule : l'ancien hote api.feexpay.me (FeexLink v1) repond 502 depuis le 18/09/2026.
    private baseUrl = 'https://api-v2.feexpay.me';

    constructor(config: FeexPayConfig) {
        this.config = config;
    }

    /**
     * Generate a unique custom ID
     */
    private generateCustomId(orderId: string): string {
        return `FEEX_${orderId}_${Date.now()}`;
    }

    private entetes(): Record<string, string> {
        return { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': `Bearer ${this.config.apiKey}` };
    }

    /**
     * Demande poussee (POST /api/transactions/public/requesttopay/<reseau>).
     * MTN, Moov, Free, Togocom... : l'acheteur confirme sur son telephone, on reste
     * sur notre page. Wave (CI, SN, BF) et Orange (CI, BF, SN, ML) : FeexPay rend une
     * `payment_url` (application Wave, page web Orange) vers laquelle on envoie
     * l'acheteur, puis il revient sur `return_url`.
     */
    private async pousser(request: PaymentRequest, customId: string, chiffres: string, reseau: string): Promise<PaymentResponse> {
        const [prenom, ...reste] = String(request.customerName || 'Client').trim().split(/\s+/);
        const corps: Record<string, any> = {
            shop: this.config.shopId,
            amount: Math.round(request.amount),
            phoneNumber: chiffres,
            first_name: prenom,
            last_name: reste.join(' ') || prenom,
            description: `Commande ${request.orderId}`.replace(/[^\w\s-]/g, ''),
            callback_info: request.orderId,
            return_url: request.returnUrl,
            cancel_url: request.cancelUrl || request.returnUrl,
        };
        const otp = String(request.metadata?.otp || '').trim();
        if (otp) corps.otp = otp;
        try {
            const response = await fetch(`${this.baseUrl}/api/transactions/public/requesttopay/${reseau}`, {
                method: 'POST', headers: this.entetes(), body: JSON.stringify(corps), signal: AbortSignal.timeout(25000),
            });
            const data: any = await response.json().catch(() => ({}));
            const refuse = response.status === 401 || response.status === 403;
            if (!response.ok || String(data?.status || '').toUpperCase() === 'FAILED') {
                // Ancienne regle Orange : un code de paiement genere par l'acheteur. Si
                // FeexPay le reclame encore, on le demande chez nous puis on renvoie la demande.
                const ussd = USSD_ORANGE[reseau];
                if (ussd && !otp && /\botp\b|code de paiement|payment code/i.test(String(data?.message || data?.reason || ''))) {
                    return {
                        transactionId: customId, providerReference: '', status: 'PENDING',
                        rawData: { _otp_requis: true, _otp_ussd: ussd, _instructions: `Composez ${ussd} sur votre téléphone pour générer votre code de paiement Orange Money, puis saisissez-le ici.` },
                    };
                }
                return { transactionId: customId, providerReference: String(data?.reference || ''), status: 'FAILED', rawData: { ...data, error: messageFeexPay(data, response.status), _identifiants_refuses: refuse } };
            }
            const reference = String(data?.reference || data?.order_id || data?.transref || '');
            if (!reference) {
                return { transactionId: customId, providerReference: '', status: 'FAILED', rawData: { ...data, error: 'FeexPay a accepté la demande sans renvoyer de référence' } };
            }
            const pageDePaiement = typeof data?.payment_url === 'string' && /^https?:\/\//i.test(data.payment_url) ? data.payment_url : undefined;
            return {
                transactionId: customId,
                providerReference: reference,
                status: 'PENDING',
                checkoutUrl: pageDePaiement,
                rawData: { ...data, ...(pageDePaiement && reseau.startsWith('wave') ? { _application: 'Wave' } : {}) },
            };
        } catch (error: any) {
            const delai = error?.name === 'TimeoutError' || error?.name === 'AbortError';
            return { transactionId: customId, providerReference: '', status: 'FAILED', rawData: { error: delai ? 'FeexPay ne répond pas (délai dépassé)' : (error?.message || 'FeexPay injoignable') } };
        }
    }

    /**
     * FeexLink v2 (POST /api/feexlinks/generate) : la page hebergee de FeexPay, pour
     * la carte bancaire. La reponse ne porte qu'une adresse ; la reference FeexPay
     * arrive en `?ref=` sur l'adresse de retour (et par webhook) : la page de
     * retour l'attache a la transaction, puis le statut est verifie par l'API.
     */
    private async lienHeberge(request: PaymentRequest, customId: string, paymentMethod: 'CARD' | 'MOBILE' | 'ALL'): Promise<PaymentResponse> {
        const corps = {
            shop: this.config.shopId,
            amount: Math.round(request.amount),
            description: (`Commande ${request.orderId}`.replace(/[^\w\s-]/g, '') || 'Paiement'),
            paymentMethod,
            range: 1,
            expireIn: 60,
            callback_url: request.returnUrl,
            callback_error: request.cancelUrl || request.returnUrl,
        };
        try {
            const response = await fetch(`${this.baseUrl}/api/feexlinks/generate`, {
                method: 'POST', headers: this.entetes(), body: JSON.stringify(corps), signal: AbortSignal.timeout(20000),
            });
            const data: any = await response.json().catch(() => ({}));
            const url = typeof data?.urlPay === 'string' && /^https?:\/\//i.test(data.urlPay) ? data.urlPay
                : (typeof data?.link === 'string' && /^https?:\/\//i.test(data.link) ? data.link : '');
            if (!response.ok || !url) {
                return { transactionId: customId, providerReference: '', status: 'FAILED', rawData: { ...data, error: messageFeexPay(data, response.status), _identifiants_refuses: response.status === 401 || response.status === 403 } };
            }
            return { transactionId: customId, providerReference: '', status: 'PENDING', checkoutUrl: url, rawData: { ...data, _lien_heberge: true } };
        } catch (error: any) {
            const delai = error?.name === 'TimeoutError' || error?.name === 'AbortError';
            return { transactionId: customId, providerReference: '', status: 'FAILED', rawData: { error: delai ? 'FeexPay ne répond pas (délai dépassé)' : (error?.message || 'FeexPay injoignable') } };
        }
    }

    async initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
        const customId = this.generateCustomId(request.orderId);
        try {
            const code = String(request.metadata?.methodCode || '');
            const chiffres = String(request.customerPhone || '').replace(/\D/g, '');
            const reseau = reseauFeexPay(code);
            if (reseau) {
                if (!chiffres) return { transactionId: customId, providerReference: '', status: 'FAILED', rawData: { error: 'Numéro de téléphone requis pour ce moyen de paiement' } };
                return await this.pousser(request, customId, chiffres, reseau);
            }
            // Carte bancaire, ou moyen sans segment documente : page hebergee.
            const carte = /card|carte|visa|master/i.test(code);
            return await this.lienHeberge(request, customId, carte ? 'CARD' : 'ALL');
        } catch (error: any) {
            console.error('[FeexPay] initiatePayment error:', error);
            return { transactionId: customId, providerReference: '', status: 'FAILED', rawData: { error: error?.message || 'FeexPay injoignable' } };
        }
    }

    /**
     * Verify payment status
     */
    async verifyPayment(providerReference: string): Promise<PaymentResponse> {
        try {
            const response = await fetch(
                `${this.baseUrl}/api/transactions/public/single/status/${providerReference}`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${this.config.apiKey}`,
                    },
                    signal: AbortSignal.timeout(20000),
                }
            );

            const data: FeexPayTransactionResponse = await response.json().catch(() => ({} as FeexPayTransactionResponse));

            // 401/403/404/5xx : FeexPay n'a pas repondu sur la transaction. Rendre
            // PENDING ici faisait passer un jeton refuse pour un paiement en cours.
            if (!response.ok) {
                return {
                    transactionId: providerReference,
                    providerReference,
                    status: 'FAILED' as PaymentStatus,
                    rawData: { ...(data as any), error: (data as any)?.message || (data as any)?.reason || `FeexPay a répondu ${response.status}` },
                };
            }

            let status: PaymentStatus = 'PENDING';
            const txStatus = data.status?.toUpperCase();

            if (txStatus === 'SUCCESSFUL') {
                status = 'SUCCESS';
            } else if (txStatus === 'FAILED') {
                status = 'FAILED';
            } else if (txStatus === 'PENDING' || txStatus === 'IN PENDING STATE') {
                status = 'PENDING';
            }

            return {
                transactionId: data.externalId || providerReference,
                providerReference: data.financialTransactionId || providerReference,
                status,
                rawData: status === 'FAILED' ? { ...data, error: messageFeexPay(data) } : data,
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
     * Process FeexPay webhook
     * Webhook payload structure:
     * {
     *   reference: string,
     *   order_id: string,
     *   status: 'SUCCESSFUL' | 'FAILED',
     *   amount: number,
     *   callback_info: string,
     *   last_name: string,
     *   first_name: string,
     *   email: string,
     *   type: string,
     *   phoneNumber: number,
     *   date: string,
     *   reseau: 'MTN' | 'MOOV',
     *   ref_link: string,
     *   description: string,
     *   reason?: string
     * }
     */
    async handleWebhook(payload: any, headers?: any): Promise<WebhookResult> {
        try {
            const data = payload;

            let status: PaymentStatus = 'PENDING';
            if (data.status === 'SUCCESSFUL') {
                status = 'SUCCESS';
            } else if (data.status === 'FAILED') {
                status = 'FAILED';
            }

            return {
                transactionId: data.order_id || data.reference,
                providerReference: data.reference,
                status,
                rawData: {
                    ...data,
                    customerName: `${data.first_name} ${data.last_name}`.trim(),
                    customerEmail: data.email,
                    customerPhone: data.phoneNumber,
                    network: data.reseau,
                    amount: data.amount,
                    failureReason: data.reason,
                    ...(status === 'FAILED' ? { error: messageFeexPay(data) } : {}),
                },
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
     * Payout API - Send money to a mobile wallet
     */
    async payout(details: {
        phone: string;
        amount: number;
        network: 'MTN' | 'MOOV';
        country?: string; // BJ, TG, CI, SN, CG
    }): Promise<{ success: boolean; reference?: string; message?: string }> {
        try {
            const response = await fetch(`${this.baseUrl}/api/payouts/public/transfer/global`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.apiKey}`,
                },
                body: JSON.stringify({
                    phone: details.phone,
                    amount: details.amount,
                    network: details.network,
                    country: details.country || 'BJ',
                }),
                signal: AbortSignal.timeout(20000),
            });

            const data = await response.json();

            return {
                success: data.success || false,
                reference: data.reference,
                message: data.message,
            };
        } catch (error: any) {
            return {
                success: false,
                message: error.message,
            };
        }
    }

    /**
     * Get supported payment methods for a country
     */
    getSupportedMethods(countryCode: string): string[] {
        const methods: Record<string, string[]> = {
            'BJ': ['MTN Mobile Money', 'Moov Money', 'Visa/MasterCard'],
            'TG': ['T-Money', 'Moov Money', 'Visa/MasterCard'],
            'CI': ['Orange Money', 'MTN Mobile Money', 'Moov Money', 'Wave', 'Visa/MasterCard'],
            'SN': ['Orange Money', 'Free Money', 'Wave', 'Visa/MasterCard'],
            'CG': ['MTN Mobile Money', 'Visa/MasterCard'],
        };
        return methods[countryCode] || ['MTN Mobile Money', 'Moov Money', 'Visa/MasterCard'];
    }

    /**
     * Get supported currencies
     */
    getSupportedCurrencies(): string[] {
        return ['XOF', 'USD', 'CAD']; // USD/CAD for card payments only
    }

    /**
     * Validate credentials by checking API key format
     */
    async validateCredentials(): Promise<{ success: boolean; message?: string }> {
        try {
            // FeexPay API keys start with 'fp_'
            if (!this.config.apiKey.startsWith('fp_')) {
                return {
                    success: false,
                    message: 'La clé API FeexPay doit commencer par "fp_"'
                };
            }

            if (!this.config.shopId || this.config.shopId.length < 10) {
                return {
                    success: false,
                    message: 'L\'identifiant boutique FeexPay est invalide'
                };
            }

            // Try to verify by checking a non-existent transaction
            // This will fail but should return a proper response if credentials are valid
            const response = await fetch(
                `${this.baseUrl}/api/transactions/public/single/status/test-validation-check`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${this.config.apiKey}`,
                    },
                    signal: AbortSignal.timeout(20000),
                }
            );

            // If we get 401, credentials are invalid
            if (response.status === 401 || response.status === 403) {
                return {
                    success: false,
                    message: 'Clé API FeexPay invalide ou non autorisée'
                };
            }

            // Any other response means the API key is valid (even 404 for non-existent tx)
            return { success: true };
        } catch (error: any) {
            return {
                success: false,
                message: 'Impossible de contacter FeexPay. Vérifiez votre connexion.'
            };
        }
    }
}
