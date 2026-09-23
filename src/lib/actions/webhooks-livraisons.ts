"use server";

import prisma from "@/lib/db";
import { getSession } from "@/lib/session";
import { getSelectedAppId } from "./utils";
import { logActivity } from "@/lib/audit";
import { AVEC_TESTS } from "@/lib/donnees-test";
import { EVENEMENTS, livraisonVersApi, tenterLivraison } from "@/lib/webhook-dispatch";

/**
 * Journal des webhooks sortants, vu du tableau de bord. La liste suit la vue
 * courante (production, ou donnees de test) comme les transactions.
 */
async function espaceDeLaSession(): Promise<string | null> {
    const session = await getSession();
    if (!session?.user) return null;
    return (await getSelectedAppId()) || null;
}

export async function listerLivraisons(params?: { limite?: number; transactionId?: string }) {
    const appId = await espaceDeLaSession();
    if (!appId) return [];
    const lignes = await prisma.webhookDelivery.findMany({
        where: { applicationId: appId, ...(params?.transactionId ? { transactionId: params.transactionId } : {}) },
        orderBy: { createdAt: "desc" },
        take: Math.min(200, Math.max(1, params?.limite || 50)),
    });
    return lignes.map(livraisonVersApi);
}

export async function renvoyerLivraison(id: string): Promise<{ ok: boolean; livraison?: any; message?: string }> {
    const appId = await espaceDeLaSession();
    if (!appId) return { ok: false, message: "Session expirée." };
    const livraison = await prisma.webhookDelivery.findFirst({ where: { id, applicationId: appId, ...AVEC_TESTS } });
    if (!livraison) return { ok: false, message: "Livraison introuvable." };
    const resultat = await tenterLivraison(id, { manuel: true });
    const vue = livraisonVersApi(resultat || livraison);
    return {
        ok: true,
        livraison: vue,
        message: vue.status === "delivered" ? `Reçu par votre serveur (HTTP ${vue.last_status_code}).` : `Toujours pas reçu : ${vue.last_error || "sans réponse"}.`,
    };
}

export async function definirEvenementsWebhook(events: string[]): Promise<{ ok: boolean; message?: string }> {
    const appId = await espaceDeLaSession();
    if (!appId) return { ok: false, message: "Session expirée." };
    const propres = Array.from(new Set((events || []).filter((e) => (EVENEMENTS as readonly string[]).includes(e))));
    if (propres.length === 0) return { ok: false, message: "Gardez au moins un événement." };
    await prisma.apiConfig.update({
        where: { applicationId: appId },
        data: { webhookEvents: propres.length === EVENEMENTS.length ? [] : propres } as any,
    });
    const session = await getSession();
    await logActivity({
        applicationId: appId,
        actorName: session?.user?.name || session?.user?.email || "Système",
        action: `A choisi les événements de webhook : ${propres.length === EVENEMENTS.length ? "tous" : propres.join(", ")}`,
        location: "Sécurité",
    }).catch(() => { });
    return { ok: true };
}
