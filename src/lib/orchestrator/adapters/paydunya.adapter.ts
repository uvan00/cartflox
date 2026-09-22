import {
    IPaymentProvider,
    PaymentRequest,
    PaymentResponse,
    PaymentStatus,
    WebhookResult
} from '../types';

/**
 * PayDunya Payment Provider Adapter
 * Documentation: https://developers.paydunya.com/
 * 
 * Supported Payment Methods:
 * - Card (Visa/MasterCard)
 * - Orange Money (Senegal, Mali, Burkina Faso, CI)
 * - Wave (Senegal, CI)
 * - MTN Mobile Money (Benin, CI, Cameroun)
 * - Moov Money (Benin, CI, Togo, Mali, Burkina Faso)
 * - Free Money (Senegal)
 * - Expresso (Senegal)
 * - Wizall (Senegal)
 * - T-Money (Togo)
 */

interface PayDunyaConfig {
    masterKey: string;
    privateKey: string;
    publicKey: string;
    token: string;
    mode: 'test' | 'live';
    storeId?: string;
}

interface PayDunyaInvoiceResponse {
    response_code: string;
    response_text: string;
    description: string;
    token: string;
    response_url: string;
}

interface PayDunyaStatusResponse {
    response_code: string;
    status: string;
    custom_data: any;
    transaction_id: string;
}

export class PayDunyaAdapter implements IPaymentProvider {
    readonly name = 'PayDunya';
    private config: PayDunyaConfig;
    private baseUrl: string;

    constructor(config: PayDunyaConfig) {
        this.config = config;
        this.baseUrl = config.mode === 'live'
            ? 'https://app.paydunya.com/api/v1'
            : 'https://app.paydunya.com/sandbox-api/v1';
    }

