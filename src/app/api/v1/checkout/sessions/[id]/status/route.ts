import { NextResponse } from "next/server";
import { authenticateApiKey, authenticatePublicKey, estClePublique } from "@/lib/api-auth";
import { getCorsHeaders, corsPreflightResponse } from "@/lib/cors";
import { getPublicTransaction } from "@/lib/actions/transactions";

// GET /api/v1/checkout/sessions/[id]/status
// Statut de la session pour polling. Auth: cle secrete API, comme POST /sessions.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const origin = req.headers.get("origin");
    try {
        const { id } = await params;
        const h = req.headers.get("authorization");
        const k = req.headers.get("x-api-key");
        const secret = h && h.startsWith("Bearer ") ? h.split(" ")[1] : (k || "");
        if (!secret) {
            return NextResponse.json({ error: "Missing API key. Use Authorization: Bearer <key> or x-api-key header." }, { status: 401, headers: getCorsHeaders(origin, null) });
        }
        // Cle secrete, ou cle publique (SoftPay : lecture seule d'une session
        // dont l'identifiant n'est pas devinable).
        let auth = await authenticateApiKey(secret);
        if (!auth && estClePublique(secret)) auth = await authenticatePublicKey(secret);
        if (!auth) {
            return NextResponse.json({ error: "Invalid API Key" }, { status: 401, headers: getCorsHeaders(origin, null) });
        }
        const tx: any = await getPublicTransaction(id);
        // Une cle de test ne voit que des sessions de test, et inversement.
        if (!tx || tx.applicationId !== auth.applicationId || (tx.test === true) !== auth.test) {
            return NextResponse.json({ error: "Session introuvable" }, { status: 404, headers: getCorsHeaders(origin, null) });
        }
        const status = String(tx.status || "PENDING").toUpperCase();
        return NextResponse.json({
            id: tx.id,
            status,
            paid: status === "SUCCESS",
            livemode: tx.test !== true,
            amount: tx.amount,
            currency: tx.currency,
            order_id: tx.orderId,
            provider: tx.provider || null,
            provider_reference: tx.providerRef || null,
            // Pourquoi le paiement a echoue, dit par le fournisseur et traduit (metadata.echec).
            failure_message: tx.metadata?.echec ? [tx.metadata.echec.message, tx.metadata.echec.action].filter(Boolean).join(" ") || null : null,
            // Ce que l'acheteur doit encore faire (code a saisir, USSD, redirection),
            // quand le fournisseur ne l'a dit qu'apres l'initiation.
            next_action: tx.attente ? {
                type: tx.attente.type,
                message: tx.attente.message || null,
                ussd_code: tx.attente.ussdCode || null,
                url: tx.attente.url || null,
                application: tx.attente.application || null,
            } : null,
        }, { status: 200, headers: getCorsHeaders(origin, null) });
    } catch (e: any) {
        return NextResponse.json({ error: (e && e.message) || "Erreur" }, { status: 500, headers: getCorsHeaders(origin, null) });
    }
}

export async function OPTIONS(req: Request) {
    return corsPreflightResponse(req.headers.get("origin"), null);
}
