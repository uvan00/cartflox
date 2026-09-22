import crypto from "crypto";

/**
 * Verifies incoming webhook signatures per provider.
 * Returns true if valid, false if invalid, null if no verification available.
 */
export function verifyWebhookSignature(
    providerName: string,
    rawBody: string,
    headers: Record<string, string>,
    gatewayConfig: Record<string, any>
): boolean | null {
    const provider = providerName.toLowerCase();

    // ── Paystack ─────────────────────────────────────────────────────────────
    // Header: x-paystack-signature = HMAC-SHA512(rawBody, secretKey)
    if (provider === "paystack") {
        const sig = headers["x-paystack-signature"];
        const secret = gatewayConfig?.secretKey || gatewayConfig?.apiSecret;
        if (!sig || !secret) return null;
        const expected = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
        return timingSafeEqual(sig, expected);
    }

    // ── Flutterwave ───────────────────────────────────────────────────────────
    // Header: verif-hash = plain secret (not HMAC — Flutterwave uses a static hash)
    if (provider === "flutterwave") {
        const sig = headers["verif-hash"];
        const secret = gatewayConfig?.webhookSecret || gatewayConfig?.secretHash;
        if (!sig || !secret) return null;
        return timingSafeEqual(sig, secret);
    }

    // ── Kkiapay ───────────────────────────────────────────────────────────────
    // Header: x-kkiapay-secret = HMAC-SHA256(rawBody, secret)
    if (provider === "kkiapay") {
        const sig = headers["x-kkiapay-secret"];
        const secret = gatewayConfig?.secret || gatewayConfig?.apiSecret;
        if (!sig || !secret) return null;
        const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
        return timingSafeEqual(sig, expected);
    }

    // ── Stripe ────────────────────────────────────────────────────────────────
    // Header: stripe-signature (t=timestamp,v1=HMAC-SHA256)
    if (provider === "stripe") {
        const sig = headers["stripe-signature"];
        const secret = gatewayConfig?.webhookSecret;
        if (!sig || !secret) return null;
        try {
            const parts = Object.fromEntries(sig.split(",").map((p: string) => p.split("=")));
            const timestamp = parts["t"];
            const v1 = parts["v1"];
            if (!timestamp || !v1) return false;
            const signed = `${timestamp}.${rawBody}`;
            const expected = crypto.createHmac("sha256", secret).update(signed).digest("hex");
            // Reject if timestamp is >5 minutes old
            if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
            return timingSafeEqual(v1, expected);
        } catch {
            return false;
        }
    }

    // ── Coinbase Commerce ─────────────────────────────────────────────────────
    // Header: x-cc-webhook-signature = HMAC-SHA256(rawBody, sharedSecret)
    if (provider === "coinbase") {
        const sig = headers["x-cc-webhook-signature"];
        const secret = gatewayConfig?.sharedSecret || gatewayConfig?.apiSecret;
        if (!sig || !secret) return null;
        const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
        return timingSafeEqual(sig, expected);
    }

    // ── NotchPay ──────────────────────────────────────────────────────────────
    // Header: x-notch-signature = HMAC-SHA256(rawBody, publicKey)
    if (provider === "notchpay") {
        const sig = headers["x-notch-signature"];
        const secret = gatewayConfig?.publicKey;
        if (!sig || !secret) return null;
        const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
        return timingSafeEqual(sig, expected);
    }

    // ── PayDunya ──────────────────────────────────────────────────────────────
    // No standard HMAC — verify via master_key presence in payload
    if (provider === "paydunya") {
        const masterKey = gatewayConfig?.masterKey || gatewayConfig?.apiKey;
        const payloadMasterKey = (() => {
            try { return JSON.parse(rawBody)?.data?.bill?.hash || null; } catch { return null; }
        })();
        // PayDunya doesn't use HMAC, so we allow it through (no null = no verification)
        return null;
    }

    // ── Wave Business ────────────────────────────────────────────────────────
    // Header: wave-signature = t=<timestamp>,v1=<HMAC-SHA256(timestamp + rawBody, webhookSecret)>
    // Le secret (wave_xx_WHS_...) est remis a la creation du webhook ; sans lui,
    // pas de verification (null) et tout succes est reconfirme aupres de Wave.
    if (provider === "wave") {
        const sig = headers["wave-signature"];
        const secret = gatewayConfig?.webhookSecret;
        if (!sig || !secret) return null;
        try {
            const parts = Object.fromEntries(sig.split(",").map((p: string) => p.trim().split("=")));
            const timestamp = parts["t"];
            const v1 = parts["v1"];
            if (!timestamp || !v1) return false;
            if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
            const expected = crypto.createHmac("sha256", secret).update(`${timestamp}${rawBody}`).digest("hex");
            return timingSafeEqual(String(v1).toLowerCase(), expected);
        } catch {
            return false;
        }
    }

    // ── PayTech ──────────────────────────────────────────────────────────────
    // IPN en formulaire : hmac_compute = HMAC-SHA256("<final_item_price>|<ref_command>|<api_key>", api_secret),
    // sinon api_key_sha256 et api_secret_sha256 = SHA-256 de nos deux cles.
    if (provider === "paytech") {
        const apiKey = gatewayConfig?.apiKey;
        const apiSecret = gatewayConfig?.apiSecret;
        if (!apiKey || !apiSecret) return null;
        const champs = corpsEnObjet(rawBody);
        if (champs.hmac_compute) {
            const prix = champs.final_item_price ?? champs.item_price ?? "";
            const expected = crypto.createHmac("sha256", apiSecret).update(`${prix}|${champs.ref_command || ""}|${apiKey}`).digest("hex");
            return timingSafeEqual(String(champs.hmac_compute).toLowerCase(), expected);
        }
        if (champs.api_key_sha256 && champs.api_secret_sha256) {
            const sha = (v: string) => crypto.createHash("sha256").update(v).digest("hex");
            return timingSafeEqual(String(champs.api_key_sha256).toLowerCase(), sha(apiKey))
                && timingSafeEqual(String(champs.api_secret_sha256).toLowerCase(), sha(apiSecret));
        }
        // Un IPN PayTech porte toujours ces empreintes : sans elles, c'est un faux.
        return false;
    }

    // ── Magma OnePay ─────────────────────────────────────────────────────────
    // Header: x-signature = HMAC-SHA256(json_encode(data), secret). PHP echappe les
    // barres obliques : on accepte les deux encodages du meme objet.
    if (provider === "onepay") {
        const sig = headers["x-signature"];
        const secret = gatewayConfig?.secret;
        if (!sig || !secret) return null;
        const data = corpsEnObjet(rawBody)?.data;
        if (!data || typeof data !== "object") return false;
        const brut = JSON.stringify(data);
        const candidats = [brut, brut.replace(/\//g, "\\/")];
        return candidats.some((c) => timingSafeEqual(String(sig).toLowerCase(), crypto.createHmac("sha256", secret).update(c).digest("hex")));
    }

    // ── Djamo Business ───────────────────────────────────────────────────────
    // Header: x-djamo-hmac-sha256 = base64(HMAC-SHA256(rawBody, webhookSecret))
    if (provider === "djamo") {
        const sig = headers["x-djamo-hmac-sha256"];
        const secret = gatewayConfig?.webhookSecret;
        if (!sig || !secret) return null;
        const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
        return timingSafeEqual(String(sig), expected);
    }

    // ── iPay Money ───────────────────────────────────────────────────────────
    // Header: secret-hash = le secret defini par le marchand dans iPay (comparaison simple).
    if (provider === "ipay") {
        const sig = headers["secret-hash"];
        const secret = gatewayConfig?.webhookSecret;
        if (!sig || !secret) return null;
        return timingSafeEqual(String(sig), String(secret));
    }

    // ── Hub2 ────────────────────────────────────────────────────────────────
    // Header: HUB2-Signature: s1=<hex>,s0=<hex> ; HMAC-SHA256(rawBody, secret) en hex.
    // s1 = secret courant, s0 = ancien secret (24 h apres une rotation) : on
    // accepte l'un ou l'autre, notre secret pouvant etre l'un des deux.
    if (provider === "hub2") {
        const brut = headers["hub2-signature"];
        const secret = gatewayConfig?.webhookSecret;
        if (!brut || !secret) return null;
        const expected = crypto.createHmac("sha256", String(secret)).update(rawBody).digest("hex");
        const signatures = String(brut).split(",").map((p) => p.trim().replace(/^s[01]=/i, "").toLowerCase()).filter(Boolean);
        return signatures.some((sig) => timingSafeEqual(sig, expected));
    }

    // Unknown provider — no verification available, allow through with warning
    // ── FeexPay ──────────────────────────────────────────────────────────────
    // Pas de HMAC : le marchand choisit dans FeexPay un en-tete « Bearer » ou
    // « Basic » avec la valeur de son choix, et saisit la meme chez nous
    // (webhookSecret). Sans jeton configure : pas de verification (null).
    if (provider === "feexpay") {
        const secret = String(gatewayConfig?.webhookSecret || "").trim();
        if (!secret) return null;
        const brut = String(headers["authorization"] || "").trim();
        if (!brut) return false;
        const [type, ...reste] = brut.split(/\s+/);
        const valeur = reste.join(" ");
        if (/^bearer$/i.test(type)) return timingSafeEqual(valeur, secret);
        if (/^basic$/i.test(type)) {
            // Basic : la valeur saisie chez FeexPay, en clair ou deja en base64.
            let decode = "";
            try { decode = Buffer.from(valeur, "base64").toString("utf8"); } catch { decode = ""; }
            return timingSafeEqual(valeur, secret) || timingSafeEqual(decode, secret) || timingSafeEqual(decode, `${secret}:`) || timingSafeEqual(valeur, Buffer.from(secret).toString("base64"));
        }
        return timingSafeEqual(brut, secret);
    }

    return null;
}

/** Corps JSON ou formulaire (x-www-form-urlencoded) en objet plat. */
function corpsEnObjet(rawBody: string): Record<string, any> {
    try {
        const json = JSON.parse(rawBody);
        return json && typeof json === "object" ? json : {};
    } catch {
        return Object.fromEntries(new URLSearchParams(rawBody).entries());
    }
}

/** Constant-time string comparison to prevent timing attacks */
function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    return crypto.timingSafeEqual(bufA, bufB);
}
