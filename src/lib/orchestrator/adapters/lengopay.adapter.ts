import {
    IPaymentProvider,
    PaymentRequest,
    PaymentResponse,
    PaymentStatus,
    WebhookResult
} from '../types';

/**
 * LengoPay Payment Provider Adapter
 * Website: https://lengopay.com/
 * 
 * Supported Payment Methods:
 * - Orange Money (Guinea)
 * - MTN MoMo (Guinea)
 * - Bank Cards (Visa, MasterCard)
 * 
 * Primary Countries:
 * - Guinea Conakry
 * - Morocco (expansion)
 * 
 * Currency: GNF, MAD, USD
 */

interface LengoPayConfig {
    licenseKey: string;
    websiteId: string;
    mode?: 'test' | 'live';
}

export class LengoPayAdapter implements IPaymentProvider {
    readonly name = 'LengoPay';
    private config: LengoPayConfig;
    private baseUrl: string;

    constructor(config: LengoPayConfig) {
        this.config = config;
        this.baseUrl = config.mode === 'live'
            ? 'https://portal.lengopay.com/api/v1'
            : 'https://sandbox.lengopay.com/api/v1';
    }

    private generateReference(orderId: string): string {
        return `LP_${orderId}_${Date.now()}`;
    }

    async initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
        try {
            const reference = this.generateReference(request.orderId);

            const payload = {
                websiteId: this.config.websiteId,
                amount: request.amount,
                currency: request.currency || 'GNF',
                returnUrl: request.returnUrl || '',
                callbackUrl: request.callbackUrl || '',
            };

            const response = await fetch(`${this.baseUrl}/payment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'licenseKey': this.config.licenseKey,
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(20000),
            });

            const data: any = await response.json();

            if (!response.ok || !data?.paymentUrl) {
                return {
                    transactionId: reference,
                    providerReference: '',
                    status: 'FAILED' as PaymentStatus,
                    rawData: data,
                };
            }

            return {
                transactionId: reference,
                providerReference: data.payId || reference,
                status: 'PENDING' as PaymentStatus,
                checkoutUrl: data.paymentUrl,
                rawData: data,
            };
        } catch (error: any) {
            console.error('[LengoPay] initiatePayment error:', error);
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
            const response = await fetch(`${this.baseUrl}/payment/${providerReference}`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'licenseKey': this.config.licenseKey,
                },
                signal: AbortSignal.timeout(20000),
            });

            const data: any = await response.json();

            let status: PaymentStatus = 'PENDING';
            const txStatus = data?.status?.toUpperCase();
            if (txStatus === 'SUCCESS') {
                status = 'SUCCESS';
            } else if (txStatus === 'FAILED') {
                status = 'FAILED';
            }

            return {
                transactionId: providerReference,
                providerReference: data?.payId || providerReference,
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
            const payId = payload?.pay_id || payload?.payId;
            if (!payId) throw new Error('Missing pay_id in LengoPay webhook');

            let status: PaymentStatus = 'PENDING';
            const webhookStatus = payload?.status?.toUpperCase();
            if (webhookStatus === 'SUCCESS') {
                status = 'SUCCESS';
            } else if (webhookStatus === 'FAILED') {
                status = 'FAILED';
            }

            return {
                transactionId: payId,
                providerReference: payId,
                status,
                rawData: payload,
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
        if (!this.config.licenseKey || !this.config.websiteId) {
            return { success: false, message: 'License Key et Website ID LengoPay requis' };
        }
        return { success: true };
    }
}
