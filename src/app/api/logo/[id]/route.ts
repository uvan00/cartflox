import { NextResponse } from "next/server";
import prisma from "@/lib/db";

/**
 * Logo d'un espace, servi comme une image ordinaire.
 *
 * Les logos sont stockes en base64 dans la base : les recopier dans le HTML
 * alourdissait chaque page de plusieurs mega-octets. Ici le navigateur le
 * telecharge une fois et le garde en cache. Un logo est deja public : il
 * s'affiche sur la page de paiement vue par les clients.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const app = await prisma.application.findUnique({ where: { id }, select: { image: true, name: true } }).catch(() => null);
    const brut = app?.image || "";
    // Pas de logo : une pastille avec l'initiale, plutot qu'un 404 (le tableau de
    // bord Connect et la fiche de transaction demandent l'image sans savoir si
    // l'espace en a une ; chaque affichage laissait une erreur dans les journaux).
    if (!brut) {
        const initiale = String(app?.name || "?").trim().charAt(0).toUpperCase() || "?";
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#864FFE"/><text x="32" y="41" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="600" fill="#ffffff">${initiale.replace(/[<>&"]/g, "")}</text></svg>`;
        return new NextResponse(svg, {
            status: app ? 200 : 404,
            headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=600" },
        });
    }

    // Logo deja heberge ailleurs : on renvoie vers lui.
    if (/^https?:\/\//i.test(brut)) return NextResponse.redirect(brut, 302);

    const m = brut.match(/^data:([^;,]+);base64,(.+)$/);
    if (!m) return new NextResponse(null, { status: 404 });
    const octets = Buffer.from(m[2], "base64");
    return new NextResponse(new Uint8Array(octets), {
        headers: {
            "Content-Type": m[1],
            "Content-Length": String(octets.length),
            "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        },
    });
}
