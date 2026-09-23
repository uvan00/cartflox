"use server";

import prisma from "@/lib/db";
import { getSession } from "@/lib/session";
/** Perimetre de lecture : un espace ne voit que ses transactions. */
const perimetreTransactions = async (applicationId: string) => ({ where: { applicationId }, plateforme: false });
import { annulerAbandon, getAdapterForTransaction, applyVerificationResult } from "@/lib/transaction-finalize";
import { rembourserTransaction } from "@/lib/remboursement";
import { getSelectedAppId } from "./utils";
import { rateLimit } from "@/lib/rate-limit";

const PUBLIC_TX_INCLUDE = {
    application: {
        select: {
            id: true,
            name: true,
            image: true,
            metadata: true,
            liveMode: true,
            user: {
                select: { name: true, image: true, country: true, phone: true }
            },
            whatsapp: { select: { phoneNumber: true, status: true } },
        }
    }
} as const;

/**
 * Ce qui sort vers la page de paiement publique : des reglages de l'espace, seul
 * le theme est utile. Le reste de `Application.metadata` (notifications, methodes
 * de transfert, reglages internes) n'a rien a faire dans un lien de paiement.
 */
function epurer(t: any) {
    if (!t?.application) return t;
    const m = (t.application.metadata as any) || {};
    return { ...t, application: { ...t.application, metadata: { checkoutTheme: m.checkoutTheme ?? null, checkoutThemeCustom: m.checkoutThemeCustom ?? null } } };
}

// Per-process throttle so the checkout's 4s polling doesn't hammer the
// provider API: at most one provider verification per transaction per window.
const lastProviderCheck = new Map<string, number>();
const PROVIDER_CHECK_THROTTLE_MS = 8000;

/** Ce que le fournisseur attend encore de l'acheteur, lu dans la derniere verification. */
export type AttentePaiement = { type: "otp" | "ussd" | "redirection"; message?: string; ussdCode?: string; url?: string; application?: string; paymentId?: string };
const derniereAttente = new Map<string, AttentePaiement>();

function attenteDepuisVerification(v: any): AttentePaiement | null {
    const r = v?.rawData || {};
    if (v?.checkoutUrl) return { type: "redirection", url: String(v.checkoutUrl), application: r._application || undefined, message: r._instructions || undefined };
    if (r._hub2_otp_required) return { type: "otp", message: r._hub2_otp_message || r._instructions || undefined, ussdCode: r._hub2_otp_ussd || undefined, paymentId: r._hub2_payment_id || undefined };
    if (typeof r._instructions === "string" && r._instructions) return { type: "ussd", message: r._instructions };
    return null;
}

/**
 * Fetches a single transaction by its ID (Public version for checkout)
 *
 * While the transaction is PENDING, also verifies it directly with the
 * provider: customers come back from hosted payment pages before the
 * provider webhook lands (and some webhooks never arrive), so polling the
 * DB alone would leave the checkout stuck on "pending" forever.
 */
export async function getPublicTransaction(id: string) {
    try {
        // Fetch transaction + application metadata via ORM
        const p = prisma as any;
        let transaction = await p.transaction.findUnique({
            where: { id },
            include: PUBLIC_TX_INCLUDE
        });
        if (!transaction) return null;

        if (transaction.status === 'PENDING' && transaction.providerRef) {
            const ageMs = Date.now() - new Date(transaction.createdAt).getTime();
            const last = lastProviderCheck.get(id) || 0;
            const throttled = Date.now() - last < PROVIDER_CHECK_THROTTLE_MS;
            // Past 24h the cron declares the transaction expired — stop checking.
            if (!throttled && ageMs < 24 * 60 * 60 * 1000) {
                if (lastProviderCheck.size > 1000) lastProviderCheck.clear();
                lastProviderCheck.set(id, Date.now());
                try {
                    const adapter = await getAdapterForTransaction(transaction);
                    if (adapter) {
                        const verification = await adapter.verifyPayment(transaction.providerRef);
                        // Code a saisir, consigne USSD ou redirection connus APRES l'initiation
                        // (Hub2 repond avant l'operateur) : gardes pour les sondages suivants.
                        const attente = attenteDepuisVerification(verification);
                        if (attente) derniereAttente.set(id, attente); else derniereAttente.delete(id);
                        if (attente?.paymentId && !(transaction.metadata as any)?._hub2_payment_id) {
                            await p.transaction.update({
                                where: { id },
                                data: { metadata: { ...((transaction.metadata as any) || {}), _hub2_payment_id: attente.paymentId } },
                            }).catch(() => { });
                        }
                        const updated = await applyVerificationResult(transaction, verification, 'checkout-poll');
                        if (updated.status !== transaction.status) {
                            transaction = await p.transaction.findUnique({
                                where: { id },
                                include: PUBLIC_TX_INCLUDE
                            });
                        }
                    }
                } catch (err) {
                    console.error("Active verification failed (kept PENDING):", err);
                }
            }
        }

        if (transaction && transaction.status === 'PENDING') {
            const attente = derniereAttente.get(id);
            if (attente) (transaction as any).attente = attente;
        } else {
            derniereAttente.delete(id);
        }
        return transaction ? epurer(transaction) : null;
    } catch (error) {
        console.error("Error fetching public transaction:", error);
        return null;
    }
}

