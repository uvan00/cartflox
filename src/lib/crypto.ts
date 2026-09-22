import { createCipheriv, createDecipheriv, randomBytes, createHash, hkdfSync } from "crypto";
import { readFileSync } from "fs";

/**
 * Symmetric encryption helpers used to store sensitive values that must be
 * retrievable in plaintext later (API secret keys, gateway credentials).
 *
 * Algorithm: AES-256-GCM
 *   - 32-byte key, 12-byte IV (random per encryption), 16-byte auth tag
 *
 * DEUX FORMATS, deux clefs :
 *   "enc:v1:<iv>:<ct>:<tag>"  -> chiffre par la CLE MAITRE, pour tout le monde.
 *   "enc:v2:<iv>:<ct>:<tag>"  -> chiffre par une clef DERIVEE POUR UN MARCHAND.
 *
 * Le v2 existe pour plafonner les degats : aujourd'hui une seule clef ouvre les
 * identifiants fournisseur des 116 marchands. En v2 chaque marchand a la sienne,
 * derivee de la clef maitre et de sa portee par HKDF, donc connaitre la clef d'un
 * marchand n'ouvre pas celle du voisin. Modele repris d'Hyperswitch
 * (`merchant_key_store`), avec une derivation au lieu d'une table : a l'echelle de
 * Cartflox (une trentaine de lignes de passerelle) une rotation de la clef maitre
 * se fait par rechiffrement complet en quelques secondes, ce qui rend le stockage
 * d'une clef par marchand inutile.
 *
 * La LECTURE reste retro-compatible : un v1 se dechiffre toujours, un texte clair
 * hérité passe toujours. Rien n'oblige a migrer avant de deployer.
 */

const PREFIXE_V1 = "enc:v1:";
const PREFIXE_V2 = "enc:v2:";

/** Portee a utiliser pour les passerelles plateforme (applicationId absent). */
export const PORTEE_PLATEFORME = "__plateforme__";

/** Contexte de derivation. Le changer invaliderait tous les v2 existants. */
const INFO_DERIVATION = "cartflox-passerelle-v2";

let secretResolu: string | null = null;

/**
 * Resout le secret maitre. `KEY_VAULTS_SECRET` accepte deux formes :
 *   - la valeur litterale (comportement historique) ;
 *   - une REFERENCE `file:/chemin/absolu`, lue une fois au premier usage.
 *
 * La reference permet de sortir le secret du `.env` de l'application, donc des
 * vidages d'environnement, de la liste des processus et de toute copie du dossier.
 * Meme principe que le `SecretsManagementConfig` d'Hyperswitch, sans dependance a
 * un fournisseur : un KMS pourra s'ajouter ici comme un prefixe de plus.
 */
function resoudreSecret(): string {
    if (secretResolu !== null) return secretResolu;

    const brut = process.env.KEY_VAULTS_SECRET;
    if (!brut) {
        throw new Error(
            "KEY_VAULTS_SECRET is not set. Cannot encrypt/decrypt sensitive values."
        );
    }

    if (brut.startsWith("file:")) {
        const chemin = brut.slice("file:".length);
        let contenu: string;
        try {
            contenu = readFileSync(chemin, "utf8");
        } catch (e: any) {
            // Ne jamais laisser filtrer le chemin dans une reponse HTTP : le message
            // part dans les journaux serveur, pas au client.
            throw new Error(`KEY_VAULTS_SECRET: fichier de secret illisible (${e?.code || "erreur"}).`);
        }
        const valeur = contenu.trim();
        if (!valeur) throw new Error("KEY_VAULTS_SECRET: fichier de secret vide.");
        secretResolu = valeur;
        return secretResolu;
    }

    secretResolu = brut;
    return secretResolu;
}

/** Clef maitre 32 octets. Meme entree, meme clef : idempotent. */
function cleMaitre(): Buffer {
    return createHash("sha256").update(resoudreSecret()).digest();
}

