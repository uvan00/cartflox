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
 *   2. POST /v1/transactions/:id/token  → generate payment token
 *   3. POST /v1/:method_endpoint        → trigger payment with token + phone_number
 *      Methods: mtn, moov, celtiis, togocom, mtn-guinea, airtel, free
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
    'mtn-benin':        { endpoint: 'mtn',       country: 'bj' },
    'moov-benin':       { endpoint: 'moov',      country: 'bj' },
    'celtiis-benin':    { endpoint: 'celtiis',   country: 'bj' },
    'airtel-niger':     { endpoint: 'airtel',    country: 'ne' },
    'mtn-momo-benin':   { endpoint: 'mtn',       country: 'bj' },
    'moov-money-benin': { endpoint: 'moov',      country: 'bj' },
    'mtn-ci-fedapay':   { endpoint: 'mtn',       country: 'ci' },
    'moov-togo':        { endpoint: 'moov',      country: 'tg' },
    'togocom-togo':     { endpoint: 'togocom',   country: 'tg' },
    'mtn-guinea':       { endpoint: 'mtn-guinea', country: 'gn' },
    'free-senegal':     { endpoint: 'free',      country: 'sn' },
};

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
        if (c.includes('mtn') && (c.includes('bj') || c.includes('benin')))  return { endpoint: 'mtn',      country: 'bj' };
        if (c.includes('moov') && (c.includes('bj') || c.includes('benin'))) return { endpoint: 'moov',     country: 'bj' };
        if (c.includes('moov') && (c.includes('tg') || c.includes('togo')))  return { endpoint: 'moov',     country: 'tg' };
        if (c.includes('togocom') || c.includes('tmoney'))                    return { endpoint: 'togocom',  country: 'tg' };
        if (c.includes('airtel'))                                             return { endpoint: 'airtel',   country: 'ne' };
        if (c.includes('celtiis'))                                            return { endpoint: 'celtiis',  country: 'bj' };
        if (c.includes('mtn') && (c.includes('ci') || c.includes('ivoire'))) return { endpoint: 'mtn',      country: 'ci' };
        if (c.includes('free'))                                               return { endpoint: 'free',     country: 'sn' };
        return { endpoint: 'mtn', country: 'bj' };
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
                    callback_url: request.callbackUrl,
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
            const txId = txData?.v1?.id || txData?.transaction?.id;

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

            if (!tokenRes.ok || !token) {
                return { transactionId: txId.toString(), providerReference: '', status: 'FAILED', rawData: tokenData };
            }

            // Step 3: Trigger payment directly (no redirect)
            const triggerRes = await fetch(`${this.baseUrl}/v1/${endpoint}`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({
                    token,
                    phone_number: { number: phone, country },
                }),
                signal: AbortSignal.timeout(20000),
            });

            const triggerData: any = await triggerRes.json();

            if (!triggerRes.ok) {
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
            const tx = data?.v1 || data?.transaction || data;

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
