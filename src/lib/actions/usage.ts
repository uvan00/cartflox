"use server";

import prisma from "@/lib/db";
import { getSession } from "@/lib/session";
import {
    startOfDay,
    endOfDay,
    startOfMonth,
    format,
    differenceInCalendarDays,
    eachDayOfInterval,
    eachMonthOfInterval,
} from "date-fns";
import { getSelectedAppId } from "./utils";

export type UsagePoint = {
    key: string;
    label: string;
    volume: number;
    count: number;
    success: number;
    failed: number;
};

export type Trend = { val: string; up: boolean };

export type UsageData = {
    currency: string;
    totalSpend: number;
    avgPerDay: number;
    totalTransactions: number;
    totalSuccess: number;
    totalFailed: number;
    successRate: number;
    avgTicket: number;
    uniqueClients: number;
    spendTrend: Trend;
    txTrend: Trend;
    successTrend: Trend;
    monthSpend: number;
    monthCount: number;
    rangeStart: string;
    rangeEnd: string;
    granularity: "day" | "month";
    series: UsagePoint[];
    byProvider: { name: string; volume: number; count: number }[];
    byCountry: { name: string; volume: number }[];
};

const IGNORED_PROVIDERS = new Set(["cartflox", "afriflow", "", "pending", "non attribué"]);

function countryFromPhone(phoneRaw?: string | null): string {
    const p = (phoneRaw || "").replace(/\D/g, "");
    if (p.startsWith("225")) return "Côte d'Ivoire";
    if (p.startsWith("221")) return "Sénégal";
    if (p.startsWith("229")) return "Bénin";
    if (p.startsWith("237")) return "Cameroun";
    if (p.startsWith("223")) return "Mali";
    if (p.startsWith("226")) return "Burkina Faso";
    if (p.startsWith("228")) return "Togo";
    if (p.startsWith("241")) return "Gabon";
    if (p.startsWith("242")) return "Congo";
    if (p.startsWith("243")) return "RDC";
    if (p.startsWith("233")) return "Ghana";
    return "Autre";
}

function trend(curr: number, prev: number, lowerIsBetter = false): Trend {
    if (prev === 0) return { val: curr > 0 ? "+100%" : "0%", up: !lowerIsBetter ? curr >= 0 : true };
    const diff = ((curr - prev) / prev) * 100;
    const up = lowerIsBetter ? diff <= 0 : diff >= 0;
    return { val: `${diff > 0 ? "+" : ""}${diff.toFixed(1)}%`, up };
}

/**
 * Données de la page « Usage » (analytique). Accepte une plage de dates
 * (ISO yyyy-MM-dd). Bucket quotidien si la plage <= 92 jours, sinon mensuel.
 * Fournit totaux, tendances vs période précédente, et répartitions.
 */
