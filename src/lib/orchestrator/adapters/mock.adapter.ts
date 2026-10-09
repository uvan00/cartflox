import { IPaymentProvider, PaymentRequest, PaymentResponse, WebhookResult } from "../types";

/**
 * Issue simulée, réglée dans la configuration de la passerelle (`config.mock`) :
 *  - `FAILED` : refus immédiat, avec `rawData` tel quel (code, message, error...) ;
 *  - `TIMEOUT` : l'appel ne répond pas (exception TimeoutError), comme un fournisseur muet ;
 *  - `EXCEPTION` : l'appel lève (message dans `error`) ;
 *  - sinon : demande acceptée, avec une page de paiement.
 * Sert aux essais locaux du routage (tentatives, secours, incertain).
 */
type ReglageMock = { issue?: "FAILED" | "TIMEOUT" | "EXCEPTION" | "ACCEPTED"; rawData?: Record<string, unknown>; error?: string; delaiMs?: number };

export class MockProviderAdapter implements IPaymentProvider {
    readonly name = "MockProvider";
    private readonly reglage: ReglageMock;

    constructor(config?: { mock?: ReglageMock }) {
        this.reglage = config?.mock || {};
    }

    async initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
        console.log(`[MockProvider] Initiating payment for order ${request.orderId}`);

        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, this.reglage.delaiMs ?? 500));

        if (this.reglage.issue === "TIMEOUT") {
            const e = new Error("The operation was aborted due to timeout");
            e.name = "TimeoutError";
            throw e;
        }
        if (this.reglage.issue === "EXCEPTION") throw new Error(this.reglage.error || "Mock exception");
        if (this.reglage.issue === "FAILED") {
            return { transactionId: "", providerReference: "", status: "FAILED", rawData: this.reglage.rawData || { error: this.reglage.error || "Mock refusal" } };
        }

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
