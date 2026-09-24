import { NextRequest, NextResponse } from "next/server";
import { PaymentOrchestratorFactory } from "@/lib/orchestrator/factory";
import prisma from "@/lib/db";
import { overlayTestKeys, decryptSecret, porteeDePasserelle } from "@/lib/gateway-credentials";
import { applyVerificationResult } from "@/lib/transaction-finalize";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyWebhookSignature } from "@/lib/webhook-verify";
import { buildAdapterConfig } from "@/lib/orchestrator/executor";
import { createNotification } from "@/lib/notifications";
import logger from "@/lib/logger";

/**
 * Chaque webhook recu est journalise dans WebhookEvent (agregateur, corps,
 * quelques en-tetes, issue) : la page de statut publique et la page Sante de
 * l'admin lisaient cette table sans que personne n'y ecrive jamais.
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ provider: string }> }
) {
    const { provider: providerName } = await params;
    // Chaque appel ecrit une ligne de journal et peut interroger l'API du
    // fournisseur avec les cles du marchand : une limite par connexion evite
    // qu'un tiers fasse bannir le marchand chez son agregateur.
    const limite = await rateLimit(`webhook:${getClientIp(req)}:${providerName.toLowerCase()}`, { limit: 120, windowSec: 60 });
    if (!limite.allowed) return NextResponse.json({ received: false, error: "Too many requests" }, { status: 429 });
    // Read raw body once for signature verification
    const rawBody = await req.text();
    const headers = Object.fromEntries(req.headers.entries());
    let reponse: NextResponse;
    const contexte = { avertissement: "" };
    try {
        reponse = await traiter(providerName, rawBody, headers, contexte);
    } catch (error: any) {
        console.error("Webhook Error:", error);
        reponse = NextResponse.json({ success: false, error: error.message || "Webhook processing failed" }, { status: 400 });
    }
    journaliserWebhook(providerName, rawBody, headers, reponse, contexte.avertissement).catch(() => {});
    return reponse;
}

/**
 * Fournisseurs dont l'adaptateur ne croit RIEN du corps recu : il relit l'etat
 * aupres de l'API avant toute decision. Pour eux, un secret de webhook mal
 * saisi ne doit pas faire perdre les evenements : on traite comme sans
 * signature, on le note dans le journal et on previent le marchand.
 */
const REVERIFIE_PAR_API = new Set(["hub2", "pawapay", "feexpay"]);

