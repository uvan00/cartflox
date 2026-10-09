import prisma from "@/lib/db";
import logger from "@/lib/logger";
import type { PaymentResponse } from "./types";
import type { DepotTentatives, StatutTentative } from "./tentatives";

/**
 * Les tentatives en base (table `Tentative`), et ce que la finalisation et
 * le cron en font. Le reste de la logique vit dans `tentatives.ts`, sans base.
 */

export const depotPrisma: DepotTentatives = {
    async prochainRang(transactionId) {
        const d = await prisma.tentative.aggregate({ where: { transactionId }, _max: { rang: true } });
        return Number(d?._max?.rang || 0) + 1;
    },
    async creer(t) {
        return prisma.tentative.create({ data: t, select: { id: true } });
    },
    async terminer(id, patch) {
        await prisma.tentative.update({ where: { id }, data: { ...patch, termineeLe: new Date() } });
    },
    async remplacerAcceptees(transactionId, saufId) {
        await prisma.tentative.updateMany({
            where: { transactionId, statut: { in: ["ACCEPTEE", "INCERTAINE"] }, id: { not: saufId } },
            data: { statut: "REMPLACEE", termineeLe: new Date() },
        });
    },
};

/**
 * Fournisseurs chez qui NOTRE référence suffit à relire l'état : la demande
 * est créée sous notre identifiant (PawaPay : depositId). Pour les autres, il
 * faut la référence du fournisseur, qu'un délai dépassé ne nous a pas donnée.
 */
export const VERIFIABLES_PAR_NOTRE_REFERENCE = new Set(["pawapay"]);

/** La transaction d'une tentative, retrouvée par une référence fournisseur ou la nôtre (webhook sur une tentative remplacée). */
type TentativeAvecTransaction = NonNullable<Awaited<ReturnType<typeof chercherTentative>>>;

async function chercherTentative(refs: string[]) {
    return prisma.tentative.findFirst({
        where: { OR: [{ providerRef: { in: refs } }, { reference: { in: refs } }] },
        orderBy: { creeLe: "desc" },
        include: { transaction: true },
    });
}

export async function transactionParTentative(references: string[]): Promise<{ tentative: TentativeAvecTransaction; transaction: TentativeAvecTransaction["transaction"] } | null> {
    const refs = references.filter((r) => typeof r === "string" && r.trim());
    if (refs.length === 0) return null;
    try {
        const t = await chercherTentative(refs);
        return t?.transaction ? { tentative: t, transaction: t.transaction } : null;
    } catch {
        return null;
    }
}

/**
 * À la finalisation d'une transaction : clôt la tentative qui portait le
 * paiement (REUSSIE, ECHOUEE ou ABANDONNEE), remplace les autres encore
 * ouvertes, et renvoie ses repères (contexte, fournisseur, compte) pour la
 * mesure. Null quand la transaction n'a pas de tentative (d'avant le 08/10/2026).
 */
export async function cloreTentatives(
    tx: { id: string; providerRef?: string | null },
    statut: "SUCCESS" | "FAILED" | "CANCELLED",
    verification?: PaymentResponse | null,
): Promise<{ contexte: string; passerelle: string; gatewayId: string } | null> {
    try {
        const ouvertes = await prisma.tentative.findMany({
            where: { transactionId: tx.id, statut: { in: ["ACCEPTEE", "INCERTAINE", "REMPLACEE", "INITIEE"] } },
            orderBy: { rang: "desc" },
        });
        if (ouvertes.length === 0) return null;
        const ref = String(verification?.providerReference || tx.providerRef || "").trim();
        const porteuse = (ref && ouvertes.find((t) => t.providerRef === ref || t.reference === ref))
            || ouvertes.find((t) => t.statut === "ACCEPTEE")
            || ouvertes[0];
        const final: StatutTentative = statut === "SUCCESS" ? "REUSSIE" : statut === "FAILED" ? "ECHOUEE" : "ABANDONNEE";
        let extra: Record<string, unknown> = {};
        if (statut === "FAILED") {
            const { categoriserEchec } = await import("./categorie-echec");
            const v = await categoriserEchec(porteuse.fournisseur, verification?.rawData);
            extra = { code: v.code || null, categorie: v.categorie, decision: v.decision, message: v.message || null };
        }
        await prisma.tentative.update({ where: { id: porteuse.id }, data: { statut: final, termineeLe: new Date(), ...extra } });
        const autres = ouvertes.filter((t) => t.id !== porteuse.id && ["ACCEPTEE", "INCERTAINE", "INITIEE"].includes(t.statut));
        if (autres.length) {
            await prisma.tentative.updateMany({
                where: { id: { in: autres.map((t) => t.id) } },
                data: { statut: statut === "CANCELLED" ? "ABANDONNEE" : "REMPLACEE", termineeLe: new Date() },
            });
        }
        return { contexte: porteuse.contexte, passerelle: porteuse.fournisseur, gatewayId: porteuse.gatewayId };
    } catch (e) {
        logger.warn("[tentatives] cloture impossible", { txId: tx.id, err: String((e as { message?: unknown } | null)?.message || e) });
        return null;
    }
}

