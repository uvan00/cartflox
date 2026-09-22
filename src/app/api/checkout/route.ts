import { NextRequest, NextResponse } from "next/server";

// Deprecated — use /api/checkout/initiate instead
export async function POST(_req: NextRequest) {
    return NextResponse.json({ error: "Deprecated. Use /api/checkout/initiate" }, { status: 410 });
}
