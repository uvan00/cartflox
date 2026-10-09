import {
    IPaymentProvider,
    PaymentRequest,
    PaymentResponse,
    PaymentStatus,
    WebhookResult
} from '../types';

/**
 * FedaPay Payment Provider Adapter
 * Documentation: https://docs.fedapay.com/integration-api/en/collects-management-en
 *
 * Direct Mobile Money flow (stays on YOUR checkout — no redirect):
 *   1. POST /v1/transactions            → create transaction, get ID
 *      (reponse enveloppee sous la cle « v1/transaction », comme le lit le SDK officiel)
 *   2. POST /v1/transactions/:id/token  → { token, url } (url = page de paiement FedaPay)
 *   3. POST /v1/:mode                   → trigger payment with token + phone_number
 *      Modes (doc « Paiement sans redirection ») : mtn_open (MTN Benin), moov (Moov Benin),
 *      sbin (Celtiis Benin), mtn_ci, moov_tg, togocel (T-Money), free_sn, airtel_ne,
 *      mtn_open_gn (MTN Guinee). Tous les operateurs n'acceptent pas l'envoi direct :
 *      s'il est refuse, l'acheteur finit sur la page FedaPay (url du jeton).
 *
 * Supported Countries: Benin, Togo, Guinea, Côte d'Ivoire, Niger, Senegal
 * Currency: XOF
 */

interface FedaPayConfig {
    apiKey: string;
    mode?: 'test' | 'live';
}

// Map method codes → FedaPay endpoint + country code
const METHOD_ENDPOINTS: Record<string, { endpoint: string; country: string }> = {
    'mtn-benin':        { endpoint: 'mtn_open',    country: 'bj' },
    'moov-benin':       { endpoint: 'moov',        country: 'bj' },
    'celtiis-benin':    { endpoint: 'sbin',        country: 'bj' },
    'airtel-niger':     { endpoint: 'airtel_ne',   country: 'ne' },
    'mtn-momo-benin':   { endpoint: 'mtn_open',    country: 'bj' },
    'moov-money-benin': { endpoint: 'moov',        country: 'bj' },
    'mtn-ci-fedapay':   { endpoint: 'mtn_ci',      country: 'ci' },
    'moov-togo':        { endpoint: 'moov_tg',     country: 'tg' },
    'togocom-togo':     { endpoint: 'togocel',     country: 'tg' },
    'mtn-guinea':       { endpoint: 'mtn_open_gn', country: 'gn' },
    'free-senegal':     { endpoint: 'free_sn',     country: 'sn' },
};

/**
 * FedaPay enveloppe l'objet sous « v1/transaction » (SDK officiel,
 * `convertToFedaPayObject`) ; les autres cles restent pour les anciennes reponses.
 * Lire `v1` seulement faisait echouer CHAQUE paiement a la creation.
 */
const transactionDe = (data: any) => data?.['v1/transaction'] ?? data?.v1 ?? data?.transaction ?? data?.entity;

export class FedaPayAdapter implements IPaymentProvider {
    readonly name = 'FedaPay';
    private config: FedaPayConfig;
    private baseUrl: string;

    constructor(config: FedaPayConfig) {
        this.config = config;
        this.baseUrl = config.mode === 'live'
            ? 'https://api.fedapay.com'
            : 'https://sandbox-api.fedapay.com';
    }

