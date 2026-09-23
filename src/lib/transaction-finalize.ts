import { detectProviderKey } from "@/lib/cle-fournisseur";
import prisma from "@/lib/db";
import { PaymentOrchestratorFactory } from "@/lib/orchestrator/factory";
import { buildAdapterConfig } from "@/lib/orchestrator/executor";
import { IPaymentProvider, PaymentResponse } from "@/lib/orchestrator/types";
import { sendPaymentConfirmationEmail, sendPaymentReceiptEmail } from "@/lib/email";
import { envoyerWebhook, evenementPourStatut } from "@/lib/webhook-dispatch";
import { createNotification } from "@/lib/notifications";
import { safeDecrypt } from "@/lib/crypto";
import logger from "@/lib/logger";

/**
 * Shared logic for every path that moves a PENDING transaction to a final
 * state: provider webhook, checkout polling (active verification) and the
 * sync cron. Keeping side effects (emails, in-app notification, outgoing
 * merchant webhook, audit log) here guarantees the merchant gets the same
 * treatment no matter which path confirms the payment first.
 */

/**
 * Build the provider adapter for a transaction, resolving the gateway
 * credentials scoped to the transaction's application.
 */
export async function getAdapterForTransaction(tx: {
    applicationId: string | null;
    provider: string;
    metadata?: any;
}): Promise<IPaymentProvider | null> {
    // La passerelle designee a l'initiation d'abord (metadata.gatewayId) : seule
    // facon sure avec une carte par pays (Hub2, Djamo) ou quand un nom en contient
    // un autre (« Flutterwave » contient « wave »). Le nom ne sert qu'aux vieilles
    // transactions sans identifiant.
    let gateway: any = null;
    const gatewayId = (tx.metadata as any)?.gatewayId;
    if (gatewayId) {
        gateway = await prisma.gateway.findUnique({ where: { id: String(gatewayId) } }).catch(() => null);
        // Refuser la passerelle d'un AUTRE marchand.
        if (gateway && gateway.applicationId && tx.applicationId && gateway.applicationId !== tx.applicationId) gateway = null;
    }
    if (!gateway) {
        gateway = await prisma.gateway.findFirst({
            where: {
                applicationId: tx.applicationId,
                name: { contains: tx.provider, mode: "insensitive" },
            },
        });
    }
    if (!gateway) return null;

    // Meme construction que l'initiation et la route de webhook : chaque
    // fournisseur range ses cles a sa facon (FeexPay : Shop ID et jeton dans les
    // colonnes, Hub2 : merchantId, Notch Pay : cle publique, LengoPay : licence...).
    // L'ancienne table generique (apiKey, secretKey, masterKey...) envoyait par
    // exemple le Shop ID FeexPay comme jeton : chaque verification par le cron ou
    // par la page de paiement recevait 401 sans champ de statut, l'adaptateur en
    // deduisait PENDING et un paiement encaisse restait en attente (VenteUp,
    // 18/09/2026). buildAdapterConfig dechiffre et pose les cles de test en mode test.
    // La cle de la fabrique vient du NOM de la passerelle, comme a l'initiation :
    // `tx.provider` porte ce nom tel quel (« Hub2 Côte d'Ivoire »), inconnu de la
    // fabrique, et la verification tombait en « adaptateur indisponible ».
    const cle = detectProviderKey(gateway.name) || String(tx.provider || "").toLowerCase();
    try {
        return PaymentOrchestratorFactory.getProvider(cle, buildAdapterConfig(gateway, cle));
    } catch (err) {
        logger.warn("[tx-finalize] adaptateur indisponible", {
            provider: cle, gatewayId: gateway.id, err: String((err as any)?.message || err),
        });
        return null;
    }
}

/**
 * Apply a provider verification result to a transaction and fire the
 * post-payment side effects. Safe against transient verify errors (no
 * status change) and against downgrading an already-SUCCESS transaction.
 * Returns the updated record, or the original one when nothing changed.
 */
