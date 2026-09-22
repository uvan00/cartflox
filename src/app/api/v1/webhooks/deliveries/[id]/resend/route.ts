import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { authentifierRequete } from "@/lib/api-auth";
import { rateLimit } from "@/lib/rate-limit";
import { livraisonVersApi, tenterLivraison } from "@/lib/webhook-dispatch";

/**
 * POST /api/v1/webhooks/deliveries/{id}/resend
 * Renvoie tout de suite une livraison, quel que soit son etat (deja livree,
 * abandonnee ou en attente), avec une signature fraiche, vers l'adresse
 * ACTUELLE de l'espace. Repond la livraison mise a jour.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await authentifierRequete(req);
    if (!auth) return NextResponse.json({ error: "Invalid API Key" }, { status: 401 });

    const limite = await rateLimit(`webhook_resend:${auth.applicationId}`, { limit: 30, windowSec: 60 });
    if (!limite.allowed) {
        return NextResponse.json({ error: "Too many resends: 30 per minute at most.", code: "rate_limited" }, { status: 429 });
    }

    const { id } = await params;
    const livraison = await prisma.webhookDelivery.findFirst({ where: { id, applicationId: auth.applicationId, test: auth.test } });
    if (!livraison) return NextResponse.json({ error: "Delivery not found" }, { status: 404 });

    const resultat = await tenterLivraison(id, { manuel: true });
    return NextResponse.json(livraisonVersApi(resultat || livraison));
}
