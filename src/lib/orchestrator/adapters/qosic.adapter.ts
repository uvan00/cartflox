import {
    IPaymentProvider,
    PaymentRequest,
    PaymentResponse,
    PaymentStatus,
    WebhookResult
} from '../types';

/**
 * Qosic (QosPay) Payment Provider Adapter
 * Documentation: https://docs.qosic.com/api-documentation/paiement
 * 
 * Supported Payment Methods:
 * - MTN MoMo (Benin, Togo, CI)
 * - Moov Money (Benin, Togo, CI)
 * - T-Money Togo
 * - Bank Cards (Visa, MasterCard)
 * 
 * Primary Countries:
 * - Benin
 * - Togo
 * - Côte d'Ivoire
 * 
 * Currency: XOF
 */

interface QosicConfig {
    apiKey: string;
    clientId: string;
    mode?: 'test' | 'live';
}

export class QosicAdapter implements IPaymentProvider {
    readonly name = 'Qosic';
    private config: QosicConfig;
    private baseUrl: string;

    constructor(config: QosicConfig) {
        this.config = config;
        this.baseUrl = config.mode === 'live'
            ? 'https://apis.qosic.com'
            : 'https://api.qosic.net';
    }

    private generateReference(orderId: string): string {
        return `QOS_${orderId}_${Date.now()}`;
    }

    private getAuthHeader(): string {
        return 'Basic ' + Buffer.from(`${this.config.clientId}:${this.config.apiKey}`).toString('base64');
    }

    async initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
        try {
            const reference = this.generateReference(request.orderId);

            const payload = {
                msisdn: request.customerPhone || '',
                amount: String(request.amount),
                firstname: (request.customerName || 'Customer').split(' ')[0],
                lastname: (request.customerName || 'User').split(' ').slice(1).join(' ') || 'User',
                transref: reference,
                clientid: this.config.clientId,
            };

            const response = await fetch(`${this.baseUrl}/QosicBridge/user/requestpayment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': this.getAuthHeader(),
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(20000),
            });

            const data: any = await response.json();

            if (!response.ok || (data.responsecode !== '00' && data.responsecode !== '01')) {
                return {
                    transactionId: reference,
                    providerReference: '',
                    status: 'FAILED' as PaymentStatus,
                    rawData: data,
                };
            }

            // Qosic is a direct debit API (no redirect), status is immediate or pending
            const isPending = data.responsecode === '01';

            return {
                transactionId: reference,
                providerReference: data.transref || reference,
                status: isPending ? 'PENDING' as PaymentStatus : 'SUCCESS' as PaymentStatus,
                rawData: data,
            };
        } catch (error: any) {
            console.error('[Qosic] initiatePayment error:', error);
            return {
                transactionId: '',
                providerReference: '',
                status: 'FAILED' as PaymentStatus,
                rawData: { error: error.message },
            };
        }
    }

    async verifyPayment(providerReference: string): Promise<PaymentResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/QosicBridge/user/gettransactionstatus`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': this.getAuthHeader(),
                },
                body: JSON.stringify({ transref: providerReference, clientid: this.config.clientId }),
                signal: AbortSignal.timeout(20000),
            });

            const data: any = await response.json();

            let status: PaymentStatus = 'PENDING';
            if (data.responsecode === '00') {
                status = 'SUCCESS';
            } else if (data.responsecode === '01' || data.responsecode == null) {
                // Sans code de reponse (401, panne), ce n'est pas un echec de paiement.
                status = 'PENDING';
                if (data.responsecode == null) data.error = data.error || data.message || `Qosic : HTTP ${response.status} sans code de réponse`;
            } else {
                status = 'FAILED';
            }

            return {
                transactionId: providerReference,
                providerReference: data.transref || providerReference,
                status,
                rawData: data,
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

    async handleWebhook(payload: any, headers?: any): Promise<WebhookResult> {
        try {
            const transref = payload?.transref || payload?.reference;
            if (!transref) {
                throw new Error('Missing transref in Qosic webhook');
            }

            const verification = await this.verifyPayment(transref);

            return {
                transactionId: transref,
                providerReference: verification.providerReference,
                status: verification.status,
                rawData: { webhook_original: payload, verification_data: verification.rawData },
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

    async validateCredentials(): Promise<{ success: boolean; message?: string }> {
        try {
            if (!this.config.apiKey || !this.config.clientId) {
                return { success: false, message: 'Client ID et API Key Qosic requis' };
            }
            return { success: true };
        } catch (error: any) {
            return { success: false, message: 'Erreur lors de la validation Qosic' };
        }
    }
}
