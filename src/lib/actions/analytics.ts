"use server";

import prisma from "@/lib/db";
import { getSession } from "@/lib/session";
import { subDays, startOfDay, endOfDay, format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { fr } from "date-fns/locale";
import { getSelectedAppId } from "./utils";

export async function getAnalyticsData(days: number = 7) {
    try {
        const session = await getSession();
        if (!session?.user?.email) throw new Error("Unauthorized");

        const appId = await getSelectedAppId();
        if (!appId) throw new Error("No application selected");

        const now = new Date();
        const startDate = startOfDay(subDays(now, days));
        const prevStartDate = startOfDay(subDays(startDate, days));

        // Fetch current period data
        const currentRecords = await prisma.transaction.findMany({
            where: {
                applicationId: appId,
                createdAt: { gte: startDate }
            }
        });

        // Fetch previous period data for trends
        const prevRecords = await prisma.transaction.findMany({
            where: {
                applicationId: appId,
                createdAt: { gte: prevStartDate, lt: startDate }
            }
        });

        // 1. Calculate Metrics
        const calculateStats = (records: any[]) => {
            const success = records.filter(r => r.status === 'SUCCESS');
            const revenue = success.reduce((acc, r) => acc + r.amount, 0);
            const failureRate = records.length > 0 ? (records.filter(r => r.status === 'FAILED').length / records.length) * 100 : 0;
            const uniqueClients = new Set(records.map(r => r.customerEmail)).size;
            const avgVolume = uniqueClients > 0 ? revenue / uniqueClients : 0;

            // Average response time in seconds
            const responseTimes = success
                .filter(r => r.completedAt)
                .map(r => (r.completedAt!.getTime() - r.createdAt.getTime()) / 1000);
            const avgResponseTime = responseTimes.length > 0
                ? responseTimes.reduce((acc, t) => acc + t, 0) / responseTimes.length
                : 1.2; // fallback

            return { revenue, failureRate, avgVolume, avgResponseTime };
        };

        const currentStats = calculateStats(currentRecords);
        const prevStats = calculateStats(prevRecords);

        const getTrend = (curr: number, prev: number) => {
            if (prev === 0) return { val: "+0%", up: true };
            const diff = ((curr - prev) / prev) * 100;
            return {
                val: `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%`,
                up: diff >= 0
            };
        };

        // 2. Conversion Data (Area Chart)
        const conversionData = [];
        for (let i = days - 1; i >= 0; i--) {
            const date = subDays(now, i);
            const dayStart = startOfDay(date);
            const dayEnd = endOfDay(date);

            const dayRecords = currentRecords.filter((r: any) => r.createdAt >= dayStart && r.createdAt <= dayEnd);
            const daySuccess = dayRecords.filter((r: any) => r.status === 'SUCCESS').length;
            const rate = dayRecords.length > 0 ? (daySuccess / dayRecords.length) * 100 : 0;

            conversionData.push({
                name: format(date, 'eee', { locale: fr }),
                value: Math.round(rate)
            });
        }

        // 3. Gateway Mix (Pie Chart)
        const IGNORED_PROVIDERS = new Set(['cartflox', 'afriflow', '', 'pending', 'non attribué']);
        const gatewayCounts: Record<string, number> = {};
        currentRecords.forEach((r: any) => {
            const provider = (r.provider || "").trim();
            if (IGNORED_PROVIDERS.has(provider.toLowerCase())) return;
            if (!provider) return;
            gatewayCounts[provider] = (gatewayCounts[provider] || 0) + 1;
        });
        const gatewayMixData = Object.entries(gatewayCounts).map(([name, value]) => ({
            name,
            value
        })).sort((a, b) => b.value - a.value);

        // 4. Regional Volume (Bar Chart)
        const customersWithSuccess = await prisma.customer.findMany({
            where: { applicationId: appId },
            select: { id: true, country: true, email: true }
        });

        const regionVolume: Record<string, number> = {};
        currentRecords.filter((r: any) => r.status === 'SUCCESS').forEach((r: any) => {
            let country = "Autre";

            // 1. Try to infer from Phone Number
            const phone = r.customerPhone?.replace(/\D/g, '') || "";
            if (phone.startsWith('225')) country = "Côte d'Ivoire";
            else if (phone.startsWith('221')) country = "Sénégal";
            else if (phone.startsWith('229')) country = "Bénin";
            else if (phone.startsWith('237')) country = "Cameroun";
            else if (phone.startsWith('223')) country = "Mali";
            else if (phone.startsWith('226')) country = "Burkina Faso";
            else if (phone.startsWith('228')) country = "Togo";
            else if (phone.startsWith('241')) country = "Gabon";
            else if (phone.startsWith('242')) country = "Congo";
            else if (phone.startsWith('243')) country = "RDC";

            // 2. If phone didn't match, check provider/method hint if available
            if (country === "Autre" && r.provider) {
                const p = r.provider.toLowerCase();
                if (p.includes('ci') || p.includes('cote') || p.includes('ivory')) country = "Côte d'Ivoire";
                else if (p.includes('sn') || p.includes('senegal')) country = "Sénégal";
                else if (p.includes('bj') || p.includes('benin')) country = "Bénin";
                else if (p.includes('cm') || p.includes('cameroon')) country = "Cameroun";
            }

            // 3. Fallback to Customer Profile
            if (country === "Autre") {
                const customer = customersWithSuccess.find((c: any) => c.email === r.customerEmail);
                country = customer?.country || "Sénégal"; // Default to Senegal if truly unknown, as per user base
            }

            regionVolume[country] = (regionVolume[country] || 0) + r.amount;
        });

        const regionalData = Object.entries(regionVolume).map(([name, amount], i) => ({
            name,
            amount,
            color: `hsl(var(--chart-${(i % 5) + 1}))`
        })).sort((a, b) => b.amount - a.amount);

        return {
            stats: [
                { title: "Revenue Net", value: `${currentStats.revenue.toLocaleString()} F`, trend: getTrend(currentStats.revenue, prevStats.revenue).val, up: getTrend(currentStats.revenue, prevStats.revenue).up, icon: "zap" },
                { title: "Temps de Réponse", value: `${currentStats.avgResponseTime.toFixed(1)}s`, trend: `${(currentStats.avgResponseTime - prevStats.avgResponseTime).toFixed(1)}s`, up: currentStats.avgResponseTime <= prevStats.avgResponseTime, icon: "activity" },
                { title: "Taux d'Échec", value: `${currentStats.failureRate.toFixed(1)}%`, trend: getTrend(currentStats.failureRate, prevStats.failureRate).val, up: currentStats.failureRate <= prevStats.failureRate, icon: "trending-down" },
                { title: "Volume Moyen/Client", value: `${Math.round(currentStats.avgVolume).toLocaleString()} F`, trend: getTrend(currentStats.avgVolume, prevStats.avgVolume).val, up: getTrend(currentStats.avgVolume, prevStats.avgVolume).up, icon: "bar-chart" },
            ],
            conversionData,
            gatewayMixData,
            regionalData
        };
    } catch (error) {
        console.error("Failed to fetch analytics data:", error);
        throw error;
    }
}

/** Code ISO des pays deduits de l'indicatif, pour afficher leur drapeau. */
const CODES_PAYS: Record<string, string> = {
    "Côte d'Ivoire": "CI", "Sénégal": "SN", "Cameroun": "CM", "Mali": "ML",
    "Burkina Faso": "BF", "Bénin": "BJ", "Togo": "TG",
};

export async function getStatisticsData(startDate?: string, endDate?: string) {
    try {
        const session = await getSession();
        if (!session?.user?.email) throw new Error("Unauthorized");

        const appId = await getSelectedAppId();
        if (!appId) throw new Error("No application selected");

        const now = new Date();

        // ── Date range filter ─────────────────────────────────────────────
        const rangeFilter = startDate && endDate ? {
            gte: startOfDay(new Date(startDate)),
            lte: endOfDay(new Date(endDate)),
        } : undefined;

        // ── 1. All transactions for this app ──────────────────────────────
        const allTx = await prisma.transaction.findMany({
            where: { applicationId: appId, ...(rangeFilter ? { createdAt: rangeFilter } : {}) },
            select: {
                id: true, amount: true, status: true, provider: true,
                customerEmail: true, customerPhone: true,
                createdAt: true, completedAt: true,
            },
            orderBy: { createdAt: "asc" },
        });

        const successTx = allTx.filter(t => t.status === "SUCCESS");
        const failedTx  = allTx.filter(t => t.status === "FAILED");
        const pendingTx = allTx.filter(t => !["SUCCESS","FAILED"].includes(t.status));

        // ── 2. KPI cards ─────────────────────────────────────────────────
        const totalRevenue = successTx.reduce((s, t) => s + t.amount, 0);
        const totalTx      = allTx.length;
        const successRate  = totalTx > 0 ? (successTx.length / totalTx) * 100 : 0;
        const failureRate  = totalTx > 0 ? (failedTx.length / totalTx) * 100 : 0;
        const uniqueClients = new Set(allTx.map(t => t.customerEmail).filter(Boolean)).size;
        const avgTxValue   = successTx.length > 0 ? totalRevenue / successTx.length : 0;

        // Prev month comparison
        const thisMonthStart = startOfMonth(now);
        const prevMonthStart = startOfMonth(subMonths(now, 1));
        const prevMonthEnd   = endOfMonth(subMonths(now, 1));
        const txThisMonth = allTx.filter(t => t.createdAt >= thisMonthStart);
        const txPrevMonth = allTx.filter(t => t.createdAt >= prevMonthStart && t.createdAt <= prevMonthEnd);
        const revThisMonth = txThisMonth.filter(t => t.status === "SUCCESS").reduce((s,t) => s+t.amount, 0);
        const revPrevMonth = txPrevMonth.filter(t => t.status === "SUCCESS").reduce((s,t) => s+t.amount, 0);
        const revGrowth = revPrevMonth > 0 ? ((revThisMonth - revPrevMonth) / revPrevMonth * 100) : 0;
        const txGrowth  = txPrevMonth.length > 0 ? ((txThisMonth.length - txPrevMonth.length) / txPrevMonth.length * 100) : 0;

        // ── 3. Revenue by month (last 12 months) ─────────────────────────
        const revenueByMonth: Record<string, { Montant: number; Revenus: number; Dépenses: number; Profit: number }> = {};
        for (let m = 11; m >= 0; m--) {
            const mDate  = subMonths(now, m);
            const mStart = startOfMonth(mDate);
            const mEnd   = endOfMonth(mDate);
            const label  = format(mDate, "MMM", { locale: fr });
            const mTx    = allTx.filter(t => t.createdAt >= mStart && t.createdAt <= mEnd);
            const mRev   = mTx.filter(t => t.status === "SUCCESS").reduce((s, t) => s + t.amount, 0);
            const mFees  = mRev * 0.02; // 2% estimated fees
            revenueByMonth[label] = {
                Montant:  mRev,
                Revenus:  parseFloat((mRev / 1_000_000).toFixed(2)),
                Dépenses: parseFloat((mFees / 1_000_000).toFixed(2)),
                Profit:   parseFloat(((mRev - mFees) / 1_000_000).toFixed(2)),
            };
        }
        const revenueData = Object.entries(revenueByMonth).map(([month, v]) => ({ month, ...v }));

        // ── 4. Daily transactions (last 7 days) ──────────────────────────
        const dailyData = [];
        for (let d = 6; d >= 0; d--) {
            const date  = subDays(now, d);
            const dStart = startOfDay(date);
            const dEnd   = endOfDay(date);
            const label  = format(date, "EEE", { locale: fr });
            const dTx    = allTx.filter(t => t.createdAt >= dStart && t.createdAt <= dEnd);
            dailyData.push({
                day:      label,
                Réussi:   dTx.filter(t => t.status === "SUCCESS").length,
                Échec:    dTx.filter(t => t.status === "FAILED").length,
                Attente:  dTx.filter(t => !["SUCCESS","FAILED"].includes(t.status)).length,
            });
        }

        // ── 5. Hourly activity (today) ────────────────────────────────────
        const todayStart = startOfDay(now);
        const todayTx    = allTx.filter(t => t.createdAt >= todayStart);
        const hourlyData = Array.from({ length: 24 }, (_, h) => {
            const count = todayTx.filter(t => t.createdAt.getHours() === h).length;
            return { heure: `${String(h).padStart(2, "0")}h`, Transactions: count };
        });

        // ── 6. Gateway donut ─────────────────────────────────────────────
        const IGNORED_PROVIDERS = new Set(['cartflox', 'afriflow', '', 'pending', 'non attribué']);
        const gatewayCounts: Record<string, number> = {};
        allTx.forEach(t => {
            const p = t.provider?.trim() || "";
            if (IGNORED_PROVIDERS.has(p.toLowerCase())) return;
            gatewayCounts[p] = (gatewayCounts[p] || 0) + 1;
        });
        const donutData = Object.entries(gatewayCounts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 6);

        // ── 7. Conversion funnel ──────────────────────────────────────────
        const initiated  = allTx.length;
        const inProgress = allTx.filter(t => t.status === "PENDING").length + successTx.length + failedTx.length;
        const succeeded  = successTx.length;
        const funnelData = [
            { name: "Initiées", value: initiated },
            { name: "Traitées", value: inProgress },
            { name: "Réussies", value: succeeded },
        ];

        // ── 8. Top countries by revenue ──────────────────────────────────
        const countryRevenue: Record<string, number> = {};
        const realSuccessTx = successTx.filter(t => {
            const p = t.provider?.trim().toLowerCase() || "";
            return !IGNORED_PROVIDERS.has(p);
        });
        realSuccessTx.forEach(t => {
            let country = "Autre";
            const phone = (t.customerPhone || "").replace(/\D/g, "");
            if (phone.startsWith("225"))      country = "Côte d'Ivoire";
            else if (phone.startsWith("221")) country = "Sénégal";
            else if (phone.startsWith("237")) country = "Cameroun";
            else if (phone.startsWith("223")) country = "Mali";
            else if (phone.startsWith("226")) country = "Burkina Faso";
            else if (phone.startsWith("229")) country = "Bénin";
            else if (phone.startsWith("228")) country = "Togo";
            countryRevenue[country] = (countryRevenue[country] || 0) + t.amount;
        });
        const topCountriesBarList = Object.entries(countryRevenue)
            .map(([name, value]) => ({ name, value, code: CODES_PAYS[name] || "" }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 6);

        // ── 9. Top merchants (by customerEmail as proxy) ─────────────────
        const merchantRevenue: Record<string, number> = {};
        successTx.forEach(t => {
            const key = t.customerEmail || "Inconnu";
            merchantRevenue[key] = (merchantRevenue[key] || 0) + t.amount;
        });
        const topMerchantsBarList = Object.entries(merchantRevenue)
            .map(([name, value]) => ({ name: name.split("@")[0], value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5);

        // ── 10. Sparkline (last 12 months tx count) ──────────────────────
        const sparkData = Array.from({ length: 12 }, (_, m) => {
            const mDate  = subMonths(now, 11 - m);
            const mStart = startOfMonth(mDate);
            const mEnd   = endOfMonth(mDate);
            return allTx.filter(t => t.createdAt >= mStart && t.createdAt <= mEnd).length;
        });

        // ── 11. Gateway uptime tracker (simulate from success rate per day last 30d) ─
        const trackerData = Array.from({ length: 30 }, (_, d) => {
            const date  = subDays(now, 29 - d);
            const dStart = startOfDay(date);
            const dEnd   = endOfDay(date);
            const dTx    = allTx.filter(t => t.createdAt >= dStart && t.createdAt <= dEnd);
            if (dTx.length === 0) return { color: "gray", tooltip: "Aucune activité" };
            const rate = dTx.filter(t => t.status === "SUCCESS").length / dTx.length;
            if (rate >= 0.9)  return { color: "emerald", tooltip: `${Math.round(rate*100)}% succès` };
            if (rate >= 0.7)  return { color: "yellow",  tooltip: `${Math.round(rate*100)}% succès` };
            return { color: "red", tooltip: `${Math.round(rate*100)}% succès` };
        });

        const fmt = (v: number) =>
            v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M`
            : v >= 1_000   ? `${(v/1_000).toFixed(0)}K`
            : String(Math.round(v));

        return {
            kpis: {
                totalRevenue,
                totalTx,
                successRate,
                failureRate,
                uniqueClients,
                avgTxValue,
                revGrowth,
                txGrowth,
            },
            revenueData,
            dailyData,
            hourlyData,
            donutData,
            funnelData,
            topCountriesBarList,
            topMerchantsBarList,
            sparkData,
            trackerData,
            fmtRevenue: fmt(totalRevenue),
            fmtAvg: fmt(avgTxValue),
        };
    } catch (error) {
        console.error("Failed to fetch statistics data:", error);
        return null;
    }
}