    private getHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`,
        };
    }

    private detectEndpoint(methodCode: string): { endpoint: string; country: string } {
        if (METHOD_ENDPOINTS[methodCode]) return METHOD_ENDPOINTS[methodCode];
        const c = methodCode.toLowerCase();
        if (c.includes('mtn') && (c.includes('bj') || c.includes('benin')))  return { endpoint: 'mtn_open',    country: 'bj' };
        if (c.includes('moov') && (c.includes('bj') || c.includes('benin'))) return { endpoint: 'moov',        country: 'bj' };
        if (c.includes('moov') && (c.includes('tg') || c.includes('togo')))  return { endpoint: 'moov_tg',     country: 'tg' };
        if (c.includes('togocom') || c.includes('tmoney'))                    return { endpoint: 'togocel',     country: 'tg' };
        if (c.includes('airtel'))                                             return { endpoint: 'airtel_ne',   country: 'ne' };
        if (c.includes('celtiis'))                                            return { endpoint: 'sbin',        country: 'bj' };
        if (c.includes('mtn') && (c.includes('ci') || c.includes('ivoire'))) return { endpoint: 'mtn_ci',      country: 'ci' };
        if (c.includes('mtn') && (c.includes('gn') || c.includes('guin')))   return { endpoint: 'mtn_open_gn', country: 'gn' };
        if (c.includes('free'))                                               return { endpoint: 'free_sn',     country: 'sn' };
        return { endpoint: 'mtn_open', country: 'bj' };
    }

    /**
     * Direct mobile money: create transaction → generate token → trigger payment
     */
    async initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
        try {
            // FedaPay accepte le format international. On ne retire plus les zéros
            // de tête : au Bénin ils font partie du numéro (01...) depuis le passage
            // à 10 chiffres, et les supprimer donnait un numéro à 9 chiffres refusé.
            const brut = String(request.customerPhone || '').trim();
            const phone = brut.startsWith('+') ? brut : (/^\d{11,}$/.test(brut) ? `+${brut}` : brut);
            const methodCode = request.metadata?.methodCode || '';
            const { endpoint, country } = this.detectEndpoint(methodCode);

            // Step 1: Create transaction
            const txRes = await fetch(`${this.baseUrl}/v1/transactions`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({
                    description: `Paiement commande ${request.orderId}`,
                    amount: request.amount,
                    currency: { iso: request.currency || 'XOF' },
                    // Chez FedaPay, callback_url est l'adresse de RETOUR de l'acheteur apres
                    // la page de paiement (les notifications se reglent dans son tableau de
                    // bord) : notre page de suivi, pas l'adresse de webhook.
                    callback_url: request.returnUrl || request.callbackUrl,
                    customer: {
                        firstname: (request.customerName || 'Client').split(' ')[0],
                        lastname: (request.customerName || 'Client').split(' ').slice(1).join(' ') || 'Client',
                        email: request.customerEmail,
                        phone_number: { number: phone, country },
                    },
                }),
                signal: AbortSignal.timeout(20000),
            });

            const txData: any = await txRes.json();
            const tx = transactionDe(txData);
            const txId = tx?.id;

            if (!txRes.ok || !txId) {
                return { transactionId: '', providerReference: '', status: 'FAILED', rawData: txData };
            }

            // Step 2: Generate payment token
            const tokenRes = await fetch(`${this.baseUrl}/v1/transactions/${txId}/token`, {
                method: 'POST',
                headers: this.getHeaders(),
                signal: AbortSignal.timeout(20000),
            });

            const tokenData: any = await tokenRes.json();
            const token = tokenData?.token;
            // Page de paiement FedaPay : secours si l'envoi direct est refuse.
            const pageFedapay: string | undefined = tokenData?.url || tx?.payment_url || undefined;

            if (!tokenRes.ok || !token) {
                return { transactionId: txId.toString(), providerReference: '', status: 'FAILED', rawData: tokenData };
            }

            // Step 3: Trigger payment directly (no redirect)
            let triggerRes: Response;
            try {
                triggerRes = await fetch(`${this.baseUrl}/v1/${endpoint}`, {
                    method: 'POST',
                    headers: this.getHeaders(),
                    body: JSON.stringify({
                        token,
                        phone_number: { number: phone, country },
                    }),
                    signal: AbortSignal.timeout(20000),
                });
            } catch (error: any) {
                // Sans reponse de l'envoi direct (Moov Benin depasse souvent les 20 s), la
                // transaction existe chez FedaPay et la demande a pu partir vers le
                // telephone : ce n'est pas un refus. On la garde en attente avec sa
                // reference (le suivi la verifie) et la page FedaPay, au lieu d'essayer une
                // autre passerelle qui enverrait une deuxieme demande au meme client.
                console.warn(`[FedaPay] envoi direct sans reponse (${endpoint}, ${error?.name || 'erreur'}) : page FedaPay proposee`);
                return { transactionId: txId.toString(), providerReference: txId.toString(), status: 'PENDING', checkoutUrl: pageFedapay, rawData: { _repli: 'page FedaPay', _envoi_sans_reponse: true } };
            }

            const triggerData: any = await triggerRes.json().catch(() => ({}));

            if (!triggerRes.ok) {
                // Tous les operateurs n'acceptent pas l'envoi direct (FedaPay le dit dans
                // sa documentation) : la transaction existe, l'acheteur la termine sur la
                // page FedaPay et revient sur notre page de suivi.
                if (pageFedapay) {
                    console.warn(`[FedaPay] envoi direct refuse (${endpoint}, HTTP ${triggerRes.status}) : page FedaPay proposee`);
                    return { transactionId: txId.toString(), providerReference: txId.toString(), status: 'PENDING', checkoutUrl: pageFedapay, rawData: { ...triggerData, _repli: 'page FedaPay' } };
                }
                return { transactionId: txId.toString(), providerReference: txId.toString(), status: 'FAILED', rawData: triggerData };
            }

            // USSD push sent to customer's phone
            return {
                transactionId: txId.toString(),
                providerReference: txId.toString(),
                status: 'PENDING',
                rawData: triggerData,
            };
        } catch (error: any) {
            console.error('[FedaPay] initiatePayment error:', error);
            return { transactionId: '', providerReference: '', status: 'FAILED', rawData: { error: error.message } };
        }
    }

    async verifyPayment(providerReference: string): Promise<PaymentResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/v1/transactions/${providerReference}`, {
                method: 'GET',
                headers: this.getHeaders(),
                signal: AbortSignal.timeout(20000),
            });

            const data: any = await response.json();
            const tx = transactionDe(data) ?? data;

            return {
                transactionId: tx?.id?.toString() || providerReference,
                providerReference: tx?.reference || providerReference,
                status: this.mapStatus(tx?.status || ''),
                rawData: data,
            };
        } catch (error: any) {
            return { transactionId: providerReference, providerReference, status: 'FAILED', rawData: { error: error.message } };
        }
    }

    async handleWebhook(payload: any, _headers?: any): Promise<WebhookResult> {
        try {
            const entity = payload.entity || payload;
            return {
                transactionId: entity.id?.toString(),
                providerReference: entity.reference,
                status: this.mapStatus(entity.status || ''),
                rawData: payload,
            };
        } catch (error: any) {
            return { transactionId: '', providerReference: '', status: 'FAILED', rawData: { error: error.message } };
        }
    }

    private mapStatus(status: string): PaymentStatus {
        switch ((status || '').toLowerCase()) {
            case 'approved': case 'transferred': case 'captured': return 'SUCCESS';
            case 'canceled': return 'CANCELLED';
            case 'declined': case 'failed': return 'FAILED';
            default: return 'PENDING';
        }
    }

    async validateCredentials(): Promise<{ success: boolean; message?: string }> {
        try {
            if (!this.config.apiKey) return { success: false, message: 'Clé API FedaPay requise' };
            const res = await fetch(`${this.baseUrl}/v1/transactions?per_page=1`, { method: 'GET', headers: this.getHeaders(), signal: AbortSignal.timeout(20000) });
            if (res.status === 401 || res.status === 403) return { success: false, message: 'Clé API FedaPay invalide' };
            return { success: true };
        } catch {
            return { success: false, message: 'Erreur lors de la validation FedaPay' };
        }
    }
}
