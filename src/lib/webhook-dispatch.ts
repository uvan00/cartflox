import crypto from "crypto";
import prisma from "@/lib/db";
import { isEncrypted, safeDecrypt } from "@/lib/crypto";
import { AVEC_TESTS } from "@/lib/donnees-test";

/**
 * Webhooks SORTANTS, vers le serveur du marchand.
 *
 * Chaque envoi est une ligne `WebhookDelivery` : une premiere tentative part
 * tout de suite, puis le cron /api/cron/webhooks-retry rejoue les echecs selon
 * `DELAIS_REJEU_MS` (10 tentatives sur environ 72 h). Une livraison se renvoie
 * aussi a la main, depuis le tableau de bord ou l'API. Avant ce journal, trois
 * essais partaient en memoire (42 s au total) et disparaissaient au redemarrage.
 *
 * SECURITE :
 *  - SSRF : https seul en production, jamais une adresse locale, privee ni de
 *    metadonnees cloud ;
 *  - authenticite : le corps est signe HMAC-SHA256 avec la cle secrete de
 *    l'espace (de test pour un evenement de test), en-tetes
 *    `X-Afriflow-Timestamp` et `X-Afriflow-Signature: t=<ts>,v1=<hex>` sur
 *    `${ts}.${corps}`.
 */

/** Delais avant chaque nouvelle tentative, apres l'envoi immediat. */
export const DELAIS_REJEU_MS = [
    60_000,            // + 1 min
    5 * 60_000,        // + 5 min
    15 * 60_000,       // + 15 min
    60 * 60_000,       // + 1 h
    3 * 3_600_000,     // + 3 h
    6 * 3_600_000,     // + 6 h
    12 * 3_600_000,    // + 12 h
    24 * 3_600_000,    // + 24 h
    24 * 3_600_000,    // + 24 h
];
export const MAX_TENTATIVES = DELAIS_REJEU_MS.length + 1;
const DELAI_REPONSE_MS = 10_000;

export const EVENEMENTS = [
    "payment.completed",
    "payment.failed",
    "payment.cancelled",
    "payment.updated",
    "transfer.succeeded",
    "transfer.failed",
] as const;
export type Evenement = (typeof EVENEMENTS)[number];

/** L'evenement qui correspond a un statut de transaction. */
export function evenementPourStatut(status: string): Evenement {
    switch (String(status).toUpperCase()) {
        case "SUCCESS": return "payment.completed";
        case "FAILED": return "payment.failed";
        case "CANCELLED": return "payment.cancelled";
        default: return "payment.updated";
    }
}

/** Block obvious SSRF targets (localhost, private/link-local IPs, metadata). */
export function isSafeWebhookUrl(raw: string): boolean {
    let u: URL;
    try { u = new URL(raw); } catch { return false; }
    const isProd = process.env.NODE_ENV === "production";
    if (u.protocol !== "https:" && !(u.protocol === "http:" && !isProd)) return false;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
    if (host === "metadata.google.internal") return false;
    // IPv4 literal in a private / loopback / link-local range
    const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (m) {
        const [a, b] = [Number(m[1]), Number(m[2])];
        if (a === 127 || a === 10 || a === 0) return false;
        if (a === 169 && b === 254) return false;            // link-local + cloud metadata
        if (a === 192 && b === 168) return false;
        if (a === 172 && b >= 16 && b <= 31) return false;
        if (a === 100 && b >= 64 && b <= 127) return false;  // CGNAT
    }
    if (host === "::1" || host === "0.0.0.0" || host.startsWith("fd") || host.startsWith("fe80")) return false;
    return true;
}

/** Le marchand choisit ses evenements ; une liste vide veut dire « tous ». */
export function evenementSouhaite(config: { webhookEvents?: string[] | null } | null | undefined, event: string): boolean {
    const liste = config?.webhookEvents || [];
    return liste.length === 0 || liste.includes(event);
}

/** Adresse et secret de signature d'un espace, selon le monde (test ou production). */
/**
 * Le secret de signature, qu'il soit chiffre ou encore en clair.
 *
 * ⚠️ `safeDecrypt` rend `null` pour TOUTE valeur non prefixee `enc:`. Or 16 des
 * 98 configurations d'API gardent encore leur secret en clair (celles creees
 * avant le chiffrement par marchand). Pour elles, `destination.secret` valait
 * donc `null`, et `tenterLivraison` envoyait le webhook SANS EN-TETE DE
 * SIGNATURE : tout marchand qui verifie la signature, comme il le doit, le
 * refusait. Constate le 2026-09-22 sur linkafr.com, 5 livraisons en 401 apres
 * jusqu'a 8 tentatives. les boutiques integrees auraient subi le meme
 * sort a leur premier paiement.
 *
 * Ce n'est PAS une invitation a stocker en clair : les secrets encore en clair
 * restent a chiffrer. C'est la lecture qui doit tolerer les deux, sinon la
 * migration devient un prealable a la simple remise en service des webhooks.
 */
