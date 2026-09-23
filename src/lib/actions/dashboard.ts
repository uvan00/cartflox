"use server";

import prisma from "@/lib/db";
import { getSession } from "@/lib/session";
import { devisePrincipale, parDevise, parDeviseGroupe, type MontantDevise } from "@/lib/devises";
import { getSelectedAppId } from "./utils";

/**
 * Les chiffres de la vue d'ensemble. Le volume se compte DANS CHAQUE DEVISE :
 * un `_sum` global additionnait des francs, des dollars et des francs
 * congolais puis l'affichait en XOF.
 */
export async function getDashboardStats() {
    try {
        const session = await getSession();
        if (!session?.user) return null;

        const appId = await getSelectedAppId();
        if (!appId) return null;

        const [reussis, totalTxCount, activeGateways, totalGateways] = await Promise.all([
            prisma.transaction.groupBy({
                by: ["currency"],
                where: { applicationId: appId, status: "SUCCESS" },
                _sum: { amount: true },
                _count: { _all: true },
            }),
            prisma.transaction.count({ where: { applicationId: appId } }),
            prisma.gateway.count({ where: { applicationId: appId, status: "active" } }),
            prisma.gateway.count({ where: { applicationId: appId } }),
        ]);

        const successfulTxCount = reussis.reduce((n, l) => n + (l._count?._all || 0), 0);
        const conversionRate = totalTxCount > 0
            ? ((successfulTxCount / totalTxCount) * 100).toFixed(1)
            : "0.0";

        return {
            volumes: parDeviseGroupe(reussis),
            successfulTxCount,
            conversionRate,
            activeGateways,
            totalGateways,
            totalTxCount,
        };
    } catch (error) {
        console.error("Error fetching dashboard stats:", error);
        return null;
    }
}

export async function getRecentTransactions(limit = 5) {
    try {
        const session = await getSession();
        if (!session?.user) return [];

        const appId = await getSelectedAppId();
        if (!appId) return [];

        const transactions = await prisma.transaction.findMany({
            where: { applicationId: appId },
            orderBy: { createdAt: 'desc' },
            take: limit
        });

        return transactions;
    } catch (error) {
        console.error("Error fetching recent transactions:", error);
        return [];
    }
}

/**
 * Montant encaisse par jour, separe en Mobile Money et carte bancaire : les
 * deux aires du graphique de la vue d'ensemble s'empilent donc sur le total
 * encaisse. Une seule requete groupee.
 *
 * La courbe ne trace qu'UNE devise, la plus frequente sur la periode : empiler
 * des francs et des dollars ne veut rien dire. Les autres devises reviennent a
 * part, en total, pour que rien ne disparaisse.
 */
export type PointVolume = { date: string; mobile: number; carte: number; paiements: number };
export type SerieVolume = { devise: string; points: PointVolume[]; autres: MontantDevise[] };

export async function getVolumeSerie(jours: number): Promise<SerieVolume> {
    const vide: SerieVolume = { devise: "XOF", points: [], autres: [] };
    try {
        const session = await getSession();
        if (!session?.user) return vide;
        const appId = await getSelectedAppId();
        if (!appId) return vide;

        const n = [7, 30, 90].includes(jours) ? jours : 30;
        const debut = new Date();
        debut.setHours(0, 0, 0, 0);
        debut.setDate(debut.getDate() - (n - 1));

        const lignes = await prisma.transaction.findMany({
            where: { applicationId: appId, status: "SUCCESS", createdAt: { gte: debut } },
            select: { createdAt: true, amount: true, paymentType: true, currency: true },
        });
        const totaux = parDevise(lignes);
        const devise = devisePrincipale(totaux);

        // Un point par jour, meme sans paiement : sinon la courbe saute les trous.
        const par = new Map<string, PointVolume>();
        for (let i = 0; i < n; i++) {
            const d = new Date(debut);
            d.setDate(debut.getDate() + i);
            const cle = d.toISOString().slice(0, 10);
            par.set(cle, { date: cle, mobile: 0, carte: 0, paiements: 0 });
        }
        for (const l of lignes) {
            if (String(l.currency || "XOF").toUpperCase() !== devise) continue;
            const cle = new Date(l.createdAt).toISOString().slice(0, 10);
            const p = par.get(cle);
            if (!p) continue;
            const montant = Number(l.amount) || 0;
            if (l.paymentType === "CARD") p.carte += montant; else p.mobile += montant;
            p.paiements += 1;
        }
        return { devise, points: [...par.values()], autres: totaux.filter((t) => t.devise !== devise) };
    } catch (e) {
        console.error("[dashboard] serie de volume indisponible", e);
        return vide;
    }
}
