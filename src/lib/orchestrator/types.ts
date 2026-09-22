export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';

export interface PaymentRequest {
    amount: number;
    currency: string;
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    orderId: string;
    metadata?: Record<string, any>;
    callbackUrl: string;
    returnUrl: string;
    /**
     * Ou renvoyer l'acheteur si le paiement echoue ou s'il abandonne. Les
     * moyens a REDIRECTION (Wave chez Hub2) l'exigent : le fournisseur doit
     * savoir ou ramener la personne dans les deux cas, pas seulement en cas
     * de succes. Optionnel : les moyens a pousse USSD n'en ont pas besoin.
     */
    cancelUrl?: string;
}

export interface PaymentResponse {
    transactionId: string;
    providerReference: string;
    status: PaymentStatus;
    checkoutUrl?: string; // For redirect-based payments
    rawData?: any;
}

export interface WebhookResult {
    transactionId: string;
    status: PaymentStatus;
    providerReference: string;
    rawData: any;
}

/** Argent SORTANT : ce qu'il faut pour envoyer une somme vers un compte Mobile Money. */
export interface PayoutRequest {
    /** Notre reference, generee et enregistree AVANT l'appel : c'est elle qui permet de retrouver l'envoi si la reponse se perd. */
    reference: string;
    amount: number;
    currency: string;
    /** ISO 3166-1 alpha-2 */
    country: string;
    /** Code Cartflox (mtn_money, orange_money, wave...) ou code du fournisseur (MTN_MOMO_CIV). */
    operator: string;
    /** Chiffres seuls, indicatif compris. */
    phone: string;
    recipientName?: string;
    description?: string;
    metadata?: Record<string, any>;
}

export interface PayoutResponse {
    providerReference: string;
    /** PENDING : confie au fournisseur, issue inconnue. FAILED : refus definitif. */
    status: PaymentStatus;
    /** L'operateur tel que le fournisseur le nomme, une fois resolu. */
    providerCode?: string;
    providerTransactionId?: string;
    failureCode?: string;
    failureMessage?: string;
    /** Le fournisseur ne connait pas cette reference : l'envoi ne lui est jamais parvenu. */
    notFound?: boolean;
    rawData?: any;
}

export interface IPaymentProvider {
    readonly name: string;
    initiatePayment(request: PaymentRequest): Promise<PaymentResponse>;
    verifyPayment(providerReference: string): Promise<PaymentResponse>;
    handleWebhook(payload: any, headers?: any): Promise<WebhookResult>;
    validateCredentials?(): Promise<{ success: boolean; message?: string }>;
    /**
     * Refund a completed payment. `providerReference` is the same reference
     * used by verifyPayment (e.g. PawaPay depositId). Returns the refund
     * reference in `providerReference` and its initial status.
     */
    refundPayment?(providerReference: string, options?: { amount?: number; currency?: string }): Promise<PaymentResponse>;
    /** Check the status of a refund initiated via refundPayment. */
    verifyRefund?(refundReference: string): Promise<PaymentResponse>;
    /**
     * Envoyer de l'argent vers un compte Mobile Money. Un rejet definitif se
     * renvoie en `status: FAILED` ; une panne reseau se LANCE (throw) : l'appelant
     * ne sait alors pas si l'envoi est parti et doit interroger le fournisseur
     * avec sa reference plutot que renvoyer.
     */
    initiatePayout?(request: PayoutRequest): Promise<PayoutResponse>;
    /** Etat d'un envoi, par la reference passee a initiatePayout. */
    verifyPayout?(providerReference: string): Promise<PayoutResponse>;
    /**
     * Code de confirmation saisi par l'acheteur sur NOTRE page, apres une
     * initiation qui l'a demande (`rawData._otp_requis`). Recoit la reference
     * fournisseur renvoyee par l'initiation. Un code refuse se renvoie en
     * `status: FAILED` avec `rawData.error` : l'acheteur peut retaper.
     */
    soumettreCode?(providerReference: string, otp: string): Promise<PaymentResponse>;
}
