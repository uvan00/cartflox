import { NextRequest, NextResponse } from "next/server";
import { cronAutorise } from "@/lib/cron-auth";
import { rafraichirSantePawaPay } from "@/lib/orchestrator/sante-moyens";

// GET /api/cron/sante-moyens
// Appele toutes les 2 minutes par la crontab du serveur (25/09/2026). Relit la
// disponibilite publiee par PawaPay et met a jour la table SanteMoyen : un
// operateur ferme se grise dans les pages de paiement et le routeur l'evite ;
// retabli, il se degrise au passage suivant. Voir lib/orchestrator/sante-moyens.ts.
export async function GET(req: NextRequest) {
    if (!cronAutorise(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const debut = Date.now();
    const pawapay = await rafraichirSantePawaPay().catch((e: unknown) => ({ erreur: String((e as Error)?.message || e).slice(0, 200) }));
    return NextResponse.json({ ok: true, ms: Date.now() - debut, pawapay });
}
