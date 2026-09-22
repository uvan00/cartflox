import QRCode from "qrcode";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * QR code aux couleurs Cartflox : la marque est posee au centre.
 *
 * Le code est genere avec la correction d'erreur la plus haute (niveau H,
 * 30 % de redondance) : la pastille centrale masque environ 8 % des modules,
 * le code reste donc lisible meme abime ou imprime en petit.
 *
 * Si la marque ne peut pas etre composee, on renvoie le QR nu : un code de
 * paiement doit toujours sortir.
 */
export async function qrCartflox(texte: string, largeur = 640): Promise<string> {
    const qr = await QRCode.toBuffer(texte, {
        errorCorrectionLevel: "H",
        width: largeur,
        margin: 1,
        color: { dark: "#0b0b0c", light: "#ffffff" },
    });

    try {
        const cote = Math.round(largeur * 0.19);
        const pastille = Math.round(cote * 1.4);
        const rayon = Math.round(pastille * 0.24);
        const marque = await sharp(await readFile(path.join(process.cwd(), "public/logos/cartflox-mark.png")))
            .resize(cote, cote, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
            .toBuffer();
        const fond = Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg" width="${pastille}" height="${pastille}"><rect width="${pastille}" height="${pastille}" rx="${rayon}" fill="#ffffff"/></svg>`
        );
        const png = await sharp(qr)
            .composite([
                { input: fond, top: Math.round((largeur - pastille) / 2), left: Math.round((largeur - pastille) / 2) },
                { input: marque, top: Math.round((largeur - cote) / 2), left: Math.round((largeur - cote) / 2) },
            ])
            .png()
            .toBuffer();
        return `data:image/png;base64,${png.toString("base64")}`;
    } catch (e) {
        console.error("QR : marque non composee", e);
        return `data:image/png;base64,${qr.toString("base64")}`;
    }
}