/**
 * Refund a successful transaction via its payment provider.
 * Dashboard-only (session + application scope). The transaction is marked
 * REFUNDED as soon as the provider accepts the refund; the provider-side
 * progress is kept in metadata.refund.
 */
export async function refundTransaction(transactionId: string) {
    try {
        const session = await getSession();
        if (!session?.user) return { error: "Non autorisé" };

        const appId = await getSelectedAppId();
        if (!appId) return { error: "Aucune application sélectionnée" };

        return await rembourserTransaction(transactionId, appId);
    } catch (error: any) {
        console.error("Failed to refund transaction:", error);
        return { error: error.message || "Échec du remboursement" };
    }
}

/**
 * Fetches a single transaction by its ID (Private version for dashboard)
 */
export async function getTransactionById(id: string) {
    try {
        const session = await getSession();
        if (!session?.user) return null;

        const appId = await getSelectedAppId();
        if (!appId) return null;

        const transaction = await prisma.transaction.findFirst({
            where: { id, ...(await perimetreTransactions(appId)).where }
        });
        if (!transaction) return null;
        // Le nom du commerce figure sur le recu remis au client : on le joint ici.
        const app = (await (prisma as any).application.findUnique({
            where: { id: appId },
            select: { id: true, name: true, paymentMode: true },
        }));
        const marchand = { id: app?.id || appId, nom: app?.name || "" };
        if (app?.paymentMode === "managed") {
            return { ...transaction, provider: "Cartflox", marchand } as any;
        }
        return { ...transaction, marchand } as any;
    } catch (error) {
        console.error("Error fetching transaction:", error);
        return null;
    }
}

/**
 * Syncs a single transaction status with the provider
 */
/**
 * Relance WhatsApp : envoie un rappel de paiement au client par un pont HTTP
 * (WHATSAPP_BRIDGE_URL, WHATSAPP_SESSION_ID). Seulement pour une transaction de
 * l'espace courant, trois envois par jour et par transaction. Trace l'envoi
 * dans ProviderLog.
 */
export async function sendPaymentReminder(transactionId: string) {
    try {
        const session = await getSession();
        if (!session?.user) throw new Error("Unauthorized");

        const appId = await getSelectedAppId();
        if (!appId) throw new Error("Aucun espace sélectionné");
        const tx = await prisma.transaction.findFirst({ where: { id: transactionId, applicationId: appId } });
        if (!tx) throw new Error("Transaction introuvable");
        if (!tx.customerPhone) return { error: "Aucun numéro de téléphone pour ce client." };

        const BRIDGE_URL = (process.env.WHATSAPP_BRIDGE_URL || "").replace(/\/+$/, "");
        const SESSION_ID = process.env.WHATSAPP_SESSION_ID || "default";
        if (!BRIDGE_URL) return { error: "Aucun pont WhatsApp configuré (WHATSAPP_BRIDGE_URL)." };
        const quota = await rateLimit(`rappel:${tx.id}`, { limit: 3, windowSec: 86400 });
        if (!quota.allowed) return { error: "Trois rappels ont déjà été envoyés aujourd'hui pour ce paiement." };

        // Numeros stockes en international : gardes tels quels ; sinon on prefixe
        // l'indicatif par defaut de l'instance.
        const phoneDigits = (tx.customerPhone || "").replace(/\D/g, "");
        let recipient = phoneDigits;
        if (recipient.length >= 8 && recipient.length <= 10) {
            if (recipient.startsWith("0")) recipient = recipient.slice(1);
            recipient = (process.env.WHATSAPP_INDICATIF_DEFAUT || "225") + recipient;
        }
        if (!recipient) return { error: "Numéro invalide." };

        const amount = `${Number(tx.amount).toLocaleString("fr-FR")} ${tx.currency}`;
        const hi = tx.customerName ? `Bonjour ${tx.customerName}` : "Bonjour";
        const message = `${hi} 👋\n\nNous avons remarqué que votre paiement de *${amount}* n'a pas encore été finalisé. Vous pouvez le reprendre quand vous voulez.\n\nUn souci pour payer ? Répondez simplement à ce message, nous vous aidons à finaliser. Merci !`;

        const res = await fetch(`${BRIDGE_URL}/api/send?sessionId=${SESSION_ID}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ recipient, message }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.success === false) {
            return { error: data?.message || data?.error || `Échec de l'envoi (HTTP ${res.status})` };
        }

        try {
            await (prisma as any).providerLog.create({
                data: {
                    transactionId: tx.id,
                    type: "WHATSAPP_REMINDER",
                    payload: { recipient, by: (session.user as any)?.email || "admin", at: new Date().toISOString() },
                },
            });
        } catch { /* trace best-effort */ }

        return { success: true, recipient };
    } catch (error: any) {
        return { error: error.message };
    }
}