export async function getUsageData(
    startISO?: string,
    endISO?: string
): Promise<UsageData | null> {
    try {
        const session = await getSession();
        if (!session?.user?.email) throw new Error("Unauthorized");

        const appId = await getSelectedAppId();
        if (!appId) throw new Error("No application selected");

        const now = new Date();
        const end = endISO ? endOfDay(new Date(endISO)) : now;
        const start = startISO ? startOfDay(new Date(startISO)) : startOfDay(new Date(now.getTime() - 29 * 86400_000));

        const spanDays = Math.max(1, differenceInCalendarDays(end, start) + 1);
        const granularity: "day" | "month" = spanDays <= 92 ? "day" : "month";
        const keyOf = (d: Date) => (granularity === "day" ? format(d, "yyyy-MM-dd") : format(d, "yyyy-MM"));
        const labelOf = (d: Date) => (granularity === "day" ? format(d, "MMM d") : format(d, "MMM yy"));

        const [records, prevRecords] = await Promise.all([
            prisma.transaction.findMany({
                where: { applicationId: appId, createdAt: { gte: start, lte: end } },
                select: { amount: true, status: true, createdAt: true, provider: true, customerPhone: true, customerEmail: true },
            }),
            prisma.transaction.findMany({
                where: {
                    applicationId: appId,
                    createdAt: { gte: new Date(start.getTime() - spanDays * 86400_000), lt: start },
                },
                select: { amount: true, status: true },
            }),
        ]);

        // Buckets pré-remplis sur toute la plage.
        const buckets = new Map<string, UsagePoint>();
        const stops =
            granularity === "day"
                ? eachDayOfInterval({ start, end })
                : eachMonthOfInterval({ start: startOfMonth(start), end: startOfMonth(end) });
        for (const d of stops) {
            buckets.set(keyOf(d), { key: keyOf(d), label: labelOf(d), volume: 0, count: 0, success: 0, failed: 0 });
        }

        const providerAgg: Record<string, { volume: number; count: number }> = {};
        const countryAgg: Record<string, number> = {};
        const clients = new Set<string>();

        for (const r of records) {
            const b = buckets.get(keyOf(r.createdAt));
            if (b) {
                b.count += 1;
                if (r.status === "SUCCESS") {
                    b.success += 1;
                    b.volume += r.amount || 0;
                } else if (r.status === "FAILED") {
                    b.failed += 1;
                }
            }
            if (r.customerEmail) clients.add(r.customerEmail);
            if (r.status === "SUCCESS") {
                const prov = (r.provider || "").trim();
                if (!IGNORED_PROVIDERS.has(prov.toLowerCase()) && prov) {
                    providerAgg[prov] = providerAgg[prov] || { volume: 0, count: 0 };
                    providerAgg[prov].volume += r.amount || 0;
                    providerAgg[prov].count += 1;
                }
                const c = countryFromPhone(r.customerPhone);
                countryAgg[c] = (countryAgg[c] || 0) + (r.amount || 0);
            }
        }

        const series = Array.from(buckets.values());
        const totalSpend = series.reduce((s, p) => s + p.volume, 0);
        const totalTransactions = series.reduce((s, p) => s + p.count, 0);
        const totalSuccess = series.reduce((s, p) => s + p.success, 0);
        const totalFailed = series.reduce((s, p) => s + p.failed, 0);
        const activeUnits = series.filter((p) => p.volume > 0).length || 1;
        const avgPerDay = totalSpend / activeUnits;
        const successRate = totalTransactions > 0 ? (totalSuccess / totalTransactions) * 100 : 0;
        const avgTicket = totalSuccess > 0 ? totalSpend / totalSuccess : 0;

        // Période précédente (même durée) pour les tendances.
        const prevSpend = prevRecords.filter((r) => r.status === "SUCCESS").reduce((s, r) => s + (r.amount || 0), 0);
        const prevTx = prevRecords.length;
        const prevSuccess = prevRecords.filter((r) => r.status === "SUCCESS").length;
        const prevRate = prevTx > 0 ? (prevSuccess / prevTx) * 100 : 0;

        const monthStart = startOfMonth(now);
        const monthRecords = records.filter((r) => r.createdAt >= monthStart && r.status === "SUCCESS");
        const monthSpend = monthRecords.reduce((s, r) => s + (r.amount || 0), 0);
        const monthCount = monthRecords.length;

        const byProvider = Object.entries(providerAgg)
            .map(([name, v]) => ({ name, volume: v.volume, count: v.count }))
            .sort((a, b) => b.volume - a.volume)
            .slice(0, 6);
        const byCountry = Object.entries(countryAgg)
            .map(([name, volume]) => ({ name, volume }))
            .sort((a, b) => b.volume - a.volume)
            .slice(0, 6);

        return {
            currency: "XOF",
            totalSpend,
            avgPerDay,
            totalTransactions,
            totalSuccess,
            totalFailed,
            successRate,
            avgTicket,
            uniqueClients: clients.size,
            spendTrend: trend(totalSpend, prevSpend),
            txTrend: trend(totalTransactions, prevTx),
            successTrend: trend(successRate, prevRate),
            monthSpend,
            monthCount,
            rangeStart: format(start, "dd/MM/yy"),
            rangeEnd: format(end, "dd/MM/yy"),
            granularity,
            series,
            byProvider,
            byCountry,
        };
    } catch (error) {
        console.error("getUsageData failed:", error);
        return null;
    }
}
