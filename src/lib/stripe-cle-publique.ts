import { overlayTestKeys, porteeDePasserelle } from "@/lib/gateway-credentials";
import { buildAdapterConfig } from "@/lib/orchestrator/executor";

/**
 * La cle PUBLIQUE Stripe d'une passerelle : celle enregistree dans sa
 * configuration, sinon celle de la plateforme, mais UNIQUEMENT si la passerelle
 * utilise le secret de la plateforme (meme compte Stripe). Sans ce garde-fou on
 * livrerait au navigateur la cle publique d'un autre compte, et la confirmation
 * echouerait. En mode test, c'est la cle de test qui sort, jamais celle de
 * production.
 *
 * Une cle publique est faite pour le navigateur : la renvoyer n'expose rien.
 * Les secrets, eux, restent dans `buildAdapterConfig`.
 */
export function clePubliqueStripe(gateway: any): string {
    if (!gateway) return "";
    const config = (gateway.config as Record<string, unknown>) || {};
    try {
        const dec = overlayTestKeys(config, porteeDePasserelle(gateway)) as Record<string, unknown>;
        if (typeof dec.publishableKey === "string" && dec.publishableKey) return dec.publishableKey;
        const secret = buildAdapterConfig({ ...gateway, config }, "stripe")?.secretKey || "";
        return secret && secret === process.env.STRIPE_SECRET_KEY ? (process.env.STRIPE_PUBLISHABLE_KEY || "") : "";
    } catch {
        // Passerelle en mode test sans cles de test : pas de cle, pas de prechargement.
        return "";
    }
}