/**
 * Clef de 32 octets propre a une portee (applicationId, ou PORTEE_PLATEFORME).
 * HKDF-SHA256, natif Node, pas de table ni d'appel asynchrone : les chemins de
 * paiement qui chiffrent et dechiffrent sont synchrones et doivent le rester.
 */
function cleDePortee(portee: string): Buffer {
    const p = (portee || "").trim();
    if (!p) throw new Error("Portee de chiffrement vide : derivation impossible.");
    return Buffer.from(hkdfSync("sha256", cleMaitre(), Buffer.from(p, "utf8"), INFO_DERIVATION, 32));
}

function sceller(cle: Buffer, prefixe: string, plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", cle, iv);
    const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
        prefixe.replace(/:$/, ""),
        iv.toString("base64"),
        ct.toString("base64"),
        tag.toString("base64"),
    ].join(":");
}

function ouvrir(cle: Buffer, payload: string): string {
    const parts = payload.split(":");
    // ["enc","vN","iv","ct","tag"]
    if (parts.length !== 5) throw new Error("Malformed encrypted payload");
    const [, , ivB64, ctB64, tagB64] = parts;
    const decipher = createDecipheriv("aes-256-gcm", cle, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]);
    return pt.toString("utf8");
}

/**
 * Chiffre une chaine UTF-8 en AES-256-GCM.
 *  - sans `portee` : format v1, clef maitre (inchange, pour les secrets qui ne
 *    sont pas rattaches a un marchand) ;
 *  - avec `portee` : format v2, clef derivee pour ce marchand.
 */
export function encrypt(plaintext: string, portee?: string): string {
    if (!plaintext) return plaintext;
    return portee
        ? sceller(cleDePortee(portee), PREFIXE_V2, plaintext)
        : sceller(cleMaitre(), PREFIXE_V1, plaintext);
}

/**
 * Dechiffre une sortie d'`encrypt`. La version est lue dans le prefixe, donc un
 * v1 ecrit avant cette modification se dechiffre sans rien changer a l'appelant.
 * Un v2 EXIGE la portee : sans elle on echoue au lieu de renvoyer du faux.
 */
export function decrypt(payload: string, portee?: string): string {
    if (!isEncrypted(payload)) {
        throw new Error("Value is not in the encrypted format expected by decrypt().");
    }
    if (payload.startsWith(PREFIXE_V2)) {
        if (!portee) throw new Error("Valeur chiffree par marchand : portee requise pour dechiffrer.");
        return ouvrir(cleDePortee(portee), payload);
    }
    return ouvrir(cleMaitre(), payload);
}

/**
 * Quick predicate: does this string look like an `encrypt()` output ?
 * ATTENTION : doit reconnaitre LES DEUX versions. Un v2 non reconnu serait pris
 * pour du texte clair, donc re-chiffre par-dessus ou renvoye tel quel.
 */
export function isEncrypted(payload: string | null | undefined): payload is string {
    return typeof payload === "string"
        && (payload.startsWith(PREFIXE_V1) || payload.startsWith(PREFIXE_V2));
}

/** Vrai si la valeur est chiffree par une clef de marchand (format v2). */
export function estChiffreParMarchand(payload: string | null | undefined): boolean {
    return typeof payload === "string" && payload.startsWith(PREFIXE_V2);
}

/** True for bcrypt-hashed values (legacy `apiConfig.secretKey` format). */
export function isBcryptHash(payload: string | null | undefined): boolean {
    return typeof payload === "string" && /^\$2[aby]\$/.test(payload);
}

/**
 * Try to decrypt; return null if the value isn't in encrypted format or
 * decryption fails. Use this when you want a "best effort" reveal.
 */
export function safeDecrypt(payload: string | null | undefined, portee?: string): string | null {
    if (!isEncrypted(payload)) return null;
    try {
        return decrypt(payload as string, portee);
    } catch {
        return null;
    }
}
