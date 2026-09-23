import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import prisma from "@/lib/db";
import { chiffreMontant } from "@/lib/devises";
import { getSelectedAppId } from "@/lib/actions/utils";
import PDFDocument from "pdfkit";
import sharp from "sharp";

/**
 * Reçu de paiement au format PDF.
 *
 * Un vrai fichier, que le marchand enregistre ou envoie à son client par
 * WhatsApp ou par e-mail, sans passer par la boîte d'impression du navigateur.
 * Réservé au propriétaire de l'espace qui a encaissé le paiement.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENCRE = "#0f172a";
const GRIS = "#64748b";
const TRAIT = "#e2e8f0";
const VERT = "#0f766e";

const montant = (n: number, devise?: string) => chiffreMontant(Number(n) || 0, devise).replace(/ /g, " ");

function dateLongue(d: Date) {
    return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
}

/** Le logo est stocké en data URL : pdfkit ne lit que PNG et JPEG. */
async function logoPng(image: string | null): Promise<Buffer | null> {
    const m = String(image || "").match(/^data:([^;,]+);base64,(.+)$/);
    if (!m || m[1] === "image/svg+xml") return null;
    try {
        return await sharp(Buffer.from(m[2], "base64")).resize(96, 96, { fit: "inside" }).png().toBuffer();
    } catch {
        return null;
    }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await getSession();
    if (!session?.user?.email) return new NextResponse("Non authentifié", { status: 401 });
    const appId = await getSelectedAppId();
    if (!appId) return new NextResponse("Aucun espace sélectionné", { status: 400 });

    const tx = await prisma.transaction.findFirst({ where: { id, applicationId: appId } });
    if (!tx) return new NextResponse("Paiement introuvable", { status: 404 });
    const app = (await (prisma as any).application.findUnique({ where: { id: appId }, select: { name: true, image: true, website: true, paymentMode: true } })) || {};

    const doc = new PDFDocument({ size: "A4", margin: 56, info: { Title: `Reçu ${tx.orderId}`, Author: app.name || "Cartflox" } });
    const morceaux: Buffer[] = [];
    doc.on("data", (c: Buffer) => morceaux.push(c));
    const fini = new Promise<Buffer>((r) => doc.on("end", () => r(Buffer.concat(morceaux))));

    const G = doc.page.margins.left;
    const D = doc.page.width - doc.page.margins.right;
    const large = D - G;

    // ---------- en-tête : qui a encaissé ----------
    const logo = await logoPng(app.image);
    let y = 56;
    if (logo) {
        doc.save();
        doc.roundedRect(G, y, 44, 44, 8).clip();
        doc.image(logo, G, y, { width: 44, height: 44 });
        doc.restore();
    }
    const xTexte = logo ? G + 58 : G;
    doc.font("Helvetica-Bold").fontSize(15).fillColor(ENCRE).text(app.name || "Reçu de paiement", xTexte, y + 4, { width: large - 170 });
    doc.font("Helvetica").fontSize(10.5).fillColor(GRIS).text("Reçu de paiement", xTexte, doc.y + 1, { width: large - 170 });

    const etat = tx.status === "SUCCESS" ? "PAYÉ" : tx.status === "REFUNDED" ? "REMBOURSÉ" : tx.status === "FAILED" ? "ÉCHOUÉ" : "EN ATTENTE";
    const couleurEtat = tx.status === "SUCCESS" ? VERT : tx.status === "REFUNDED" ? "#b45309" : GRIS;
    doc.font("Helvetica-Bold").fontSize(10);
    const largeurEtat = doc.widthOfString(etat) + 22;
    doc.roundedRect(D - largeurEtat, y + 6, largeurEtat, 24, 12).fillAndStroke(tx.status === "SUCCESS" ? "#ecfdf5" : "#f1f5f9", tx.status === "SUCCESS" ? "#a7f3d0" : TRAIT);
    doc.fillColor(couleurEtat).text(etat, D - largeurEtat, y + 13, { width: largeurEtat, align: "center" });

    y = 128;

    // ---------- le montant ----------
    doc.roundedRect(G, y, large, 92, 10).fill("#f8fafc");
    doc.font("Helvetica").fontSize(10.5).fillColor(GRIS).text("Montant payé", G + 20, y + 18);
    const somme = montant(tx.amount, tx.currency);
    doc.font("Helvetica-Bold").fontSize(30).fillColor(ENCRE).text(somme, G + 20, y + 34);
    const largeurSomme = doc.widthOfString(somme);
    doc.font("Helvetica").fontSize(14).fillColor(GRIS).text(tx.currency, G + 28 + largeurSomme, y + 50);
    doc.font("Helvetica").fontSize(10.5).fillColor(GRIS).text(dateLongue(new Date(tx.completedAt || tx.createdAt)), G + 20, y + 70);

    y += 120;

    // ---------- le détail ----------
    const meta: any = tx.metadata || {};
    const toutes: [string, string][] = [
        ["Payé par", tx.customerName || "Client"],
        ["Contact", [tx.customerEmail, tx.customerPhone].filter(Boolean).join(", ")],
        ["Objet", meta.description || ""],
        ["Moyen de paiement", tx.paymentType === "CARD" ? "Carte bancaire" : tx.paymentType === "MOBILE_MONEY" ? "Mobile Money" : String(tx.paymentType || "")],
        ["Traité par", app.paymentMode === "managed" ? "Cartflox" : String(tx.provider || "")],
        ["Référence", tx.orderId],
        ["Référence opérateur", String((tx as any).providerRef || "")],
    ];
    const lignes = toutes.filter(([, valeur]) => Boolean(valeur));

    for (const [cle, valeur] of lignes) {
        doc.font("Helvetica").fontSize(10.5).fillColor(GRIS).text(cle, G, y, { width: 180 });
        doc.font("Helvetica-Bold").fontSize(10.5).fillColor(ENCRE).text(valeur, G + 190, y, { width: large - 190, align: "right" });
        y = Math.max(doc.y, y + 16) + 6;
    }

    // ---------- commission, quand il y en a une ----------
    const frais = Number((tx as any).platformFee) || 0;
    if (frais > 0) {
        y += 8;
        doc.roundedRect(G, y, large, 62, 10).lineWidth(1).stroke(TRAIT);
        doc.font("Helvetica").fontSize(10.5).fillColor(GRIS).text("Commission Cartflox", G + 18, y + 16);
        doc.font("Helvetica-Bold").fillColor(ENCRE).text(`${montant(frais, tx.currency)} ${tx.currency}`, G + 18, y + 16, { width: large - 36, align: "right" });
        doc.font("Helvetica").fillColor(GRIS).text(`Net pour ${app.name || "le commerce"}`, G + 18, y + 36);
        doc.font("Helvetica-Bold").fillColor(ENCRE).text(`${montant((tx as any).merchantAmount || tx.amount - frais, tx.currency)} ${tx.currency}`, G + 18, y + 36, { width: large - 36, align: "right" });
        y += 78;
    }

    // ---------- pied ----------
    const bas = doc.page.height - doc.page.margins.bottom - 52;
    doc.moveTo(G, bas).lineTo(D, bas).lineWidth(1).stroke(TRAIT);
    doc.font("Helvetica").fontSize(9).fillColor(GRIS)
        .text(`Reçu émis par Cartflox${app.name ? ` pour ${app.name}` : ""}${app.website ? `, ${String(app.website).replace(/^https?:\/\//, "")}` : ""}`, G, bas + 14, { width: large, align: "center" })
        .text(`Identifiant de la transaction : ${tx.id}`, G, bas + 27, { width: large, align: "center" })
        .text(`Document établi le ${dateLongue(new Date())}`, G, bas + 40, { width: large, align: "center" });

    doc.end();
    const pdf = await fini;
    const nom = `recu-${String(tx.orderId || tx.id).replace(/[^a-zA-Z0-9-]/g, "")}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
        headers: {
            "Content-Type": "application/pdf",
            "Content-Length": String(pdf.length),
            "Content-Disposition": `attachment; filename="${nom}"`,
            "Cache-Control": "private, no-store",
        },
    });
}