export async function syncTransactionStatus(transactionId: string) {
    try {
        const session = await getSession();
        if (!session?.user) throw new Error("Unauthorized");
        const appId = await getSelectedAppId();
        if (!appId) throw new Error("Aucun espace sélectionné");
        return await synchroniser(transactionId, appId);
    } catch (error: any) {
        console.error("Failed to sync transaction:", error);
        return { error: error.message };
    }
}

/** Relecture chez le fournisseur, bornee a l'espace : jamais la transaction d'un autre marchand. */
async function synchroniser(transactionId: string, appId: string) {
    try {
        const transaction = await prisma.transaction.findFirst({
            where: { id: transactionId, applicationId: appId }
        });

        if (!transaction) {
            throw new Error("Transaction not found");
        }

        // If it's already finalized, no need to sync unless forced
        if (transaction.status === 'SUCCESS') return { status: 'SUCCESS' };

        if (!transaction.providerRef) {
            // If no provider ref, it's likely a stalled initiation
            // Check if it's old enough to mark as failed
            const isOld = (new Date().getTime() - new Date(transaction.createdAt).getTime()) > 1000 * 60 * 30; // 30 mins
            if (isOld) {
                await prisma.transaction.update({
                    where: { id: transaction.id },
                    data: { status: 'FAILED' }
                });
                return { status: 'FAILED' };
            }
            return { status: transaction.status };
        }

        // Shared resolution: gateway credentials (incl. sandbox overlay) + finalize side effects
        const adapter = await getAdapterForTransaction(transaction);
        if (!adapter) {
            throw new Error("Gateway configuration not found for " + transaction.provider);
        }

        console.log(`🔍 Syncing transaction ${transaction.orderId} via ${transaction.provider} (ref: ${transaction.providerRef})...`);
        const verification = await adapter.verifyPayment(transaction.providerRef);
        console.log(`🎯 Status detected: ${verification.status}`);

        const updated = await applyVerificationResult(transaction, verification, 'manual-sync');
        return { status: updated.status };
    } catch (error: any) {
        console.error("Failed to sync transaction:", error);
        return { error: error.message };
    }
}

/**
 * Synchronise toutes les transactions PENDING, et EXPIRE les sessions abandonnees.
 * - Pas de providerRef + > 30min  → FAILED (n'a jamais atteint l'etape paiement)
 * - A un providerRef + > 5min      → on synchronise avec la passerelle
 * - A un providerRef + > 2h ET TOUJOURS PENDING apres synchro → CANCELLED
 *   (session mobile money expiree ; ex. PaymentPage PawaPay / lien Wave jamais
 *   finalise — la passerelle ne renvoie jamais de statut final dans ce cas).
 *   La synchro passe AVANT l'expiration : un vrai paiement non synchronise est
 *   capte d'abord, jamais ecrase.
 */
const EXPIRE_AFTER_MS = 2 * 60 * 60 * 1000; // 2 heures

