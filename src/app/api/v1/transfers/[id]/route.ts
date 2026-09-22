import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { versApi } from "@/lib/transferts";
import { authentifierApiTransferts } from "@/lib/transferts/auth-api";

/** GET /api/v1/transfers/{id} : par identifiant Cartflox ou par reference. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = await authentifierApiTransferts(req);
    if (auth instanceof NextResponse) return auth;
    const { id } = await params;
    const t = await prisma.transfert.findFirst({ where: { applicationId: auth.applicationId, OR: [{ id }, { reference: id }] } });
    if (!t) return NextResponse.json({ error: "Transfert introuvable.", code: "not_found" }, { status: 404 });
    return NextResponse.json(versApi(t));
}
