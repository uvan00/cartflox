"use server";

import prisma from "@/lib/db";
import { formaterMontant } from "@/lib/devises";
import { getSession } from "@/lib/session";
import { getSelectedAppId } from "./utils";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";

/** Journal de securite, activite API et recherche globale de l'application selectionnee. */

export async function getJournalSecurite(limit = 30) {
    const session = await getSession();
    if (!session?.user?.email) return [];
    const appId = await getSelectedAppId();
    if (!appId) return [];
    const lignes = await prisma.auditLog.findMany({ where: { applicationId: appId }, orderBy: { createdAt: "desc" }, take: Math.min(limit, 100) });
    return JSON.parse(JSON.stringify(lignes));
}

const SOURCES: Record<string, string> = { checkout_session: "API", widget: "Widget", softpay: "SoftPay", payment_link: "Lien de paiement", woocommerce: "WooCommerce" };

export async function getActiviteApi() {
    const session = await getSession();
    if (!session?.user?.email) return null;
    const appId = await getSelectedAppId();
    if (!appId) return null;
    const depuis = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const [recentes, total30, reussies30] = await Promise.all([
        prisma.transaction.findMany({
            where: { applicationId: appId }, orderBy: { createdAt: "desc" }, take: 25,
            select: { id: true, orderId: true, amount: true, currency: true, status: true, provider: true, createdAt: true, metadata: true, customerEmail: true },
        }),
        prisma.transaction.count({ where: { applicationId: appId, createdAt: { gte: depuis } } }),
        prisma.transaction.count({ where: { applicationId: appId, createdAt: { gte: depuis }, status: "SUCCESS" } }),
    ]);
    const parSource: Record<string, number> = {};
    for (const t of recentes) { const s = ((t.metadata as any)?.source || "checkout_session") as string; parSource[s] = (parSource[s] || 0) + 1; }
    return JSON.parse(JSON.stringify({
        total30, reussies30,
        parSource: Object.entries(parSource).map(([s, n]) => ({ source: SOURCES[s] || s, nombre: n })),
        recentes: recentes.map((t) => ({
            id: t.id, orderId: t.orderId, amount: t.amount, currency: t.currency, status: t.status, provider: t.provider, createdAt: t.createdAt,
            source: SOURCES[(t.metadata as any)?.source] || (t.metadata as any)?.source || "API", paymentLink: !!(t.metadata as any)?.paymentLinkId,
        })),
    }));
}

const STATUT_FR: Record<string, string> = { SUCCESS: "réussi", PENDING: "en attente", FAILED: "échoué", CANCELLED: "annulé", REFUNDED: "remboursé" };

/**
 * Recherche globale (palette Cmd+K) : transactions, clients et liens de
 * paiement de l'application, par reference, nom, e-mail ou telephone.
 */
export async function rechercheGlobale(q: string) {
    const session = await getSession();
    if (!session?.user?.email) return [];
    const appId = await getSelectedAppId();
    if (!appId) return [];
    const s = (q || "").trim().slice(0, 80);
    if (s.length < 2) return [];
    const chiffres = s.replace(/\D/g, "");
    const [tx, clients, liens] = await Promise.all([
        prisma.transaction.findMany({
            where: {
                applicationId: appId,
                OR: [
                    { orderId: { contains: s, mode: "insensitive" } }, { customerName: { contains: s, mode: "insensitive" } },
                    { customerEmail: { contains: s, mode: "insensitive" } }, { providerRef: { contains: s, mode: "insensitive" } },
                    ...(chiffres.length >= 6 ? [{ customerPhone: { contains: chiffres } }] : []), { id: { equals: s } },
                ],
            },
            orderBy: { createdAt: "desc" }, take: 6,
            select: { id: true, orderId: true, amount: true, currency: true, status: true, customerName: true, createdAt: true },
        }),
        prisma.customer.findMany({
            where: { applicationId: appId, OR: [{ name: { contains: s, mode: "insensitive" } }, { email: { contains: s, mode: "insensitive" } }, ...(chiffres.length >= 6 ? [{ phone: { contains: chiffres } }] : [])] },
            take: 4, select: { id: true, name: true, email: true, phone: true },
        }),
        prisma.paymentLink.findMany({
            where: { applicationId: appId, OR: [{ title: { contains: s, mode: "insensitive" } }, { slug: { contains: s, mode: "insensitive" } }] },
            take: 4, select: { id: true, title: true, slug: true, amount: true, currency: true, status: true },
        }),
    ]);
    return [
        ...tx.map((t) => ({ id: `t-${t.id}`, type: "transaction", groupe: "Transactions", titre: `${t.orderId} · ${formaterMontant(t.amount, t.currency)}`, sous: `${t.customerName || "client inconnu"} · ${STATUT_FR[t.status] || t.status} · ${new Date(t.createdAt).toLocaleDateString("fr-FR")}`, href: `/transactions/${t.id}` })),
        ...clients.map((c) => ({ id: `c-${c.id}`, type: "client", groupe: "Clients", titre: c.name || c.email, sous: [c.email, c.phone].filter(Boolean).join(" · "), href: `/customers?q=${encodeURIComponent(c.email || c.name || "")}` })),
        ...liens.map((l) => ({ id: `l-${l.id}`, type: "lien", groupe: "Liens de paiement", titre: l.title, sous: `${formaterMontant(l.amount, l.currency)} · /pay/${l.slug}`, href: `/payment-links` })),
    ];
}

/** Apres activation de la double authentification : trace dans les notifications du compte. */
export async function signalerDoubleAuth() {
    const session = await getSession();
    if (!session?.user?.id) return;
    await createNotification({
        userId: session.user.id,
        type: "security",
        title: "Authentification 2FA activée",
        body: "L'authentification à double facteur est maintenant active sur votre compte.",
        link: "/security",
    }).catch(() => { });
}

/** Compte ouvert par Google, sans mot de passe : en definir un (application mobile, double authentification). */
export async function definirMotDePasse(nouveau: string): Promise<{ success: boolean; error?: string }> {
    if (typeof nouveau !== "string" || nouveau.length < 8) return { success: false, error: "8 caractères minimum." };
    try {
        await auth.api.setPassword({ body: { newPassword: nouveau }, headers: await headers() });
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e?.body?.message || "Impossible de définir le mot de passe." };
    }
}