async function prevenirSecretWebhook(applicationId: string | null | undefined, passerelle: string) {
    if (!applicationId) return;
    const app = await prisma.application.findUnique({ where: { id: applicationId }, select: { userId: true } });
    if (!app?.userId) return;
    const title = `Secret de webhook ${passerelle} à vérifier`;
    const recent = await (prisma as any).notification.findFirst({
        where: { userId: app.userId, title, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
    if (recent) return;
    await createNotification({
        userId: app.userId,
        type: "system",
        title,
        body: `Le secret de webhook saisi pour ${passerelle} ne correspond pas aux signatures reçues. Recopiez le secret affiché par ${passerelle} à la création du webhook, ou videz le champ. En attendant, chaque événement est confirmé par un appel à l'API avant d'être pris en compte.`,
        link: "/gateways",
    });
}

const EN_TETES_GARDEES = ["content-type", "user-agent", "cf-connecting-ip", "x-forwarded-for", "x-request-id"];

async function journaliserWebhook(provider: string, rawBody: string, headers: Record<string, string>, reponse: NextResponse, avertissement = "") {
    const corps: any = await reponse.clone().json().catch(() => null);
    const code = reponse.status;
    const status = code >= 400 ? "FAILED" : corps?.ignored ? "IGNORED" : "PROCESSED";
    const issue = code >= 400 ? String(corps?.error || corps?.message || `HTTP ${code}`) : corps?.ignored ? `ignoré : ${corps.ignored}` : "";
    const error = [issue, avertissement].filter(Boolean).join(" ; ") || null;
    let payload: any;
    try { payload = JSON.parse(rawBody); } catch { payload = { texte: rawBody.slice(0, 4000) }; }
    if (rawBody.length > 20000) payload = { tronque: true, texte: rawBody.slice(0, 20000) };
    // Les en-tetes utiles au diagnostic seulement : jamais un secret en clair (iPay
    // envoie le sien dans `secret-hash`).
    const entetes: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
        const cle = k.toLowerCase();
        if (EN_TETES_GARDEES.includes(cle) || ((cle.includes("signature") || cle.includes("hmac")) && !cle.includes("secret"))) entetes[cle] = String(v).slice(0, 200);
    }
    await prisma.webhookEvent.create({
        data: { provider: provider.toLowerCase(), payload, headers: entetes, status, error, processedAt: new Date() },
    });
}

async function traiter(providerName: string, rawBody: string, headers: Record<string, string>, contexte: { avertissement: string }): Promise<NextResponse> {
    try {
        let payload: any;
        try {
            payload = JSON.parse(rawBody);
        } catch {
            payload = parseFormEncoded(rawBody);
        }

        // 1. Identify the record to get the userId
        // (Note: This depends on the provider implementation. Most send a reference.)
        // For this orchestration, we'll try to find the record first.
        const tempPayload = payload.data || payload;

        // Rappel d'un TRANSFERT sortant : `payoutId` a la place de `depositId`.
        // Le corps n'est pas signe : on ne le croit pas, on redemande l'etat
        // au fournisseur avec notre reference.
        if (tempPayload.payoutId && !tempPayload.depositId) {
            const { traiterCallbackTransfert } = await import("@/lib/transferts");
            const issue = await traiterCallbackTransfert(providerName, tempPayload);
            return NextResponse.json(issue, { status: issue.received ? 200 : 404 });
        }
        // Hub2 : { type: 'payment_intent.*', data: { id: 'pi_…', token: <JWT> } } ou
        // { type: 'payment.*', data: { id: 'pay_…', intentId: 'pi_…' } }. L'intention
        // est notre providerRef ; sans ce cas, le jeton passait pour la reference.
        const estHub2 = providerName.toLowerCase() === "hub2";
        const refHub2 = estHub2
            ? [tempPayload.id, tempPayload.intentId, tempPayload.paymentIntentId].find((v) => typeof v === "string" && v.startsWith("pi_")) || null
            : null;
        // Plusieurs tentatives = plusieurs intentions pour une meme session, et la
        // transaction ne garde que la derniere. Les evenements payment_intent.*
        // portent purchaseReference = H2_<orderId>_<horodatage> : la commande
        // retrouve la transaction quelle que soit la tentative.
        const commandeHub2 = estHub2 ? (/^H2_(.+)_\d{13}$/.exec(String(tempPayload.purchaseReference || ""))?.[1] || null) : null;
        const potentialRef = refHub2 || commandeHub2 || tempPayload.depositId || tempPayload.order_id || tempPayload.token
            || tempPayload.invoice_token || tempPayload.invoice?.token
            || tempPayload.custom_data?.order_id || tempPayload.metadata?.orderId
            || tempPayload.cpm_trans_id
            // Wave (client_reference = notre orderId), PayTech (ref_command), Magma OnePay,
            // Djamo (externalId), iPay Money (external_reference).
            || tempPayload.client_reference || tempPayload.ref_command || tempPayload.merchant_transaction_id
            || tempPayload.externalId || tempPayload.external_reference || tempPayload.payment_token
            // FeexPay : callback_info = notre orderId, reference = sa reference (notre providerRef).
            || tempPayload.callback_info || tempPayload.reference
            // PayPal : la commande (notre providerRef) ou notre orderId (custom_id) dans `resource`.
            || tempPayload.resource?.supplementary_data?.related_ids?.order_id || tempPayload.resource?.custom_id
            || (String(tempPayload.event_type || "").toUpperCase().startsWith("CHECKOUT.ORDER") ? tempPayload.resource?.id : null);

        // Without a reference, the OR-filter below would be empty and match an
        // arbitrary transaction — never let that happen.
        if (!potentialRef) {
            console.error(`[Webhook] No transaction reference in ${providerName} payload`);
            return NextResponse.json({ received: false, error: "No transaction reference" }, { status: 400 });
        }

        const references = [potentialRef, commandeHub2].filter((r): r is string => !!r);
        const record = await prisma.transaction.findFirst({
            where: { OR: references.flatMap((r) => [{ orderId: r }, { providerRef: r }]) } as any,
            orderBy: { createdAt: "desc" },
        });

        if (!record) {
            if (estHub2) {
                // Tentative remplacee (ancienne intention sans reference de commande) ou
                // paiement fait hors Cartflox sur le meme compte Hub2 : rien a faire, et
                // on repond 200 pour que Hub2 ne rejoue pas l'evenement.
                logger.info("[webhook] hub2 : intention inconnue, ignoree", { ref: potentialRef, type: payload?.type });
                return NextResponse.json({ received: true, ignored: "unknown_reference" });
            }
            console.error(`[Webhook] No record found for ref: ${potentialRef}`);
            return NextResponse.json({ received: false, error: "Record not found" }, { status: 404 });
        }

        // 2. Fetch the gateway config that processed this transaction.
        // Scoped to the transaction's application — Transaction/Gateway have no
        // userId field, and an unscoped name-only lookup would pick up another
        // tenant's credentials.
        // La transaction connait sa passerelle : c'est la premiere source. La
        // recherche par nom vient en repli, et elle est ambigue des qu'un espace a
        // plusieurs passerelles d'une meme famille (« Hub2 Côte d'Ivoire » et
        // « Hub2 Sénégal ») ou des noms qui se contiennent (« Wave », « Flutterwave »).
        const recordMeta = (record.metadata as any) || {};
        let gateway = recordMeta.gatewayId
            ? await (prisma as any).gateway.findFirst({ where: { id: recordMeta.gatewayId, applicationId: record.applicationId } }).catch(() => null)
            : null;
        if (!gateway) {
            gateway = await (prisma as any).gateway.findFirst({
                where: {
                    applicationId: record.applicationId,
                    name: { contains: providerName, mode: 'insensitive' }
                }
            });
        }

        // overlayTestKeys decrypts config secrets + overlays sandbox keys.
        // The column fallback is decrypted explicitly (legacy plaintext passes through).
        const porteePasserelle = porteeDePasserelle(gateway);
        const config = gateway?.config ? overlayTestKeys(gateway.config, porteePasserelle) : (gateway?.apiKey ? {
            apiKey: decryptSecret(gateway.apiKey, porteePasserelle),
            apiSecret: decryptSecret(gateway.apiSecret, porteePasserelle)
        } : {});

        // 2b. Verify webhook signature (HMAC per provider)
        let sigValid = verifyWebhookSignature(providerName, rawBody, headers, config);
        if (sigValid === false) {
            if (REVERIFIE_PAR_API.has(providerName.toLowerCase())) {
                logger.warn("[webhook] signature invalide : secret de webhook a verifier, evenement traite apres verification API", { provider: providerName, txId: record.id });
                contexte.avertissement = "signature invalide : secret de webhook à vérifier, événement traité après vérification auprès de l'API";
                sigValid = null;
                prevenirSecretWebhook(record.applicationId, gateway?.name || providerName).catch(() => { });
            } else {
                console.warn(`[Webhook] Invalid signature from ${providerName} for tx ${potentialRef}`);
                return NextResponse.json({ received: false, error: "Invalid signature" }, { status: 401 });
            }
        }
        if (sigValid === null) {
            console.log(`[Webhook] No signature verification for ${providerName} (not supported)`);
        }

        // 3. Get the provider adapter with user-specific config
        // L'adaptateur recoit la meme configuration qu'a l'encaissement (cles en
        // colonnes ou dans config, cles de test en mode test) ; la config brute ne
        // sert qu'a la verification de signature ci-dessus.
        let configAdaptateur: any = config;
        try {
            if (gateway) configAdaptateur = buildAdapterConfig(gateway, providerName);
        } catch (e: any) {
            logger.warn("[webhook] adapter config fallback", { provider: providerName, error: e?.message });
        }
        const provider = PaymentOrchestratorFactory.getProvider(providerName, configAdaptateur);

        // 4. Normalize the webhook data via adapter
        const result = await provider.handleWebhook(payload, headers);

        // Hub2 : un evenement d'une ANCIENNE intention (tentative remplacee) ne doit
        // pas faire echouer la transaction pendant que l'acheteur reessaie. Seul un
        // succes compte, et il est reverifie plus bas aupres de Hub2 sur cette
        // intention-la : un client qui a paye a la premiere tentative est credite.
        if (estHub2 && record.providerRef && result.providerReference && result.providerReference !== record.providerRef && result.status !== 'SUCCESS') {
            logger.info("[webhook] hub2 : evenement d'une tentative remplacee, ignore", { txId: record.id, intention: result.providerReference, courante: record.providerRef, statut: result.status });
            return NextResponse.json({ received: true, ignored: "superseded_intent" });
        }

        // Un statut deja tenu : rien a faire (idempotence).
        if (record.status === result.status) {
            return NextResponse.json({ received: true, ignored: "no_change" });
        }

        // SECURITE : quand la signature n'est pas prouvee, le corps est ecrit par
        // qui veut. On ne le croit pour RIEN : l'etat est relu aupres du fournisseur
        // sur NOTRE reference (celle posee a l'initiation), jamais sur une reference
        // prise dans le corps. Avant, le succes d'un petit paiement d'un autre
        // acheteur, cite dans le corps, confirmait n'importe quelle commande ; et un
        // echec forge faisait echouer un paiement en cours. Sans reference, un succes
        // est invérifiable (refus) et un echec attend le sondage.
        let resultat = result;
        if (sigValid !== true) {
            if (!record.providerRef) {
                if (result.status === 'SUCCESS') {
                    logger.warn("[webhook] succes non signe sans reference fournisseur : refuse", { txId: record.id, provider: providerName });
                    return NextResponse.json({ received: true, ignored: "unverified_success" }, { status: 202 });
                }
                return NextResponse.json({ received: true, ignored: "unsigned_without_reference" }, { status: 202 });
            }
            try {
                const verified = await provider.verifyPayment(record.providerRef);
                if (!verified || verified.rawData?.error) {
                    logger.warn("[webhook] relecture impossible aupres du fournisseur", { txId: record.id, provider: providerName, error: verified?.rawData?.error });
                    return NextResponse.json({ received: false, error: "Unverifiable payment" }, { status: 400 });
                }
                if (result.status === 'SUCCESS' && verified.status !== 'SUCCESS') {
                    logger.warn("[webhook] succes annonce, non confirme par le fournisseur : refuse", { txId: record.id, provider: providerName, providerStatus: verified.status });
                }
                resultat = { ...verified, providerReference: record.providerRef, rawData: verified.rawData ?? {} };
            } catch (e: any) {
                logger.warn("[webhook] relecture en erreur : refuse", { txId: record.id, provider: providerName, error: e?.message });
                return NextResponse.json({ received: false, error: "Unverifiable payment" }, { status: 400 });
            }
            if (record.status === resultat.status) {
                return NextResponse.json({ received: true, ignored: "no_change" });
            }
        }

        // Transition et effets (courriels, notification, webhook sortant, piste de
        // routage) au meme endroit que le sondage et le cron : verrous d'etat
        // compris (un succes confirme rattrape un CANCELLED).
        const updated = await applyVerificationResult(record, resultat, `webhook:${providerName.toLowerCase()}`);
        if (updated.status === record.status) {
            return NextResponse.json({ received: true, ignored: "no_transition" });
        }
        logger.info("[webhook] tx updated", { txId: record.id, status: updated.status, provider: providerName });
        return NextResponse.json({ received: true });

    } catch (error: any) {
        console.error("Webhook Error:", error);
        return NextResponse.json({
            success: false,
            error: error.message || "Webhook processing failed"
        }, { status: 400 });
    }
}

/**
 * Parse a form-encoded body supporting PHP-style bracket notation,
 * e.g. PayDunya IPN: "data[invoice][token]=abc&data[status]=completed"
 * → { data: { invoice: { token: "abc" }, status: "completed" } }
 */
function parseFormEncoded(rawBody: string): any {
    const result: any = {};
    for (const [key, value] of new URLSearchParams(rawBody)) {
        const path = key.replace(/\]/g, '').split('[');
        let node = result;
        for (let i = 0; i < path.length - 1; i++) {
            if (typeof node[path[i]] !== 'object' || node[path[i]] === null) {
                node[path[i]] = {};
            }
            node = node[path[i]];
        }
        node[path[path.length - 1]] = value;
    }
    return result;
}

