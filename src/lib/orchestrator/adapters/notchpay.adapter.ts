import {
    IPaymentProvider,
    PaymentRequest,
    PaymentResponse,
    PaymentStatus,
    WebhookResult
} from '../types';

/**
 * NotchPay Payment Provider Adapter
 * Documentation: https://developer.notchpay.co/accept-payments/mobile-money
 *
 * Direct Mobile Money flow (stays on YOUR checkout):
 *   1. POST /payments              → create payment, get reference
 *   2. POST /payments/:reference   → process with channel + phone → USSD push
 *
 * Supported channels: cm.mtn, cm.orange, ci.mtn, ci.orange, sn.orange, sn.wave
 *
 * Countries: Cameroon (XAF), Côte d'Ivoire (XOF), Sénégal (XOF)
 */

interface NotchPayConfig {
    publicKey: string;
    mode?: 'test' | 'live';
}

// Map method codes → NotchPay channel codes
const CHANNEL_MAP: Record<string, string> = {
    'mtn-cameroon':            'cm.mtn',
    'orange-money-cameroon':   'cm.orange',
    'express-union-cm':        'cm.eu',
    'mtn-ci-notchpay':         'ci.mtn',
    'orange-money-ci':         'ci.orange',
    'card-notchpay':           'card',
};

export class NotchPayAdapter implements IPaymentProvider {
    readonly name = 'NotchPay';
    private config: NotchPayConfig;
    private baseUrl = 'https://api.notchpay.co';

    constructor(config: NotchPayConfig) {
        this.config = config;
    }

    private getHeaders() {
        return {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': this.config.publicKey,
        };
    }

    private generateReference(orderId: string): string {
        return `NP_${orderId}_${Date.now()}`;
    }

    private detectChannel(methodCode: string): string {
        if (CHANNEL_MAP[methodCode]) return CHANNEL_MAP[methodCode];
        const c = methodCode.toLowerCase();
        if (c.includes('mtn') && c.includes('cm'))     return 'cm.mtn';
        if (c.includes('orange') && c.includes('cm'))  return 'cm.orange';
        if (c.includes('mtn') && c.includes('ci'))     return 'ci.mtn';
        if (c.includes('orange') && c.includes('ci'))  return 'ci.orange';
        if (c.includes('wave') && c.includes('sn'))    return 'sn.wave';
        if (c.includes('orange') && c.includes('sn'))  return 'sn.orange';
        if (c.includes('card') || c.includes('visa'))  return 'card';
        return 'cm.mtn';
    }

    /**
     * Step 1: Create payment
     * Step 2: Process with mobile money channel + phone
     */
    async initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
        try {
            const reference = this.generateReference(request.orderId);

            const paymentPayload: any = {
                amount: request.amount,
                currency: request.currency || 'XAF',
                customer: {
                    name: request.customerName || 'Customer',
                    email: request.customerEmail,
                    phone: request.customerPhone || '',
                },
                description: `Payment for order ${request.orderId}`,
                callback: request.callbackUrl,
                reference,
            };

            // Step 1: Create the payment
            const createRes = await fetch(`${this.baseUrl}/payments`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(paymentPayload),
                signal: AbortSignal.timeout(20000),
            });

            const created: any = await createRes.json();

            if (!createRes.ok || !created?.transaction?.reference) {
                return { transactionId: reference, providerReference: '', status: 'FAILED', rawData: created };
            }

            const paymentRef = created.transaction.reference;
            const methodCode = request.metadata?.methodCode || '';

            // Card payments → redirect to authorization_url
            if (methodCode.includes('card') || methodCode.includes('visa')) {
                return {
                    transactionId: reference,
                    providerReference: paymentRef,
                    status: 'PENDING',
                    checkoutUrl: created.authorization_url,
                    rawData: created,
                };
            }

            // Step 2: Process with mobile money channel + phone
            const channel = this.detectChannel(methodCode);
            const phone = request.customerPhone || '';

            const processRes = await fetch(`${this.baseUrl}/payments/${paymentRef}`, {
                method: 'PUT',
                headers: this.getHeaders(),
                body: JSON.stringify({
                    channel,
                    data: { phone },
                }),
                signal: AbortSignal.timeout(20000),
            });

            const processed: any = await processRes.json();

            if (!processRes.ok) {
                return { transactionId: reference, providerReference: paymentRef, status: 'FAILED', rawData: processed };
            }

            // Payment is now processing — USSD push sent to customer's phone
            return {
                transactionId: reference,
                providerReference: paymentRef,
                status: 'PENDING',
                rawData: processed,
            };
        } catch (error: any) {
            console.error('[NotchPay] initiatePayment error:', error);
            return { transactionId: '', providerReference: '', status: 'FAILED', rawData: { error: error.message } };
        }
    }

    async verifyPayment(providerReference: string): Promise<PaymentResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/payments/${providerReference}`, {
                method: 'GET',
                headers: this.getHeaders(),
                signal: AbortSignal.timeout(20000),
            });

            const data: any = await response.json();

            let status: PaymentStatus = 'PENDING';
            switch (data.transaction?.status) {
                case 'complete':   status = 'SUCCESS';    break;
                case 'failed':
                case 'expired':    status = 'FAILED';     break;
                case 'cancelled':  status = 'CANCELLED';  break;
                default:           status = 'PENDING';
            }

            return { transactionId: providerReference, providerReference: data.transaction?.reference || providerReference, status, rawData: data };
        } catch (error: any) {
            return { transactionId: providerReference, providerReference, status: 'FAILED', rawData: { error: error.message } };
        }
    }

    async handleWebhook(payload: any, _headers?: any): Promise<WebhookResult> {
        try {
            const reference = payload?.data?.reference || payload?.reference;
            if (!reference) throw new Error('Missing reference in NotchPay webhook');
            const verification = await this.verifyPayment(reference);
            return { transactionId: reference, providerReference: verification.providerReference, status: verification.status, rawData: { webhook_original: payload, verification_data: verification.rawData } };
        } catch (error: any) {
            return { transactionId: '', providerReference: '', status: 'FAILED', rawData: { error: error.message } };
        }
    }

    async validateCredentials(): Promise<{ success: boolean; message?: string }> {
        try {
            if (!this.config.publicKey) return { success: false, message: 'Clé publique NotchPay requise' };
            const response = await fetch(`${this.baseUrl}/payments?perPage=1`, { method: 'GET', headers: this.getHeaders(), signal: AbortSignal.timeout(20000) });
            if (response.status === 401 || response.status === 403) return { success: false, message: 'Clé publique NotchPay invalide' };
            return { success: true };
        } catch {
            return { success: false, message: 'Erreur lors de la validation NotchPay' };
        }
    }
}
