import {
    IPaymentProvider,
    PaymentRequest,
    PaymentResponse,
    PaymentStatus,
    WebhookResult
} from '../types';

/**
 * Flutterwave Payment Provider Adapter
 * Documentation: https://developer.flutterwave.com/docs
 * 
 * Supported Payment Methods:
 * - Card (Visa, MasterCard, Verve)
 * - Bank Transfer
 * - Mobile Money (All African countries)
 * - USSD
 * - Barter
 * - Bank Account (Nigeria)
 * 
 * Supported Countries (40+):
 * Nigeria, Ghana, Kenya, Uganda, Tanzania, Rwanda, South Africa,
 * Zambia, Ivory Coast, Cameroon, Senegal, and many more
 */

interface FlutterwaveConfig {
    publicKey: string;
    secretKey: string;
    encryptionKey?: string;
    mode: 'test' | 'live';
}

interface FlutterwavePaymentResponse {
    status: string;
    message: string;
    data: {
        link?: string;
        id?: number;
        tx_ref?: string;
        flw_ref?: string;
        device_fingerprint?: string;
        amount?: number;
        charged_amount?: number;
        app_fee?: number;
        merchant_fee?: number;
        processor_response?: string;
        auth_model?: string;
        currency?: string;
        ip?: string;
        narration?: string;
        status?: string;
        payment_type?: string;
        created_at?: string;
        account_id?: number;
        customer?: {
            id?: number;
            name?: string;
            phone_number?: string;
            email?: string;
            created_at?: string;
        };
    };
}

export class FlutterwaveAdapter implements IPaymentProvider {
    readonly name = 'Flutterwave';
    private config: FlutterwaveConfig;
    private baseUrl = 'https://api.flutterwave.com/v3';

    constructor(config: FlutterwaveConfig) {
        this.config = config;
    }

    /**
     * Generate a unique transaction reference
     */
    private generateTxRef(orderId: string): string {
        return `FLW_${orderId}_${Date.now()}`;
    }

