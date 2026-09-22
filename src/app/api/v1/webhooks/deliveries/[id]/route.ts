import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { authentifierRequete } from "@/lib/api-auth";
import { livraisonVersApi } from "@/lib/webhook-dispatch";

/** GET /api/v1/webhooks/deliveries/{id} : une livraison de l'espace. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await authentifierRequete(req);
    if (!auth) return NextResponse.json({ error: "Invalid API Key" }, { status: 401 });
    const { id } = await params;
    const livraison = await prisma.webhookDelivery.findFirst({ where: { id, applicationId: auth.applicationId, test: auth.test } });
    if (!livraison) return NextResponse.json({ error: "Delivery not found" }, { status: 404 });
    return NextResponse.json(livraisonVersApi(livraison));
}
