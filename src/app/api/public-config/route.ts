import { NextResponse } from "next/server";

/**
 * GET /api/public-config
 * Reglages publics lus a l'execution (pas au build) : activer le support
 * Chatwoot se fait en renseignant CHATWOOT_WEBSITE_TOKEN puis en redemarrant,
 * sans reconstruire l'application. Le numero WhatsApp du service client vient
 * de SUPPORT_WHATSAPP (chiffres avec l'indicatif, sans +).
 */
export const dynamic = "force-dynamic";

export async function GET() {
    const support = { numero: process.env.SUPPORT_WHATSAPP || null, nom: process.env.SUPPORT_NOM || null };
    return NextResponse.json(
        {
            chatwoot: {
                url: (process.env.CHATWOOT_URL || "").replace(/\/+$/, ""),
                token: process.env.CHATWOOT_WEBSITE_TOKEN || "",
            },
            support: { whatsapp: support.numero, nom: support.nom },
            // Balise Google : vide tant que l'environnement ne la renseigne pas,
            // donc rien n'est charge et aucune donnee ne part.
            google: {
                mesure: process.env.GOOGLE_TAG_ID || "",
                ads: process.env.GOOGLE_ADS_ID || "",
                conversions: {
                    inscription: process.env.GOOGLE_ADS_CONVERSION_INSCRIPTION || "",
                    espace: process.env.GOOGLE_ADS_CONVERSION_ESPACE || "",
                    paiement: process.env.GOOGLE_ADS_CONVERSION_PAIEMENT || "",
                },
            },
        },
        { headers: { "Cache-Control": "public, max-age=300" } }
    );
}
