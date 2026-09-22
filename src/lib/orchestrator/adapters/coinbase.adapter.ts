import {
    IPaymentProvider,
    PaymentRequest,
    PaymentResponse,
    PaymentStatus,
    WebhookResult
} from '../types';
import crypto from 'crypto';

/**
 * Coinbase Commerce Payment Provider Adapter
 * Documentation: https://docs.cloud.coinbase.com/commerce/docs/welcome
 * 
 * Supported Assets:
 * - Bitcoin (BTC)
 * - Ethereum (ETH)
 * - Litecoin (LTC)
 * - Dogecoin (DOGE)
 * - Bitcoin Cash (BCH)
 * - USD Coin (USDC)
 * - many others...
 */

interface CoinbaseConfig {
    apiKey: string;
    webhookSecret?: string;
    mode?: 'test' | 'live';
}

export class CoinbaseAdapter implements IPaymentProvider {
    readonly name = 'Coinbase';
    private config: CoinbaseConfig;
    private baseUrl = 'https://api.commerce.coinbase.com';

    constructor(config: CoinbaseConfig) {
        this.config = config;
    }

    /**
     * Initiate a charge with Coinbase Commerce
     */
    async initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
        try {
            const body = {
                name: `Commande ${request.orderId}`,
                description: request.metadata?.description || `Paiement pour la commande ${request.orderId}`,
                pricing_type: 'fixed_price',
                local_price: {
                    amount: request.amount.toString(),
                    currency: request.currency || 'USD'
                },
                metadata: {
                    orderId: request.orderId,
                    customerName: request.customerName,
                    customerEmail: request.customerEmail,
                    ...request.metadata
                },
                redirect_url: request.returnUrl,
                cancel_url: request.callbackUrl + (request.callbackUrl.includes('?') ? '&' : '?') + 'status=cancelled'
            };

            const response = await fetch(`${this.baseUrl}/charges`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CC-Api-Key': this.config.apiKey,
                    'X-CC-Version': '2018-03-22'
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(20000)
            });

            const data = await response.json();

            if (!response.ok) {
                console.error('[Coinbase] initiatePayment API error:', data);
                return {
                    transactionId: '',
                    providerReference: '',
                    status: 'FAILED',
                    rawData: data
                };
            }

            return {
                transactionId: data.data.id,
                providerReference: data.data.code,
                status: 'PENDING',
                checkoutUrl: data.data.hosted_url,
                rawData: data.data
            };
        } catch (error: any) {
            console.error('[Coinbase] initiatePayment error:', error);
            return {
                transactionId: '',
                providerReference: '',
                status: 'FAILED',
                rawData: { error: error.message }
            };
        }
    }

    /**
     * Verify charge status
     */
    async verifyPayment(providerReference: string): Promise<PaymentResponse> {
        try {
            // providerReference can be the ID or the Code
            const response = await fetch(`${this.baseUrl}/charges/${providerReference}`, {
                method: 'GET',
                headers: {
                    'X-CC-Api-Key': this.config.apiKey,
                    'X-CC-Version': '2018-03-22'
                },
                signal: AbortSignal.timeout(20000)
            });

            if (!response.ok) {
                throw new Error(`Coinbase API error: ${response.statusText}`);
            }

            const data = await response.json();
            const charge = data.data;

            return {
                transactionId: charge.id,
                providerReference: charge.code,
                status: this.mapStatus(charge.timeline),
                rawData: charge
            };
        } catch (error: any) {
            return {
                transactionId: providerReference,
                providerReference,
                status: 'FAILED',
                rawData: { error: error.message }
            };
        }
    }

    /**
     * Handle Coinbase webhooks
     */
    async handleWebhook(payload: any, headers?: any): Promise<WebhookResult> {
        try {
            const event = payload.event;

            // Verify signature if secret is provided
            if (headers && headers['x-cc-webhook-signature'] && this.config.webhookSecret) {
                const signature = headers['x-cc-webhook-signature'];
                const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
                const hmac = crypto.createHmac('sha256', this.config.webhookSecret);
                const digest = hmac.update(body).digest('hex');

                const sigBuf = Buffer.from(signature);
                const digestBuf = Buffer.from(digest);
                if (sigBuf.length !== digestBuf.length || !crypto.timingSafeEqual(sigBuf, digestBuf)) {
                    throw new Error('Invalid Coinbase webhook signature');
                }
            }

            const charge = event.data;
            const status = this.mapStatus(charge.timeline);

            return {
                transactionId: charge.id,
                providerReference: charge.code,
                status: status,
                rawData: event
            };
        } catch (error: any) {
            return {
                transactionId: '',
                providerReference: '',
                status: 'FAILED',
                rawData: { error: error.message }
            };
        }
    }

    /**
     * Map timeline events to PaymentStatus
     */
    private mapStatus(timeline: any[]): PaymentStatus {
        if (!timeline || timeline.length === 0) return 'PENDING';

        // Timeline is ordered from oldest to newest
        const lastEvent = timeline[timeline.length - 1].status;

        switch (lastEvent.toUpperCase()) {
            case 'COMPLETED':
                return 'SUCCESS';
            case 'CANCELED':
                return 'CANCELLED';
            case 'EXPIRED':
                return 'FAILED';
            case 'UNRESOLVED':
                // Usually means underpaid or overpaid
                return 'PENDING';
            case 'PENDING':
                return 'PENDING';
            case 'NEW':
                return 'PENDING';
            default:
                return 'PENDING';
        }
    }

    /**
     * Validate credentials
     */
    async validateCredentials(): Promise<{ success: boolean; message?: string }> {
        try {
            const response = await fetch(`${this.baseUrl}/charges`, {
                method: 'GET',
                headers: {
                    'X-CC-Api-Key': this.config.apiKey,
                    'X-CC-Version': '2018-03-22'
                },
                signal: AbortSignal.timeout(20000)
            });

            if (response.ok) {
                return { success: true };
            }

            if (response.status === 401) {
                return { success: false, message: 'Clé API Coinbase Commerce invalide.' };
            }

            return { success: true }; // Other errors might be permissions or limits, but key is valid
        } catch (error: any) {
            return { success: false, message: "Impossible de contacter Coinbase Commerce." };
        }
    }
}
