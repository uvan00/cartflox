import { encrypt, isEncrypted, safeDecrypt, PORTEE_PLATEFORME } from "@/lib/crypto";

/**
 * Dual-environment gateway credentials + encryption at rest.
 *
 * Live keys live where they always did (Gateway.apiKey/apiSecret columns and
 * top-level config keys). Sandbox keys live in `config.testKeys`, keyed by
 * the same field names. `config.mode` selects the environment: in test mode
 * every non-empty test key overrides its live counterpart, so switching
 * environments never requires re-entering either set of keys.
 *
 * SECURITY: provider secrets are stored ENCRYPTED (AES-256-GCM via crypto.ts).
 * Encryption happens on write (encryptGatewayWriteData); decryption happens
 * here in overlayTestKeys() — the chokepoint every charge/webhook/sync path
 * runs config through — and at the few column-read sites.
 *
 * UNE CLEF PAR MARCHAND. Chaque fonction prend desormais une `portee` :
 * l'`applicationId` de la passerelle, ou PORTEE_PLATEFORME pour les passerelles
 * Connect qui n'appartiennent a aucun marchand. L'ecriture produit du `enc:v2:`
 * derive de cette portee ; la lecture accepte indifferemment du `enc:v2:`, du
 * `enc:v1:` hérité (clef maitre) et du texte clair hérité. Aucune migration n'est
 * requise avant de deployer : elle se fait ensuite, a froid.
 */

// Config/column keys that hold secrets and must be encrypted at rest.
// publicKey/identifiers (siteId, merchantId, shopId, mode, …) are intentionally
// excluded — they are not sensitive and are read by code that does not decrypt.
export const SECRET_KEYS = new Set([
    "apiKey", "apiSecret", "secretKey", "privateKey", "masterKey", "token",
    "secret", "secretHash", "webhookSecret", "sharedSecret", "serviceSecret",
    "licenseKey",
]);

/**
 * Portee de chiffrement d'une passerelle. Une passerelle plateforme n'a pas
 * d'`applicationId` : elle partage la portee PORTEE_PLATEFORME, sinon chaque
 * lecture devrait deviner a quel marchand l'attribuer.
 */
export function porteeDePasserelle(gateway: { applicationId?: string | null } | null | undefined): string {
    return gateway?.applicationId || PORTEE_PLATEFORME;
}

/** Decrypt a single value if it's in encrypted form; pass through otherwise. */
export function decryptSecret<T>(v: T, portee?: string): T {
    if (isEncrypted(v as any)) {
        const d = safeDecrypt(v as any, portee);
        // Indechiffrable (portee changee, secret maitre tourne) : une chaine vide
        // fait refuser l'authentification chez le fournisseur avec un motif clair,
        // la ou le chiffre envoye tel quel passait pour une cle fausse.
        if (d == null) { console.error("[cles] valeur indechiffrable : passerelle a ressaisir"); return "" as any; }
        return d as any;
    }
    return v;
}

/** Decrypt every encrypted string value within a config object (deep). */
function decryptConfigValues(cfg: any, portee?: string): any {
    if (!cfg || typeof cfg !== "object") return cfg;
    const out: any = Array.isArray(cfg) ? [...cfg] : { ...cfg };
    for (const [k, v] of Object.entries(out)) {
        if (typeof v === "string") out[k] = decryptSecret(v, portee);
        else if (v && typeof v === "object") out[k] = decryptConfigValues(v, portee);
    }
    return out;
}

/** Encrypt secret-named string fields within a config object (deep on testKeys). */
function encryptConfigValues(cfg: any, portee: string): any {
    if (!cfg || typeof cfg !== "object") return cfg;
    const out: any = Array.isArray(cfg) ? [...cfg] : { ...cfg };
    for (const [k, v] of Object.entries(out)) {
        if (typeof v === "string" && v && SECRET_KEYS.has(k) && !isEncrypted(v)) {
            out[k] = encrypt(v, portee);
        } else if (v && typeof v === "object") {
            // Descente GENERALE, et non plus seulement dans `testKeys` : les comptes
            // par pays (`comptesPays.CI.apiKey`) sont imbriques a deux niveaux, et
            // sans cette recursion ils partaient EN CLAIR en base. Le dechiffrement,
            // lui, etait deja profond : les deux sens sont maintenant symetriques.
            out[k] = encryptConfigValues(v, portee);
        }
    }
    return out;
}

/**
 * Encrypt the secret fields of a gateway write payload (apiKey/apiSecret
 * columns + config secrets + testKeys). Idempotent: already-encrypted values
 * are left as-is. Call this before persisting a gateway.
 *
 * `portee` est l'`applicationId` de la passerelle ecrite, ou PORTEE_PLATEFORME.
 * Se tromper de portee rendrait la passerelle indechiffrable : c'est pourquoi
 * l'argument est OBLIGATOIRE plutot qu'optionnel avec un defaut silencieux.
 */
export function encryptGatewayWriteData<T extends Record<string, any>>(data: T, portee: string): T {
    if (!data || typeof data !== "object") return data;
    if (!portee) throw new Error("encryptGatewayWriteData : portee manquante.");
    const out: any = { ...data };
    if (typeof out.apiKey === "string" && out.apiKey && !isEncrypted(out.apiKey)) {
        out.apiKey = encrypt(out.apiKey, portee);
    }
    if (typeof out.apiSecret === "string" && out.apiSecret && !isEncrypted(out.apiSecret)) {
        out.apiSecret = encrypt(out.apiSecret, portee);
    }
    if (out.config && typeof out.config === "object") {
        out.config = encryptConfigValues(out.config, portee);
    }
    return out;
}

/**
 * Resolve a gateway config for use: decrypt secrets, then overlay sandbox keys
 * when in test mode. Every charge/webhook/sync path calls this before handing
 * the config to an adapter.
 */
export function overlayTestKeys(config: any, portee?: string): any {
    const cfg = decryptConfigValues({ ...(config || {}) }, portee);
    const testKeys = cfg.testKeys;
    if (cfg.mode === "test" && testKeys && typeof testKeys === "object") {
        for (const [key, value] of Object.entries(testKeys)) {
            if (typeof value === "string" && value.trim() !== "") {
                cfg[key] = value;
            }
        }
    }
    delete cfg.testKeys;
    return cfg;
}

/**
 * Retire les secrets d'une passerelle avant de la renvoyer au navigateur.
 *
 * `getGateways` renvoyait la ligne entiere aux composants clients, donc le
 * chiffre des clefs de chaque marchand partait dans le HTML de la page sans
 * qu'aucun ecran ne l'affiche. Le chiffre n'est pas la clef, mais il n'a rien
 * a faire la : une valeur qui ne quitte jamais le serveur ne peut pas fuir.
 */
export function sansSecrets<T extends Record<string, any>>(gateway: T): T {
    if (!gateway || typeof gateway !== "object") return gateway;
    const out: any = { ...gateway };
    if (out.apiKey) out.apiKey = "";
    if (out.apiSecret) out.apiSecret = "";
    out.config = masquerConfig(out.config);
    return out;
}

/** Remplace toute valeur de nom secret par la chaine vide, en profondeur. */
function masquerConfig(cfg: any): any {
    if (!cfg || typeof cfg !== "object") return cfg;
    const out: any = Array.isArray(cfg) ? [...cfg] : { ...cfg };
    for (const [k, v] of Object.entries(out)) {
        if (typeof v === "string" && SECRET_KEYS.has(k)) out[k] = v ? "" : v;
        else if (v && typeof v === "object") out[k] = masquerConfig(v);
    }
    return out;
}
