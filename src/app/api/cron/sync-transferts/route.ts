import { NextRequest, NextResponse } from "next/server";
import { synchroniserEnCours } from "@/lib/transferts";

/**
 * Toutes les cinq minutes : demande au fournisseur l'etat des transferts
 * encore ouverts. C'est ce qui tranche quand un rappel s'est perdu, ou quand
 * l'envoi lui-meme est reste sans reponse.
 */
export async function GET(req: NextRequest) {
    const secret = req.headers.get("x-cron-secret");
    if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const bilan = await synchroniserEnCours(50);
    return NextResponse.json({ ok: true, ...bilan });
}