export async function applyVerificationResult(
    tx: any,
    verification: PaymentResponse,
    source: string
): Promise<any> {
    // A failed API call must never flip a transaction to FAILED — adapters
    // surface transport errors via rawData.error with status FAILED.
    if (!verification || verification.rawData?.error) return tx;
    if (verification.status === tx.status) return tx;
    // REFUNDED est un etat REEL et definitif : on n'y touche jamais.
    if (tx.status === "REFUNDED") {
        logger.info("[tx-finalize] ignored - locked terminal state", {
            txId: tx.id, status: tx.status, incoming: verification.status, source,
        });
        return tx;
    }
    // CANCELLED, lui, est souvent SUPPOSE : le cron l'applique a toute tx PENDING
    // sans providerRef depuis 30 min. Un paiement encaisse plus tard restait alors
    // invisible (des clients ont paye par carte sans etre livres). Un SUCCES
    // CONFIRME par le fournisseur peut donc rattraper un CANCELLED ; tout autre
    // statut entrant reste ignore.
    if (tx.status === "CANCELLED" && verification.status !== "SUCCESS") {
        logger.info("[tx-finalize] ignored - locked terminal state", {
            txId: tx.id, status: tx.status, incoming: verification.status, source,
        });
        return tx;
    }
    if (tx.status === "CANCELLED") {
        logger.warn("[tx-finalize] rattrapage : paiement confirme sur une tx annulee", {
            txId: tx.id, source,
        });
    }
    // Un remboursement CONFIRME par le fournisseur (webhook Stripe signe) est le
    // seul chemin qui sorte de SUCCESS.
    const remboursementConfirme = String(verification.status) === "REFUNDED" && source === "stripe-webhook";
    if (tx.status === "SUCCESS" && verification.status !== "SUCCESS" && !remboursementConfirme) {
        logger.info("[tx-finalize] ignored downgrade attempt", {
            txId: tx.id, incoming: verification.status, source,
        });
        return tx;
    }
    // Un « en attente » entrant ne fait pas revenir un echec : le fournisseur
    // qui repond « inconnu » a une relecture ne rouvre pas un FAILED.
    if (verification.status === "PENDING" && tx.status !== "PENDING") return tx;

    // ATOMIC: only transition out of a non-terminal state. If another path
    // (webhook/cron/poll) finalized first, count===0 and we skip the duplicate
    // side effects below — no double emails / double outgoing webhooks.
    const claim = await prisma.transaction.updateMany({
        where: {
            id: tx.id,
            // On ne sort de CANCELLED que pour un succes confirme (cf. ci-dessus).
            status: verification.status === "SUCCESS"
                ? { notIn: ["SUCCESS", "REFUNDED"] }
                : String(verification.status) === "REFUNDED"
                    ? { in: ["SUCCESS", "PENDING", "FAILED"] }
                    : { notIn: ["SUCCESS", "REFUNDED", "CANCELLED"] },
        },
        data: {
            status: verification.status as any,
            ...(verification.status === "SUCCESS" ? { completedAt: new Date() } : {}),
        },
    });
    if (claim.count === 0) {
        logger.info("[tx-finalize] already finalized by another path — skipping side effects", {
            txId: tx.id, source,
        });
        return (await prisma.transaction.findUnique({ where: { id: tx.id } })) ?? tx;
    }
    // Pourquoi ça a échoué : on le garde sur la transaction, sinon le motif
    // reste enterré dans le journal et le client ne voit qu'un échec muet.
    if (verification.status === "FAILED") {
        try {
            const { motifEchec } = await import("@/lib/motif-echec");
            const motif = motifEchec(verification.rawData);
            if (motif) {
                const meta: any = (tx.metadata as any) || {};
                await prisma.transaction.update({
                    where: { id: tx.id },
                    data: { metadata: { ...meta, echec: { ...motif, quand: new Date().toISOString() } } as any },
                });
            }
        } catch { /* le motif est un confort, jamais un bloquant */ }
    }

    const updated = (await prisma.transaction.findUnique({ where: { id: tx.id } }))!;

    logger.info("[tx-finalize] tx updated", {
        txId: tx.id, status: verification.status, source,
    });

    try {
        await (prisma as any).providerLog.create({
            data: {
                transactionId: tx.id,
                type: "SYNC_CHECK",
                payload: JSON.parse(JSON.stringify(verification.rawData || { status: verification.status, source })),
            },
        });
    } catch { /* audit log is best-effort */ }

    // Compter l'issue DEFINITIVE pour le routage : c'est ici, et nulle part
    // ailleurs, que l'on sait si la passerelle a encaisse. Compter a
    // l'initiation reviendrait a la noter sur sa capacite a decrocher.
    if (["SUCCESS", "FAILED"].includes(verification.status)) {
        (async () => {
            const { reperesTransaction, enregistrerIssue } = await import("@/lib/orchestrator/routage-mesure");
            const reperes = await reperesTransaction(updated);
            if (!reperes) return;
            const reussi = verification.status === "SUCCESS";
            let categorie;
            if (!reussi) {
                const { categoriserEchec } = await import("@/lib/orchestrator/categorie-echec");
                categorie = (await categoriserEchec(reperes.passerelle, verification.rawData)).categorie;
            }
            await enregistrerIssue({ ...reperes, reussi, categorie });
        })().catch(() => { });
    }

    if (["SUCCESS", "FAILED", "CANCELLED"].includes(verification.status)) {
        (async () => {
            try {
                const { updateDecisionOutcome } = await import("@/lib/routing-audit");
                await updateDecisionOutcome(tx.id, verification.status as "SUCCESS" | "FAILED" | "CANCELLED");
            } catch { /* ignore */ }
        })();
    }

    if (updated.applicationId) {
        if ((updated as any).test === true) {
            // Donnee de test : ni commission, ni e-mail, ni notification ; seul le webhook part.
        } else if (verification.status === "SUCCESS") {
            sendPaymentSuccessEmails(updated, tx.provider, updated.applicationId).catch(() => {});
            notifyMerchant(updated, {
                title: "Paiement reçu",
                body: `Paiement de ${updated.amount.toLocaleString("fr-FR")} ${updated.currency} via ${tx.provider} (commande ${updated.orderId})`,
            }).catch(() => {});
        } else if (String(verification.status) === "REFUNDED") {
            notifyMerchant(updated, {
                title: "Paiement remboursé",
                body: `Paiement de ${updated.amount.toLocaleString("fr-FR")} ${updated.currency} via ${tx.provider} remboursé (commande ${updated.orderId})`,
            }).catch(() => {});
        } else if (verification.status === "FAILED") {
            notifyMerchant(updated, {
                title: "Paiement échoué",
                body: `Paiement de ${updated.amount.toLocaleString("fr-FR")} ${updated.currency} via ${tx.provider} a échoué (commande ${updated.orderId})`,
            }).catch(() => {});
        }
        dispatchOutgoingStatusWebhook(updated, verification.status, tx.provider, verification.providerReference).catch(() => {});
    }

    return updated;
}

