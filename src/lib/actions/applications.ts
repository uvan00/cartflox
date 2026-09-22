"use server";

import prisma from "@/lib/db";
import { faviconDuSite } from "@/lib/favicon";
import { getSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { getSelectedAppId } from "./utils";

/**
 * Contexte de paiement de l'application selectionnee. En version ouverte il
 * n'existe qu'un mode : le marchand branche ses propres cles d'agregateur et
 * aucun frais de plateforme ne s'ajoute a ses paiements. La forme est gardee
 * pour que les ecrans qui la lisent ne changent pas.
 */
export async function getPaymentContext(): Promise<{ managed: boolean; commissionBps: number; fraisClient: boolean; fraisBps: number }> {
    return { managed: false, commissionBps: 0, fraisClient: false, fraisBps: 0 };
}

/** Les applications (espaces) du compte connecte. */
export async function getApplications() {
    const p = prisma as any;
    try {
        const session = await getSession();
        if (!session?.user?.email) return [];

        const user = await p.user.findUnique({
            where: { email: session.user.email },
            include: { applications: true }
        });

        if (!user) return [];

        return user.applications;
    } catch (error) {
        console.error("Error fetching applications:", error);
        return [];
    }
}

/**
 * Adresse du site ou de la page du marchand. Obligatoire : c'est ce qui permet
 * de verifier une activite et de rassurer ses clients sur la page de paiement.
 * Accepte « monsite.com » ou « instagram.com/maboutique » et complete en https://.
 */
export async function normaliserSiteWeb(brut: string): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
    const v = String(brut || "").trim().replace(/\s+/g, "");
    if (!v) return { ok: false, message: "Indiquez le lien de votre site ou de votre page (Instagram, Facebook, WhatsApp Business...)." };
    const avecProtocole = /^https?:\/\//i.test(v) ? v : `https://${v}`;
    let u: URL;
    try { u = new URL(avecProtocole); } catch { return { ok: false, message: "Ce lien n'est pas valide. Exemple : maboutique.com ou instagram.com/maboutique" }; }
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(u.hostname) || u.hostname.length < 4) {
        return { ok: false, message: "Ce lien n'est pas valide. Exemple : maboutique.com ou instagram.com/maboutique" };
    }
    return { ok: true, url: u.toString().replace(/\/$/, "").slice(0, 200) };
}

export async function createApplication(name: string, website?: string, category?: string) {
    const p = prisma as any;
    try {
        const session = await getSession();

        if (!session?.user?.email) {
            console.error("❌ Unauthorized: No session or email");
            return { success: false, error: "Non autorisé" };
        }

        const user = await p.user.findUnique({
            where: { email: session.user.email }
        });

        if (!user) {
            console.error("❌ User not found for email:", session.user.email);
            return { success: false, error: "Utilisateur non trouvé" };
        }

        if (!p.application) {
            throw new Error("Le modèle Application n'est pas initialisé dans le client Prisma.");
        }

        // Le lien du site ou de la page est obligatoire pour chaque espace.
        const site = await normaliserSiteWeb(website || "");
        if (!site.ok) {
            return { success: false, error: site.message };
        }

        // Le site porte deja un logo : on prend son favicon plutot que de
        // demander une image de plus. Si le site n'en expose pas, l'espace
        // garde son initiale : ca ne doit jamais empecher la creation.
        const logo = await faviconDuSite(site.url).catch(() => null);

        const application = await p.application.create({
            data: {
                name,
                website: site.url,
                category,
                userId: user.id,
                paymentMode: "own_keys",
                // Le marchand encaisse avec ses propres cles : rien a verifier ici,
                // c'est son agregateur qui l'a deja fait.
                liveMode: true,
                ...(logo ? { image: logo } : {}),
            }
        });

        revalidatePath("/");
        return { success: true, data: application };
    } catch (error: any) {
        console.error("🔥 Critical error in createApplication:", error);
        // Ensure we always return a serializable object to avoid 500s from non-serializable errors
        return {
            success: false,
            error: error instanceof Error ? error.message : "Une erreur inconnue est survenue"
        };
    }
}

export async function getCurrentApplication(applicationId?: string) {
    const p = prisma as any;
    try {
        const session = await getSession();
        if (!session?.user?.email) return null;

        const user = await p.user.findUnique({
            where: { email: session.user.email }
        });
        if (!user) return null;

        if (applicationId) {
            return await p.application.findFirst({
                where: { id: applicationId, userId: user.id }
            });
        }

        // Default to first app
        return await p.application.findFirst({
            where: { userId: user.id }
        });
    } catch (error) {
        return null;
    }
}
