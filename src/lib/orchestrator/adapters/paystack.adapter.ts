import {
    IPaymentProvider,
    PaymentRequest,
    PaymentResponse,
    PaymentStatus,
    WebhookResult
} from '../types';

/**
 * Paystack Payment Provider Adapter
 * Documentation: https://paystack.com/docs/api/
 * 
 * Supported Payment Methods:
 * - Bank Cards (Visa, MasterCard, Verve)
 * - Bank Transfer
 * - USSD
 * - Mobile Money (Ghana)
 * - QR Code
 * 
 * Primary Countries:
 * - Nigeria (Main)
 * - Ghana
 * - South Africa
 * - Kenya
 * 
 * Currencies: NGN, GHS, ZAR, KES, USD
 */

interface PaystackConfig {
    publicKey: string;
    secretKey: string;
    mode?: 'test' | 'live';
}

interface PaystackTransactionResponse {
    status: boolean;
    message: string;
    data: {
        authorization_url?: string;
        access_code?: string;
        reference?: string;
        id?: number;
        domain?: string;
        status?: string;
        gateway_response?: string;
        amount?: number;
        currency?: string;
        paid_at?: string;
        channel?: string;
        customer?: {
            id?: number;
            email?: string;
            customer_code?: string;
            first_name?: string;
            last_name?: string;
            phone?: string;
        };
        metadata?: any;
    };
}

export class PaystackAdapter implements IPaymentProvider {
    readonly name = 'Paystack';
    private config: PaystackConfig;
    private baseUrl = 'https://api.paystack.co';

    constructor(config: PaystackConfig) {
        this.config = config;
    }

    /**
     * Generate a unique transaction reference
     */
    private generateReference(orderId: string): string {
        return `PSK_${orderId}_${Date.now()}`;
    }

    /**
     * Convert amount to kobo (smallest currency unit)
     * Paystack expects amounts in kobo for NGN (1 NGN = 100 kobo)
     */
    private toSmallestUnit(amount: number, currency: string): number {
        // NGN, GHS, ZAR, KES all use 100 subunits
        return Math.round(amount * 100);
    }

    /**
     * Convert from kobo to main currency unit
     */
    private fromSmallestUnit(amount: number): number {
        return amount / 100;
    }

    /**
     * Initiate a payment with Paystack
     * Uses the Initialize Transaction endpoint
     */
    /** Operateur Paystack d'apres notre code de moyen ; null si ce n'est pas du Mobile Money direct. */
    private operateurMobile(code: string, devise: string): string | null {
        const c = code.toLowerCase();
        if (devise === 'GHS') {
            if (/mtn/.test(c)) return 'mtn';
            if (/vodafone|telecel|vod/.test(c)) return 'vod';
            if (/airtel|tigo|atl/.test(c)) return 'atl';
        }
        if (devise === 'KES' && /m-?pesa|safaricom/.test(c)) return 'mpesa';
        return null;
    }

    /** Etats de l'API Charge : send_otp, pay_offline, pending, success, failed, timeout. */
    private etatCharge(data: any, reference: string): PaymentResponse {
        const d = data?.data || {};
        const etat = String(d.status || '').toLowerCase();
        const instructions = d.display_text || '';
        const ref = d.reference || reference;
        if (etat === 'success') return { transactionId: ref, providerReference: ref, status: 'SUCCESS', rawData: data };
        if (etat === 'failed' || etat === 'timeout' || etat === 'abandoned') {
            return { transactionId: ref, providerReference: ref, status: 'FAILED', rawData: { ...data, error: d.gateway_response || d.message || data?.message || 'Paystack a refusé la demande' } };
        }
        if (etat === 'send_otp') return { transactionId: ref, providerReference: ref, status: 'PENDING', rawData: { ...data, _otp_requis: true, _instructions: instructions } };
        return { transactionId: ref, providerReference: ref, status: 'PENDING', rawData: { ...data, _instructions: instructions } };
    }

