"use client";

import React, { useState, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import type { CheckoutTheme } from "@/lib/checkout-themes";
import { AvatarMarchand, POLICE_MONTANT, POLICE_TEXTE, useLangueCoque, type Marchand } from "@/components/checkout/coque";

/**
 * Panneau de gauche d'un LIEN DE PAIEMENT : une vraie page produit.
 *
 * Le checkout heberge garde `PanneauMarchand` (une ligne, un montant) : la, le
 * client sait deja ce qu'il achete, il vient de la boutique. Un lien de
 * paiement, lui, est souvent la PREMIERE page que le client voit, envoyee par
 * WhatsApp : il lui faut des images, un titre lisible, le prix et la
 * description avant de donner ses coordonnees.
 *
 * Sur telephone, tout se replie derriere « Details » comme le reste des pages
 * de paiement, mais la vignette et le prix restent visibles.
 */

const MOTS = {
    fr: { details: "Détails", payerA: "Payer à {nom}", image: "Image {n}", suivante: "Image suivante", precedente: "Image précédente" },
    en: { details: "Details", payerA: "Pay {nom}", image: "Image {n}", suivante: "Next image", precedente: "Previous image" },
} as const;

export type LigneResume = { label: string; valeur: string; fort?: boolean };

export function PanneauProduit({ theme, marchand, titre, description, images, montant, devise, etiquette, lignes, enfants }: {
    theme: CheckoutTheme;
    marchand: Marchand;
    titre: string;
    description?: string | null;
    images?: string[];
    /** Montant deja formate. Vide sur un lien a montant libre non encore saisi. */
    montant: string;
    devise: string;
    etiquette?: string;
    lignes?: LigneResume[];
    enfants?: ReactNode;
}) {
    const langue = useLangueCoque();
    const mot = (cle: keyof typeof MOTS.fr, valeurs?: Record<string, string | number>) => {
        let texte: string = MOTS[langue][cle] ?? MOTS.fr[cle];
        for (const [k, v] of Object.entries(valeurs || {})) texte = texte.replace(`{${k}}`, String(v));
        return texte;
    };

    const galerie = (images || []).filter(Boolean);
    const [actuelle, setActuelle] = useState(0);
    const [ouvert, setOuvert] = useState(false);
    const vue = galerie[Math.min(actuelle, galerie.length - 1)];
    const bouger = (pas: number) => setActuelle((i) => (i + pas + galerie.length) % galerie.length);

    const Devise = <span className="ml-1.5 text-[15px] font-medium" style={{ fontFamily: POLICE_TEXTE, color: theme.textMuted }}>{devise}</span>;

    /**
     * L'image principale. Sans image, AUCUN cadre : un grand rectangle vide
     * repousserait le formulaire hors de l'ecran sur telephone, et la plupart
     * des liens existants n'ont pas d'image.
     */
    const visuel = galerie.length > 0 && (
        <div className="relative overflow-hidden rounded-2xl" style={{ background: theme.methodHoverBg, border: `1px solid ${theme.divider}`, aspectRatio: "4 / 3" }}>
            <img src={vue} alt={titre} className="h-full w-full object-cover" />
            {galerie.length > 1 && (
                <>
                    <button type="button" aria-label={mot("precedente")} onClick={() => bouger(-1)}
                        className="absolute left-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-content-center rounded-full transition-opacity hover:opacity-80"
                        style={{ background: theme.cardBg, border: `1px solid ${theme.divider}`, color: theme.textSecondary }}><ChevronLeft size={16} /></button>
                    <button type="button" aria-label={mot("suivante")} onClick={() => bouger(1)}
                        className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-content-center rounded-full transition-opacity hover:opacity-80"
                        style={{ background: theme.cardBg, border: `1px solid ${theme.divider}`, color: theme.textSecondary }}><ChevronRight size={16} /></button>
                </>
            )}
        </div>
    );

    const vignettes = galerie.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
            {galerie.map((src, i) => (
                <button key={src.slice(0, 48) + i} type="button" onClick={() => setActuelle(i)} aria-label={mot("image", { n: i + 1 })} aria-current={i === actuelle}
                    className="h-14 w-14 overflow-hidden rounded-lg transition-opacity hover:opacity-90"
                    style={{ border: `2px solid ${i === actuelle ? theme.accent : theme.divider}` }}>
                    <img src={src} alt="" className="h-full w-full object-cover" />
                </button>
            ))}
        </div>
    );

    const resume = lignes && lignes.length > 0 && (
        <div className="mt-5 overflow-hidden rounded-xl" style={{ border: `1px solid ${theme.divider}` }}>
            {lignes.map((l, i) => (
                <div key={l.label} className="flex items-center justify-between px-4 py-2.5 text-[13px]" style={i > 0 ? { borderTop: `1px solid ${theme.divider}` } : undefined}>
                    <span style={{ color: l.fort ? theme.textSecondary : theme.textMuted }}>{l.label}</span>
                    <span className={l.fort ? "text-[14px] font-semibold" : "font-medium"} style={{ color: theme.textPrimary }}>{l.valeur}</span>
                </div>
            ))}
        </div>
    );

    return (
        <div className="flex flex-col">
            {/* Telephone : vignette, prix, et le reste derriere « Details » */}
            <div className="flex items-center gap-3 lg:hidden">
                {vue ? (
                    <img src={vue} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" style={{ border: `1px solid ${theme.divider}` }} />
                ) : (
                    <AvatarMarchand marchand={marchand} theme={theme} taille={40} />
                )}
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px]" style={{ color: theme.textMuted }}>{titre || mot("payerA", { nom: marchand.nom })}</p>
                    <p className="text-[24px] leading-tight" style={{ fontFamily: POLICE_MONTANT, color: theme.textPrimary }}>
                        {montant || etiquette}{montant ? Devise : null}
                    </p>
                </div>
                <button type="button" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert}
                    className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-[12px] font-medium"
                    style={{ background: theme.methodHoverBg, color: theme.textSecondary }}>
                    {mot("details")} <ChevronDown size={13} className={`transition-transform ${ouvert ? "rotate-180" : ""}`} />
                </button>
            </div>

            {/* Ordinateur, et telephone une fois deplie : la fiche produit complete */}
            <div className={`${ouvert ? "mt-4 block" : "hidden"} lg:mt-0 lg:block`}>
                <div className="hidden items-center gap-3 lg:flex">
                    <AvatarMarchand marchand={marchand} theme={theme} taille={44} />
                    <span className="text-[15px] font-medium" style={{ color: theme.textSecondary }}>{marchand.nom}</span>
                </div>

                {visuel && (
                    <div className="lg:mt-8">
                        {visuel}
                        {vignettes}
                    </div>
                )}

                <h2 className={`text-[22px] font-semibold leading-snug tracking-tight ${visuel ? "mt-5" : "mt-5 lg:mt-8"}`} style={{ color: theme.textPrimary }}>{titre}</h2>
                <p className="mt-4 text-[13px]" style={{ color: theme.textMuted }}>{etiquette}</p>
                {montant && (
                    <p className="mt-1 text-[38px] leading-none tracking-tight" style={{ fontFamily: POLICE_MONTANT, color: theme.textPrimary }}>{montant}{Devise}</p>
                )}
                {description && (
                    <p className="mt-4 whitespace-pre-line text-[13.5px] leading-relaxed" style={{ color: theme.textSecondary }}>{description}</p>
                )}

                {resume}
                {enfants}
            </div>
        </div>
    );
}
