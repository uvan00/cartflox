"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Largeur du menu lateral reglable a la souris : on tire son bord droit,
 * un double-clic remet la largeur d'origine, les fleches du clavier
 * l'ajustent pas a pas. La valeur est memorisee par navigateur.
 */
export const LARGEUR_MENU = 200;
const MIN = 168;
const MAX = 380;
const PAS = 16;

export function useLargeurMenu(cle = "cf-menu-largeur") {
    const [largeur, setLargeur] = useState(LARGEUR_MENU);
    const [glisse, setGlisse] = useState(false);

    useEffect(() => {
        try {
            const v = Number(localStorage.getItem(cle));
            if (v >= MIN && v <= MAX) setLargeur(v);
        } catch { /* stockage indisponible */ }
    }, [cle]);

    const memoriser = useCallback((v: number) => {
        try { localStorage.setItem(cle, String(v)); } catch { /* ignore */ }
    }, [cle]);

    const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const depart = e.clientX;
        const base = largeur;
        let courant = base;
        setGlisse(true);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        const bouge = (ev: PointerEvent) => {
            courant = Math.min(MAX, Math.max(MIN, base + ev.clientX - depart));
            setLargeur(courant);
        };
        const fin = () => {
            window.removeEventListener("pointermove", bouge);
            window.removeEventListener("pointerup", fin);
            window.removeEventListener("pointercancel", fin);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            setGlisse(false);
            memoriser(courant);
        };
        window.addEventListener("pointermove", bouge);
        window.addEventListener("pointerup", fin);
        window.addEventListener("pointercancel", fin);
    }, [largeur, memoriser]);

    const onDoubleClick = useCallback(() => { setLargeur(LARGEUR_MENU); memoriser(LARGEUR_MENU); }, [memoriser]);

    const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLElement>) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        const v = Math.min(MAX, Math.max(MIN, largeur + (e.key === "ArrowRight" ? PAS : -PAS)));
        setLargeur(v);
        memoriser(v);
    }, [largeur, memoriser]);

    return { largeur, glisse, poignee: { onPointerDown, onDoubleClick, onKeyDown } };
}

export function Poignee({ onPointerDown, onDoubleClick, onKeyDown }: {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
    onDoubleClick: () => void;
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
}) {
    return (
        <div role="separator" aria-orientation="vertical" aria-label="Largeur du menu" tabIndex={0}
            title="Glisser pour changer la largeur du menu, double-clic pour la rétablir"
            onPointerDown={onPointerDown} onDoubleClick={onDoubleClick} onKeyDown={onKeyDown}
            className="group absolute -right-1 top-0 z-[60] hidden h-full w-2 cursor-col-resize outline-none md:block">
            <span className="absolute left-[3px] top-0 h-full w-[2px] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" style={{ background: "var(--dt-brand)" }} />
        </div>
    );
}
