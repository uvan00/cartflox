import { NextResponse } from "next/server";
import { rafraichirTaux, tauxActuels } from "@/lib/taux-change";

export const dynamic = "force-dynamic";

/**
 * Cours de l'instance, publics : `taux[D]` = combien de D vaut 1 XOF. La page
 * de paiement affiche ainsi le montant dans la devise que le serveur debite,
 * avec les memes cours que lui. Rafraichis une fois par jour au plus ; zone
 * franc et euro fixes.
 */
export async function GET() {
    await rafraichirTaux();
    const { taux, majLe } = tauxActuels();
    return NextResponse.json(
        { base: "XOF", majLe, taux },
        { headers: { "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" } },
    );
}
