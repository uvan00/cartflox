import { NextRequest, NextResponse } from "next/server";
import { cronAutorise } from "@/lib/cron-auth";
import { synchroniserEnCours } from "@/lib/transferts";

/**
 * Toutes les cinq minutes : demande au fournisseur l'etat des transferts
 * encore ouverts. C'est ce qui tranche quand un rappel s'est perdu, ou quand
 * l'envoi lui-meme est reste sans reponse.
 */
export async function GET(req: NextRequest) {
    if (!cronAutorise(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const bilan = await synchroniserEnCours(50);
    return NextResponse.json({ ok: true, ...bilan });
}
