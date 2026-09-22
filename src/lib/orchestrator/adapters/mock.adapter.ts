import { IPaymentProvider, PaymentRequest, PaymentResponse, WebhookResult } from "../types";

export class MockProviderAdapter implements IPaymentProvider {
    readonly name = "MockProvider";

    async initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
        console.log(`[MockProvider] Initiating payment for order ${request.orderId}`);

        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, 500));

        return {
            transactionId: `mock_tx_${Date.now()}`,
            providerReference: `ref_${Math.random().toString(36).substring(7)}`,
            status: 'PENDING',
            checkoutUrl: `https://mock-gateway.com/pay/${request.orderId}`,
            rawData: { message: "Payment initiated in mock mode" }
        };
    }

    async verifyPayment(providerReference: string): Promise<PaymentResponse> {
        console.log(`[MockProvider] Verifying payment ${providerReference}`);

        return {
            transactionId: `mock_tx_verify_${Date.now()}`,
            providerReference,
            status: 'SUCCESS',
            rawData: { message: "Payment verified successfully in mock mode" }
        };
    }

    async handleWebhook(payload: any): Promise<WebhookResult> {
        console.log(`[MockProvider] Handling webhook`, payload);

        return {
            transactionId: payload.tx_id || "unknown",
            status: payload.status === 'completed' ? 'SUCCESS' : 'FAILED',
            providerReference: payload.ref || "unknown",
            rawData: payload
        };
    }
}