function lireSecret(valeur: string | null | undefined): string | null {
    if (!valeur) return null;
    return isEncrypted(valeur) ? safeDecrypt(valeur) : valeur;
}

export async function destinationWebhook(applicationId: string, test: boolean): Promise<{ url: string | null; secret: string | null; config: any | null }> {
    const config: any = await prisma.apiConfig.findFirst({ where: { applicationId } });
    if (!config) return { url: null, secret: null, config: null };
    const url = (test && config.testWebhookUrl ? config.testWebhookUrl : config.webhookUrl) || null;
    const secret = test
        ? (lireSecret(config.testSecretKey) || lireSecret(config.secretKey))
        : lireSecret(config.secretKey);
    return { url, secret, config };
}

export type EnvoiWebhook = {
    applicationId: string;
    event: Evenement | string;
    /** Evenement de test (transaction de test) : URL de test si elle existe, `livemode: false`. */
    test?: boolean;
    transactionId?: string | null;
    transfertId?: string | null;
};

/**
 * Journalise puis envoie un webhook. Renvoie la livraison, ou null si rien ne
 * part (pas d'adresse, evenement non souhaite par le marchand, adresse refusee).
 */
export async function envoyerWebhook(payload: Record<string, unknown>, envoi: EnvoiWebhook): Promise<any | null> {
    const test = envoi.test === true;
    const { url, config } = await destinationWebhook(envoi.applicationId, test);
    if (!url) return null;
    if (!evenementSouhaite(config, envoi.event)) return null;
    if (!isSafeWebhookUrl(url)) {
        console.warn(`[webhook:dispatch] refused unsafe webhook URL: ${url}`);
        return null;
    }
    const corps = { ...payload, event: envoi.event, livemode: !test };
    const livraison = await prisma.webhookDelivery.create({
        data: {
            applicationId: envoi.applicationId,
            event: envoi.event,
            url,
            payload: corps as any,
            test,
            status: "PENDING",
            attempts: 0,
            maxAttempts: MAX_TENTATIVES,
            nextAttemptAt: new Date(),
            transactionId: envoi.transactionId || null,
            transfertId: envoi.transfertId || null,
        },
    });
    return tenterLivraison(livraison.id);
}

/**
 * Une tentative de livraison. Le verrou est le passage PENDING -> SENDING :
 * deux crons qui se chevauchent ne peuvent pas envoyer la meme ligne deux fois.
 * `manuel` (bouton « renvoyer ») repart quel que soit l'etat.
 */
