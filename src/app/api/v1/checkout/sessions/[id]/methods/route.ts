import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { authenticateApiKey, authenticatePublicKey, estClePublique } from "@/lib/api-auth";
import { getCorsHeaders, corsPreflightResponse } from "@/lib/cors";
import { getPaymentMethodsByAppId } from "@/lib/actions/methods";

// GET /api/v1/checkout/sessions/[id]/methods
// Liste des operateurs de paiement disponibles pour une session de checkout.
// Auth: cle secrete API (Authorization: Bearer <key> ou x-api-key), comme POST /sessions.

// Map ISO-3166 alpha-2 -> libelle pays (normalise sans accent) du catalogue,
// pour accepter ?country=ci aussi bien que ?country=Cote d Ivoire.
const ISO_TO_COUNTRY: Record<string, string> = {
    ci: "cote d ivoire", sn: "senegal", bj: "benin", tg: "togo",
    ml: "mali", bf: "burkina faso", ne: "niger", gn: "guinee",
    cm: "cameroun", cg: "congo", cd: "rd congo", ga: "gabon",
    gh: "ghana", ng: "nigeria", ke: "kenya", za: "afrique du sud",
    ma: "maroc", eg: "egypte", et: "ethiopie", rw: "rwanda",
    ug: "ouganda", tz: "tanzanie", zm: "zambie", zw: "zimbabwe",
    mw: "malawi", mz: "mozambique", sl: "sierra leone", ls: "lesotho",
};

function normalize(s: string): string {
    return (s || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/gi, " ")
        .toLowerCase()
        .trim();
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const origin = req.headers.get("origin");
    try {
        const { id } = await params;
        const h = req.headers.get("authorization");
        const k = req.headers.get("x-api-key");
        const secret = h && h.startsWith("Bearer ") ? h.split(" ")[1] : (k || "");
        if (!secret) {
            return NextResponse.json({ error: "Missing API key. Use Authorization: Bearer <key> or x-api-key header." }, { status: 401, headers: getCorsHeaders(origin, null) });
        }
        // Cle secrete, ou cle publique (SoftPay : lecture seule d'une session
        // dont l'identifiant n'est pas devinable).
        let auth = await authenticateApiKey(secret);
        if (!auth && estClePublique(secret)) auth = await authenticatePublicKey(secret);
        if (!auth) {
            return NextResponse.json({ error: "Invalid API Key" }, { status: 401, headers: getCorsHeaders(origin, null) });
        }

        const tx = await prisma.transaction.findUnique({ where: { id } });
        // Une cle de test ne voit que des sessions de test, et inversement.
        if (!tx || tx.applicationId !== auth.applicationId || ((tx as any).test === true) !== auth.test) {
            return NextResponse.json({ error: "Session introuvable" }, { status: 404, headers: getCorsHeaders(origin, null) });
        }

        const rawCountry = (new URL(req.url).searchParams.get("country") || "").trim();
        const q = normalize(rawCountry);
        const target = ISO_TO_COUNTRY[q] || q;

        const all = await getPaymentMethodsByAppId(auth.applicationId);
        // Meme logique que la page checkout : le filtre pays garde aussi les
        // methodes globales (cartes UEMOA/International) valables partout.
        const GLOBAL = new Set(["uemoa", "cemac", "international", "global"]);
        const methods = (Array.isArray(all) ? all : [])
            .filter((m: any) => {
                if (!q) return true;
                const mc = normalize(m && m.country);
                return mc === target || mc === q || GLOBAL.has(mc);
            })
            .map((m: any) => ({
                code: m.code,
                gatewayId: m.gatewayId,
                name: m.name,
                provider: m.gateway ?? null,
                country: m.country ?? null,
                type: m.type ?? null,
                flag: m.flag ?? null,
                logo: m.logo ?? null,
            }))
            .filter((m: any) => m.code && m.gatewayId);

        return NextResponse.json({ id: tx.id, currency: tx.currency, methods }, { status: 200, headers: getCorsHeaders(origin, null) });
    } catch (e: any) {
        return NextResponse.json({ error: (e && e.message) || "Erreur" }, { status: 500, headers: getCorsHeaders(origin, null) });
    }
}

export async function OPTIONS(req: Request) {
    return corsPreflightResponse(req.headers.get("origin"), null);
}
