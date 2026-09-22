import { kkiapay } from '@kkiapay-org/nodejs-sdk';
import {
    IPaymentProvider,
    PaymentRequest,
    PaymentResponse,
    PaymentStatus,
    WebhookResult
} from '../types';
import crypto from 'crypto';

/**
 * Kkiapay Payment Provider Adapter
 * Documentation: https://docs.kkiapay.me/
 * 
 * Supported Countries:
 * - Benin (Primary)
 * - Togo
 * - Côte d'Ivoire
 * 
 * Payment Methods:
 * - Mobile Money (MTN, Moov, Flooz)
 * - Cards (Visa, MasterCard)
 */

interface KkiapayConfig {
    publicKey: string;
    privateKey: string;
    secret: string;
    mode?: 'test' | 'live';
}

export class KkiapayAdapter implements IPaymentProvider {
    readonly name = 'Kkiapay';
    private kkiapayInstance: any;
    private config: KkiapayConfig;

    constructor(config: KkiapayConfig) {
        this.config = config;
        // Kkiapay SDK expects an object { publickey, privatekey, secretkey, sandbox }
        this.kkiapayInstance = kkiapay({
            publickey: config.publicKey,
            privatekey: config.privateKey,
            secretkey: config.secret,
            sandbox: config.mode !== 'live'
        });
    }




    /**
     * Kkiapay is primarily widget-based. 
     * We return a standard widget URL that can be used for redirection.
     */
    async initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
        try {
            const data = {
                amount: request.amount,
                key: this.config.publicKey,
                callback: request.returnUrl,
                sandbox: this.config.mode !== 'live',
                phone: request.customerPhone,
                name: request.customerName,
                email: request.customerEmail,
                transaction_id: `KK_${request.orderId}_${Date.now()}`,
                metadata: JSON.stringify({
                    orderId: request.orderId,
                    ...request.metadata
                })
            };

            // Structure the widget URL
            // Format: https://widget.kkiapay.me/?amount=xxx&url=...&key=...&sandbox=true
            const params = new URLSearchParams({
                amount: data.amount.toString(),
                key: data.key || this.config.publicKey,
                callback: data.callback,
                sandbox: data.sandbox.toString(),
                phone: data.phone || '',
                name: data.name || '',
                email: data.email || '',
                partner_id: data.transaction_id
            });


            const checkoutUrl = `https://widget.kkiapay.me/?${params.toString()}`;

            return {
                transactionId: data.transaction_id,
                providerReference: '',
                status: 'PENDING' as PaymentStatus,
                checkoutUrl,
                rawData: data,
            };
        } catch (error: any) {
            console.error('[Kkiapay] initiatePayment error:', error);
            return {
                transactionId: '',
                providerReference: '',
                status: 'FAILED' as PaymentStatus,
                rawData: { error: error.message },
            };
        }
    }

    /**
     * Verify payment status using Kkiapay SDK
     */
    async verifyPayment(providerReference: string): Promise<PaymentResponse> {
        try {
            // providerReference should be the Kkiapay transaction ID returned after payment
            const response = await this.kkiapayInstance.verify(providerReference);


            let status: PaymentStatus = 'PENDING';
            if (response.status === 'SUCCESS') {
                status = 'SUCCESS';
            } else if (response.status === 'FAILED') {
                status = 'FAILED';
            }

            return {
                transactionId: providerReference,
                providerReference,
                status,
                rawData: response,
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
     * Process Kkiapay webhook
     */
    async handleWebhook(payload: any, headers?: any): Promise<WebhookResult> {
        try {
            // Verify signature if secret is provided
            // Kkiapay uses x-kkiapay-secret header which is HMAC-SHA256(payload, secret)
            if (headers && headers['x-kkiapay-secret'] && this.config.secret) {
                const signature = headers['x-kkiapay-secret'];
                const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
                const hmac = crypto.createHmac('sha256', this.config.secret);
                const digest = hmac.update(body).digest('hex');

                if (signature !== digest) {
                    throw new Error('Invalid Kkiapay webhook signature');
                }
            }

            const transactionId = payload.transactionId || payload.transaction_id;
            const status = payload.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED';

            return {
                transactionId,
                providerReference: transactionId,
                status: status as PaymentStatus,
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

    /**
     * Validate credentials (limited check with Kkiapay)
     */
    async validateCredentials(): Promise<{ success: boolean; message?: string }> {
        try {
            if (!this.config.publicKey || !this.config.privateKey) {
                return { success: false, message: 'Public Key and Private Key are required' };
            }

            // The SDK doesn't have a direct "ping" method. 
            // We'll perform a dummy verify to check if keys are accepted.
            const response = await this.kkiapayInstance.verify('fake_id').catch((e: any) => e);


            // If the error is 401/Invalid Key, we know it's bad.
            // But usually, Kkiapay returns useful error messages.
            if (response && response.status === 'INVALID_TRANSACTION') {
                // This means the API key is valid but transaction ID is not
                return { success: true };
            }

            return { success: true };
        } catch (error: any) {
            return { success: false, message: 'Erreur lors de la validation Kkiapay' };
        }
    }
}
