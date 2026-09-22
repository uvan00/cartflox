import {
    IPaymentProvider,
    PaymentRequest,
    PaymentResponse,
    PaymentStatus,
    WebhookResult
} from '../types';

/**
 * CinetPay Payment Provider Adapter
 * Documentation: https://docs.cinetpay.com/api/1.0-fr/checkout/initialisation
 * 
 * Supported Payment Methods:
 * - Mobile Money (Orange, MTN, Moov, Wave)
 * - Bank Cards (Visa, MasterCard)
 * - Wallets
 * 
 * Primary Countries:
 * - Côte d'Ivoire (Main)
 * - Senegal
 * - Mali
 * - Burkina Faso
 * - Togo
 * - Benin
 * - Cameroon
 * - Congo (DRC)
 * 
 * Currency: XOF, XAF, CDF, GNF, USD
 */

interface CinetPayConfig {
    apiKey: string;
    siteId: string;
    mode?: 'test' | 'live';
}

interface CinetPayInitResponse {
    code: string;
    message: string;
    description?: string;
    data?: {
        payment_token: string;
        payment_url: string;
    };
    api_response_id: string;
}

interface CinetPayVerifyResponse {
    code: string;
    message: string;
    data: {
        amount: string;
        currency: string;
        status: 'ACCEPTED' | 'REFUSED' | 'WAITING_FOR_CUSTOMER' | 'EXPIRED';
        payment_method: string;
        description: string;
        metadata: string | null;
        operator_id: string | null;
        payment_date: string;
    };
    api_response_id: string;
}

export class CinetPayAdapter implements IPaymentProvider {
    readonly name = 'CinetPay';
    private config: CinetPayConfig;
    private baseUrl = 'https://api-checkout.cinetpay.com/v2';

    constructor(config: CinetPayConfig) {
        this.config = config;
    }

    /**
     * Generate a unique transaction reference
     */
    private generateTransactionId(orderId: string): string {
        return `CP_${orderId}_${Date.now()}`;
    }

    /**
     * Initiate a payment with CinetPay
     */
    async initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
        try {
            const transaction_id = this.generateTransactionId(request.orderId);

            const payload = {
                apikey: this.config.apiKey,
                site_id: this.config.siteId,
                transaction_id,
                amount: request.amount,
                currency: request.currency || 'XOF',
                description: `Payment for order ${request.orderId}`,
                notify_url: request.callbackUrl,
                return_url: request.returnUrl,
                channels: 'ALL',
                metadata: JSON.stringify({
                    orderId: request.orderId,
                    ...request.metadata
                }),
                customer_id: request.customerEmail || request.orderId,
                customer_name: request.customerName || 'Customer',
                customer_surname: '',
                customer_email: request.customerEmail,
                customer_phone_number: request.customerPhone,
                customer_address: 'Address',
                customer_city: 'City',
                customer_country: (request.metadata?.country || 'CI').toUpperCase().slice(0, 2),
                customer_state: 'State',
                customer_zip_code: '0000',
                lang: 'FR'
            };

            const response = await fetch(`${this.baseUrl}/payment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(20000),
            });

            const data: CinetPayInitResponse = await response.json();

            if (data.code !== '201' || !data.data) {
                return {
                    transactionId: transaction_id,
                    providerReference: '',
                    status: 'FAILED' as PaymentStatus,
                    rawData: data,
                };
            }

            return {
                transactionId: transaction_id,
                // /payment/check and the webhook (cpm_trans_id) both key on the
                // transaction_id — the payment_token stays available in rawData.
                providerReference: transaction_id,
                status: 'PENDING' as PaymentStatus,
                checkoutUrl: data.data.payment_url,
                rawData: data,
            };
        } catch (error: any) {
            console.error('[CinetPay] initiatePayment error:', error);
            return {
                transactionId: '',
                providerReference: '',
                status: 'FAILED' as PaymentStatus,
                rawData: { error: error.message },
            };
        }
    }

    /**
     * Verify payment status
     */
    async verifyPayment(providerReference: string): Promise<PaymentResponse> {
        // CinetPay requires transaction_id, not token for check
        // But often we store providerReference as the transaction_id or token
        // In our initiatePayment, transactionId is the CP_... and providerReference is the token.
        // CinetPay /check needs transaction_id.

        try {
            const payload = {
                apikey: this.config.apiKey,
                site_id: this.config.siteId,
                transaction_id: providerReference, // This should be the transaction_id passed during init
            };

            const response = await fetch(`${this.baseUrl}/payment/check`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(20000),
            });

            const data: CinetPayVerifyResponse = await response.json();

            let status: PaymentStatus = 'PENDING';
            if (data.code === '00' && data.data.status === 'ACCEPTED') {
                status = 'SUCCESS';
            } else if (data.data?.status === 'REFUSED' || data.data?.status === 'EXPIRED') {
                status = 'FAILED';
            } else if (data.data?.status === 'WAITING_FOR_CUSTOMER') {
                status = 'PENDING';
            }

            return {
                transactionId: providerReference,
                providerReference: data.data?.operator_id || providerReference,
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

    /**
     * Process CinetPay webhook
     * Webhook sent as a POST with either JSON or form-data containing cpm_trans_id
     */
    async handleWebhook(payload: any, headers?: any): Promise<WebhookResult> {
        try {
            // CinetPay sends properties like cpm_trans_id, cpm_site_id
            const transactionId = payload.cpm_trans_id || payload.transaction_id;

            if (!transactionId) {
                throw new Error('Missing transaction ID in CinetPay webhook');
            }

            // Always verify against API for security as recommended by CinetPay
            const verification = await this.verifyPayment(transactionId);

            return {
                transactionId,
                providerReference: verification.providerReference,
                status: verification.status,
                rawData: {
                    webhook_original: payload,
                    verification_data: verification.rawData
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
     * Validate credentials by checking API key format or simple account check
     */
    async validateCredentials(): Promise<{ success: boolean; message?: string }> {
        try {
            if (!this.config.apiKey || !this.config.siteId) {
                return {
                    success: false,
                    message: 'API Key and Site ID are required'
                };
            }

            // We can try a check on a dummy transaction to see if we get a 401/403 or a proper CinetPay code
            const response = await fetch(`${this.baseUrl}/payment/check`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    apikey: this.config.apiKey,
                    site_id: this.config.siteId,
                    transaction_id: 'val_check_' + Date.now()
                }),
                signal: AbortSignal.timeout(20000),
            });

            const data = await response.json();

            // If the credentials was wrong, we'd get a specific error code
            // Code 602 is often "Invalid API Key" or similar in CinetPay
            if (data.code === '602' || data.message?.includes('API KEY')) {
                return { success: false, message: 'Clé API CinetPay invalide' };
            }

            if (data.code === '605' || data.message?.includes('SITE ID')) {
                return { success: false, message: 'Site ID CinetPay invalide' };
            }

            // If we get "Transaction not found" (like code 626), it means the auth was successful but transaction doesn't exist
            if (data.code === '00' || data.code === '626' || data.code === 'PAYMENT_NOT_FOUND') {
                return { success: true };
            }

            return { success: true }; // Assume OK if we get a non-auth error response
        } catch (error: any) {
            return { success: false, message: 'Erreur lors de la validation CinetPay' };
        }
    }
}
