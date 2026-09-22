import {
    IPaymentProvider,
    PaymentRequest,
    PaymentResponse,
    PaymentStatus,
    WebhookResult
} from '../types';

/**
 * PayPlus Africa Payment Provider Adapter
 * Website: https://payplus.africa/
 * 
 * Supported Payment Methods:
 * - Orange Money (CI, SN, ML, BF)
 * - MTN MoMo (CI, BJ, CM)
 * - Moov Money (BJ, TG, CI)
 * - Wave (SN, CI)
 * - Bank Cards (Visa, MasterCard)
 * 
 * Primary Countries:
 * - Côte d'Ivoire
 * - Sénégal
 * - Mali
 * - Bénin
 * 
 * Currency: XOF, XAF
 */

interface PayPlusConfig {
    apiKey: string;
    secretKey: string;
    mode?: 'test' | 'live';
}

export class PayPlusAdapter implements IPaymentProvider {
    readonly name = 'PayPlus';
    private config: PayPlusConfig;
    private baseUrl: string;

    constructor(config: PayPlusConfig) {
        this.config = config;
        this.baseUrl = config.mode === 'live'
            ? 'https://app.payplus.africa/api/v1'
            : 'https://sandbox.payplus.africa/api/v1';
    }

    private generateReference(orderId: string): string {
        return `PP_${orderId}_${Date.now()}`;
    }

    async initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
        try {
            const reference = this.generateReference(request.orderId);

            const payload = {
                amount: request.amount,
                currency: request.currency || 'XOF',
                description: `Payment for order ${request.orderId}`,
                reference,
                customer: {
                    name: request.customerName || 'Customer',
                    email: request.customerEmail,
                    phone: request.customerPhone || '',
                },
                return_url: request.returnUrl,
                callback_url: request.callbackUrl,
            };

            const response = await fetch(`${this.baseUrl}/payments/initialize`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${this.config.secretKey}`,
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(20000),
            });

            const data: any = await response.json();

            if (!response.ok || !data?.data?.payment_url) {
                return {
                    transactionId: reference,
                    providerReference: '',
                    status: 'FAILED' as PaymentStatus,
                    rawData: data,
                };
            }

            return {
                transactionId: reference,
                providerReference: data.data.id || reference,
                status: 'PENDING' as PaymentStatus,
                checkoutUrl: data.data.payment_url,
                rawData: data,
            };
        } catch (error: any) {
            console.error('[PayPlus] initiatePayment error:', error);
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
            const response = await fetch(`${this.baseUrl}/payments/${providerReference}`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${this.config.secretKey}`,
                },
                signal: AbortSignal.timeout(20000),
            });

            const data: any = await response.json();

            let status: PaymentStatus = 'PENDING';
            const txStatus = data?.data?.status?.toLowerCase();
            if (txStatus === 'success' || txStatus === 'completed') {
                status = 'SUCCESS';
            } else if (txStatus === 'failed' || txStatus === 'expired') {
                status = 'FAILED';
            } else if (txStatus === 'cancelled') {
                status = 'CANCELLED';
            }

            return {
                transactionId: providerReference,
                providerReference: data?.data?.id || providerReference,
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
            const reference = payload?.data?.reference || payload?.reference;
            if (!reference) throw new Error('Missing reference in PayPlus webhook');

            const verification = await this.verifyPayment(reference);
            return {
                transactionId: reference,
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
        if (!this.config.apiKey || !this.config.secretKey) {
            return { success: false, message: 'Clés API PayPlus requises' };
        }
        return { success: true };
    }
}
