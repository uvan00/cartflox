import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-auth";

/**
 * Les transferts exigent la cle SECRETE de l'espace (Authorization: Bearer ...
 * ou x-api-key). La cle publique du widget ne peut pas faire sortir d'argent.
 */
export async function authentifierApiTransferts(req: NextRequest): Promise<{ applicationId: string } | NextResponse> {
    const auth = req.headers.get("authorization");
    const cle = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : (req.headers.get("x-api-key") || "").trim();
    if (!cle) return NextResponse.json({ error: "Clé API absente. Utilisez Authorization: Bearer <clé secrète> ou x-api-key.", code: "unauthorized" }, { status: 401 });
    const ok = await authenticateApiKey(cle);
    if (!ok) return NextResponse.json({ error: "Clé API invalide. Les transferts exigent la clé SECRÈTE de l'espace.", code: "unauthorized" }, { status: 401 });
    // Une cle de TEST ne fait pas sortir d'argent : le bac a sable couvre l'encaissement, pas les transferts.
    if (ok.test) return NextResponse.json({ error: "Les transferts ne sont pas disponibles en mode test : utilisez votre clé de production.", code: "test_mode" }, { status: 403 });
    return { applicationId: ok.applicationId };
}
