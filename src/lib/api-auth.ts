import prisma from "@/lib/db";
import bcrypt from "bcryptjs";
import { isEncrypted, isBcryptHash, safeDecrypt } from "@/lib/crypto";

/**
 * Cles d'API d'un espace. Deux jeux, meme API, memes routes :
 *   production  af_live_pub_... / af_live_sec_...
 *   test        af_test_pub_... / af_test_sec_...
 * Une requete faite avec une cle de test ne cree et ne lit que des donnees de
 * test (`Transaction.test`), aucun agregateur n'est appele, et les webhooks
 * partent avec `livemode: false`.
 */
export const PUBLIC_KEY_PREFIX = "af_live_pub_";
export const TEST_PUBLIC_KEY_PREFIX = "af_test_pub_";
export const TEST_SECRET_KEY_PREFIX = "af_test_sec_";

export type AuthApi = {
    config: any;
    applicationId: string;
    /** Cle de test : la requete vit dans le bac a sable. */
    test: boolean;
};

/** Une cle publique, de production ou de test (widget, SoftPay : creer et lire une session, rien d'autre). */
export function estClePublique(cle: string | null | undefined): boolean {
    return !!cle && (cle.startsWith(PUBLIC_KEY_PREFIX) || cle.startsWith(TEST_PUBLIC_KEY_PREFIX));
}

/**
 * Authenticates an API request by comparing the provided secret key
 * against stored secrets in the database.
 *
 * Storage formats supported, in order of preference:
 *   1. AES-256-GCM encrypted ("enc:v1:..."):    decrypt + constant-time compare
 *   2. Legacy plaintext ("af_live_sec_..."):    direct DB lookup
 *   3. Legacy bcrypt hash ("$2a$..."):          bcrypt.compare across configs
 */
export async function authenticateApiKey(secretKey: string): Promise<AuthApi | null> {
    if (!secretKey) return null;

    // Cle secrete de TEST : toujours chiffree, une ligne par espace, on parcourt.
    if (secretKey.startsWith(TEST_SECRET_KEY_PREFIX)) {
        const configs = await (prisma as any).apiConfig.findMany({
            where: { testSecretKey: { not: null } },
            include: { application: true },
        });
        for (const config of configs) {
            if (!config.applicationId) continue;
            const plaintext = safeDecrypt(config.testSecretKey);
            if (plaintext && timingSafeEquals(plaintext, secretKey)) {
                return { config, applicationId: config.applicationId, test: true };
            }
        }
        return null;
    }

    // Legacy plaintext: O(1) indexed lookup still works.
    if (!secretKey.startsWith("$2") && !isEncrypted(secretKey)) {
        const config = await prisma.apiConfig.findFirst({
            where: { secretKey },
            include: { application: true },
        });
        if (config?.applicationId) return { config, applicationId: config.applicationId, test: false };
    }

    // Encrypted or hashed paths require scanning all configs (one row per app — small).
    const allConfigs = await (prisma as any).apiConfig.findMany({
        include: { application: true },
    });

    for (const config of allConfigs) {
        if (!config.secretKey || !config.applicationId) continue;

        if (isEncrypted(config.secretKey)) {
            const plaintext = safeDecrypt(config.secretKey);
            if (plaintext && timingSafeEquals(plaintext, secretKey)) {
                return { config, applicationId: config.applicationId, test: false };
            }
            continue;
        }

        if (isBcryptHash(config.secretKey)) {
            const match = await bcrypt.compare(secretKey, config.secretKey);
            if (match) return { config, applicationId: config.applicationId, test: false };
        }
    }

    return null;
}

/**
 * Cle PUBLIQUE (af_live_pub_... ou af_test_pub_...) : celle que le widget
 * cartflox.js met dans la page du marchand. Elle ne donne droit qu'a UNE chose,
 * creer une session de paiement (et lire son statut) ; jamais a lire des
 * transactions ni a configurer quoi que ce soit. Stockee en clair (elle est
 * publique par nature), lookup indexe.
 */
export async function authenticatePublicKey(publicKey: string): Promise<AuthApi | null> {
    if (!publicKey) return null;
    if (publicKey.startsWith(TEST_PUBLIC_KEY_PREFIX)) {
        const config = await (prisma as any).apiConfig.findUnique({
            where: { testPublicKey: publicKey },
            include: { application: true },
        });
        if (!config?.applicationId) return null;
        return { config, applicationId: config.applicationId, test: true };
    }
    if (!publicKey.startsWith(PUBLIC_KEY_PREFIX)) return null;
    const config = await prisma.apiConfig.findUnique({
        where: { publicKey },
        include: { application: true },
    });
    if (!config?.applicationId) return null;
    return { config, applicationId: config.applicationId, test: false };
}

/** La cle portee par une requete : `Authorization: Bearer <cle>` ou `x-api-key`. */
export function cleDeLaRequete(req: Request): string {
    const auth = req.headers.get("authorization");
    if (auth && auth.startsWith("Bearer ")) return auth.slice(7).trim();
    return (req.headers.get("x-api-key") || "").trim();
}

/** Authentifie une requete par cle secrete (production ou test). Null si absente ou invalide. */
export async function authentifierRequete(req: Request): Promise<AuthApi | null> {
    const cle = cleDeLaRequete(req);
    if (!cle) return null;
    return authenticateApiKey(cle);
}

/**
 * Constant-time string comparison to avoid leaking match length via timing.
 */
function timingSafeEquals(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}
