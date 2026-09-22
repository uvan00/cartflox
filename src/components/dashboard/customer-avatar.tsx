"use client";

import { useEffect, useState, type CSSProperties } from "react";

/**
 * Avatar client : la PHOTO Gravatar de l'email si elle existe, sinon un avatar
 * DESSINE (Gravatar `d=retro` pour un email, DiceBear sinon). Hash SHA-256 natif
 * (crypto.subtle, supporte par Gravatar) -> aucune dependance.
 */
async function sha256Hex(input: string): Promise<string> {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
    return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

const diceBear = (seed: string) =>
    `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(seed.toLowerCase() || "client")}`;

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
    const fallback = diceBear(name || email || "client");
    const [src, setSrc] = useState<string>(fallback);

    useEffect(() => {
        let alive = true;
        const e = (email || "").trim().toLowerCase();
        if (!e) {
            setSrc(diceBear(name || "client"));
            return;
        }
        // Gravatar : photo de l'email si elle existe, sinon un avatar dessine (retro).
        sha256Hex(e)
            .then((h) => {
                if (alive) setSrc(`https://www.gravatar.com/avatar/${h}?s=${size * 2}&d=retro`);
            })
            .catch(() => {});
        return () => {
            alive = false;
        };
    }, [email, name, size]);

    return (
        <img
            src={src}
            alt={name || ""}
            width={size}
            height={size}
            referrerPolicy="no-referrer"
            onError={() => setSrc(diceBear(name || email || "client"))}
            style={{
                width: size,
                height: size,
                borderRadius: square ? 8 : "50%",
                objectFit: "cover",
                flexShrink: 0,
                background: "rgba(127,127,127,0.12)",
                ...style,
            }}
        />
    );
}