export async function syncAllPendingTransactions() {
    try {
        const session = await getSession();
        if (!session?.user) return { count: 0 };

        const appId = await getSelectedAppId();
        if (!appId) return { count: 0 };

        const now = Date.now();
        const thirtyMinutesAgo = new Date(now - 30 * 60 * 1000);
        const fiveMinutesAgo = new Date(now - 5 * 60 * 1000);

        // 1. Transactions bloquees a l'initiation (sans providerRef, > 30min) → FAILED
        // Comme le cron : abandon (CANCELLED) et non echec, avec le webhook payment.cancelled.
        const bloquees = await prisma.transaction.findMany({
            where: { applicationId: appId, status: 'PENDING', OR: [{ providerRef: null }, { providerRef: "" }], createdAt: { lt: thirtyMinutesAgo } },
            select: { id: true },
            take: 200,
        });
        let nbBloquees = 0;
        for (const b of bloquees) { if (await annulerAbandon(b.id, "abandon > 30 min (synchronisation manuelle)").catch(() => false)) nbBloquees++; }
        const stalledResult = { count: nbBloquees };
        if (stalledResult.count > 0) {
            console.log(`⏱️ ${stalledResult.count} transaction(s) bloquee(s) (sans providerRef) → CANCELLED`);
        }

        // 2. Synchroniser les PENDING (> 5min, avec providerRef), puis EXPIRER celles
        //    qui restent PENDING apres > 2h (session abandonnee, aucun paiement).
        const pendingTransactions = await prisma.transaction.findMany({
            where: {
                applicationId: appId,
                status: 'PENDING',
                NOT: { providerRef: null },
                createdAt: { lt: fiveMinutesAgo }
            },
            orderBy: { createdAt: 'asc' },
            take: 50
        });

        let syncCount = 0;
        let expiredCount = 0;
        for (const tx of pendingTransactions) {
            // Derniere chance de capter un vrai paiement aupres de la passerelle.
            await synchroniser(tx.id, appId);
            syncCount++;

            // Toujours PENDING ET trop vieille → la session a expire : on annule.
            if (now - new Date(tx.createdAt).getTime() > EXPIRE_AFTER_MS) {
                const fresh = await prisma.transaction.findUnique({
                    where: { id: tx.id },
                    select: { status: true }
                });
                if (fresh?.status === 'PENDING') {
                    if (await annulerAbandon(tx.id, "session expirée > 2 h").catch(() => false)) expiredCount++;
                }
            }
        }
        if (expiredCount > 0) {
            console.log(`⌛ ${expiredCount} session(s) expiree(s) (> 2h, non finalisee) → CANCELLED`);
        }

        return { count: syncCount + stalledResult.count + expiredCount };
    } catch (error) {
        console.error("Failed to sync pending transactions:", error);
        return { count: 0 };
    }
}
/**
 * Fetches paginated transactions with filtering
 */
