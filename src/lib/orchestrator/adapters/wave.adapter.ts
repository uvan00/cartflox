import {
    IPaymentProvider,
    PaymentRequest,
    PaymentResponse,
    PaymentStatus,
    WebhookResult
} from '../types';

/**
 * Wave Business (API Checkout) : https://docs.wave.com/checkout
 *
 * Le marchand encaisse directement sur son compte Wave Business, sans
 * agregateur. Une session de paiement renvoie une URL Wave ou l'acheteur
 * confirme dans son application, puis Wave le ramene chez nous.
 *
 * - Pas de bac a sable : Wave ne delivre que des cles de production
 *   (prefixe wave_xx_prod_). Le mode test est donc masque dans l'interface.
 * - Devise : XOF seulement, sans decimales, montant envoye en chaine.
 * - Pays : Senegal, Cote d'Ivoire, Mali, Burkina Faso.
 * - Le webhook se declare dans le portail Wave Business (Developpeurs,
 *   Webhooks) ; sa signature se verifie dans lib/webhook-verify.ts.
 */
interface WaveConfig {
    apiKey: string;
    webhookSecret?: string;
    mode?: 'test' | 'live';
}

const BASE = 'https://api.wave.com/v1';

export class WaveAdapter implements IPaymentProvider {
    readonly name = 'Wave';

    constructor(private config: WaveConfig) {}

    private entetes() {
        return {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey || ''}`,
        };
    }

    /** Une session Wave ne connait que trois etats de paiement. */
    private statut(session: any): PaymentStatus {
        if (session?.payment_status === 'succeeded') return 'SUCCESS';
        if (session?.payment_status === 'cancelled' || session?.checkout_status === 'expired') return 'FAILED';
        return 'PENDING';
    }

    async initiatePayment(request: PaymentRequest): Promise<PaymentResponse> {
        const echec = (error: string, rawData?: any): PaymentResponse => ({
            transactionId: request.orderId, providerReference: '', status: 'FAILED', rawData: { ...(rawData || {}), error },
        });
        const devise = (request.currency || 'XOF').toUpperCase();
        if (devise !== 'XOF') return echec(`Wave n'encaisse qu'en XOF (paiement demandé en ${devise})`);
        try {
            const corps = {
                amount: String(Math.round(request.amount)),
                currency: 'XOF',
                client_reference: String(request.orderId).slice(0, 255),
                success_url: request.returnUrl,
                error_url: request.cancelUrl || request.returnUrl,
            };
            const reponse = await fetch(`${BASE}/checkout/sessions`, {
                method: 'POST', headers: this.entetes(), body: JSON.stringify(corps), signal: AbortSignal.timeout(20000),
            });
            const data: any = await reponse.json().catch(() => ({}));
            if (reponse.status === 401 || reponse.status === 403) {
                // Le message de Wave cite la fin de la cle (« ending in ... ») et le
                // checkout montre ce texte a l acheteur : on ne garde que le code.
                return echec(`Wave a refusé les identifiants (${data?.code || reponse.status})`, { code: data?.code, status: reponse.status });
            }
            if (!reponse.ok || !data?.wave_launch_url) {
                return echec(data?.message || data?.code || `Wave a répondu ${reponse.status}`, data);
            }
            return {
                transactionId: request.orderId,
                providerReference: data.id,
                status: 'PENDING',
                checkoutUrl: data.wave_launch_url,
                // Lien d'application : notre page l'affiche (bouton, QR code) et surveille l'etat.
                rawData: { ...data, _application: 'Wave' },
            };
        } catch (error: any) {
            console.error('[Wave] initiatePayment error:', error);
            return echec(error?.message || 'Wave injoignable');
        }
    }

    async verifyPayment(providerReference: string): Promise<PaymentResponse> {
        // Une panne reseau ne vaut pas un echec : on reste en attente et on
        // redemandera. Seule la reponse de Wave fait foi.
        try {
            const reponse = await fetch(`${BASE}/checkout/sessions/${encodeURIComponent(providerReference)}`, {
                headers: this.entetes(), signal: AbortSignal.timeout(20000),
            });
            const data: any = await reponse.json().catch(() => ({}));
            if (!reponse.ok) {
                return { transactionId: providerReference, providerReference, status: 'PENDING', rawData: { ...data, error: data?.code || `Wave a répondu ${reponse.status}` } };
            }
            return {
                transactionId: data.client_reference || providerReference,
                providerReference: data.id || providerReference,
                status: this.statut(data),
                rawData: data,
            };
        } catch (error: any) {
            return { transactionId: providerReference, providerReference, status: 'PENDING', rawData: { error: error?.message } };
        }
    }

    /** Enveloppe Wave : { id, type: "checkout.session.completed", data: { ...session } }. */
    async handleWebhook(payload: any): Promise<WebhookResult> {
        const data = payload?.data || payload || {};
        const type = String(payload?.type || '');
        const status: PaymentStatus = data.payment_status === 'succeeded'
            ? 'SUCCESS'
            : (type.endsWith('payment_failed') || data.payment_status === 'cancelled') ? 'FAILED' : 'PENDING';
        return {
            transactionId: data.client_reference || data.id || '',
            providerReference: data.id || '',
            status,
            rawData: payload,
        };
    }

    async validateCredentials(): Promise<{ success: boolean; message?: string }> {
        if (!this.config.apiKey) return { success: false, message: 'Clé API Wave Business requise' };
        try {
            // La recherche par reference est le plus petit appel authentifie qui
            // exige exactement le droit dont on a besoin (Checkout).
            const reponse = await fetch(`${BASE}/checkout/sessions/search?client_reference=cartflox-verification`, {
                headers: this.entetes(), signal: AbortSignal.timeout(15000),
            });
            if (reponse.status === 401 || reponse.status === 403) {
                const data: any = await reponse.json().catch(() => ({}));
                return { success: false, message: `Wave refuse cette clé (${data?.code || reponse.status})` };
            }
            return { success: true };
        } catch (error: any) {
            return { success: false, message: `Wave injoignable : ${error?.message || 'réseau'}` };
        }
    }
}
