import Link from "next/link";
import type { Metadata } from "next";
import { MARQUE } from "@/lib/marque";

export const metadata: Metadata = { title: `Page introuvable : ${MARQUE}`, robots: { index: false, follow: false } };

/**
 * La page 404 de tous les hotes servis par l'application.
 * Sombre comme l'accueil, le nom de la marque, trois sorties : l'accueil, la
 * documentation, le support. Rien d'autre : quelqu'un qui arrive ici cherche
 * une porte, pas une lecture.
 *
 * Le nom est ECRIT, plus charge en image. Next inclut la frontiere 404 dans
 * chaque page, donc l'image etait prechargee partout sans jamais s'afficher :
 * une requete inutile sur toutes les pages, et le nom de la marque fige dans
 * le HTML. Du texte regle les deux.
 */
const bouton = { display: "inline-block", padding: "12px 20px", borderRadius: 12, fontWeight: 600, fontSize: 14, textDecoration: "none", color: "#fff" } as const;

export default function PageIntrouvable() {
    return (
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem", background: "#0f0f14", color: "#fff", fontFamily: "var(--font-poppins), Inter, system-ui, sans-serif" }}>
            <div style={{ maxWidth: 560, textAlign: "center" }}>
                <Link href="/" aria-label={`${MARQUE}, retour à l'accueil`} style={{ display: "inline-block", margin: "0 auto 40px", fontSize: 21, fontWeight: 600, letterSpacing: "-0.04em", color: "#fff", textDecoration: "none" }}>
                    {MARQUE}
                </Link>
                <p style={{ fontSize: 96, fontWeight: 700, lineHeight: 1, letterSpacing: -3, color: "#864FFE", margin: 0 }}>404</p>
                <h1 style={{ fontSize: 24, fontWeight: 600, margin: "20px 0 0" }}>Cette page n'existe pas</h1>
                <p style={{ color: "#a1a1aa", margin: "12px auto 0", lineHeight: 1.65, maxWidth: 440 }}>
                    L'adresse est peut-être mal recopiée, ou la page a été déplacée. Rien n'a été perdu de votre côté.
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12, marginTop: 32 }}>
                    <Link href="/" style={{ ...bouton, background: "#6D28D9" }}>Retour à l'accueil</Link>
                    <a href="/docs/" style={{ ...bouton, border: "1px solid #2a2a33", background: "#17171d" }}>Documentation</a>
                    <a href="https://wa.me/22554038858" target="_blank" rel="noopener noreferrer" style={{ ...bouton, border: "1px solid #2a2a33", background: "#17171d" }}>Écrire au support</a>
                </div>
                <p style={{ color: "#71717a", fontSize: 12, marginTop: 44 }}>Erreur 404, page introuvable.</p>
            </div>
        </main>
    );
}
