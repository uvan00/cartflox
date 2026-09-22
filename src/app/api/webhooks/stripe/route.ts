import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import prisma from "@/lib/db";
import { applyVerificationResult } from "@/lib/transaction-finalize";
import logger from "@/lib/logger";

/**
 * Webhook Stripe des PAIEMENTS CLIENTS (carte).
 *
 * À ne pas confondre avec /api/stripe/webhook, qui ne traite que les ABONNEMENTS
 * de Cartflox lui-même.
 *
 * Pourquoi cette route existe : sans elle, un paiement carte n'était connu que
 * si quelqu'un interrogeait Stripe au bon moment. Le cron rendant le statut
 * terminal au bout de 30 min, des paiements RÉELLEMENT ENCAISSÉS sont restés
 * « annulés » et des clients n'ont jamais été livrés (3 cas constatés entre le
 * 15/07 et le 06/08/2026). Stripe nous prévient désormais directement.
 *
 * Le statut n'est jamais pris depuis le corps du message : on RE-INTERROGE
 * Stripe avec l'identifiant reçu, puis on passe par `applyVerificationResult`,
 * le même point de sortie que le cron et le polling (emails, notification et
 * webhook marchand compris, sans doublon).
 */
export async function POST(req: NextRequest) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!secret || !apiKey) {
        // Jamais de repli sans vérification : un webhook non signé serait
        // trivialement falsifiable (n'importe qui marquerait ses achats payés).
        logger.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET ou STRIPE_SECRET_KEY manquant");
        return NextResponse.json({ error: "Webhook non configuré" }, { status: 500 });
    }

    const stripe = new Stripe(apiKey, { apiVersion: "2025-12-15.clover" as any });
    const rawBody = await req.text();
    const signature = req.headers.get("stripe-signature") || "";

    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch (err: any) {
        logger.warn("[stripe-webhook] signature invalide", { err: String(err?.message) });
        return NextResponse.json({ error: "Signature invalide" }, { status: 400 });
    }

    // On ne traite que ce qui change l'état d'un paiement client.
    const HANDLED = ["payment_intent.succeeded", "payment_intent.payment_failed", "charge.refunded"];
    if (!HANDLED.includes(event.type)) {
        return NextResponse.json({ received: true, ignored: event.type });
    }

    try {
        const object: any = event.data.object;
        const intentId: string | undefined =
            event.type === "charge.refunded" ? object.payment_intent : object.id;
        const orderId: string | undefined = object.metadata?.orderId;

        if (!intentId && !orderId) {
            return NextResponse.json({ received: true, ignored: "aucune référence" });
        }

        // Retrouver la transaction : par référence fournisseur, sinon par le
        // numéro de commande posé dans les métadonnées à la création.
        const tx = await prisma.transaction.findFirst({
            where: {
                OR: [
                    ...(intentId ? [{ providerRef: intentId }] : []),
                    ...(orderId ? [{ orderId }] : []),
                ],
            },
        });
        if (!tx) {
            logger.warn("[stripe-webhook] transaction introuvable", { intentId, orderId, type: event.type });
            return NextResponse.json({ received: true, ignored: "transaction introuvable" });
        }

        // Source de vérité : Stripe, pas le corps du message.
        let status: "SUCCESS" | "FAILED" | "REFUNDED" | "PENDING" = "PENDING";
        let rawData: any = object;
        if (event.type === "charge.refunded") {
            status = "REFUNDED";
        } else if (intentId) {
            const intent = await stripe.paymentIntents.retrieve(intentId);
            rawData = intent;
            if (intent.status === "succeeded") status = "SUCCESS";
            else if (intent.status === "canceled") status = "FAILED";
            else if (event.type === "payment_intent.payment_failed") status = "FAILED";
            else status = "PENDING";
        }

        if (status === "PENDING") {
            return NextResponse.json({ received: true, ignored: "statut non final" });
        }

        // Si la référence manquait sur la transaction, on la fixe : le cron
        // pourra la re-vérifier plus tard, et on garde la piste d'audit.
        if (intentId && !tx.providerRef) {
            await prisma.transaction.update({ where: { id: tx.id }, data: { providerRef: intentId } });
            (tx as any).providerRef = intentId;
        }

        const updated = await applyVerificationResult(
            tx,
            { transactionId: tx.id, providerReference: intentId || tx.providerRef || "", status, rawData } as any,
            "stripe-webhook"
        );

        logger.info("[stripe-webhook] traité", {
            txId: tx.id, type: event.type, avant: tx.status, apres: updated.status,
        });
        return NextResponse.json({ received: true, txId: tx.id, status: updated.status });
    } catch (err: any) {
        // On répond 500 pour que Stripe REESSAIE : perdre un succès coûte un
        // client non livré.
        logger.error("[stripe-webhook] erreur de traitement", { err: String(err?.message) });
        return NextResponse.json({ error: "Erreur de traitement" }, { status: 500 });
    }
}