export async function getTransactions(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
    from?: string; // ISO date — filtre createdAt >=
    to?: string;   // ISO date — filtre createdAt <=
}) {
    try {
        const session = await getSession();
        if (!session?.user) throw new Error("Unauthorized");

        const appId = await getSelectedAppId();
        if (!appId) throw new Error("No application selected");

        const { page = 1, pageSize = 10, search, status, from, to } = params;
        const skip = (page - 1) * pageSize;

        // Espace plateforme (Connect d'un administrateur) : tous les paiements Connect, avec le marchand.
        const perimetre = await perimetreTransactions(appId);
        const where: any = { ...perimetre.where };

        if (status && status !== 'ALL') {
            where.status = status;
        }

        if (from || to) {
            where.createdAt = {};
            if (from) where.createdAt.gte = new Date(from);
            if (to) where.createdAt.lte = new Date(to);
        }

        if (search) {
            where.OR = [
                { id: { contains: search, mode: 'insensitive' } },
                { customerName: { contains: search, mode: 'insensitive' } },
                { customerEmail: { contains: search, mode: 'insensitive' } },
                { orderId: { contains: search, mode: 'insensitive' } }
            ];
        }

        // Mode geré : le nom de l'agregateur sous-jacent n'est jamais montre
        // au marchand, tout est presente comme "Cartflox".
        const managedApp = ((await (prisma as any).application.findUnique({
            where: { id: appId },
            select: { paymentMode: true },
        }))?.paymentMode === "managed");

        const [transactions, total, gateways] = await Promise.all([
            prisma.transaction.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: pageSize,
                include: perimetre.plateforme ? { application: { select: { name: true } } } : undefined,
            }),
            prisma.transaction.count({ where }),
            prisma.gateway.findMany({ where: { applicationId: appId }, select: { name: true, config: true, logo: true, apiKey: true, apiSecret: true } })
        ]);
        // Build a map: gateway name (lowercase) → real provider type
        // Detected from config keys since no explicit type field exists
        const gatewayProviderMap: Record<string, string> = {};
        for (const gw of gateways) {
            const cfg = gw.config as any;
            const allKeys = [...Object.keys(cfg || {}), ...(gw.apiKey ? ['apiKey'] : []), ...(gw.apiSecret ? ['apiSecret'] : [])].map(k => k.toLowerCase());
            const cfgStr = JSON.stringify(cfg || {}).toLowerCase();
            let realProvider = cfg?.provider || cfg?.type || null;
            if (!realProvider) {
                // Detect from config keys
                if (allKeys.includes('masterkey') || allKeys.includes('master_key')) realProvider = 'paydunya';
                else if (allKeys.includes('float_id') || allKeys.includes('floatid')) realProvider = 'pawapay';
                else if (allKeys.includes('flw_secret') || cfgStr.includes('flutterwave')) realProvider = 'flutterwave';
                else if (allKeys.includes('site_id') || allKeys.includes('apipassword')) realProvider = 'cinetpay';
                else if (allKeys.includes('stripe_key') || allKeys.includes('stripe_secret')) realProvider = 'stripe';
                else if (allKeys.includes('secret_key') && allKeys.includes('public_key')) realProvider = 'paystack';
                // Detect from gateway name itself
                else {
                    const gn = gw.name.toLowerCase();
                    if (gn.includes('paydunya')) realProvider = 'paydunya';
                    else if (gn.includes('pawapay')) realProvider = 'pawapay';
                    else if (gn.includes('flutterwave')) realProvider = 'flutterwave';
                    else if (gn.includes('paystack')) realProvider = 'paystack';
                    else if (gn.includes('cinetpay')) realProvider = 'cinetpay';
                    else if (gn.includes('stripe')) realProvider = 'stripe';
                    else if (gn.includes('wave')) realProvider = 'wave';
                    else if (gn.includes('orange')) realProvider = 'orange';
                    else if (gn.includes('mtn')) realProvider = 'mtn';
                    else if (gn.includes('moov')) realProvider = 'moov';
                    else if (gn.includes('fedapay')) realProvider = 'fedapay';
                    else if (gn.includes('feexpay')) realProvider = 'feexpay';
                    else if (gn.includes('kkiapay')) realProvider = 'kkiapay';
                    // If still unknown, detect from apiKey prefix pattern (PayDunya keys start with PAYDUNYA-)
                    else if ((gw.apiKey || '').toUpperCase().includes('PAYDUNYA')) realProvider = 'paydunya';
                    else if (cfgStr.includes('paydunya')) realProvider = 'paydunya';
                    else if (cfgStr.includes('pawapay')) realProvider = 'pawapay';
                }
            }
            if (realProvider) {
                gatewayProviderMap[gw.name.toLowerCase()] = realProvider.toLowerCase();
            }
        }

        const METHOD_CODE_TO_NAME: Record<string, string> = {
            'orange-money-ci': 'Orange Money CI',
            'orange-money-senegal': 'Orange Money SN',
            'orange-money-mali': 'Orange Money ML',
            'orange-money-burkina': 'Orange Money BF',
            'orange-money-cameroon': 'Orange Money CM',
            'wave-ci': 'Wave CI',
            'wave-senegal': 'Wave SN',
            'mtn-ci': 'MTN CI',
            'mtn-benin': 'MTN BJ',
            'mtn-ghana': 'MTN GH',
            'mtn-cameroon': 'MTN CM',
            'moov-ci': 'Moov CI',
            'moov-benin': 'Moov BJ',
            'moov-togo': 'Moov TG',
            'moov-ml': 'Moov ML',
            'moov-burkina-faso': 'Moov BF',
            'free-money-senegal': 'Free Money SN',
            'wizall-senegal': 'Wizall SN',
            'expresso-sn': 'Expresso SN',
            't-money-togo': 'T-Money TG',
            'mpesa-kenya': 'M-Pesa KE',
            'mpesa-tanzania': 'M-Pesa TZ',
            'vodafone-ghana': 'Vodafone GH',
            'card': 'Carte',
            'mastercard': 'MasterCard',
        };

        const METHOD_CODE_TO_LOGO: Record<string, string> = {
            'orange-money-ci': '/icons/methods/orange_money.svg',
            'orange-money-senegal': '/icons/methods/orange_money.svg',
            'orange-money-mali': '/icons/methods/orange_money.svg',
            'orange-money-burkina': '/icons/methods/orange_money.svg',
            'orange-money-cameroon': '/icons/methods/orange_money.svg',
            'wave-ci': '/icons/methods/wave.svg',
            'wave-senegal': '/icons/methods/wave.svg',
            'mtn-ci': '/icons/methods/momo.svg',
            'mtn-benin': '/icons/methods/momo.svg',
            'mtn-ghana': '/icons/methods/momo.svg',
            'mtn-cameroon': '/icons/methods/momo.svg',
            'mtn-congo': '/icons/methods/momo.svg',
            'mtn-zambia': '/icons/methods/momo.svg',
            'mtn-uganda': '/icons/methods/momo.svg',
            'moov-ci': '/icons/methods/moov_money.svg',
            'moov-benin': '/icons/methods/moov_money.svg',
            'moov-togo': '/icons/methods/moov_money.svg',
            'moov-ml': '/icons/methods/moov_money.svg',
            'moov-burkina-faso': '/icons/methods/moov_money.svg',
            'free-money-senegal': '/icons/methods/freemoney_sn.svg',
            'wizall-senegal': '/icons/methods/wizall_sn.svg',
            'expresso-sn': '/icons/methods/e_money_sn.svg',
            't-money-togo': '/icons/methods/togocel.svg',
            'mpesa-kenya': '/icons/methods/mpesa.svg',
            'mpesa-tanzania': '/icons/methods/mpesa.svg',
            'vodafone-ghana': '/icons/methods/vodafone_gh.svg',
            'card': '/icons/methods/credit_card.svg',
            'mastercard': '/icons/methods/credit_card.svg',
        };

        const DIAL_TO_COUNTRY: Record<string, { code: string; name: string }> = {
            '225': { code: 'CI', name: "C\u00f4te d'Ivoire" },
            '221': { code: 'SN', name: 'S\u00e9n\u00e9gal' },
            '229': { code: 'BJ', name: 'B\u00e9nin' },
            '237': { code: 'CM', name: 'Cameroun' },
            '223': { code: 'ML', name: 'Mali' },
            '226': { code: 'BF', name: 'Burkina Faso' },
            '228': { code: 'TG', name: 'Togo' },
            '224': { code: 'GN', name: 'Guin\u00e9e' },
            '227': { code: 'NE', name: 'Niger' },
            '233': { code: 'GH', name: 'Ghana' },
            '234': { code: 'NG', name: 'Nigeria' },
        };
        function detectCountryFromPhone(phone: string, paymentType?: string): { code: string; name: string } | null {
            const d = (phone || '').replace(/\D/g, '');
            for (const prefix of ['237', '234', '233', '227', '226', '225', '224', '223', '229', '228', '221']) {
                if (d.startsWith(prefix)) return DIAL_TO_COUNTRY[prefix] || null;
            }
            // Try to infer country from paymentType suffix (_ci, _sn, _bj, _tg, _bf, _ml, _gn, _gh)
            const pt = (paymentType || '').toLowerCase();
            if (pt.endsWith('_ci') || pt.includes('_ci_')) return DIAL_TO_COUNTRY['225'] || null;
            if (pt.endsWith('_sn') || pt.includes('_sn_')) return DIAL_TO_COUNTRY['221'] || null;
            if (pt.endsWith('_bj') || pt.includes('_bj_')) return DIAL_TO_COUNTRY['229'] || null;
            if (pt.endsWith('_tg') || pt.includes('_tg_')) return DIAL_TO_COUNTRY['228'] || null;
            if (pt.endsWith('_bf') || pt.includes('_bf_')) return DIAL_TO_COUNTRY['226'] || null;
            if (pt.endsWith('_ml') || pt.includes('_ml_')) return DIAL_TO_COUNTRY['223'] || null;
            if (pt.endsWith('_gn') || pt.includes('_gn_')) return DIAL_TO_COUNTRY['224'] || null;
            if (pt.endsWith('_gh') || pt.includes('_gh_')) return DIAL_TO_COUNTRY['233'] || null;
            // Fallback for local CI numbers (10 digits starting with 0x)
            if (d.length === 10 && d.startsWith('0')) return DIAL_TO_COUNTRY['225'] || null;
            // Fallback for local SN numbers (9 digits starting with 7x or 3x)
            if (d.length === 9 && (d.startsWith('7') || d.startsWith('3'))) return DIAL_TO_COUNTRY['221'] || null;
            return null;
        }
        function detectOperator(phone: string, provider: string, paymentType?: string, metadata?: any): string | null {
            const d = (phone || '').replace(/\D/g, '');
            // Check paymentType first (most reliable)
            const pt = (paymentType || '').toLowerCase();
            if (pt.includes('wave')) return 'wave';
            if (pt.includes('orange')) return 'orange';
            if (pt.includes('mtn')) return 'mtn';
            if (pt.includes('moov')) return 'moov';
            if (pt.includes('free')) return 'free';
            if (pt.includes('tmoney') || pt.includes('t-money')) return 'tmoney';
            // Check provider name
            const p = (provider || '').toLowerCase();
            if (p.includes('wave')) return 'wave';
            if (p.includes('orange')) return 'orange';
            if (p.includes('mtn')) return 'mtn';
            if (p.includes('moov')) return 'moov';
            if (p.includes('free')) return 'free';
            // Check metadata (PayDunya stores operator info)
            if (metadata) {
                const meta = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
                const op = (meta?.operator || meta?.payment_method || meta?.channel || '').toLowerCase();
                if (op.includes('wave')) return 'wave';
                if (op.includes('orange')) return 'orange';
                if (op.includes('mtn')) return 'mtn';
                if (op.includes('moov')) return 'moov';
                if (op.includes('free')) return 'free';
            }
            // Detect from phone prefix after country code
            if (d.startsWith('225') && d.length >= 11) {
                const local = d.slice(3);
                // New 10-digit CI numbers (since 2021)
                if (local.startsWith('07') || local.startsWith('77')) return 'moov';
                if (local.startsWith('08') || local.startsWith('88')) return 'moov';
                if (local.startsWith('05') || local.startsWith('55')) return 'mtn';
                if (local.startsWith('04') || local.startsWith('44')) return 'mtn';
                if (local.startsWith('01') || local.startsWith('11')) return 'orange';
                if (local.startsWith('03') || local.startsWith('33')) return 'orange';
                if (local.startsWith('02') || local.startsWith('27')) return 'wave';
                // Old 9-digit CI numbers (pre-2021): 225 + 9 digits = 12 total
                if (local.length === 9) {
                    if (local.startsWith('47') || local.startsWith('57')) return 'mtn';
                    if (local.startsWith('40') || local.startsWith('50')) return 'mtn';
                    if (local.startsWith('70') || local.startsWith('71') || local.startsWith('72')) return 'orange';
                    if (local.startsWith('08') || local.startsWith('09')) return 'moov';
                    if (local.startsWith('07')) return 'wave';
                }
            }
            if (d.startsWith('221') && d.length >= 11) {
                const local = d.slice(3);
                if (local.startsWith('78') || local.startsWith('77') || local.startsWith('76')) return 'wave';
                if (local.startsWith('70') || local.startsWith('75')) return 'orange';
                if (local.startsWith('33')) return 'free';
            }
            return null;
        }
        function getGatewayDisplay(provider: string): { label: string; color: string; bg: string; logo?: string } {
            const p = (provider || '').toLowerCase();
            if (p.includes('paydunya') || p.includes('afriflow')) return { label: 'PayDunya', color: '#7C3AED', bg: '#7C3AED15', logo: '/icons/methods/paydunya.svg' };
            if (p.includes('pawapay')) return { label: 'PawaPay', color: '#F59E0B', bg: '#F59E0B15', logo: '/icons/methods/pawapay.svg' };
            if (p.includes('flutterwave')) return { label: 'Flutterwave', color: '#F5A623', bg: '#F5A62315', logo: '/icons/methods/flutterwave.svg' };
            if (p.includes('paystack')) return { label: 'Paystack', color: '#00C2A8', bg: '#00C2A815', logo: '/icons/methods/paystack.svg' };
            if (p.includes('cinetpay')) return { label: 'CinetPay', color: '#0052CC', bg: '#0052CC15', logo: '/icons/methods/cinetpay.svg' };
            if (p.includes('stripe')) return { label: 'Stripe', color: '#6772E5', bg: '#6772E515', logo: '/icons/methods/stripe.svg' };
            if (p.includes('fedapay')) return { label: 'FedaPay', color: '#0066CC', bg: '#0066CC15', logo: '/icons/methods/fedapay.svg' };
            if (p.includes('feexpay')) return { label: 'FeexPay', color: '#E63946', bg: '#E6394615', logo: '/icons/methods/feexpay.svg' };
            if (p.includes('kkiapay')) return { label: 'KKiaPay', color: '#F97316', bg: '#F9731615', logo: '/icons/methods/kkiapay.svg' };
            if (p.includes('wave')) return { label: 'Wave', color: '#1DC3E0', bg: '#1DC3E015', logo: '/icons/methods/wave.svg' };
            if (p.includes('orange')) return { label: 'Orange', color: '#FF6600', bg: '#FF660015', logo: '/icons/methods/orange_money.svg' };
            if (p.includes('mtn')) return { label: 'MTN', color: '#FFCC00', bg: '#FFCC0020', logo: '/icons/methods/momo.svg' };
            return { label: provider || 'Inconnu', color: '#6B7280', bg: '#6B728015' };
        }

        return {
            plateforme: perimetre.plateforme,
            transactions: transactions.map((tx: any) => {
                const pType = (tx.paymentType || '').toLowerCase();
                const isMobile = pType.includes('mobile') || pType.includes('money') || pType.includes('orange') || pType.includes('mtn') || pType.includes('moov') || pType.includes('wave');
                const realProvider = gatewayProviderMap[(tx.provider || '').toLowerCase()] || tx.provider || '';
                const metaMethodCode = (tx.metadata as any)?.methodCode || '';
                const countryInfo = detectCountryFromPhone(tx.customerPhone || '', metaMethodCode);
                const operator = detectOperator(tx.customerPhone || '', realProvider, metaMethodCode, tx.metadata);
                const gatewayDisplay = managedApp ? "Cartflox" : getGatewayDisplay(realProvider);
                const methodLogo = METHOD_CODE_TO_LOGO[metaMethodCode] || null;

                return {
                    id: tx.id,
                    marchand: perimetre.plateforme ? (tx.application?.name || null) : null,
                    customer: tx.customerName,
                    email: tx.customerEmail,
                    phone: tx.customerPhone || null,
                    country: countryInfo,
                    operator,
                    methodLogo,
                    gatewayDisplay,
                    date: new Date(tx.createdAt).toLocaleString('fr-FR'),
                    method: METHOD_CODE_TO_NAME[metaMethodCode] || (isMobile ? 'Mobile Money' : 'Carte'),
                    paymentType: metaMethodCode || tx.paymentType || '',
                    gateway: managedApp ? "Cartflox" : tx.provider,
                    amount: `${tx.amount.toLocaleString()} ${tx.currency}`,
                    status: tx.status.toLowerCase(),
                    // « Initié » = session créée mais paiement pas encore poussé au
                    // provider (pas de providerRef). Une fois le push envoyé → « En attente ».
                    initiated: tx.status === 'PENDING' && !tx.providerRef,
                };
            }),
            pagination: {
                total,
                page,
                pageSize,
                totalPages: Math.ceil(total / pageSize)
            }
        };
    } catch (error) {
        console.error("Error fetching transactions:", error);
        return {
            transactions: [],
            pagination: { total: 0, page: 1, pageSize: 10, totalPages: 0 }
        };
    }
}

