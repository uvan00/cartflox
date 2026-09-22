import { NextRequest, NextResponse } from "next/server";
import { traiterCallbackTransfert } from "@/lib/transferts";

/**
 * Rappels des fournisseurs pour les transferts sortants :
 * /api/webhooks/transferts/{paydunya|monetbill|flutterwave|hub2|notchpay|fedapay|paystack|feexpay}.
 * Le corps n'est jamais cru sur parole : quand le fournisseur sait repondre,
 * on lui redemande l'etat ; sinon le rappel fait foi, sans toucher au solde.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ fournisseur: string }> }) {
    const { fournisseur } = await params;
    const brut = await req.text();
    let payload: any = {};
    try { payload = JSON.parse(brut); } catch { payload = Object.fromEntries(new URLSearchParams(brut)); }
    const issue = await traiterCallbackTransfert(fournisseur, payload);
    return NextResponse.json(issue, { status: issue.received ? 200 : 404 });
}

/** Certains fournisseurs verifient l'URL avant de l'enregistrer. */
export async function GET() {
    return NextResponse.json({ ok: true });
}