    /**
     * Initiate a payment with Flutterwave Standard
     * Creates a hosted payment page
     */
    async initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
        try {
            const tx_ref = this.generateTxRef(request.orderId);

            const payload = {
                tx_ref,
                amount: request.amount,
                currency: request.currency || 'NGN',
                redirect_url: request.returnUrl,
                payment_options: 'card,mobilemoney,ussd,banktransfer',
                customer: {
                    email: request.customerEmail,
                    phonenumber: request.customerPhone || '',
                    name: request.customerName,
                },
                customizations: {
                    title: 'Cartflox Payment',
                    description: `Payment for order ${request.orderId}`,
                    logo: 'https://afriflow.io/logo.png',
                },
                meta: {
                    order_id: request.orderId,
                    callback_url: request.callbackUrl,
                    ...request.metadata,
                },
            };

            const response = await fetch(`${this.baseUrl}/payments`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.secretKey}`,
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(20000),
            });

            const data: FlutterwavePaymentResponse = await response.json();

            if (data.status !== 'success') {
                return {
                    transactionId: tx_ref,
                    providerReference: '',
                    status: 'FAILED' as PaymentStatus,
                    rawData: data,
                };
            }

            return {
                transactionId: tx_ref,
                providerReference: tx_ref,
                status: 'PENDING' as PaymentStatus,
                checkoutUrl: data.data.link,
                rawData: data,
            };
        } catch (error: any) {
            console.error('[Flutterwave] initiatePayment error:', error);
            return {
                transactionId: '',
                providerReference: '',
                status: 'FAILED' as PaymentStatus,
                rawData: { error: error.message },
            };
        }
    }

    /**
     * Initiate direct card charge (for PCI DSS compliant merchants)
     */
    async chargeCard(cardDetails: {
        card_number: string;
        cvv: string;
        expiry_month: string;
        expiry_year: string;
        amount: number;
        currency: string;
        email: string;
        fullname: string;
        tx_ref: string;
        redirect_url: string;
    }): Promise<PaymentResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/charges?type=card`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.secretKey}`,
                },
                body: JSON.stringify(cardDetails),
                signal: AbortSignal.timeout(20000),
            });

            const data: FlutterwavePaymentResponse = await response.json();

            if (data.status !== 'success') {
                return {
                    transactionId: cardDetails.tx_ref,
                    providerReference: '',
                    status: 'FAILED' as PaymentStatus,
                    rawData: data,
                };
            }

            // Determine status based on auth_model
            let status: PaymentStatus = 'PENDING';
            if (data.data.status === 'successful') {
                status = 'SUCCESS';
            } else if (data.data.auth_model === 'redirect') {
                status = 'PENDING'; // Needs 3DS redirect
            }

            return {
                transactionId: cardDetails.tx_ref,
                providerReference: data.data.flw_ref || '',
                status,
                checkoutUrl: data.data.auth_model === 'redirect' ? data.data.link : undefined,
                rawData: data,
            };
        } catch (error: any) {
            return {
                transactionId: cardDetails.tx_ref,
                providerReference: '',
                status: 'FAILED' as PaymentStatus,
                rawData: { error: error.message },
            };
        }
    }

    /**
     * Initiate Mobile Money payment
     */
    async chargeMobileMoney(details: {
        phone_number: string;
        amount: number;
        currency: string;
        email: string;
        tx_ref: string;
        network?: string; // MTN, VODAFONE, TIGO, AIRTEL, etc.
        country?: string; // GH, KE, UG, RW, ZM, etc.
    }): Promise<PaymentResponse> {
        try {
            const country = details.country || 'GH';
            const chargeType = this.getMobileMoneyType(country);

            const payload = {
                ...details,
                country,
            };

            const response = await fetch(`${this.baseUrl}/charges?type=${chargeType}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.secretKey}`,
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(20000),
            });

            const data: FlutterwavePaymentResponse = await response.json();

            if (data.status !== 'success') {
                return {
                    transactionId: details.tx_ref,
                    providerReference: '',
                    status: 'FAILED' as PaymentStatus,
                    rawData: data,
                };
            }

            return {
                transactionId: details.tx_ref,
                providerReference: data.data.flw_ref || '',
                status: 'PENDING' as PaymentStatus,
                checkoutUrl: data.data.link,
                rawData: data,
            };
        } catch (error: any) {
            return {
                transactionId: details.tx_ref,
                providerReference: '',
                status: 'FAILED' as PaymentStatus,
                rawData: { error: error.message },
            };
        }
    }

    /**
     * Get mobile money charge type based on country
     */
    private getMobileMoneyType(country: string): string {
        const types: Record<string, string> = {
            'GH': 'mobile_money_ghana',
            'KE': 'mpesa',
            'UG': 'mobile_money_uganda',
            'RW': 'mobile_money_rwanda',
            'ZM': 'mobile_money_zambia',
            'TZ': 'mobile_money_tanzania',
            'CI': 'mobile_money_franco',
            'SN': 'mobile_money_franco',
            'CM': 'mobile_money_franco',
            'BF': 'mobile_money_franco',
            'BJ': 'mobile_money_franco',
        };
        return types[country] || 'mobile_money_ghana';
    }

    /**
     * Verify payment status
     */
    async verifyPayment(providerReference: string): Promise<PaymentResponse> {
        try {
            // Flutterwave uses transaction ID for verification
            const response = await fetch(
                `${this.baseUrl}/transactions/verify_by_reference?tx_ref=${providerReference}`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${this.config.secretKey}`,
                    },
                    signal: AbortSignal.timeout(20000),
                }
            );

            const data: FlutterwavePaymentResponse = await response.json();

            // Reponse d'API (« No transaction was found » tant que l'acheteur n'a pas
            // tente, cle refusee...) : on reste en attente avec le motif, pas un echec.
            if (data.status !== 'success') {
                return {
                    transactionId: providerReference,
                    providerReference,
                    status: 'PENDING' as PaymentStatus,
                    rawData: { ...(data as any), error: (data as any)?.message || 'Flutterwave : réponse sans statut de transaction' },
                };
            }

            let status: PaymentStatus = 'PENDING';
            const txStatus = data.data.status?.toLowerCase();

            if (txStatus === 'successful') {
                status = 'SUCCESS';
            } else if (txStatus === 'failed') {
                status = 'FAILED';
            } else if (txStatus === 'cancelled') {
                status = 'CANCELLED';
            }

            return {
                transactionId: data.data.tx_ref || providerReference,
                providerReference: data.data.flw_ref || providerReference,
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
     * Process Flutterwave webhook
     */
    async handleWebhook(payload: any, headers?: any): Promise<WebhookResult> {
        try {
            // NOTE: webhook authenticity is enforced centrally, BEFORE this
            // adapter runs: the route calls verifyWebhookSignature() (Flutterwave
            // verif-hash) and, when the signature is not cryptographically proven,
            // re-confirms any SUCCESS against the Flutterwave API via
            // verifyPayment(). This payload is NOT trusted as proof of payment.
            const data = payload.data || payload;
            const event = payload.event || 'charge.completed';

            let status: PaymentStatus = 'PENDING';
            if (event === 'charge.completed' && data.status === 'successful') {
                status = 'SUCCESS';
            } else if (data.status === 'failed') {
                status = 'FAILED';
            }

            return {
                transactionId: data.tx_ref || data.id?.toString() || '',
                providerReference: data.flw_ref || data.id?.toString() || '',
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

    /**
     * Get supported payment methods for a country
     */
    getSupportedMethods(countryCode: string): string[] {
        const methods: Record<string, string[]> = {
            'NG': ['card', 'banktransfer', 'ussd', 'barter'],
            'GH': ['card', 'mobile_money_ghana', 'banktransfer'],
            'KE': ['card', 'mpesa', 'banktransfer'],
            'UG': ['card', 'mobile_money_uganda'],
            'TZ': ['card', 'mobile_money_tanzania'],
            'RW': ['card', 'mobile_money_rwanda'],
            'ZA': ['card', 'banktransfer'],
            'ZM': ['card', 'mobile_money_zambia'],
            'CI': ['card', 'mobile_money_franco'],
            'SN': ['card', 'mobile_money_franco'],
            'CM': ['card', 'mobile_money_franco'],
            'BF': ['card', 'mobile_money_franco'],
            'BJ': ['card', 'mobile_money_franco'],
        };
        return methods[countryCode] || ['card'];
    }

    /**
     * Get supported currencies
     */
    getSupportedCurrencies(): string[] {
        return [
            'NGN', 'GHS', 'KES', 'UGX', 'TZS', 'RWF', 'ZAR', 'ZMW',
            'XOF', 'XAF', 'USD', 'EUR', 'GBP'
        ];
    }

    /**
     * Validate credentials by fetching account balance
     */
    async validateCredentials(): Promise<{ success: boolean; message?: string }> {
        try {
            const response = await fetch(`${this.baseUrl}/balances`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.config.secretKey}`,
                },
                signal: AbortSignal.timeout(20000),
            });

            if (response.status === 401) {
                return { success: false, message: 'Clé secrète Flutterwave invalide' };
            }

            const data = await response.json();

            if (data.status === 'success') {
                return { success: true };
            }

            return {
                success: false,
                message: data.message || 'Erreur de connexion à Flutterwave'
            };
        } catch (error: any) {
            return { success: false, message: 'Impossible de contacter Flutterwave. Vérifiez votre connexion.' };
        }
    }

    /**
     * Get transaction fees for a payment
     */
    async getTransactionFee(amount: number, currency: string): Promise<{ fee: number; currency: string }> {
        try {
            const response = await fetch(
                `${this.baseUrl}/transactions/fee?amount=${amount}&currency=${currency}`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${this.config.secretKey}`,
                    },
                    signal: AbortSignal.timeout(20000),
                }
            );

            const data = await response.json();

            if (data.status === 'success') {
                return {
                    fee: data.data.fee,
                    currency: data.data.currency
                };
            }

            return { fee: 0, currency };
        } catch {
            return { fee: 0, currency };
        }
    }
}
