import { NextRequest, NextResponse } from "next/server";
import { cronAutorise } from "@/lib/cron-auth";
import prisma from "@/lib/db";
import { getAdapterForTransaction, applyVerificationResult, annulerAbandon } from "@/lib/transaction-finalize";
import { AVEC_TESTS } from "@/lib/donnees-test";
import logger from "@/lib/logger";

// GET /api/cron/sync-pending
// Called every 10 minutes by the VPS crontab.
// Syncs PENDING transactions with providers. Stalled ones (never initiated
// with a provider) are CANCELLED; expired ones (initiated, >24h) are FAILED.
export async function GET(req: NextRequest) {
    if (!cronAutorise(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const now = Date.now();
    const thirtyMinutesAgo = new Date(now - 30 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);
    const fiveMinutesAgo = new Date(now - 5 * 60 * 1000);

    // Une reference VIDE vaut une reference absente : une initiation qui a
    // echoue chez le fournisseur laisse parfois "" au lieu de null, et la
    // transaction etait alors re-verifiee toutes les 10 minutes pendant 24 h
    // avec un "Missing transaction reference" garanti, au lieu d etre classee
    // comme abandon au bout de 30 minutes.
    const sansReference = { OR: [{ providerRef: null }, { providerRef: "" }] };
    const avecReference = { AND: [{ NOT: { providerRef: null } }, { NOT: { providerRef: "" } }] };

    // 1. Mark stalled (no providerRef + >30min) as CANCELLED — the customer
    // never reached the provider, so counting these as FAILED skews the
    // success-rate stats with pure checkout abandons.
    // Une par une, pour que chaque abandon parte au marchand en `payment.cancelled`
    // (test et production confondus : un test abandonne se classe aussi).
    const abandons = await prisma.transaction.findMany({
        where: { status: "PENDING", ...sansReference, createdAt: { lt: thirtyMinutesAgo }, ...AVEC_TESTS },
        select: { id: true },
        take: 200,
    });
    let annulees = 0;
    for (const a of abandons) {
        if (await annulerAbandon(a.id, "abandon > 30 min").catch(() => false)) annulees++;
    }
    const stalled = { count: annulees };

    // 2. Plus de 24 h avec une reference : une derniere relecture, puis abandon
    // (CANCELLED + webhook payment.cancelled), au lieu d'un FAILED muet.
    const trop = await prisma.transaction.findMany({
        where: { status: "PENDING", ...avecReference, createdAt: { lt: twentyFourHoursAgo } },
        orderBy: { updatedAt: "asc" },
        take: 100,
    });
    let expires = 0;
    for (const tx of trop) {
        try {
            const adapter = await getAdapterForTransaction(tx);
            const verification = adapter ? await adapter.verifyPayment(tx.providerRef!).catch(() => null) : null;
            if (verification && !verification.rawData?.error && verification.status !== "PENDING") {
                await applyVerificationResult(tx, verification, "cron:expiration");
                continue;
            }
            if (await annulerAbandon(tx.id, "en attente depuis plus de 24 h").catch(() => false)) expires++;
        } catch (err: unknown) {
            logger.warn("[cron:sync-pending] expiration", { txId: tx.id, err: String(err) });
        }
    }
    const expired = { count: expires };

    // 3. Sync remaining PENDING (has providerRef + >5min) with provider, les
    // moins recemment relues d'abord : chaque relecture touche updatedAt, donc
    // au-dela de 50 en attente, toutes finissent par etre relues.
    const pending = await prisma.transaction.findMany({
        where: { status: "PENDING", ...avecReference, createdAt: { lt: fiveMinutesAgo } },
        orderBy: { updatedAt: "asc" },
        take: 50,
    });

    let synced = 0;
    let newSuccess = 0;
    let newFailed = 0;

    for (const tx of pending) {
        try {
            const adapter = await getAdapterForTransaction(tx);
            if (!adapter) {
                logger.warn("[cron:sync-pending] aucune passerelle utilisable", { txId: tx.id, provider: tx.provider });
                continue;
            }

            const verification = await adapter.verifyPayment(tx.providerRef!);
            // Une reponse en erreur (401, panne) ne change jamais le statut ; sans
            // cette ligne elle restait invisible et « synced: 0 » ne disait rien.
            if (verification?.rawData?.error) {
                logger.warn("[cron:sync-pending] verification impossible", {
                    txId: tx.id, provider: tx.provider, error: String(verification.rawData.error).slice(0, 200),
                });
            }
            // Shared finalize: status update with downgrade/transport-error
            // guards + notification, emails and outgoing merchant webhook.
            const updated = await applyVerificationResult(tx, verification, "cron");
            if (updated.status === tx.status) {
                await prisma.transaction.updateMany({ where: { id: tx.id, status: "PENDING" }, data: { updatedAt: new Date() } }).catch(() => { });
                continue;
            }

            if (updated.status === "SUCCESS") newSuccess++;
            else if (updated.status === "FAILED") newFailed++;

            synced++;
        } catch (err: unknown) {
            logger.warn("[cron:sync-pending] error syncing tx", { txId: tx.id, err: String(err) });
        }
    }

    // 4. RATTRAPAGE : une transaction annulee/echouee peut avoir ete payee juste
    // apres (le client finit sur son telephone, la banque valide en differe...).
    // Sans ce passage, l'argent est encaisse chez le fournisseur et le client
    // n'est jamais livre. Seul un SUCCES confirme rattrape (cf. tx-finalize).
    let rescued = 0;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const toRecheck = await prisma.transaction.findMany({
        where: {
            status: { in: ["CANCELLED", "FAILED"] },
            NOT: { providerRef: null },
            createdAt: { gte: sevenDaysAgo },
        },
        orderBy: { createdAt: "desc" },
        take: 25,
    });

    for (const tx of toRecheck) {
        try {
            const adapter = await getAdapterForTransaction(tx);
            if (!adapter) continue;
            const verification = await adapter.verifyPayment(tx.providerRef!);
            if (verification?.status !== "SUCCESS") continue;
            const updated = await applyVerificationResult(tx, verification, "cron:rescue");
            if (updated.status === "SUCCESS") {
                rescued++;
                logger.warn("[cron:sync-pending] paiement rattrape", {
                    txId: tx.id, avant: tx.status, montant: tx.amount, devise: tx.currency,
                });
            }
        } catch (err: unknown) {
            logger.warn("[cron:sync-pending] error rescuing tx", { txId: tx.id, err: String(err) });
        }
    }

    logger.info("[cron:sync-pending] completed", {
        stalled: stalled.count,
        expired: expired.count,
        synced,
        newSuccess,
        newFailed,
        rescued,
    });

    return NextResponse.json({
        stalled: stalled.count,
        expired: expired.count,
        synced,
        newSuccess,
        newFailed,
        rescued,
    });
}
