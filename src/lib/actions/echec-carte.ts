"use server";

import prisma from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

/**
 * Le formulaire de carte a refusé le paiement CHEZ L'ACHETEUR (carte refusée par
 * la banque, 3-D Secure abandonné, champ incomplet). Sans cette trace, ces échecs
 * n'existaient nulle part : l'intention de paiement restait `requires_payment_method`
 * chez Stripe, sans motif, et le marchand ne pouvait rien dire à son client.
 *
 * On garde le motif dans le journal du fournisseur et dans `metadata.echec`, comme
 * pour les autres moyens. Aucune donnée de carte n'est transmise ici.
 */
export async function journaliserEchecCarte(
    transactionId: string,
    erreur: { code?: string; decline_code?: string; type?: string; message?: string },
): Promise<void> {
    const id = String(transactionId || "").trim();
    if (!id) return;
    const limite = await rateLimit(`echec_carte:${id}`, { limit: 10, windowSec: 60 });
    if (!limite.allowed) return;

    const tx = await prisma.transaction.findUnique({ where: { id }, select: { id: true, status: true, provider: true, metadata: true } });
    if (!tx || tx.status !== "PENDING") return;

    const motif = {
        code: String(erreur?.code || "").slice(0, 60) || null,
        decline_code: String(erreur?.decline_code || "").slice(0, 60) || null,
        type: String(erreur?.type || "").slice(0, 40) || null,
        message: String(erreur?.message || "").slice(0, 300) || null,
    };
    logger.info("[carte] paiement refusé chez l'acheteur", { txId: id, provider: tx.provider, ...motif });

    await (prisma as any).providerLog.create({
        data: { transactionId: id, type: "CARD_CONFIRM_FAILED", payload: motif as any },
    }).catch(() => { });

    const meta = (tx.metadata as any) || {};
    await prisma.transaction.update({
        where: { id },
        data: { metadata: { ...meta, echec: { ...motif, source: "carte", quand: new Date().toISOString() } } as any },
    }).catch(() => { });
}