    /**
     * Mobile Money Ghana / Kenya avec un numero : la demande est poussee sur le
     * telephone depuis NOTRE page (API Charge), sans passer par la page Paystack.
     * null = pas concerne (carte, Nigeria, pas de numero) : flux hebergee.
     */
    private async chargeMobile(request: PaymentRequest): Promise<PaymentResponse | null> {
        const devise = (request.currency || 'NGN').toUpperCase();
        const operateur = this.operateurMobile(String(request.metadata?.methodCode || ''), devise);
        const chiffres = String(request.customerPhone || '').replace(/\D/g, '');
        if (!operateur || !chiffres) return null;
        const reference = this.generateReference(request.orderId);
        try {
            const reponse = await fetch(`${this.baseUrl}/charge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.config.secretKey}` },
                body: JSON.stringify({
                    email: request.customerEmail, amount: this.toSmallestUnit(request.amount, devise), currency: devise, reference,
                    mobile_money: { phone: `+${chiffres}`, provider: operateur },
                    metadata: { order_id: request.orderId, customer_name: request.customerName },
                }),
                signal: AbortSignal.timeout(25000),
            });
            const data: any = await reponse.json().catch(() => ({}));
            if (!reponse.ok || data?.status === false) {
                return { transactionId: reference, providerReference: '', status: 'FAILED', rawData: { ...data, error: data?.message || `Paystack a répondu ${reponse.status}` } };
            }
            return this.etatCharge(data, reference);
        } catch (error: any) {
            return { transactionId: reference, providerReference: '', status: 'FAILED', rawData: { error: error?.message } };
        }
    }

    /** Code recu par SMS, saisi sur notre page. */
    async soumettreCode(providerReference: string, otp: string): Promise<PaymentResponse> {
        try {
            const reponse = await fetch(`${this.baseUrl}/charge/submit_otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.config.secretKey}` },
                body: JSON.stringify({ otp, reference: providerReference }),
                signal: AbortSignal.timeout(25000),
            });
            const data: any = await reponse.json().catch(() => ({}));
            if (!reponse.ok || data?.status === false) {
                return { transactionId: providerReference, providerReference, status: 'FAILED', rawData: { ...data, error: data?.message || 'Code refusé par Paystack' } };
            }
            return this.etatCharge(data, providerReference);
        } catch (error: any) {
            return { transactionId: providerReference, providerReference, status: 'FAILED', rawData: { error: error?.message } };
        }
    }

    async initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
        const direct = await this.chargeMobile(request);
        if (direct) return direct;
        try {
            const reference = this.generateReference(request.orderId);
            const amountInKobo = this.toSmallestUnit(request.amount, request.currency || 'NGN');

            const payload = {
                email: request.customerEmail,
                amount: amountInKobo,
                currency: request.currency || 'NGN',
                reference,
                callback_url: request.returnUrl,
                metadata: {
                    order_id: request.orderId,
                    customer_name: request.customerName,
                    customer_phone: request.customerPhone,
                    cancel_action: request.callbackUrl + '?status=cancelled',
                    ...request.metadata,
                },
                channels: ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer'],
            };

            const response = await fetch(`${this.baseUrl}/transaction/initialize`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.secretKey}`,
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(20000),
            });

            const data: PaystackTransactionResponse = await response.json();

            if (!data.status || !data.data.authorization_url) {
                return {
                    transactionId: reference,
                    providerReference: '',
                    status: 'FAILED' as PaymentStatus,
                    rawData: data,
                };
            }

            return {
                transactionId: reference,
                providerReference: data.data.access_code || reference,
                status: 'PENDING' as PaymentStatus,
                checkoutUrl: data.data.authorization_url,
                rawData: data,
            };
        } catch (error: any) {
            console.error('[Paystack] initiatePayment error:', error);
            return {
                transactionId: '',
                providerReference: '',
                status: 'FAILED' as PaymentStatus,
                rawData: { error: error.message },
            };
        }
    }

    /**
     * Charge authorization (for recurring payments)
     */
    async chargeAuthorization(details: {
        email: string;
        amount: number;
        currency: string;
        authorization_code: string;
        reference: string;
    }): Promise<PaymentResponse> {
        try {
            const amountInKobo = this.toSmallestUnit(details.amount, details.currency);

            const response = await fetch(`${this.baseUrl}/transaction/charge_authorization`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.secretKey}`,
                },
                body: JSON.stringify({
                    email: details.email,
                    amount: amountInKobo,
                    currency: details.currency,
                    authorization_code: details.authorization_code,
                    reference: details.reference,
                }),
                signal: AbortSignal.timeout(20000),
            });

            const data: PaystackTransactionResponse = await response.json();

            if (!data.status) {
                return {
                    transactionId: details.reference,
                    providerReference: '',
                    status: 'FAILED' as PaymentStatus,
                    rawData: data,
                };
            }

            let status: PaymentStatus = 'PENDING';
            if (data.data.status === 'success') {
                status = 'SUCCESS';
            } else if (data.data.status === 'failed') {
                status = 'FAILED';
            }

            return {
                transactionId: details.reference,
                providerReference: data.data.reference || details.reference,
                status,
                rawData: data,
            };
        } catch (error: any) {
            return {
                transactionId: details.reference,
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
        try {
            const response = await fetch(
                `${this.baseUrl}/transaction/verify/${providerReference}`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${this.config.secretKey}`,
                    },
                    signal: AbortSignal.timeout(20000),
                }
            );

            const data: PaystackTransactionResponse = await response.json();

            if (!data.status) {
                return {
                    transactionId: providerReference,
                    providerReference,
                    status: 'FAILED' as PaymentStatus,
                    rawData: data,
                };
            }

            let status: PaymentStatus = 'PENDING';
            const txStatus = data.data.status?.toLowerCase();

            if (txStatus === 'success') {
                status = 'SUCCESS';
            } else if (txStatus === 'failed' || txStatus === 'abandoned') {
                status = 'FAILED';
            } else if (txStatus === 'reversed') {
                status = 'CANCELLED';
            }

            return {
                transactionId: data.data.reference || providerReference,
                providerReference: data.data.reference || providerReference,
                status,
                rawData: {
                    ...data,
                    amount: this.fromSmallestUnit(data.data.amount || 0),
                },
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
     * Process Paystack webhook
     * Webhook events: charge.success, transfer.success, transfer.failed, etc.
     */
    async handleWebhook(payload: any, headers?: any): Promise<WebhookResult> {
        try {
            // Paystack sends event type in the payload
            const event = payload.event;
            const data = payload.data;

            let status: PaymentStatus = 'PENDING';

            if (event === 'charge.success') {
                status = 'SUCCESS';
            } else if (event === 'charge.failed' || event === 'transfer.failed') {
                status = 'FAILED';
            } else if (event === 'transfer.reversed') {
                status = 'CANCELLED';
            }

            return {
                transactionId: data.reference,
                providerReference: data.reference,
                status,
                rawData: {
                    event,
                    amount: this.fromSmallestUnit(data.amount || 0),
                    currency: data.currency,
                    customerEmail: data.customer?.email,
                    customerName: `${data.customer?.first_name || ''} ${data.customer?.last_name || ''}`.trim(),
                    channel: data.channel,
                    gatewayResponse: data.gateway_response,
                    paidAt: data.paid_at,
                    metadata: data.metadata,
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
     * Create a transfer recipient (for payouts)
     */
    async createTransferRecipient(details: {
        type: 'nuban' | 'mobile_money' | 'basa';
        name: string;
        account_number: string;
        bank_code: string;
        currency: string;
    }): Promise<{ success: boolean; recipient_code?: string; message?: string }> {
        try {
            const response = await fetch(`${this.baseUrl}/transferrecipient`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.secretKey}`,
                },
                body: JSON.stringify(details),
                signal: AbortSignal.timeout(20000),
            });

            const data = await response.json();

            if (data.status) {
                return {
                    success: true,
                    recipient_code: data.data.recipient_code,
                };
            }

            return {
                success: false,
                message: data.message,
            };
        } catch (error: any) {
            return {
                success: false,
                message: error.message,
            };
        }
    }

    /**
     * Initiate a transfer (payout)
     */
    async initiateTransfer(details: {
        amount: number;
        currency: string;
        recipient: string; // recipient_code
        reason?: string;
        reference?: string;
    }): Promise<{ success: boolean; transfer_code?: string; reference?: string; message?: string }> {
        try {
            const response = await fetch(`${this.baseUrl}/transfer`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.secretKey}`,
                },
                body: JSON.stringify({
                    source: 'balance',
                    amount: this.toSmallestUnit(details.amount, details.currency),
                    recipient: details.recipient,
                    reason: details.reason || 'Payout',
                    reference: details.reference,
                }),
                signal: AbortSignal.timeout(20000),
            });

            const data = await response.json();

            if (data.status) {
                return {
                    success: true,
                    transfer_code: data.data.transfer_code,
                    reference: data.data.reference,
                };
            }

            return {
                success: false,
                message: data.message,
            };
        } catch (error: any) {
            return {
                success: false,
                message: error.message,
            };
        }
    }

    /**
     * Get supported payment channels for a country
     */
    getSupportedChannels(countryCode: string): string[] {
        const channels: Record<string, string[]> = {
            'NG': ['card', 'bank', 'ussd', 'qr', 'bank_transfer'],
            'GH': ['card', 'mobile_money', 'bank'],
            'ZA': ['card', 'bank'],
            'KE': ['card', 'mobile_money'],
        };
        return channels[countryCode] || ['card'];
    }

    /**
     * Get supported currencies
     */
    getSupportedCurrencies(): string[] {
        return ['NGN', 'GHS', 'ZAR', 'KES', 'USD'];
    }

    /**
     * Validate credentials by fetching account balance
     */
    async validateCredentials(): Promise<{ success: boolean; message?: string }> {
        try {
            // Check if secret key has valid format
            if (!this.config.secretKey.startsWith('sk_')) {
                return {
                    success: false,
                    message: 'La clé secrète Paystack doit commencer par "sk_"'
                };
            }

            const response = await fetch(`${this.baseUrl}/balance`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.config.secretKey}`,
                },
                signal: AbortSignal.timeout(20000),
            });

            if (response.status === 401) {
                return {
                    success: false,
                    message: 'Clé secrète Paystack invalide'
                };
            }

            const data = await response.json();

            if (data.status) {
                return { success: true };
            }

            return {
                success: false,
                message: data.message || 'Erreur de connexion à Paystack'
            };
        } catch (error: any) {
            return {
                success: false,
                message: 'Impossible de contacter Paystack. Vérifiez votre connexion.'
            };
        }
    }

    /**
     * List banks for a country
     */
    async listBanks(country: string = 'nigeria'): Promise<Array<{ name: string; code: string }>> {
        try {
            const response = await fetch(`${this.baseUrl}/bank?country=${country}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.config.secretKey}`,
                },
                signal: AbortSignal.timeout(20000),
            });

            const data = await response.json();

            if (data.status) {
                return data.data.map((bank: any) => ({
                    name: bank.name,
                    code: bank.code,
                }));
            }

            return [];
        } catch {
            return [];
        }
    }
}
