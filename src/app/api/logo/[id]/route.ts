import { NextResponse } from "next/server";
import prisma from "@/lib/db";

// Servi tel quel : des images matricielles, qui ne peuvent rien executer. Un
// ancien logo SVG est servi dans un bac a sable sans script (les nouveaux sont
// rasterises a l'envoi) ; tout autre type declare (text/html...) est refuse.
const TYPES_SURS = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/x-icon", "image/vnd.microsoft.icon"]);

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

    // Seules les data URL sont servies : une adresse externe en ferait un
    // redirecteur ouvert vers un site choisi par le marchand.
    const m = brut.match(/^data:([^;,]+);base64,(.+)$/);
    if (!m) return new NextResponse(null, { status: 404 });
    const type = m[1].toLowerCase();
    if (type !== "image/svg+xml" && !TYPES_SURS.has(type)) return new NextResponse(null, { status: 404 });
    const octets = Buffer.from(m[2], "base64");
    const entetes: Record<string, string> = {
        "Content-Type": type,
        "Content-Length": String(octets.length),
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff",
    };
    if (type === "image/svg+xml") entetes["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
    return new NextResponse(new Uint8Array(octets), { headers: entetes });
}