export async function tenterLivraison(id: string, opts?: { manuel?: boolean }): Promise<any | null> {
    const verrou = await prisma.webhookDelivery.updateMany({
        where: { id, status: opts?.manuel ? { in: ["PENDING", "FAILED", "DELIVERED"] } : "PENDING" },
        data: { status: "SENDING" },
    });
    if (verrou.count !== 1) return prisma.webhookDelivery.findFirst({ where: { id, ...AVEC_TESTS } });
    const livraison: any = await prisma.webhookDelivery.findFirst({ where: { id, ...AVEC_TESTS } });
    if (!livraison) return null;

    // Adresse et secret relus a chaque tentative : un marchand qui corrige son
    // adresse n'attend pas la prochaine transaction pour etre servi.
    const destination = await destinationWebhook(livraison.applicationId, livraison.test);
    const url = destination.url || livraison.url;
    const body = JSON.stringify(livraison.payload);
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": "Cartflox-Webhooks/2",
        "X-Afriflow-Event": livraison.event,
        "X-Afriflow-Delivery": livraison.id,
    };
    if (destination.secret) {
        const ts = Math.floor(Date.now() / 1000).toString();
        const sig = crypto.createHmac("sha256", destination.secret).update(`${ts}.${body}`).digest("hex");
        headers["X-Afriflow-Timestamp"] = ts;
        headers["X-Afriflow-Signature"] = `t=${ts},v1=${sig}`;
    }

    const debut = Date.now();
    let code: number | null = null;
    let erreur: string | null = null;
    try {
        if (!isSafeWebhookUrl(url)) throw new Error("Adresse refusée : https public obligatoire");
        const res = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(DELAI_REPONSE_MS), redirect: "manual" });
        code = res.status;
        if (!res.ok) erreur = `HTTP ${res.status}`;
    } catch (e: any) {
        erreur = e?.name === "TimeoutError" || e?.name === "AbortError" ? "Pas de réponse en 10 s" : (e?.message || "Erreur réseau");
    }
    const responseMs = Date.now() - debut;
    const attempts = livraison.attempts + 1;

    if (!erreur) {
        console.log(`[webhook:dispatch] → ${url} OK (${code}) event=${livraison.event} attempt=${attempts}`);
        return prisma.webhookDelivery.update({
            where: { id },
            data: { status: "DELIVERED", attempts, lastStatusCode: code, lastError: null, responseMs, deliveredAt: new Date(), nextAttemptAt: null, url },
        });
    }

    const epuise = attempts >= livraison.maxAttempts;
    const delai = DELAIS_REJEU_MS[Math.min(attempts - 1, DELAIS_REJEU_MS.length - 1)];
    console.warn(`[webhook:dispatch] → ${url} attempt=${attempts} failed (${erreur})${epuise ? ", giving up" : `, retry in ${Math.round(delai / 1000)}s`}`);
    const maj = await prisma.webhookDelivery.update({
        where: { id },
        data: {
            status: epuise ? "FAILED" : "PENDING",
            attempts,
            lastStatusCode: code,
            lastError: erreur.slice(0, 500),
            responseMs,
            nextAttemptAt: epuise ? null : new Date(Date.now() + delai),
            url,
        },
    });
    if (epuise) prevenirEchec(maj).catch(() => { });
    return maj;
}

/** Apres la derniere tentative, le marchand est prevenu dans son tableau de bord. */
async function prevenirEchec(livraison: any) {
    const app = await prisma.application.findUnique({ where: { id: livraison.applicationId }, select: { userId: true } });
    if (!app?.userId) return;
    const { createNotification } = await import("@/lib/notifications");
    await createNotification({
        userId: app.userId,
        type: "system",
        title: "Webhook non livré",
        body: `${livraison.event} n'a pas pu être remis à ${livraison.url} après ${livraison.attempts} tentatives (${livraison.lastError || "sans réponse"}). Vérifiez votre serveur puis renvoyez-le depuis API & Logs.`,
        link: "/developer",
    });
}

/** Le cron : rejoue les livraisons dues, quelques-unes a la fois, test et production confondus. */
export async function rejouerLivraisonsDues(limite = 50): Promise<{ dues: number; livrees: number; echecs: number; debloquees: number }> {
    // Un processus arrete en plein envoi laisse SENDING : on rend ces lignes au cycle.
    const debloquees = await prisma.webhookDelivery.updateMany({
        where: { status: "SENDING", updatedAt: { lt: new Date(Date.now() - 2 * 60_000) } },
        data: { status: "PENDING", nextAttemptAt: new Date() },
    });
    const dues = await prisma.webhookDelivery.findMany({
        where: { status: "PENDING", nextAttemptAt: { lte: new Date() }, ...AVEC_TESTS },
        orderBy: { nextAttemptAt: "asc" },
        take: limite,
        select: { id: true },
    });
    let livrees = 0;
    let echecs = 0;
    for (let i = 0; i < dues.length; i += 5) {
        await Promise.all(dues.slice(i, i + 5).map(async (d) => {
            const r = await tenterLivraison(d.id).catch(() => null);
            if (r?.status === "DELIVERED") livrees++; else echecs++;
        }));
    }
    return { dues: dues.length, livrees, echecs, debloquees: debloquees.count };
}

/** Forme publique d'une livraison (API v1 et tableau de bord). */
export function livraisonVersApi(l: any) {
    return {
        id: l.id,
        object: "webhook.delivery",
        event: l.event,
        url: l.url,
        status: l.status === "SENDING" ? "pending" : String(l.status).toLowerCase(),
        attempts: l.attempts,
        max_attempts: l.maxAttempts,
        next_attempt_at: l.nextAttemptAt || null,
        last_status_code: l.lastStatusCode ?? null,
        last_error: l.lastError || null,
        response_ms: l.responseMs ?? null,
        transaction_id: l.transactionId || null,
        transfer_id: l.transfertId || null,
        livemode: !l.test,
        created_at: l.createdAt,
        delivered_at: l.deliveredAt || null,
    };
}
