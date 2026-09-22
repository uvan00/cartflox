"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import type { CheckoutTheme } from "@/lib/checkout-themes";
import { champStyle } from "@/components/checkout/coque";
import { Drapeau } from "@/components/ui/drapeau";

/**
 * Liste déroulante maison. Le menu natif d'un téléphone ne se style pas et
 * s'ouvre différemment sur chaque appareil : ici tout est dessiné, au clavier
 * comme au doigt, avec une recherche quand la liste est longue.
 */
export type Option = { valeur: string; libelle: string; codePays?: string; groupe?: string };

const sansAccent = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function Liste({ theme, options, valeur, onChange, vide = "Choisir", recherche, erreur, id }: {
    theme: CheckoutTheme;
    options: Option[];
    valeur: string;
    onChange: (v: string) => void;
    vide?: string;
    recherche?: string;
    erreur?: boolean;
    id?: string;
}) {
    const [ouvert, setOuvert] = useState(false);
    const [filtre, setFiltre] = useState("");
    const [actif, setActif] = useState(0);
    const boite = useRef<HTMLDivElement>(null);
    const champRecherche = useRef<HTMLInputElement>(null);
    const listeRef = useRef<HTMLUListElement>(null);

    const choisi = options.find((o) => o.valeur === valeur) || null;
    const visibles = useMemo(() => {
        const q = sansAccent(filtre).trim();
        if (!q) return options;
        const vus = new Set<string>();
        return options.filter((o) => sansAccent(o.libelle).includes(q) && !vus.has(o.valeur) && vus.add(o.valeur));
    }, [options, filtre]);

    useEffect(() => {
        if (!ouvert) return;
        const dehors = (e: MouseEvent) => { if (boite.current && !boite.current.contains(e.target as Node)) setOuvert(false); };
        document.addEventListener("mousedown", dehors);
        return () => document.removeEventListener("mousedown", dehors);
    }, [ouvert]);

    useEffect(() => {
        if (!ouvert) return;
        setFiltre("");
        setActif(Math.max(0, visibles.findIndex((o) => o.valeur === valeur)));
        if (recherche) setTimeout(() => champRecherche.current?.focus(), 20);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ouvert]);

    useEffect(() => {
        listeRef.current?.querySelector<HTMLElement>(`[data-i="${actif}"]`)?.scrollIntoView({ block: "nearest" });
    }, [actif, visibles.length]);

    function clavier(e: React.KeyboardEvent) {
        if (!ouvert) {
            if (["ArrowDown", "Enter", " "].includes(e.key)) { e.preventDefault(); setOuvert(true); }
            return;
        }
        if (e.key === "Escape") { e.preventDefault(); setOuvert(false); return; }
        if (e.key === "ArrowDown") { e.preventDefault(); setActif((i) => Math.min(visibles.length - 1, i + 1)); return; }
        if (e.key === "ArrowUp") { e.preventDefault(); setActif((i) => Math.max(0, i - 1)); return; }
        if (e.key === "Home") { e.preventDefault(); setActif(0); return; }
        if (e.key === "End") { e.preventDefault(); setActif(visibles.length - 1); return; }
        if (e.key === "Enter" || e.key === "Tab") {
            const o = visibles[actif];
            if (o) { e.preventDefault(); onChange(o.valeur); setOuvert(false); }
        }
    }

    let groupeVu: string | undefined;

    return (
        <div className="relative" ref={boite}>
            <button
                type="button" id={id} onClick={() => setOuvert((v) => !v)} onKeyDown={clavier}
                aria-haspopup="listbox" aria-expanded={ouvert}
                className="flex h-12 w-full items-center gap-2.5 rounded-xl px-4 text-left outline-none transition-colors"
                style={champStyle(theme, erreur)}
            >
                {choisi?.codePays && <Drapeau code={choisi.codePays} taille={14} className="shrink-0" />}
                <span className="min-w-0 flex-1 truncate" style={{ color: choisi ? theme.textPrimary : theme.textMuted, fontSize: choisi ? 15 : 14 }}>
                    {choisi ? choisi.libelle : vide}
                </span>
                <ChevronDown size={16} className="shrink-0 transition-transform" style={{ color: theme.textMuted, transform: ouvert ? "rotate(180deg)" : "none" }} />
            </button>

            {ouvert && (
                <div className="absolute left-0 right-0 z-50 mt-1.5 overflow-hidden rounded-xl"
                    style={{ background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, boxShadow: "0 18px 40px rgba(15,15,20,.16)" }}>
                    {recherche && (
                        <div className="p-2.5" style={{ borderBottom: `1px solid ${theme.divider}` }}>
                            <div className="flex h-10 items-center gap-2 rounded-lg px-3" style={{ background: theme.methodHoverBg, border: `1px solid ${theme.methodBorder}` }}>
                                <Search size={14} style={{ color: theme.textMuted }} />
                                <input
                                    ref={champRecherche} value={filtre} onChange={(e) => { setFiltre(e.target.value); setActif(0); }}
                                    onKeyDown={clavier} placeholder={recherche} aria-label={recherche}
                                    className="w-full bg-transparent text-[14px] outline-none" style={{ color: theme.textPrimary }}
                                />
                            </div>
                        </div>
                    )}
                    <ul ref={listeRef} role="listbox" className="max-h-[264px] overflow-y-auto p-1.5" style={{ overscrollBehavior: "contain" }}>
                        {visibles.length === 0 && (
                            <li className="px-3 py-5 text-center text-[13.5px]" style={{ color: theme.textMuted }}>Aucun résultat</li>
                        )}
                        {visibles.map((o, i) => {
                            const titre = !filtre && o.groupe && o.groupe !== groupeVu ? o.groupe : null;
                            if (titre) groupeVu = o.groupe;
                            const selectionne = o.valeur === valeur;
                            return (
                                <li key={o.valeur + i}>
                                    {titre && (
                                        <p className="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: theme.textMuted }}>{titre}</p>
                                    )}
                                    <div
                                        role="option" aria-selected={selectionne} data-i={i}
                                        onMouseEnter={() => setActif(i)}
                                        onClick={() => { onChange(o.valeur); setOuvert(false); }}
                                        className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-[14.5px]"
                                        style={{ background: i === actif ? theme.methodHoverBg : "transparent", color: theme.textPrimary, fontWeight: selectionne ? 600 : 400 }}
                                    >
                                        {o.codePays && <Drapeau code={o.codePays} taille={14} className="shrink-0" />}
                                        <span className="min-w-0 flex-1 truncate">{o.libelle}</span>
                                        {selectionne && <Check size={15} style={{ color: theme.accent === "#ffffff" ? theme.textPrimary : theme.accent }} />}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}
