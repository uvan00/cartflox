import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { sendFailureRateAlertEmail } from "@/lib/email";

const FAILURE_THRESHOLD = 0.10; // 10%
const WINDOW_MINUTES = 60;

// GET /api/alerts/failure-rate
// Called by Railway cron (every hour) or manually.
// Checks each application's failure rate over the last WINDOW_MINUTES.
// Sends an alert email to the merchant if failure rate > 10%.
export async function GET(req: NextRequest) {
    const cronSecret = req.headers.get("x-cron-secret");
    if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);

    const transactions = await prisma.transaction.groupBy({
        by: ["applicationId", "status"],
        where: { createdAt: { gte: since }, applicationId: { not: null } },
        _count: { id: true },
    });

    // Group by applicationId
    const byApp: Record<string, { total: number; failed: number }> = {};
    for (const row of transactions) {
        const appId = row.applicationId!;
        if (!byApp[appId]) byApp[appId] = { total: 0, failed: 0 };
        byApp[appId].total += row._count.id;
        if (row.status === "FAILED") byApp[appId].failed += row._count.id;
    }

    const alerts: string[] = [];

    for (const [appId, stats] of Object.entries(byApp)) {
        if (stats.total < 5) continue; // ignore apps with very low traffic
        const rate = stats.failed / stats.total;
        if (rate < FAILURE_THRESHOLD) continue;

        const app = await prisma.application.findUnique({
            where: { id: appId },
            select: { name: true, user: { select: { email: true, name: true } } },
        });
        if (!app?.user?.email) continue;

        const pct = Math.round(rate * 100);
        alerts.push(`${app.name} (${pct}%)`);

        await sendFailureRateAlertEmail({
            to: app.user.email,
            merchantName: app.name,
            failureRate: pct,
            failedCount: stats.failed,
            totalCount: stats.total,
            windowMinutes: WINDOW_MINUTES,
        }).catch((err: unknown) => console.error("[alert:failure-rate] email error", err));
    }

    return NextResponse.json({
        checked: Object.keys(byApp).length,
        alerts: alerts.length,
        triggered: alerts,
        window: `last ${WINDOW_MINUTES}min`,
    });
}
