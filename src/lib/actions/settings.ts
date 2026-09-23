"use server";

import prisma from "@/lib/db";
import { getSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { getSelectedAppId } from "./utils";
import { logActivity } from "@/lib/audit";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { sendPasswordChangedEmail } from "@/lib/email";

const p = prisma as any;

export async function updateApplicationImage(imageUrl: string) {
    try {
        const session = await getSession();
        if (!session?.user) throw new Error("Unauthorized");

        const appId = await getSelectedAppId();
        if (!appId) throw new Error("No application selected");

        const application = await p.application.update({
            where: { id: appId },
            data: { image: imageUrl }
        });

        await logActivity({
            applicationId: appId,
            actorName: session.user.name || session.user.email || "Système",
            action: "A mis à jour l'image de l'espace de travail",
            location: "Paramètres"
        });

        revalidatePath("/");
        revalidatePath("/settings");

        return { success: true, application };
    } catch (error) {
        console.error("Failed to update application image:", error);
        return { success: false, error: "Impossible de mettre à jour l'image." };
    }
}

export async function updateApplicationDetails(data: { name: string; website?: string }) {
    try {
        const session = await getSession();
        if (!session?.user) throw new Error("Unauthorized");

        const appId = await getSelectedAppId();
        if (!appId) throw new Error("No application selected");

        // Champs explicites : l'objet du navigateur etait ecrit tel quel, donc
        // liveMode, commissionBps ou les garde-fous des transferts y passaient.
        const application = await p.application.update({
            where: { id: appId },
            data: {
                name: String(data.name || "").trim().slice(0, 80),
                ...(typeof data.website === "string" ? { website: data.website.trim().slice(0, 200) } : {}),
            },
        });

        await logActivity({
            applicationId: appId,
            actorName: session.user.name || session.user.email || "Système",
            action: `A modifié les informations de l'entreprise : ${data.name}`,
            location: "Paramètres"
        });

        revalidatePath("/");
        revalidatePath("/settings");

        return { success: true, application };
    } catch (error) {
        console.error("Failed to update application details:", error);
        return { success: false, error: "Impossible de mettre à jour les informations." };
    }
}

export async function getFullCurrentApplication() {
    try {
        const appId = await getSelectedAppId();
        if (!appId) return null;

        const rows = await prisma.$queryRawUnsafe<any[]>(
            `SELECT id, name, website, image, metadata FROM "Application" WHERE id = $1 LIMIT 1`,
            appId
        );
        return rows?.[0] ?? null;
    } catch (error) {
        console.error("getFullCurrentApplication error:", error);
        return null;
    }
}

export async function getCurrentUser() {
    try {
        const session = await getSession();
        if (!session?.user?.email) return null;

        return await prisma.user.findUnique({
            where: { email: session.user.email }
        });
    } catch (error) {
        return null;
    }
}

export async function updateUserProfile(data: { name: string; email: string; phone?: string; country?: string; image?: string }) {
    try {
        const session = await getSession();
        if (!session?.user?.email) throw new Error("Unauthorized");

        // If no explicit image provided, generate dicebear from name
        const image = data.image || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(data.name || data.email || 'user')}`;

        // Champs explicites. L'adresse de connexion ne se change pas ici : posee
        // sans verification, elle permettait de prendre celle d'un futur inscrit
        // (liaison de compte par le fournisseur OpenID Connect). Le pays reste
        // libre (nom ou code) : le formulaire propose un nom en toutes lettres.
        const user = await prisma.user.update({
            where: { email: session.user.email },
            data: {
                name: String(data.name || "").trim().slice(0, 80),
                phone: typeof data.phone === "string" ? data.phone.trim().slice(0, 32) : undefined,
                country: typeof data.country === "string" ? data.country.trim().slice(0, 80) : undefined,
                image: String(image).slice(0, 4000),
            },
        });

        revalidatePath("/settings");
        revalidatePath("/");

        return { success: true, user, image };
    } catch (error) {
        console.error("Failed to update user profile:", error);
        return { success: false, error: "Impossible de mettre à jour le profil." };
    }
}

export async function updateCheckoutTheme(themeId: string) {
    try {
        const session = await getSession();
        if (!session?.user) {
            console.error("updateCheckoutTheme: no session");
            return { success: false, error: "Session introuvable. Reconnectez-vous." };
        }

        const appId = await getSelectedAppId();
        if (!appId) {
            console.error("updateCheckoutTheme: no appId for user", session.user.email);
            return { success: false, error: "Aucune application sélectionnée." };
        }

        await prisma.$executeRawUnsafe(
            `UPDATE "Application" SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb, "updatedAt" = NOW() WHERE id = $2`,
            JSON.stringify({ checkoutTheme: themeId }),
            appId
        );

        revalidatePath("/settings");
        return { success: true };
    } catch (error: any) {
        console.error("updateCheckoutTheme error:", error?.message, error?.code);
        return { success: false, error: error?.message || "Impossible de mettre à jour le thème." };
    }
}

export async function updateEmailNotificationSettings(settings: {
    notifyMerchantOnPayment: boolean;
    notifyCustomerOnPayment: boolean;
}) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: "Session introuvable." };

        const appId = await getSelectedAppId();
        if (!appId) return { success: false, error: "Aucune application sélectionnée." };

        await prisma.$executeRawUnsafe(
            `UPDATE "Application" SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb, "updatedAt" = NOW() WHERE id = $2`,
            JSON.stringify(settings),
            appId
        );

        revalidatePath("/settings");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error?.message || "Erreur." };
    }
}

export async function changePassword(data: { currentPassword: string; newPassword: string }) {
    try {
        const session = await getSession();
        if (!session?.user?.email) throw new Error("Unauthorized");

        if (data.newPassword.length < 8) return { success: false, error: "Le nouveau mot de passe doit contenir au moins 8 caractères" };

        // Better Auth verifie l'ancien mot de passe, hache le nouveau et ferme les autres sessions.
        try {
            await auth.api.changePassword({
                body: { currentPassword: data.currentPassword, newPassword: data.newPassword, revokeOtherSessions: true },
                headers: await headers(),
            });
        } catch (e: any) {
            const code = e?.body?.code || e?.code;
            if (code === "INVALID_PASSWORD") return { success: false, error: "Mot de passe actuel incorrect" };
            if (code === "CREDENTIAL_ACCOUNT_NOT_FOUND") return { success: false, error: "Ce compte n'a pas de mot de passe (connexion Google) : définissez-en un d'abord." };
            return { success: false, error: e?.body?.message || "Erreur lors du changement de mot de passe" };
        }
        sendPasswordChangedEmail({ to: session.user.email, prenom: (session.user.name || "").split(" ")[0] }).catch(() => { });

        const appId = await getSelectedAppId();
        if (appId) {
            await logActivity({
                applicationId: appId,
                actorName: session.user.name || session.user.email || "Utilisateur",
                action: "A modifié son mot de passe",
                location: "Paramètres › Sécurité"
            });
        }

        return { success: true };
    } catch (error) {
        console.error("Failed to change password:", error);
        return { success: false, error: "Erreur lors du changement de mot de passe" };
    }
}

/* ------------------------------------------------------------------
   Page de paiement : couleurs personnalisees (SoftPay / checkout heberge)
   ------------------------------------------------------------------ */

const COULEUR = /^#[0-9a-fA-F]{6}$/;

export async function getCheckoutCustomization() {
    const session = await getSession();
    if (!session?.user) return null;
    const appId = await getSelectedAppId();
    if (!appId) return null;
    const app = await p.application.findUnique({ where: { id: appId }, select: { name: true, image: true, metadata: true } });
    const meta = (app?.metadata as any) || {};
    return { name: app?.name || "", image: app?.image || null, checkoutTheme: meta.checkoutTheme || "cartflox", checkoutThemeCustom: meta.checkoutThemeCustom || null };
}

/** null = revenir aux themes prets a l'emploi. */
export async function updateCheckoutCustomTheme(perso: { accent: string; accentText: string; pageBg: string; cardBg: string; textPrimary: string; textMuted: string; radius: number } | null) {
    try {
        const session = await getSession();
        if (!session?.user) return { success: false, error: "Session introuvable. Reconnectez-vous." };
        const appId = await getSelectedAppId();
        if (!appId) return { success: false, error: "Aucune application sélectionnée." };

        if (perso === null) {
            await prisma.$executeRawUnsafe(
                `UPDATE "Application" SET metadata = COALESCE(metadata, '{}'::jsonb) - 'checkoutThemeCustom', "updatedAt" = NOW() WHERE id = $1`,
                appId
            );
        } else {
            const couleurs = ["accent", "accentText", "pageBg", "cardBg", "textPrimary", "textMuted"] as const;
            for (const c of couleurs) {
                if (!COULEUR.test(String((perso as any)[c] || ""))) return { success: false, error: `Couleur invalide : ${c}. Format attendu #RRGGBB.` };
            }
            const radius = Math.max(0, Math.min(32, Math.round(Number(perso.radius) || 0)));
            const propre = {
                accent: perso.accent, accentText: perso.accentText, pageBg: perso.pageBg, cardBg: perso.cardBg,
                textPrimary: perso.textPrimary, textSecondary: perso.textPrimary, textMuted: perso.textMuted,
                cardBorder: "rgba(0,0,0,0.06)", methodBorder: "rgba(0,0,0,0.08)", methodSelectedBorder: perso.accent,
                methodSelectedBg: perso.accent + "14", methodHoverBg: "rgba(0,0,0,0.035)", divider: "rgba(0,0,0,0.06)",
                secureBadgeBg: perso.accent + "1a", secureBadgeText: perso.accent, radius,
            };
            await prisma.$executeRawUnsafe(
                `UPDATE "Application" SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb, "updatedAt" = NOW() WHERE id = $2`,
                JSON.stringify({ checkoutThemeCustom: propre, checkoutTheme: "custom" }),
                appId
            );
        }
        revalidatePath("/settings");
        return { success: true };
    } catch (error: any) {
        console.error("updateCheckoutCustomTheme:", error?.message);
        return { success: false, error: error?.message || "Impossible d'enregistrer." };
    }
}