async function notifyMerchant(tx: any, content: { title: string; body: string }) {
    const app = await prisma.application.findUnique({
        where: { id: tx.applicationId },
        select: { userId: true },
    });
    if (!app?.userId) return;
    await createNotification({
        userId: app.userId,
        type: "payment",
        title: content.title,
        body: content.body,
        link: `/transactions/${tx.id}`,
    });
}

/**
 * Dispatch the merchant's outgoing webhook for a status change — same
 * payload shape as the provider-webhook route.
 */
export async function dispatchOutgoingStatusWebhook(
    tx: any,
    status: string,
    providerName: string,
    providerReference?: string
) {
    if (!tx?.applicationId) return null;
    const data = {
        id: tx.id,
        order_id: tx.orderId,
        status,
        amount: tx.amount,
        currency: tx.currency,
        provider: providerName,
        provider_reference: providerReference ?? tx.providerRef ?? null,
        customer_name: tx.customerName,
        customer_email: tx.customerEmail,
        customer_phone: tx.customerPhone,
        metadata: tx.metadata,
        completed_at: status === "SUCCESS" ? (tx.completedAt ? new Date(tx.completedAt).toISOString() : new Date().toISOString()) : null,
    };
    return envoyerWebhook(
        { data, timestamp: new Date().toISOString() },
        { applicationId: tx.applicationId, event: evenementPourStatut(status), test: tx.test === true, transactionId: tx.id }
    );
}

/**
 * Abandon d'un paiement (client parti, session expiree, annulation par le
 * marchand) : statut CANCELLED et webhook `payment.cancelled`. Ne touche pas
 * une transaction deja denouee.
 */
export async function annulerAbandon(transactionId: string, motif = "abandon"): Promise<boolean> {
    const maj = await prisma.transaction.updateMany({
        where: { id: transactionId, status: "PENDING" },
        data: { status: "CANCELLED" },
    });
    if (maj.count !== 1) return false;
    const tx = await prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!tx) return false;
    logger.info("[tx-finalize] abandon", { txId: transactionId, motif });
    dispatchOutgoingStatusWebhook(tx, "CANCELLED", tx.provider || "").catch(() => { });
    return true;
}

/**
 * Send the merchant confirmation + customer receipt emails for a successful
 * payment, honouring the application's notification preferences.
 */
export async function sendPaymentSuccessEmails(tx: any, providerName: string, applicationId: string) {
    try {
        const app = await prisma.application.findUnique({
            where: { id: applicationId },
            select: { name: true, metadata: true, user: { select: { email: true } } },
        });
        if (!app) return;

        const meta = (app.metadata as any) || {};
        const notifyMerchantPref = meta.notifyMerchantOnPayment !== false;
        const notifyCustomerPref = meta.notifyCustomerOnPayment !== false;

        const methodCode = (tx.metadata as any)?.methodCode || providerName;
        const merchantName = app.name || "Marchand";
        const completedAt = new Date().toLocaleString("fr-FR", { timeZone: "Africa/Abidjan", dateStyle: "long", timeStyle: "short" });

        const promises: Promise<unknown>[] = [];

        if (notifyMerchantPref && app.user?.email) {
            promises.push(sendPaymentConfirmationEmail({
                to: app.user.email,
                merchantName,
                customerName: tx.customerName || "Client",
                customerEmail: tx.customerEmail || "",
                amount: tx.amount,
                currency: tx.currency,
                method: methodCode,
                provider: providerName,
                orderId: tx.orderId,
                transactionId: tx.id,
                completedAt,
            }));
        }

        if (notifyCustomerPref && tx.customerEmail) {
            promises.push(sendPaymentReceiptEmail({
                to: tx.customerEmail,
                customerName: tx.customerName || "Client",
                merchantName,
                amount: tx.amount,
                currency: tx.currency,
                method: methodCode,
                orderId: tx.orderId,
                completedAt,
            }));
        }

        await Promise.allSettled(promises);
    } catch (err) {
        console.error("[tx-finalize:sendEmails]", err);
    }
}
