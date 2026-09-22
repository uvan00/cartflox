import type { CSSProperties } from "react";

/**
 * Drapeau d'un pays, en SVG.
 *
 * Fichiers : flag-icons (MIT, github.com/lipis/flag-icons), copies dans
 * public/flags/4x3. On sert le SVG en <img> plutot que d'importer la feuille
 * du paquet : seuls les drapeaux reellement affiches sont telecharges, et
 * plus rien ne passe par un CDN exterieur (flagcdn.com auparavant).
 */

/** Nos donnees ecrivent UK pour le Royaume-Uni ; flag-icons ne connait que l'ISO (gb). */
const ALIAS: Record<string, string> = { uk: "gb" };

/** Chemin du SVG, pour les cas ou il faut poser l'<img> soi-meme (recadrage rond...). */
export function cheminDrapeau(code: string): string {
    const c = String(code || "").trim().toLowerCase();
    return `/flags/4x3/${ALIAS[c] || c}.svg`;
}

export function Drapeau({ code, taille = 16, nom, className, style }: {
    /** Code ISO 3166-1 alpha-2, dans n'importe quelle casse. */
    code: string;
    /** Hauteur en pixels ; la largeur suit le rapport 4/3. */
    taille?: number;
    /** A renseigner quand le drapeau est SEUL : il devient alors son propre libelle. */
    nom?: string;
    className?: string;
    style?: CSSProperties;
}) {
    const c = String(code || "").trim().toLowerCase();
    if (!/^[a-z]{2}$/.test(c)) return null;
    const largeur = Math.round((taille * 4) / 3);
    return (
        <img
            src={cheminDrapeau(c)}
            alt={nom || ""}
            aria-hidden={nom ? undefined : true}
            title={nom || undefined}
            width={largeur}
            height={taille}
            loading="lazy"
            decoding="async"
            className={className}
            style={{ display: "inline-block", width: largeur, height: taille, borderRadius: 2, objectFit: "cover", flexShrink: 0, verticalAlign: "middle", ...style }}
        />
    );
}
