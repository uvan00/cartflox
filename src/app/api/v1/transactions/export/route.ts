import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import prisma from "@/lib/db";
import { getSelectedAppId } from "@/lib/actions/utils";

// GET /api/v1/transactions/export?format=csv&status=SUCCESS&from=2024-01-01&to=2024-12-31
export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const appId = await getSelectedAppId();
        if (!appId) {
            return NextResponse.json({ error: "No application selected" }, { status: 400 });
        }

        const { searchParams } = new URL(req.url);
        const format = searchParams.get("format") || "csv";
        const status = searchParams.get("status");
        const from = searchParams.get("from");
        const to = searchParams.get("to");
        const search = searchParams.get("search");

        const where: any = { applicationId: appId };
        if (status && status !== "ALL") where.status = status;
        if (from || to) {
            where.createdAt = {};
            if (from) where.createdAt.gte = new Date(from);
            if (to) {
                const toDate = new Date(to);
                toDate.setHours(23, 59, 59, 999);
                where.createdAt.lte = toDate;
            }
        }
        if (search) {
            where.OR = [
                { orderId: { contains: search, mode: "insensitive" } },
                { customerName: { contains: search, mode: "insensitive" } },
                { customerEmail: { contains: search, mode: "insensitive" } },
            ];
        }

        const transactions = await prisma.transaction.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: 10_000,
        });

        if (format === "json") {
            return NextResponse.json({ data: transactions, total: transactions.length });
        }

        // CSV format
        const headers = [
            "ID",
            "Order ID",
            "Status",
            "Amount",
            "Currency",
            "Provider",
            "Payment Type",
            "Customer Name",
            "Customer Email",
            "Customer Phone",
            "Provider Ref",
            "Created At",
            "Completed At",
        ];

        const rows = transactions.map((tx) => [
            tx.id,
            tx.orderId,
            tx.status,
            tx.amount.toString(),
            tx.currency,
            tx.provider || "",
            tx.paymentType || "",
            (tx as any).customerName || "",
            (tx as any).customerEmail || "",
            (tx as any).customerPhone || "",
            (tx as any).providerRef || "",
            tx.createdAt.toISOString(),
            (tx as any).completedAt ? new Date((tx as any).completedAt).toISOString() : "",
        ]);

        const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
        const csvLines = [
            headers.map(escape).join(","),
            ...rows.map((row) => row.map(escape).join(",")),
        ];
        const csv = csvLines.join("\n");

        const filename = `transactions_${appId}_${new Date().toISOString().split("T")[0]}.csv`;

        return new NextResponse(csv, {
            status: 200,
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename="${filename}"`,
                "Cache-Control": "no-store",
            },
        });
    } catch (error: any) {
        console.error("[export:transactions]", error);
        return NextResponse.json({ error: error.message || "Export failed" }, { status: 500 });
    }
}
