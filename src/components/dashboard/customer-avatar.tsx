"use client";

import type { CSSProperties } from "react";

/**
 * Pastille d'un client : ses initiales, dessinees ici. La version precedente
 * envoyait le nom du client a DiceBear et l'empreinte de son e-mail a Gravatar,
 * une requete externe par ligne de tableau : donnees des clients chez deux tiers
 * et des dizaines d'appels par page.
 */
const TEINTES = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6", "#f97316"];

function initiales(nom?: string | null, email?: string | null): string {
    const base = (nom || "").trim() || (email || "").split("@")[0] || "?";
    const mots = base.split(/[\s._-]+/).filter(Boolean);
    return (mots.length >= 2 ? mots[0][0] + mots[1][0] : base.slice(0, 2)).toUpperCase();
}

export default function CustomerAvatar({
    email,
    name,
    size = 32,
    square = true,
    style,
}: {
    email?: string | null;
    name?: string | null;
    size?: number;
    square?: boolean;
    style?: CSSProperties;
}) {
    const cle = (email || name || "?").toLowerCase();
    let h = 0;
    for (const ch of cle) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const fond = TEINTES[h % TEINTES.length];
    return (
        <span aria-hidden="true" style={{
            width: size, height: size, borderRadius: square ? Math.round(size / 4) : "50%", background: fond, color: "#ffffff",
            display: "inline-grid", placeItems: "center", fontSize: Math.max(10, Math.round(size * 0.38)), fontWeight: 600, letterSpacing: 0.3, flexShrink: 0, ...style,
        }}>
            {initiales(name, email)}
        </span>
    );
}
