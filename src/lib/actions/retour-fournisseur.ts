"use server";

import prisma from "@/lib/db";
import { getAdapterForTransaction, applyVerificationResult } from "@/lib/transaction-finalize";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";

/**
 * Retour d'une page hebergee (FeexLink v2 pour la carte chez FeexPay) : le
 * fournisseur ajoute `?ref=<sa reference>` a l'adresse de retour, alors que la
 * transaction n'en avait pas encore (la creation du lien ne la donne pas).
 *
 * On l'attache seulement si le fournisseur, interroge avec les cles de CETTE
 * passerelle, connait la reference et lui donne le meme montant : une reference
 * etrangere ou inventee ne peut donc rien faire croire. Puis le statut rendu
 * est applique comme pour un sondage ordinaire.
 */
export async function attacherReferenceRetour(transactionId: string, reference: string): Promise<{ ok: boolean; status?: string }> {
    const id = String(transactionId || "").trim();
    const ref = String(reference || "").trim();
    if (!id || !/^[A-Za-z0-9._-]{4,80}$/.test(ref)) return { ok: false };

    const limite = await rateLimit(`retour_ref:${id}`, { limit: 10, windowSec: 60 });
    if (!limite.allowed) return { ok: false };

    const tx = await prisma.transaction.findUnique({ where: { id } });
    if (!tx) return { ok: false };
    if (tx.providerRef) return { ok: true, status: tx.status };
    if (tx.status !== "PENDING") return { ok: false, status: tx.status };

    const adapter = await getAdapterForTransaction(tx).catch(() => null);
    if (!adapter) return { ok: false };
    const verification = await adapter.verifyPayment(ref).catch(() => null);
    if (!verification) return { ok: false };

    const brut: any = verification.rawData || {};
    const connue = !!(brut.status || brut.reference || brut.transref || brut.financialTransactionId);
    const montant = Number(brut.amount);
    if (!connue || (Number.isFinite(montant) && montant > 0 && Math.round(montant) !== Math.round(Number(tx.amount)))) {
        logger.warn("[retour-fournisseur] reference non attachee", { txId: id, ref, connue, montant, attendu: tx.amount });
        return { ok: false };
    }

    const maj = await prisma.transaction.updateMany({ where: { id, providerRef: null, status: "PENDING" }, data: { providerRef: ref } }).catch(() => ({ count: 0 }));
    if (!maj.count) return { ok: false };
    logger.info("[retour-fournisseur] reference attachee", { txId: id, ref, provider: tx.provider });
    const apres = await applyVerificationResult({ ...tx, providerRef: ref }, verification, "retour-fournisseur").catch(() => null);
    return { ok: true, status: apres?.status || "PENDING" };
}