    /**
     * Initiate a payment with PayDunya
     * Uses the Direct Pay API (API PAR)
     */
    async initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
        try {
            // cancel_url must land the customer on a page, not on the IPN endpoint
            const cancelSep = request.returnUrl?.includes('?') ? '&' : '?';
            const invoiceData: any = {
                invoice: {
                    total_amount: request.amount,
                    description: `Payment for order ${request.orderId}`,
                },
                store: {
                    name: this.config.storeId || 'Cartflox Store',
                },
                custom_data: {
                    order_id: request.orderId,
                    customer_email: request.customerEmail,
                    customer_phone: request.customerPhone,
                    ...request.metadata,
                },
                actions: {
                    cancel_url: `${request.returnUrl}${cancelSep}status=cancelled`,
                    return_url: request.returnUrl,
                    callback_url: request.callbackUrl,
                }
            };

            const response = await fetch(`${this.baseUrl}/checkout-invoice/create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'PAYDUNYA-MASTER-KEY': this.config.masterKey,
                    'PAYDUNYA-PRIVATE-KEY': this.config.privateKey,
                    'PAYDUNYA-TOKEN': this.config.token,
                },
                body: JSON.stringify(invoiceData),
                signal: AbortSignal.timeout(20000),
            });

            const data: PayDunyaInvoiceResponse = await response.json();

            if (data.response_code !== '00') {
                return {
                    transactionId: '',
                    providerReference: '',
                    status: 'FAILED' as PaymentStatus,
                    rawData: data,
                };
            }

            return {
                transactionId: data.token,
                providerReference: data.token,
                status: 'PENDING' as PaymentStatus,
                checkoutUrl: data.response_url,
                rawData: data,
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
     * Process Direct Payment via SoftPay
     */
    async processSoftPay(token: string, method: string, details: any): Promise<PaymentResponse> {
        try {
            let endpoint = '';
            let body: any = {};

            const m = method.toLowerCase();
            const country = (details.country || 'SN').toUpperCase();
            // SoftPay expects local subscriber numbers (e.g. CI "0712345678",
            // SN "771234567"), not E.164 — strip the country dial code.
            const dialCodes: Record<string, string> = { SN: '221', CI: '225', BJ: '229', TG: '228', ML: '223', BF: '226', CM: '237' };
            let phone = (details.phone || '').replace(/\D/g, '');
            const dial = dialCodes[country];
            if (dial && phone.startsWith(dial)) phone = phone.slice(dial.length);

            // PAYDUNYA SOFT PAY FIELD MAPPING (Inconsistent across countries/operators)
            if (m.includes('orange')) {
                if (country === 'SN') {
                    endpoint = '/softpay/new-orange-money-senegal';
                    body = {
                        customer_name: details.name,
                        customer_email: details.email,
                        phone_number: phone,
                        invoice_token: token
                    };
                } else if (country === 'CI') {
                    endpoint = '/softpay/orange-money-ci';
                    body = {
                        orange_money_ci_customer_fullname: details.name,
                        orange_money_ci_email: details.email,
                        orange_money_ci_phone_number: phone,
                        orange_money_ci_otp: details.otp,
                        payment_token: token
                    };
                } else if (country === 'ML') {
                    endpoint = '/softpay/orange-money-mali';
                    body = {
                        orange_money_mali_customer_fullname: details.name,
                        orange_money_mali_email: details.email,
                        orange_money_mali_phone_number: phone,
                        orange_money_mali_customer_address: "Bamako",
                        payment_token: token
                    };
                } else if (country === 'BF') {
                    endpoint = '/softpay/orange-money-burkina';
                    body = {
                        name_bf: details.name,
                        email_bf: details.email,
                        phone_bf: phone,
                        otp_code: details.otp,
                        payment_token: token
                    };
                }
            }
            else if (m.includes('wave')) {
                const countrySlug = country === 'SN' ? 'senegal' : 'ci';
                endpoint = `/softpay/wave-${countrySlug}`;
                body = {
                    [`wave_${countrySlug}_fullName`]: details.name,
                    [`wave_${countrySlug}_email`]: details.email,
                    [`wave_${countrySlug}_phone`]: phone,
                    [`wave_${countrySlug}_payment_token`]: token
                };
            }
            else if (m.includes('mtn')) {
                if (country === 'CI') {
                    endpoint = '/softpay/mtn-ci';
                    body = {
                        mtn_ci_customer_fullname: details.name,
                        mtn_ci_email: details.email,
                        mtn_ci_phone_number: phone,
                        mtn_ci_wallet_provider: 'MTNCI',
                        payment_token: token
                    };
                } else if (country === 'CM') {
                    endpoint = '/softpay/mtn-cameroun';
                    body = {
                        mtn_cameroun_customer_fullname: details.name,
                        mtn_cameroun_email: details.email,
                        mtn_cameroun_phone_number: phone,
                        mtn_cameroun_wallet_provider: 'MTNCAMEROUN',
                        payment_token: token
                    };
                } else {
                    endpoint = '/softpay/mtn-benin';
                    body = {
                        mtn_benin_customer_fullname: details.name,
                        mtn_benin_email: details.email,
                        mtn_benin_phone_number: phone,
                        mtn_benin_wallet_provider: 'MTNBENIN',
                        payment_token: token
                    };
                }
            }
            else if (m.includes('moov') || m.includes('flooz')) {
                if (country === 'CI') {
                    endpoint = '/softpay/moov-ci';
                    body = {
                        moov_ci_customer_fullname: details.name,
                        moov_ci_email: details.email,
                        moov_ci_phone_number: phone,
                        payment_token: token
                    };
                } else if (country === 'ML') {
                    endpoint = '/softpay/moov-mali';
                    body = {
                        moov_ml_customer_fullname: details.name,
                        moov_ml_email: details.email,
                        moov_ml_phone_number: phone,
                        payment_token: token
                    };
                } else if (country === 'BF') {
                    endpoint = '/softpay/moov-burkina';
                    body = {
                        moov_burkina_faso_fullName: details.name,
                        moov_burkina_faso_email: details.email,
                        moov_burkina_faso_phone_number: phone,
                        payment_token: token
                    };
                } else if (country === 'TG') {
                    endpoint = '/softpay/moov-togo';
                    body = {
                        moov_togo_customer_fullname: details.name,
                        moov_togo_email: details.email,
                        moov_togo_phone_number: phone,
                        moov_togo_customer_address: "Lomé",
                        payment_token: token
                    };
                } else if (country === 'BJ') {
                    endpoint = '/softpay/moov-benin';
                    body = {
                        moov_benin_customer_fullname: details.name,
                        moov_benin_email: details.email,
                        moov_benin_phone_number: phone,
                        payment_token: token
                    };
                }
            }
            else if (m.includes('free')) {
                endpoint = '/softpay/free-money-senegal';
                body = {
                    customer_name: details.name,
                    customer_email: details.email,
                    phone_number: phone,
                    payment_token: token
                };
            }
            else if (m.includes('expresso')) {
                endpoint = '/softpay/expresso-senegal';
                body = {
                    expresso_sn_fullName: details.name,
                    expresso_sn_email: details.email,
                    expresso_sn_phone: phone,
                    payment_token: token
                };
            }
            else if (m.includes('t-money') || m.includes('tmoney')) {
                // Champs officiels PayDunya (name_t_money/email_t_money/phone_t_money) :
                // les variantes tmoney_* sont rejetées avec "informations saisies incorrectes".
                endpoint = '/softpay/t-money-togo';
                body = {
                    name_t_money: details.name,
                    email_t_money: details.email,
                    phone_t_money: phone,
                    payment_token: token
                };
            }

            // Méthode sans intégration SoftPay dédiée (Coris, Wizall...) : plutôt que
            // d'échouer, on renvoie la page de paiement hébergée PayDunya de la facture,
            // qui propose les canaux disponibles du compte.
            if (!endpoint) {
                const modePath = ((this.config as any)?.mode || 'live') === 'live' ? 'checkout' : 'sandbox-checkout';
                return {
                    transactionId: token,
                    providerReference: token,
                    status: 'PENDING' as PaymentStatus,
                    checkoutUrl: `https://paydunya.com/${modePath}/invoice/${token}`,
                    rawData: { message: `SoftPay non disponible pour ${method} (${country}) : redirection vers la page PayDunya` },
                };
            }

