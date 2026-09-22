import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { creerTransfert, listerTransferts, optionsPourEspace, ErreurTransfert, versApi } from "@/lib/transferts";
import { authentifierApiTransferts } from "@/lib/transferts/auth-api";

/**
 * API des transferts d'argent sortants.
 *
 *   POST /api/v1/transfers            envoyer une somme vers un compte Mobile Money
 *   GET  /api/v1/transfers            les derniers transferts de l'espace
 *   GET  /api/v1/transfers?options=1  pays et operateurs ouverts a cet espace
 *
 * Pas de CORS : ceci se parle de serveur a serveur. Un en-tete `Idempotency-Key`
 * (ou le champ `idempotency_key`) rend un second appel inoffensif.
 */
export async function POST(req: NextRequest) {
    const auth = await authentifierApiTransferts(req);
    if (auth instanceof NextResponse) return auth;

    const limite = await rateLimit(`transferts:${auth.applicationId}`, { limit: 30, windowSec: 60 });
    if (!limite.allowed) return NextResponse.json({ error: "Trop de demandes : 30 transferts par minute au plus.", code: "rate_limited" }, { status: 429 });

    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Corps JSON attendu.", code: "invalid_body" }, { status: 400 }); }

    try {
        const { transfert, rejoue } = await creerTransfert({
            applicationId: auth.applicationId,
            montant: Number(body.amount),
            devise: body.currency,
            pays: body.country,
            operateur: body.operator || body.method || body.network,
            telephone: body.phone || body.recipient_phone || body.msisdn,
            nomBeneficiaire: body.recipient_name,
            motif: body.description,
            cleIdempotence: req.headers.get("idempotency-key") || body.idempotency_key || undefined,
            source: "api",
            metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : undefined,
        });
        return NextResponse.json(versApi(transfert), { status: rejoue ? 200 : 201, headers: rejoue ? { "Idempotent-Replayed": "true" } : undefined });
    } catch (e: any) {
        if (e instanceof ErreurTransfert) return NextResponse.json({ error: e.message, code: e.code }, { status: e.http });
        console.error("[transfers] création :", e);
        return NextResponse.json({ error: "Erreur interne, le transfert n'a pas été créé.", code: "internal" }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    const auth = await authentifierApiTransferts(req);
    if (auth instanceof NextResponse) return auth;
    const url = new URL(req.url);
    if (url.searchParams.get("options")) {
        const o = await optionsPourEspace(auth.applicationId);
        return NextResponse.json({ countries: o.pays.map((p) => ({ code: p.code, name: p.nom, currency: p.devise, operators: p.operateurs.filter((x) => !x.desactive).map((x) => ({ code: x.code, name: x.nom, provider: x.fournisseur })) })).filter((p) => p.operators.length > 0) });
    }
    const statutApi = (url.searchParams.get("status") || "").toLowerCase();
    const statut = ({ pending: "EN_ATTENTE", processing: "EN_COURS", succeeded: "REUSSI", failed: "ECHOUE" } as Record<string, string>)[statutApi];
    const lignes = await listerTransferts(auth.applicationId, { statut, limite: Number(url.searchParams.get("limit")) || 50 });
    return NextResponse.json({ data: lignes.map(versApi), count: lignes.length });
}
