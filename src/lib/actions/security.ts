"use server";

import prisma from "@/lib/db";
import { getSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { logActivity } from "./team";
import crypto from "crypto";
import { getSelectedAppId } from "./utils";
import { encrypt, isEncrypted, isBcryptHash, safeDecrypt } from "@/lib/crypto";

function generateKey(prefix: string) {
    return `${prefix}_${crypto.randomBytes(24).toString("hex")}`;
}

/**
 * Returns masked version of secret key for display (shows prefix + last 4 chars)
 */
export async function maskSecretKey(key: string): Promise<string> {
    const parts = key.split("_");
    if (parts.length >= 3) {
        const prefix = parts.slice(0, 2).join("_");
        return `${prefix}_${'*'.repeat(32)}${key.slice(-4)}`;
    }
    return `${'*'.repeat(key.length - 4)}${key.slice(-4)}`;
}

async function lireApiConfig() {
    try {
        const session = await getSession();
        if (!session?.user?.email) return null;

        const appId = await getSelectedAppId();
        if (!appId) return null;

        let config = await prisma.apiConfig.findUnique({
            where: { applicationId: appId }
        });

        if (!config) {
            try {
                // New configs: store the secret AES-256-GCM encrypted so the
                // merchant can always reveal/copy it later without rotation.
                const rawSecret = generateKey("af_live_sec");
                const encryptedSecret = encrypt(rawSecret);
                config = await prisma.apiConfig.create({
                    data: {
                        applicationId: appId,
                        publicKey: generateKey("af_live_pub"),
                        secretKey: encryptedSecret,
                        lastRotationAt: new Date(),
                        webhookUrl: ""
                    }
                });
                return { ...config, secretKey: rawSecret, _plaintext: true };
            } catch (createError) {
                config = await prisma.apiConfig.findUnique({
                    where: { applicationId: appId }
                });
            }
        }

        if (config) {
            // Encrypted format → decrypt and return in plaintext for the dashboard.
            if (isEncrypted(config.secretKey)) {
                const plaintext = safeDecrypt(config.secretKey);
                if (plaintext) {
                    return { ...config, secretKey: plaintext, _plaintext: true };
                }
            }
            // Legacy bcrypt hash → cannot recover; UI will prompt for rotation.
            if (isBcryptHash(config.secretKey)) {
                return { ...config, _plaintext: false };
            }
            // Anything else (legacy plaintext stored before hashing was introduced)
            // counts as plaintext too.
            return { ...config, _plaintext: true };
        }

        return config;
    } catch (error) {
        console.error("SERVER ACTION: getApiConfig - Global failure:", error);
        return null;
    }
}

/**
 * Les cles de l'espace, avec leur jeu de TEST (af_test_pub_ / af_test_sec_),
 * cree a la volee pour les espaces qui n'en ont pas encore. Les secrets sont
 * rendus en clair pour l'affichage dans le tableau de bord.
 */
export async function getApiConfig() {
    const config: any = await lireApiConfig();
    if (!config) return null;
    if (!config.testPublicKey || !config.testSecretKey) {
        try {
            const rawTest = generateKey("af_test_sec");
            const maj: any = await prisma.apiConfig.update({
                where: { id: config.id },
                data: { testPublicKey: generateKey("af_test_pub"), testSecretKey: encrypt(rawTest) } as any,
            });
            return { ...config, testPublicKey: maj.testPublicKey, testSecretKey: rawTest, webhookEvents: maj.webhookEvents || [] };
        } catch (e) {
            console.error("SERVER ACTION: getApiConfig - clés de test:", e);
            return { ...config, testPublicKey: null, testSecretKey: null };
        }
    }
    return { ...config, testSecretKey: safeDecrypt(config.testSecretKey) };
}

export async function rotateApiKeys(quoi: "live" | "test" = "live") {
    try {
        const session = await getSession();
        if (!session?.user?.email) throw new Error("Unauthorized");

        const appId = await getSelectedAppId();
        if (!appId) throw new Error("No application selected");

        const test = quoi === "test";
        const rawSecret = generateKey(test ? "af_test_sec" : "af_live_sec");
        const encryptedSecret = encrypt(rawSecret);
        const config: any = await prisma.apiConfig.update({
            where: { applicationId: appId },
            data: (test
                ? { testPublicKey: generateKey("af_test_pub"), testSecretKey: encryptedSecret }
                : { publicKey: generateKey("af_live_pub"), secretKey: encryptedSecret, lastRotationAt: new Date() }) as any,
        });
        const configWithPlaintext = test
            ? { ...config, secretKey: safeDecrypt(config.secretKey), testSecretKey: rawSecret, _plaintext: true }
            : { ...config, secretKey: rawSecret, testSecretKey: safeDecrypt(config.testSecretKey), _plaintext: true };

        await logActivity({
            applicationId: appId,
            actorName: session.user.name || session.user.email || "Système",
            action: test ? "A régénéré ses clés API de test" : "A effectué une rotation des clés API",
            location: "Sécurité"
        });

        revalidatePath("/security");
        return { success: true, config: configWithPlaintext };
    } catch (error) {
        console.error("Failed to rotate API keys:", error);
        return { success: false, error: "Erreur lors de la rotation des clés." };
    }
}

export async function updateWebhookUrl(url: string, mode: "live" | "test" = "live") {
    try {
        const session = await getSession();
        if (!session?.user?.email) throw new Error("Unauthorized");

        const appId = await getSelectedAppId();
        if (!appId) throw new Error("No application selected");

        await prisma.apiConfig.update({
            where: { applicationId: appId },
            data: (mode === "test" ? { testWebhookUrl: url || null } : { webhookUrl: url }) as any,
        });

        await logActivity({
            applicationId: appId,
            actorName: session.user.name || session.user.email || "Système",
            action: `A mis à jour l'URL du webhook${mode === "test" ? " de test" : ""} vers: ${url || "(aucune)"}`,
            location: "Sécurité"
        });

        revalidatePath("/security");
        return { success: true };
    } catch (error) {
        console.error("Failed to update webhook URL:", error);
        return { success: false, error: "Impossible de mettre à jour le webhook." };
    }
}

export async function getSecurityLogs() {
    try {
        const session = await getSession();
        if (!session?.user?.email) return [];

        const appId = await getSelectedAppId();
        if (!appId) return [];

        const logs = await prisma.auditLog.findMany({
            where: {
                applicationId: appId,
                OR: [
                    { action: { contains: "clé", mode: 'insensitive' } },
                    { action: { contains: "webhook", mode: 'insensitive' } },
                    { action: { contains: "accès", mode: 'insensitive' } },
                    { action: { contains: "Login", mode: 'insensitive' } },
                    { action: { contains: "rotation", mode: 'insensitive' } }
                ]
            },
            orderBy: { createdAt: "desc" },
            take: 5
        });

        return logs;
    } catch (error) {
        console.error("Failed to fetch security logs:", error);
        return [];
    }
}
