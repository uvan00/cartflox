import prisma from "@/lib/db";
import { getAdapterForTransaction } from "@/lib/transaction-finalize";
import { createNotification } from "@/lib/notifications";

/**
 * Remboursement d'un paiement reussi, commun au tableau de bord (action
 * serveur) et a l'application mobile. L'appelant a deja verifie que
 * `appId` appartient au compte connecte.
 *
 * Renvoie { error } ou { status: "REFUNDED", refundId, providerStatus }.
 * La transaction passe en REFUNDED des que le fournisseur accepte la demande ;
 * la suite cote fournisseur est gardee dans metadata.refund.
 */
export async function rembourserTransaction(transactionId: string, appId: string) {
    const tx = await prisma.transaction.findFirst({
        where: { id: transactionId, applicationId: appId }
    });
    if (!tx) return { error: "Transaction introuvable" };
    if ((tx.status as string) === 'REFUNDED') return { error: "Cette transaction a déjà été remboursée" };
    if (tx.status !== 'SUCCESS') return { error: "Seules les transactions réussies peuvent être remboursées" };
    if (!tx.providerRef) return { error: "Référence provider manquante : remboursement impossible" };

    const adapter = await getAdapterForTransaction(tx);
    if (!adapter) return { error: `Passerelle introuvable pour ${tx.provider}` };
    if (typeof adapter.refundPayment !== 'function') {
        return { error: `Le remboursement automatique n'est pas encore supporté pour ${tx.provider}` };
    }

    // ATOMIC CLAIM: only one caller may transition SUCCESS -> REFUNDED. The
    // status checks above are check-then-act and racy; without this a double
    // click / concurrent call could fire two provider refunds (double payout).
    const claim = await prisma.transaction.updateMany({
        where: { id: tx.id, applicationId: appId, status: 'SUCCESS' },
        data: { status: 'REFUNDED' as any, updatedAt: new Date() }
    });
    if (claim.count === 0) {
        return { error: "Remboursement déjà en cours ou transaction non remboursable" };
    }

    // We now own the refund. Revert the claim to SUCCESS on any provider error.
    const revertClaim = () =>
        prisma.transaction.updateMany({
            where: { id: tx.id, status: 'REFUNDED' },
            data: { status: 'SUCCESS' as any }
        }).catch(() => { });

    let result;
    try {
        result = await adapter.refundPayment(tx.providerRef, {
            amount: tx.amount,
            currency: tx.currency
        });
    } catch (e: any) {
        // Delai depasse ou panne APRES un ordre peut-etre parti : revenir a SUCCESS
        // proposait un second remboursement. On garde REFUNDED avec un etat
        // « indetermine » ; le journal fournisseur tranche.
        const meta: any = (tx.metadata as any) || {};
        await prisma.transaction.update({
            where: { id: tx.id },
            data: { metadata: { ...meta, refund: { status: "indetermine", erreur: String(e?.message || e).slice(0, 300), quand: new Date().toISOString() } } as any },
        }).catch(() => { });
        return { error: "Le fournisseur n'a pas répondu. Le remboursement est marqué à vérifier : ne le relancez pas, écrivez au support." };
    }

    try {
        await (prisma as any).providerLog.create({
            data: {
                transactionId: tx.id,
                type: 'REFUND',
                payload: JSON.parse(JSON.stringify(result.rawData || { status: result.status }))
            }
        });
    } catch { /* audit log is best-effort */ }

    if (result.status === 'FAILED') {
        await revertClaim();
        const reason = result.rawData?.rejectionReason?.rejectionMessage
            || result.rawData?.failureReason?.failureMessage
            || result.rawData?.error
            || "rejeté par le provider";
        return { error: `Remboursement refusé : ${reason}` };
    }

    // Grab the freshest provider-side status (refunds often complete fast)
    let providerStatus: string = result.status;
    let providerRaw = result.rawData;
    if (typeof adapter.verifyRefund === 'function') {
        try {
            const check = await adapter.verifyRefund(result.providerReference);
            if (!check.rawData?.error) {
                providerStatus = check.status;
                providerRaw = check.rawData;
            }
        } catch { /* keep initiation status */ }
    }

    const metadata = {
        ...((tx.metadata as any) || {}),
        refund: {
            refundId: result.providerReference,
            status: providerRaw?.status || providerStatus,
            amount: tx.amount,
            currency: tx.currency,
            requestedAt: new Date().toISOString(),
        }
    };

    // Status is already REFUNDED from the atomic claim; persist refund details.
    await prisma.transaction.update({
        where: { id: tx.id },
        data: { metadata }
    });

    const app = await prisma.application.findUnique({
        where: { id: appId },
        select: { userId: true }
    });
    if (app?.userId) {
        createNotification({
            userId: app.userId,
            type: "payment",
            title: "Remboursement initié",
            body: `Remboursement de ${tx.amount.toLocaleString("fr-FR")} ${tx.currency} (commande ${tx.orderId}) envoyé à ${tx.provider}`,
            link: `/transactions/${tx.id}`,
        }).catch(() => {});
    }

    return { status: 'REFUNDED', refundId: result.providerReference, providerStatus };
}