            // Avoid logging the full SoftPay body (contains customer PII). Log only
            // non-PII routing fields plus a masked phone.
            const maskedPhone = phone ? `${phone.slice(0, 2)}****${phone.slice(-2)}` : '';
            console.log(`📡 [PAYDUNYA] SoftPay Request: ${endpoint}`, JSON.stringify({ method: m, country, phone: maskedPhone }));

            const response = await fetch(`${this.baseUrl}${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'PAYDUNYA-MASTER-KEY': this.config.masterKey,
                    'PAYDUNYA-PRIVATE-KEY': this.config.privateKey,
                    'PAYDUNYA-TOKEN': this.config.token,
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(20000),
            });

            // Safety check for non-JSON responses
            const contentType = response.headers.get("content-type");
            let data: any;
            if (contentType && contentType.indexOf("application/json") !== -1) {
                data = await response.json();
            } else {
                const text = await response.text();
                throw new Error(`Invalid response from PayDunya: ${text.substring(0, 100)}`);
            }

            // Determine if the status is SUCCESS or PENDING
            let resultStatus: PaymentStatus = 'FAILED';
            if (data.success) {
                if (data.url) {
                    // Redirect methods (Wave)
                    resultStatus = 'PENDING';
                } else if (details.otp) {
                    // OTP methods where code was just submitted (Orange CI/BF)
                    resultStatus = 'SUCCESS';
                } else {
                    // USSD Push methods (MTN, Moov, etc.)
                    // Success here means "Push sent", so the transaction is PENDING user PIN
                    resultStatus = 'PENDING';
                }
            }

            return {
                transactionId: token,
                providerReference: data.transaction_id || token,
                status: resultStatus,
                checkoutUrl: data.url, // For Wave
                rawData: data
            };
        } catch (error: any) {
            return {
                transactionId: token,
                providerReference: token,
                status: 'FAILED',
                rawData: { error: error.message }
            };
        }
    }

    /**
     * Verify payment status
     */
    async verifyPayment(providerReference: string): Promise<PaymentResponse> {
        try {
            const response = await fetch(
                `${this.baseUrl}/checkout-invoice/confirm/${providerReference}`,
                {
                    method: 'GET',
                    headers: {
                        'PAYDUNYA-MASTER-KEY': this.config.masterKey,
                        'PAYDUNYA-PRIVATE-KEY': this.config.privateKey,
                        'PAYDUNYA-TOKEN': this.config.token,
                    },
                    signal: AbortSignal.timeout(20000),
                }
            );

            const data: PayDunyaStatusResponse = await response.json();

            let status: PaymentStatus = 'PENDING';
            if (data.response_code === '00' && data.status === 'completed') {
                status = 'SUCCESS';
            } else if (data.status === 'failed') {
                status = 'FAILED';
            } else if (data.status === 'cancelled') {
                status = 'CANCELLED';
            }

            return {
                transactionId: data.transaction_id || providerReference,
                providerReference: data.transaction_id || providerReference,
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
     * Process PayDunya IPN (Instant Payment Notification) webhook
     */
    async handleWebhook(payload: any, headers?: any): Promise<WebhookResult> {
        try {
            // PayDunya sends webhook data as form-encoded or JSON
            const data = payload.data || payload;

            // IPN nests the token under invoice (data[invoice][token])
            const token = data.invoice_token || data.token || data.invoice?.token;

            // Verify webhook authenticity by checking transaction status
            const verificationResult = await this.verifyPayment(token);

            return {
                transactionId: token,
                providerReference: token,
                status: verificationResult.status,
                rawData: {
                    custom_data: data.custom_data,
                    receipt_url: data.receipt_url,
                    ...data,
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
     * Get supported payment channels for a specific country
     */
    getSupportedChannels(countryCode: string): string[] {
        const channels: Record<string, string[]> = {
            'SN': ['card', 'orange-money-senegal', 'wave-senegal', 'free-money-senegal', 'expresso-sn', 'wizall-senegal'],
            'BJ': ['card', 'mtn-benin', 'moov-benin'],
            'CI': ['card', 'orange-money-ci', 'wave-ci', 'mtn-ci', 'moov-ci'],
            'TG': ['card', 't-money-togo', 'moov-togo'],
            'ML': ['card', 'orange-money-mali', 'moov-ml'],
            'BF': ['card', 'orange-money-burkina', 'moov-burkina-faso'],
            'CM': ['card', 'mtn-cameroun'],
        };

        return channels[countryCode] || ['card'];
    }

    /**
     * Validate credentials by attempting a test connection
     */
    async validateCredentials(): Promise<{ success: boolean; message?: string }> {
        try {
            // We try to create a dummy invoice with 200 XOF to verify keys
            const testData = {
                invoice: {
                    total_amount: 200,
                    description: "Test de connexion Cartflox",
                },
                store: {
                    name: "Cartflox Test",
                }
            };

            const response = await fetch(`${this.baseUrl}/checkout-invoice/create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'PAYDUNYA-MASTER-KEY': this.config.masterKey,
                    'PAYDUNYA-PRIVATE-KEY': this.config.privateKey,
                    'PAYDUNYA-TOKEN': this.config.token,
                },
                body: JSON.stringify(testData),
                signal: AbortSignal.timeout(20000),
            });

            if (response.status === 401) {
                return { success: false, message: "Identifiants invalides (Master Key, Private Key ou Token incorrect)" };
            }

            const data: any = await response.json();

            if (data.response_code === '00') {
                return { success: true };
            }

            return {
                success: false,
                message: data.response_text || data.description || "Erreur de connexion à PayDunya"
            };
        } catch (error: any) {
            return { success: false, message: "Impossible de contacter PayDunya. Vérifiez votre connexion." };
        }
    }
}
