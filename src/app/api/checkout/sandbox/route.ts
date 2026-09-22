import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { dispatchOutgoingStatusWebhook } from "@/lib/transaction-finalize";
import { etatEspace } from "@/lib/mode-espace";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * POST /api/checkout/sandbox : denouement SIMULE d'un paiement, reserve aux
 * espaces en bac a sable. Sert au marchand qui integre Cartflox avant d'etre
 * verifie : il declenche lui-meme un succes ou un echec et recoit le webhook
 * exactement comme en production.
 *
 * Garde-fous, dans cet ordre : la transaction doit exister, elle doit etre
 * encore payable, et son espace doit etre EN BAC A SABLE. Un espace verifie se
 * voit refuser cette route : elle ne peut donc jamais fabriquer un vrai
 * encaissement. Aucun adaptateur d'agregateur n'est charge ici.
 */
export async function POST(req: NextRequest) {
    const ip = getClientIp(req);
    const rl = await rateLimit(`checkout_sandbox:${ip}`, { limit: 30, windowSec: 60 });
    if (!rl.allowed) {
        return NextResponse.json({ success: false, message: "Trop de requêtes." }, { status: 429 });
    }

    const corps = (await req.json().catch(() => null)) as any;
    const transactionId = String(corps?.transactionId || "");
    const issue = String(corps?.issue || "succes").toLowerCase();
    const details = (corps?.customerDetails && typeof corps.customerDetails === "object") ? corps.customerDetails : null;
    const methodCode = typeof corps?.methodCode === "string" ? corps.methodCode.slice(0, 80) : null;
    if (!transactionId) {
        return NextResponse.json({ success: false, message: "transactionId manquant" }, { status: 400 });
    }
    if (issue !== "succes" && issue !== "echec") {
        return NextResponse.json({ success: false, message: "issue doit valoir 'succes' ou 'echec'" }, { status: 400 });
    }

    const tx = await prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!tx) return NextResponse.json({ success: false, message: "Transaction introuvable" }, { status: 404 });
    if (tx.status === "SUCCESS" || tx.status === "REFUNDED" || tx.status === "CANCELLED") {
        return NextResponse.json({ success: false, message: "Cette transaction n'est plus payable." }, { status: 409 });
    }

    const etat = await etatEspace(tx.applicationId);
    if (!etat.bacASable && (tx as any).test !== true) {
        return NextResponse.json(
            { success: false, message: "Cet espace encaisse réellement : le mode test ne s'applique pas." },
            { status: 403 }
        );
    }

    const statut = issue === "succes" ? "SUCCESS" : "FAILED";
    const meta = (tx.metadata as any) || {};
    const majAt = new Date();
    const misAJour = await prisma.transaction.update({
        where: { id: tx.id },
        data: {
            status: statut as any,
            provider: "sandbox",
            test: true,
            completedAt: statut === "SUCCESS" ? majAt : null,
            ...(details?.name ? { customerName: String(details.name).slice(0, 120) } : {}),
            ...(details?.email ? { customerEmail: String(details.email).slice(0, 160) } : {}),
            ...(details?.phone ? { customerPhone: String(details.phone).slice(0, 32) } : {}),
            metadata: {
                ...meta,
                sandbox: true,
                ...(methodCode ? { methodCode } : {}),
                ...(statut === "FAILED"
                    ? { echec: { titre: "Paiement refusé (test)", detail: "Échec simulé en mode test.", action: null } }
                    : {}),
            },
        },
    });

    await dispatchOutgoingStatusWebhook(misAJour, statut, "sandbox").catch(() => { });

    return NextResponse.json({
        success: true,
        sandbox: true,
        status: statut,
        message:
            statut === "SUCCESS"
                ? "Paiement marqué réussi en mode test. Aucun argent n'a été encaissé."
                : "Paiement marqué en échec en mode test.",
    });
}