/**
 * Le cron : les tentatives INCERTAINES (le fournisseur n'a pas répondu à
 * temps) sont relues auprès de lui. C'est le « PSync » d'Hyperswitch :
 *  - réussie ou échouée chez lui : la transaction est finalisée comme par un webhook ;
 *  - inconnue de lui : la demande n'est jamais partie, la tentative est ECHOUEE
 *    et la transaction redevient librement rejouable ;
 *  - toujours en attente : on laisse le webhook ou le cron de synchronisation finir ;
 *  - invérifiable (aucune référence utilisable) et vieille de plus de 30 min : ECHOUEE.
 */
export async function resoudreIncertaines(x: { apresMs?: number; abandonMs?: number; limite?: number } = {}): Promise<{ examinees: number; finalisees: number; echouees: number; encore: number }> {
    const apres = new Date(Date.now() - (x.apresMs ?? 2 * 60_000));
    const abandon = new Date(Date.now() - (x.abandonMs ?? 30 * 60_000));
    const resultat = { examinees: 0, finalisees: 0, echouees: 0, encore: 0 };
    let lignes: Array<NonNullable<TentativeAvecTransaction>> = [];
    try {
        lignes = await prisma.tentative.findMany({
            where: { statut: "INCERTAINE", creeLe: { lt: apres } },
            orderBy: { creeLe: "asc" },
            take: x.limite ?? 50,
            include: { transaction: true },
        });
    } catch {
        return resultat;
    }
    const { getAdapterForTransaction, applyVerificationResult } = await import("@/lib/transaction-finalize");

    for (const t of lignes) {
        resultat.examinees++;
        const tx = t.transaction;
        const echouer = async (motif: string) => {
            await prisma.tentative.update({ where: { id: t.id }, data: { statut: "ECHOUEE", message: motif, termineeLe: new Date() } }).catch(() => { });
            // La référence de cette tentative posée sur la transaction ne vaut plus rien.
            if (tx && tx.status === "PENDING" && tx.providerRef && tx.providerRef === t.reference) {
                await prisma.transaction.updateMany({ where: { id: tx.id, providerRef: t.reference }, data: { providerRef: null } }).catch(() => { });
            }
            resultat.echouees++;
        };
        try {
            if (!tx || tx.status !== "PENDING") {
                await prisma.tentative.update({ where: { id: t.id }, data: { statut: tx?.status === "SUCCESS" ? "REMPLACEE" : "ABANDONNEE", termineeLe: new Date() } }).catch(() => { });
                continue;
            }
            const reference = t.providerRef || (VERIFIABLES_PAR_NOTRE_REFERENCE.has(t.fournisseur) ? t.reference : null);
            if (!reference) {
                if (new Date(t.creeLe) < abandon) await echouer("invérifiable : aucune référence, abandon après 30 min");
                else resultat.encore++;
                continue;
            }
            const adapter = await getAdapterForTransaction({ ...tx, metadata: { ...((tx.metadata as Record<string, unknown> | null) || {}), gatewayId: t.gatewayId } });
            if (!adapter) { resultat.encore++; continue; }
            const v = await adapter.verifyPayment(reference);
            const erreur = String(v?.rawData?.error || "");
            const inconnue = (v?.status === "PENDING" && (v.rawData == null || typeof v.rawData !== "object" || Object.keys(v.rawData).length === 0 || /NOT_FOUND/i.test(String((v.rawData as { status?: unknown })?.status || ""))))
                || /\b404\b|not found|introuvable|inconnu/i.test(erreur);
            if (inconnue) { await echouer("inconnue du fournisseur : la demande n'est jamais partie"); continue; }
            if (erreur) { resultat.encore++; continue; }
            if (v.status === "SUCCESS" || v.status === "FAILED") {
                // La tentative devient ACCEPTEE le temps que la finalisation la clôture sous sa référence.
                await prisma.tentative.update({ where: { id: t.id }, data: { statut: "ACCEPTEE", providerRef: v.providerReference || reference } }).catch(() => { });
                await applyVerificationResult({ ...tx, providerRef: tx.providerRef || v.providerReference || reference }, { ...v, providerReference: v.providerReference || reference }, "cron:incertaine");
                resultat.finalisees++;
                continue;
            }
            // En attente chez le fournisseur : la demande est bien partie. La tentative
            // est acceptée, la transaction porte sa référence, le reste suit son cours.
            await prisma.tentative.update({ where: { id: t.id }, data: { statut: "ACCEPTEE", providerRef: v.providerReference || reference } }).catch(() => { });
            if (!tx.providerRef) await prisma.transaction.updateMany({ where: { id: tx.id, providerRef: null }, data: { providerRef: v.providerReference || reference } }).catch(() => { });
            resultat.encore++;
        } catch (e) {
            logger.warn("[tentatives] relecture incertaine impossible", { tentative: t.id, err: String((e as { message?: unknown } | null)?.message || e) });
            resultat.encore++;
        }
    }
    return resultat;
}
