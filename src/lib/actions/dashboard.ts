"use server";

import prisma from "@/lib/db";
import { getSession } from "@/lib/session";
import { getSelectedAppId } from "./utils";

export async function getDashboardStats() {
    try {
        const session = await getSession();
        if (!session?.user) return null;

        const appId = await getSelectedAppId();
        if (!appId) return null;

        // Get total volume from successful payments
        const totalVolume = await prisma.transaction.aggregate({
            where: { applicationId: appId, status: 'SUCCESS' },
            _sum: { amount: true }
        });

        // Get total successful transactions count
        const successfulTxCount = await prisma.transaction.count({
            where: { applicationId: appId, status: 'SUCCESS' }
        });

        // Get total transactions count for conversion rate
        const totalTxCount = await prisma.transaction.count({
            where: { applicationId: appId }
        });

        // Get active gateways count
        const activeGateways = await prisma.gateway.count({
            where: { applicationId: appId, status: 'active' }
        });

        const totalGateways = await prisma.gateway.count({
            where: { applicationId: appId }
        });

        const conversionRate = totalTxCount > 0
            ? ((successfulTxCount / totalTxCount) * 100).toFixed(1)
            : "0.0";

        return {
            totalVolume: totalVolume._sum.amount || 0,
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

export async function getWeeklyVolume() {
    try {
        const session = await getSession();
        if (!session?.user) return [];

        const appId = await getSelectedAppId();
        if (!appId) return [];

        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const today = new Date();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        const volumeData = await Promise.all(days.map(async (day, index) => {
            const dayStart = new Date(startOfWeek);
            dayStart.setDate(startOfWeek.getDate() + index);

            const dayEnd = new Date(dayStart);
            dayEnd.setHours(23, 59, 59, 999);

            const dayVolume = await prisma.transaction.aggregate({
                where: {
                    applicationId: appId,
                    status: 'SUCCESS',
                    createdAt: {
                        gte: dayStart,
                        lte: dayEnd
                    }
                },
                _sum: { amount: true }
            });

            return {
                name: day,
                total: dayVolume._sum.amount || 0
            };
        }));

        return volumeData;
    } catch (error) {
        console.error("Error fetching weekly volume:", error);
        return [];
    }
}


/**
 * Montant encaisse par jour, separe en Mobile Money et carte bancaire : les
 * deux aires du graphique de la vue d'ensemble s'empilent donc sur le total
 * encaisse. Une seule requete groupee, la ou l'ancienne version en faisait
 * une par jour.
 */
export type PointVolume = { date: string; mobile: number; carte: number; paiements: number };

export async function getVolumeSerie(jours: number): Promise<PointVolume[]> {
    try {
        const session = await getSession();
        if (!session?.user) return [];
        const appId = await getSelectedAppId();
        if (!appId) return [];

        const n = [7, 30, 90].includes(jours) ? jours : 30;
        const debut = new Date();
        debut.setHours(0, 0, 0, 0);
        debut.setDate(debut.getDate() - (n - 1));

        const lignes = await prisma.transaction.findMany({
            where: { applicationId: appId, status: "SUCCESS", createdAt: { gte: debut } },
            select: { createdAt: true, amount: true, paymentType: true },
        });

        // Un point par jour, meme sans paiement : sinon la courbe saute les trous.
        const par = new Map<string, PointVolume>();
        for (let i = 0; i < n; i++) {
            const d = new Date(debut);
            d.setDate(debut.getDate() + i);
            const cle = d.toISOString().slice(0, 10);
            par.set(cle, { date: cle, mobile: 0, carte: 0, paiements: 0 });
        }
        for (const l of lignes) {
            const cle = new Date(l.createdAt).toISOString().slice(0, 10);
            const p = par.get(cle);
            if (!p) continue;
            const montant = Number(l.amount) || 0;
            if (l.paymentType === "CARD") p.carte += montant; else p.mobile += montant;
            p.paiements += 1;
        }
        return [...par.values()];
    } catch (e) {
        console.error("[dashboard] serie de volume indisponible", e);
        return [];
    }
}
