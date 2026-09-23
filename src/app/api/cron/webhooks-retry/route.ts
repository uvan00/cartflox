import { NextRequest, NextResponse } from "next/server";
import { cronAutorise } from "@/lib/cron-auth";
import { rejouerLivraisonsDues } from "@/lib/webhook-dispatch";

/**
 * GET /api/cron/webhooks-retry : chaque minute par la crontab du VPS.
 * Rejoue les webhooks sortants dont l'heure de nouvelle tentative est passee
 * (10 tentatives sur 72 h, cf. src/lib/webhook-dispatch.ts).
 */
export async function GET(req: NextRequest) {
    if (!cronAutorise(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
        const resultat = await rejouerLivraisonsDues(50);
        if (resultat.dues) console.log(`[cron:webhooks-retry] ${resultat.livrees} livrée(s), ${resultat.echecs} échec(s) sur ${resultat.dues} due(s)`);
        return NextResponse.json({ ok: true, ...resultat });
    } catch (e: any) {
        console.error("[cron:webhooks-retry]", e);
        return NextResponse.json({ ok: false, error: e?.message || "erreur" }, { status: 500 });
    }
}
