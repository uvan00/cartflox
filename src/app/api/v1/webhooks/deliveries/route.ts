import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { authentifierRequete } from "@/lib/api-auth";
import { livraisonVersApi, EVENEMENTS } from "@/lib/webhook-dispatch";

/**
 * GET /api/v1/webhooks/deliveries
 * Journal des webhooks envoyes a l'espace, plus recents d'abord. Une cle de
 * test ne voit que les livraisons de test, une cle de production que celles
 * de production.
 *   ?transaction_id=   une transaction
 *   ?status=           pending | delivered | failed
 *   ?event=            payment.completed, ...
 *   ?limit=            50 par defaut, 200 au plus
 */
export async function GET(req: NextRequest) {
    const auth = await authentifierRequete(req);
    if (!auth) return NextResponse.json({ error: "Invalid API Key" }, { status: 401 });

    const q = req.nextUrl.searchParams;
    const limite = Math.min(200, Math.max(1, Number(q.get("limit")) || 50));
    const statut = (q.get("status") || "").toLowerCase();
    const evenement = q.get("event") || "";
    const transactionId = q.get("transaction_id") || "";

    if (statut && !["pending", "delivered", "failed"].includes(statut)) {
        return NextResponse.json({ error: "status must be pending, delivered or failed" }, { status: 400 });
    }
    if (evenement && !(EVENEMENTS as readonly string[]).includes(evenement)) {
        return NextResponse.json({ error: `Unknown event: ${evenement}`, available_events: [...EVENEMENTS] }, { status: 400 });
    }

    const lignes = await prisma.webhookDelivery.findMany({
        where: {
            applicationId: auth.applicationId,
            test: auth.test,
            ...(transactionId ? { transactionId } : {}),
            ...(evenement ? { event: evenement } : {}),
            ...(statut === "pending" ? { status: { in: ["PENDING", "SENDING"] } } : statut ? { status: statut.toUpperCase() } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: limite,
    });

    return NextResponse.json({ object: "list", data: lignes.map(livraisonVersApi), count: lignes.length });
}
