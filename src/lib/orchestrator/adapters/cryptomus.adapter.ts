import {
    IPaymentProvider,
    PaymentRequest,
    PaymentResponse,
    PaymentStatus,
    WebhookResult
} from '../types';
import { createHash, timingSafeEqual } from 'crypto';

/**
 * Cryptomus Payment Provider Adapter
 * Documentation: https://doc.cryptomus.com/merchant-api/payments/creating-invoice
 * 
 * Supported Payment Methods:
 * - Bitcoin (BTC)
 * - Ethereum (ETH)
 * - USDT (TRC20, ERC20)
 * - USDC
 * - Litecoin (LTC)
 * - Dogecoin (DOGE)
 * - And 50+ other cryptocurrencies
 * 
 * Global coverage
 * Currency: USD, EUR, BTC, ETH, USDT, etc.
 */

interface CryptomusConfig {
    apiKey: string;
    merchantId: string;
    mode?: 'test' | 'live';
}

export class CryptomusAdapter implements IPaymentProvider {
    readonly name = 'Cryptomus';
    private config: CryptomusConfig;
    private baseUrl = 'https://api.cryptomus.com';

    constructor(config: CryptomusConfig) {
        this.config = config;
    }

    private generateSign(body: string): string {
        const base64Body = Buffer.from(body).toString('base64');
        return createHash('md5').update(base64Body + this.config.apiKey).digest('hex');
    }

    async initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
        try {
            const payload = {
                amount: String(request.amount),
                currency: request.currency || 'USD',
                order_id: request.orderId,
                url_callback: request.callbackUrl,
                url_return: request.returnUrl,
                url_success: request.returnUrl,
                is_payment_multiple: false,
            };

            const body = JSON.stringify(payload);

            const response = await fetch(`${this.baseUrl}/v1/payment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'merchant': this.config.merchantId,
                    'sign': this.generateSign(body),
                },
                body,
                signal: AbortSignal.timeout(20000),
            });

            const data: any = await response.json();

            if (!response.ok || data.state !== 0 || !data.result?.url) {
                return {
                    transactionId: request.orderId,
                    providerReference: '',
                    status: 'FAILED' as PaymentStatus,
                    rawData: data,
                };
            }

            return {
                transactionId: request.orderId,
                providerReference: data.result.uuid,
                status: 'PENDING' as PaymentStatus,
                checkoutUrl: data.result.url,
                rawData: data,
            };
        } catch (error: any) {
            console.error('[Cryptomus] initiatePayment error:', error);
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
            const payload = { uuid: providerReference };
            const body = JSON.stringify(payload);

            const response = await fetch(`${this.baseUrl}/v1/payment/info`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'merchant': this.config.merchantId,
                    'sign': this.generateSign(body),
                },
                body,
                signal: AbortSignal.timeout(20000),
            });

            const data: any = await response.json();

            let status: PaymentStatus = 'PENDING';
            const paymentStatus = data.result?.status || data.result?.payment_status;
            switch (paymentStatus) {
                case 'paid':
                case 'paid_over':
                case 'confirm_check':
                    status = 'SUCCESS';
                    break;
                case 'fail':
                case 'cancel':
                case 'system_fail':
                case 'wrong_amount':
                    status = 'FAILED';
                    break;
                default:
                    status = 'PENDING';
            }

            return {
                transactionId: data.result?.order_id || providerReference,
                providerReference: data.result?.uuid || providerReference,
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
            const uuid = payload?.uuid;
            if (!uuid) {
                throw new Error('Missing uuid in Cryptomus webhook');
            }

            // Verify signature
            if (payload.sign) {
                const payloadCopy = { ...payload };
                delete payloadCopy.sign;
                const expectedSign = this.generateSign(JSON.stringify(payloadCopy));
                const expectedBuf = Buffer.from(expectedSign);
                const receivedBuf = Buffer.from(String(payload.sign));
                if (expectedBuf.length !== receivedBuf.length || !timingSafeEqual(expectedBuf, receivedBuf)) {
                    throw new Error('Invalid Cryptomus webhook signature');
                }
            }

            let status: PaymentStatus = 'PENDING';
            switch (payload.status) {
                case 'paid':
                case 'paid_over':
                    status = 'SUCCESS';
                    break;
                case 'fail':
                case 'cancel':
                case 'system_fail':
                case 'wrong_amount':
                    status = 'FAILED';
                    break;
                default:
                    status = 'PENDING';
            }

            return {
                transactionId: payload.order_id || uuid,
                providerReference: uuid,
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
        try {
            if (!this.config.apiKey || !this.config.merchantId) {
                return { success: false, message: 'API Key et Merchant ID Cryptomus requis' };
            }

            const payload = {};
            const body = JSON.stringify(payload);
            const response = await fetch(`${this.baseUrl}/v1/payment/services`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'merchant': this.config.merchantId,
                    'sign': this.generateSign(body),
                },
                body,
                signal: AbortSignal.timeout(20000),
            });

            if (response.status === 401 || response.status === 403) {
                return { success: false, message: 'Clés Cryptomus invalides' };
            }

            return { success: true };
        } catch (error: any) {
            return { success: false, message: 'Erreur lors de la validation Cryptomus' };
        }
    }
}
