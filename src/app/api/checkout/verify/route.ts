import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getAdapterForTransaction, applyVerificationResult } from "@/lib/transaction-finalize";

/**
 * POST /api/checkout/verify  { transactionId }
 *
 * Vérification active du statut d'une transaction auprès du provider, puis
 * finalisation partagée (applyVerificationResult : maj atomique du statut +
 * emails + webhook marchand + notification). Utilisé par le paiement carte
 * EMBARQUÉ : après que le client a confirmé le PaymentIntent Stripe côté
 * navigateur, on confirme immédiatement côté serveur sans attendre le cron.
 *
 * Endpoint public (comme /api/checkout/initiate) : il ne fait que refléter la
 * vérité du provider et ne peut jamais marquer payé une transaction non payée.
 */
export async function POST(req: NextRequest) {
    try {
        const ip = getClientIp(req);
        const rl = await rateLimit(`checkout_verify:${ip}`, { limit: 60, windowSec: 60 });
        if (!rl.allowed) {
            return NextResponse.json(
                { success: false, message: "Too many requests. Please retry later." },
                { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
            );
        }

        const body = (await req.json()) as any;
        const transactionId = body?.transactionId;
        if (!transactionId) {
            return NextResponse.json({ success: false, message: "transactionId manquant" }, { status: 400 });
        }

        const tx = await prisma.transaction.findUnique({ where: { id: transactionId } });
        if (!tx) {
            return NextResponse.json({ success: false, message: "Transaction introuvable" }, { status: 404 });
        }

        // Déjà finalisée : renvoyer l'état tel quel (idempotent).
        if (["SUCCESS", "REFUNDED", "CANCELLED", "FAILED"].includes(tx.status)) {
            return NextResponse.json({ success: true, status: tx.status, paid: tx.status === "SUCCESS" });
        }

        // Pas encore de référence provider (paiement pas encore initié).
        if (!tx.providerRef) {
            return NextResponse.json({ success: true, status: tx.status, paid: false });
        }

        const adapter = await getAdapterForTransaction(tx);
        if (!adapter) {
            return NextResponse.json({ success: true, status: tx.status, paid: false });
        }

        const verification = await adapter.verifyPayment(tx.providerRef);
        const updated = await applyVerificationResult(tx, verification, "inline-verify");
        const status = String(updated.status || tx.status).toUpperCase();

        return NextResponse.json({ success: true, status, paid: status === "SUCCESS" });
    } catch (e: any) {
        return NextResponse.json({ success: false, message: e?.message || "Erreur" }, { status: 500 });
    }
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204 });
}