/**
 * Fetches summary stats for the transactions page
 */
export async function getTransactionStats() {
    try {
        const session = await getSession();
        if (!session?.user) throw new Error("Unauthorized");

        const appId = await getSelectedAppId();
        if (!appId) throw new Error("No application selected");

        const perimetre = await perimetreTransactions(appId);
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        // ⚠️ Regroupement PAR DEVISE, et non une somme unique. Additionner des
        // francs, des dollars et des francs congolais puis coller « XOF » au
        // bout donnait un chiffre faux : 14 USD s'affichaient « 14 F », et
        // 196 000 CDF pesaient autant que 196 000 F alors qu'ils valent six
        // fois moins. Un total n'a de sens que dans une seule devise.
        const [successToday, pending, failed24h] = await Promise.all([
            prisma.transaction.groupBy({
                by: ['currency'],
                where: { ...perimetre.where, status: 'SUCCESS', createdAt: { gte: startOfToday } },
                _sum: { amount: true }
            }),
            prisma.transaction.groupBy({
                by: ['currency'],
                where: { ...perimetre.where, status: 'PENDING' },
                _sum: { amount: true }
            }),
            prisma.transaction.groupBy({
                by: ['currency'],
                where: { ...perimetre.where, status: 'FAILED', createdAt: { gte: twentyFourHoursAgo } },
                _sum: { amount: true }
            })
        ]);

        /** La devise qui pese le plus vient en premier, les autres suivent. */
        const parDevise = (lignes: any[]) => lignes
            .map((l) => ({ devise: String(l.currency || 'XOF'), montant: Number(l._sum?.amount || 0) }))
            .filter((l) => l.montant > 0)
            .sort((a, b) => b.montant - a.montant);

        return {
            successToday: parDevise(successToday),
            pending: parDevise(pending),
            failed24h: parDevise(failed24h)
        };
    } catch (error) {
        console.error("Error fetching transaction stats:", error);
        return {
            successToday: [],
            pending: [],
            failed24h: []
        };
    }
}
/**
 * Fetches logs for a technical audit of a transaction
 */
export async function getTransactionLogs(id: string) {
    try {
        const session = await getSession();
        if (!session?.user) throw new Error("Unauthorized");

        const appId = await getSelectedAppId();
        if (!appId) return [];
        const logs = await (prisma as any).providerLog.findMany({
            where: { transactionId: id, transaction: { applicationId: appId } },
            orderBy: { timestamp: 'desc' }
        });

        return logs;
    } catch (error) {
        console.error("Error fetching transaction logs:", error);
        return [];
    }
}
