import { NextRequest, NextResponse } from "next/server";
import { getCustomers } from "@/lib/actions/customers";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const page = Math.min(10_000, Math.max(1, parseInt(searchParams.get("page") || "1") || 1));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "50") || 50));

    try {
        const data = await getCustomers({ page, pageSize, search: search.slice(0, 120) });
        return NextResponse.json(data);
    } catch (error: any) {
        console.error("[customers]", error?.message);
        return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
    }
}
