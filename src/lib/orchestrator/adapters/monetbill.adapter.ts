import {
    IPaymentProvider,
    PaymentRequest,
    PaymentResponse,
    PaymentStatus,
    WebhookResult
} from '../types';

/**
 * MonetBill Payment Provider Adapter
 * Documentation: https://monetbil.company/doc
 * 
 * Supported Payment Methods:
 * - MTN Mobile Money (Cameroon)
 * - Orange Money (Cameroon)
 * - Express Union (Cameroon)
 * 
 * Primary Countries:
 * - Cameroon
 * 
 * Currency: XAF
 */

interface MonetBillConfig {
    serviceKey: string;
    serviceSecret?: string;
    mode?: 'test' | 'live';
}

export class MonetBillAdapter implements IPaymentProvider {
    readonly name = 'MonetBill';
    private config: MonetBillConfig;
    private baseUrl = 'https://api.monetbil.com';

    constructor(config: MonetBillConfig) {
        this.config = config;
    }

    private generateReference(orderId: string): string {
        return `MB_${orderId}_${Date.now()}`;
    }

    /**
     * Mobile Money avec un numero : demande poussee sur le telephone (API
     * placePayment), l'acheteur reste sur notre page. `paymentId` est un entier
     * trop grand pour JSON.parse : on le lit dans le texte brut.
     */
    private async pousser(request: PaymentRequest, reference: string, chiffres: string): Promise<PaymentResponse> {
        const [prenom, ...reste] = String(request.customerName || 'Client').trim().split(/\s+/);
        const corps: Record<string, any> = {
            service: this.config.serviceKey,
            phonenumber: chiffres,
            amount: Math.round(request.amount),
            currency: (request.currency || 'XAF').toUpperCase(),
            item_ref: reference,
            payment_ref: reference,
            user: request.orderId,
            first_name: prenom,
            last_name: reste.join(' ') || prenom,
            ...(request.customerEmail ? { email: request.customerEmail } : {}),
            notify_url: request.callbackUrl || '',
        };
        try {
            const response = await fetch(`${this.baseUrl}/payment/v1/placePayment`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify(corps), signal: AbortSignal.timeout(25000),
            });
            const texte = await response.text();
            const idBrut = texte.match(/"paymentId"\s*:\s*"?(\d+)"?/)?.[1];
            let data: any = {};
            try { data = JSON.parse(texte); } catch { data = { brut: texte.slice(0, 300) }; }
            if (!response.ok || data?.status !== 'REQUEST_ACCEPTED' || !idBrut) {
                return { transactionId: reference, providerReference: '', status: 'FAILED', rawData: { ...data, error: data?.message || data?.status || `Monetbil a répondu ${response.status}` } };
            }
            const instructions = data.channel_ussd ? `Si aucune demande n'apparaît, composez ${data.channel_ussd} (${data.channel_name || 'votre opérateur'}) pour valider le paiement.` : '';
            return { transactionId: reference, providerReference: idBrut, status: 'PENDING', rawData: { ...data, paymentId: idBrut, _instructions: instructions } };
        } catch (error: any) {
            return { transactionId: reference, providerReference: '', status: 'FAILED', rawData: { error: error?.message || 'Monetbil injoignable' } };
        }
    }

    async initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
        try {
            const reference = this.generateReference(request.orderId);
            // Numero et Mobile Money : poussee directe. Sans numero, ou pour une
            // carte, la page Monetbil comme avant.
            const code = String(request.metadata?.methodCode || '').toLowerCase();
            const chiffres = String(request.customerPhone || '').replace(/\D/g, '');
            if (chiffres && !/card|carte|visa|master/.test(code)) {
                return await this.pousser(request, reference, chiffres);
            }

            const params = new URLSearchParams({
                amount: String(request.amount),
                phone: request.customerPhone || '',
                phone_lock: 'false',
                locale: 'fr',
                operator: '',
                country: '',
                item_ref: reference,
                payment_ref: reference,
                user: request.orderId,
                first_name: (request.customerName || 'Customer').split(' ')[0],
                last_name: (request.customerName || 'User').split(' ').slice(1).join(' ') || 'User',
                email: request.customerEmail || '',
                return_url: request.returnUrl || '',
                notify_url: request.callbackUrl || '',
            });

            const response = await fetch(`${this.baseUrl}/widget/v2.1/${this.config.serviceKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: params.toString(),
                signal: AbortSignal.timeout(20000),
            });

            const data: any = await response.json();

            if (!response.ok || !data?.payment_url) {
                return {
                    transactionId: reference,
                    providerReference: '',
                    status: 'FAILED' as PaymentStatus,
                    rawData: data,
                };
            }

            return {
                transactionId: reference,
                providerReference: data.paymentId || reference,
                status: 'PENDING' as PaymentStatus,
                checkoutUrl: data.payment_url,
                rawData: data,
            };
        } catch (error: any) {
            console.error('[MonetBill] initiatePayment error:', error);
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
            const response = await fetch(
                `${this.baseUrl}/payment/v1/checkPayment`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({ paymentId: providerReference }).toString(),
                    signal: AbortSignal.timeout(20000),
                }
            );

            const data: any = await response.json();

            let status: PaymentStatus = 'PENDING';
            if (data?.transaction?.status === 1 || data?.transaction?.status === '1') {
                status = 'SUCCESS';
            } else if (data?.transaction?.status === 0 || data?.transaction?.status === '0') {
                status = 'FAILED';
            } else if (data?.transaction?.status === -1 || data?.transaction?.status === '-1') {
                status = 'CANCELLED';
            }

            return {
                transactionId: data?.transaction?.item_ref || providerReference,
                providerReference: data?.transaction?.paymentId || providerReference,
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
            const paymentId = payload?.paymentId || payload?.payment_ref;
            if (!paymentId) {
                throw new Error('Missing paymentId in MonetBill webhook');
            }

            const verification = await this.verifyPayment(paymentId);

            return {
                transactionId: paymentId,
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
        if (!this.config.serviceKey) {
            return { success: false, message: 'Clé de service MonetBill requise' };
        }
        return { success: true };
    }
}
