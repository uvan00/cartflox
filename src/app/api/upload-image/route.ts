import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import sharp from "sharp";

// Simple base64 image storage — stores data URL directly in DB
// For production, swap this with Cloudinary/S3 upload
export async function POST(req: NextRequest) {
    try {
        // Auth check — only authenticated users can upload
        const session = await getSession();
        if (!session?.user) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        // Rate limit: 10 uploads/min per user
        const userId = (session.user as any).id || session.user.email || "unknown";
        const rl = await rateLimit(`upload:${userId}`, { limit: 10, windowSec: 60 });
        if (!rl.allowed) {
            return NextResponse.json({ success: false, error: "Trop de requêtes. Réessayez dans une minute." }, {
                status: 429,
                headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) }
            });
        }

        const formData = await req.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json({ success: false, error: "Aucun fichier fourni" }, { status: 400 });
        }

        const maxSize = 2 * 1024 * 1024; // 2MB
        if (file.size > maxSize) {
            return NextResponse.json({ success: false, error: "Fichier trop volumineux (max 2MB)" }, { status: 400 });
        }

        const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];
        if (!allowed.includes(file.type)) {
            return NextResponse.json({ success: false, error: "Format non supporté (JPG, PNG, WEBP, GIF, SVG)" }, { status: 400 });
        }

        const bytes = Buffer.from(await file.arrayBuffer());

        // L'image est stockee en base64 dans la base et recopiee dans les pages :
        // une photo de 2 Mo rendait le tableau de bord interminable a charger sur
        // telephone. On redimensionne a 512 px et on encode en WebP, ce qui donne
        // quelques dizaines de kilo-octets pour un rendu identique a l'ecran.
        // Le SVG passe par le meme chemin et devient une image matricielle : un
        // SVG peut porter un script, et le logo est servi par /api/logo sur
        // l'origine du tableau de bord.
        try {
            const reduit = await sharp(bytes, { animated: file.type === "image/gif", density: 192 })
                .rotate()
                .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
                .webp({ quality: 82 })
                .toBuffer();
            return NextResponse.json({ success: true, url: `data:image/webp;base64,${reduit.toString("base64")}` });
        } catch {
            // Illisible : on ne garde jamais des octets qu'on n'a pas su relire.
            return NextResponse.json({ success: false, error: "Image illisible : envoyez un fichier PNG, JPG, WEBP, GIF ou SVG valide." }, { status: 400 });
        }
    } catch (error) {
        console.error("Upload error:", error);
        return NextResponse.json({ success: false, error: "Erreur lors de l'upload" }, { status: 500 });
    }
}
