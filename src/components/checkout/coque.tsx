"use client";

import React, { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, Check, ChevronDown, Lock, Package } from "lucide-react";
import type { CheckoutTheme } from "@/lib/checkout-themes";
import { STYLES_A_ETAPES, type CheckoutStyleId } from "@/lib/checkout-styles";
import { MARQUE, MARQUE_ICONE, MARQUE_SITE, MARQUE_SITE_DEFINI } from "@/lib/marque";

/**
 * Coque commune des pages de paiement (lien de paiement, checkout, retour).
 * Deux colonnes, comme les checkouts de reference (Stripe Checkout, Polar,
 * Medusa) : a gauche le marchand et ce que l'on paie, a droite la carte de
 * paiement. Sur telephone, le resume se replie en une ligne au-dessus de la
 * carte. Toutes les couleurs viennent du theme choisi par le marchand.
 */

export const POLICE_TEXTE = "var(--font-inter-tight), Inter, system-ui, -apple-system, sans-serif";
export const POLICE_MONTANT = "var(--font-instrument-serif), Georgia, 'Times New Roman', serif";

export type Marchand = { nom: string; image?: string | null };

/**
 * Langue de la coque, fournie par <Coque langue=...> a tout ce qu'elle
 * contient (panneau marchand, pieds). Le francais reste la langue par defaut.
 */
export type LangueCoque = "fr" | "en";
const MOTS = {
    fr: { retour: "Retour", payerA: "Payer à {nom}", details: "Détails", modeTest: "Mode test : aucun argent réel ne sera débité", propulse: "Propulsé par", confidentialite: "Confidentialité", securite: "Sécurité", chiffre: "Paiement chiffré, données jamais conservées", aide: "Un problème ? WhatsApp", etapes: "Étapes", informations: "Informations", paiement: "Paiement", termine: "Terminé" },
    en: { retour: "Back", payerA: "Pay {nom}", details: "Details", modeTest: "Test mode: no real money will be charged", propulse: "Powered by", confidentialite: "Privacy", securite: "Security", chiffre: "Encrypted payment, no data stored", aide: "A problem? WhatsApp", etapes: "Steps", informations: "Details", paiement: "Payment", termine: "Completed" },
} as const;
const LangueContexte = createContext<LangueCoque>("fr");
export function useLangueCoque(): LangueCoque { return useContext(LangueContexte); }
function mot(langue: LangueCoque, cle: keyof typeof MOTS.fr, valeurs?: Record<string, string>): string {
    let texte: string = MOTS[langue][cle] ?? MOTS.fr[cle];
    for (const [k, v] of Object.entries(valeurs || {})) texte = texte.replace(`{${k}}`, v);
    return texte;
}

export function AvatarMarchand({ marchand, theme, taille = 40 }: { marchand: Marchand; theme: CheckoutTheme; taille?: number }) {
    return marchand.image ? (
        <img src={marchand.image} alt="" className="shrink-0 rounded-full object-cover" style={{ width: taille, height: taille, border: `1px solid ${theme.divider}` }} />
    ) : (
        <span className="grid shrink-0 place-content-center rounded-full font-semibold" style={{ width: taille, height: taille, background: theme.accent, color: theme.accentText, fontSize: taille * 0.42 }}>
            {(marchand.nom || "C").charAt(0).toUpperCase()}
        </span>
    );
}

export function PanneauMarchand({ theme, marchand, titre, description, montant, devise, sousMontant, lignes, retourUrl, etiquette, enfants }: {
    theme: CheckoutTheme;
    marchand: Marchand;
    titre: string;
    description?: string | null;
    montant: string;
    devise: string;
    sousMontant?: string | null;
    lignes?: { label: string; valeur: string }[];
    retourUrl?: string | null;
    etiquette?: string;
    enfants?: ReactNode;
}) {
    const [ouvert, setOuvert] = useState(false);
    const langue = useLangueCoque();
    const Devise = <span className="ml-1.5 text-[15px] font-medium" style={{ fontFamily: POLICE_TEXTE, color: theme.textMuted }}>{devise}</span>;
    return (
        <div className="flex flex-col">
            {retourUrl && (
                <a href={retourUrl} className="mb-8 hidden items-center gap-1.5 text-[13px] transition-opacity hover:opacity-70 lg:inline-flex" style={{ color: theme.textMuted, textDecoration: "none" }}>
                    <ArrowLeft size={14} /> {mot(langue, "retour")}
                </a>
            )}

            {/* Telephone : une ligne, details repliables */}
            <div className="flex items-center gap-3 lg:hidden">
                <AvatarMarchand marchand={marchand} theme={theme} taille={40} />
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px]" style={{ color: theme.textMuted }}>{mot(langue, "payerA", { nom: marchand.nom })}</p>
                    <p className="text-[24px] leading-tight" style={{ fontFamily: POLICE_MONTANT, color: theme.textPrimary }}>{montant}{Devise}</p>
                </div>
                <button type="button" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert}
                    className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-[12px] font-medium"
                    style={{ background: theme.methodHoverBg, color: theme.textSecondary }}>
                    {mot(langue, "details")} <ChevronDown size={13} className={`transition-transform ${ouvert ? "rotate-180" : ""}`} />
                </button>
            </div>

            {/* Ordinateur : panneau complet */}
            <div className={`${ouvert ? "mt-4 block" : "hidden"} lg:mt-0 lg:block`}>
                <div className="hidden items-center gap-3 lg:flex">
                    <AvatarMarchand marchand={marchand} theme={theme} taille={44} />
                    <span className="text-[15px] font-medium" style={{ color: theme.textSecondary }}>{marchand.nom}</span>
                </div>
                <p className="mt-0 text-[13px] lg:mt-8" style={{ color: theme.textMuted }}>{etiquette || "Montant à payer"}</p>
                <p className="mt-1 hidden text-[46px] leading-none tracking-tight lg:block" style={{ fontFamily: POLICE_MONTANT, color: theme.textPrimary }}>{montant}{Devise}</p>
                {sousMontant && <p className="mt-2 text-[12px]" style={{ color: theme.textMuted }}>{sousMontant}</p>}

                <div className="mt-5 overflow-hidden rounded-xl lg:mt-8" style={{ border: `1px solid ${theme.divider}` }}>
                    <div className="flex items-start gap-3 p-4">
                        <span className="grid h-10 w-10 shrink-0 place-content-center rounded-lg" style={{ background: theme.methodHoverBg, color: theme.textSecondary }}><Package size={18} /></span>
                        <div className="min-w-0">
                            <p className="text-[14px] font-medium leading-snug" style={{ color: theme.textPrimary }}>{titre}</p>
                            {description && <p className="mt-0.5 text-[12px] leading-relaxed" style={{ color: theme.textMuted }}>{description}</p>}
                        </div>
                    </div>
                    {lignes?.map((l) => (
                        <div key={l.label} className="flex items-center justify-between px-4 py-2.5 text-[13px]" style={{ borderTop: `1px solid ${theme.divider}` }}>
                            <span style={{ color: theme.textMuted }}>{l.label}</span>
                            <span className="font-medium" style={{ color: theme.textPrimary }}>{l.valeur}</span>
                        </div>
                    ))}
                </div>
                {enfants}
            </div>
        </div>
    );
}

export function PiedCartflox({ theme }: { theme: CheckoutTheme }) {
    const langue = useLangueCoque();
    const lien = { color: theme.textMuted, textDecoration: "none" } as const;
    return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px]" style={{ color: theme.textMuted }}>
            {/* La marque vient de src/lib/marque.ts : ce pied est vu par les CLIENTS
                du marchand, il doit donc porter la marque de CETTE instance. */}
            <a href={MARQUE_SITE} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 transition-opacity hover:opacity-70" style={lien}>
                <span>{mot(langue, "propulse")}</span>
                <img src={MARQUE_ICONE} alt="" className="h-3.5 w-3.5" />
                <span className="font-semibold" style={{ color: theme.textSecondary }}>{MARQUE}</span>
            </a>
            <span className="hidden h-3 w-px sm:block" style={{ background: theme.divider }} />
            {MARQUE_SITE_DEFINI && (<>
                <a href={`${MARQUE_SITE}/privacy`} target="_blank" rel="noopener noreferrer" className="transition-opacity hover:opacity-70" style={lien}>{mot(langue, "confidentialite")}</a>
                <a href={`${MARQUE_SITE}/compliance`} target="_blank" rel="noopener noreferrer" className="transition-opacity hover:opacity-70" style={lien}>{mot(langue, "securite")}</a>
            </>)}
        </div>
    );
}

/**
 * Les trois etapes du paiement (styles boutique et express) : ce qui est fait
 * en vert, l'etape en cours pleine, la suivante en gris.
 */
export function Etapes({ theme, actif, langue }: { theme: CheckoutTheme; actif: 1 | 2 | 3; langue: LangueCoque }) {
    const noms = [mot(langue, "informations"), mot(langue, "paiement"), mot(langue, "termine")];
    return (
        <ol className="flex items-center gap-2 sm:gap-3" aria-label={mot(langue, "etapes")}>
            {noms.map((nom, i) => {
                const n = i + 1;
                const fait = n < actif;
                const enCours = n === actif;
                return (
                    <React.Fragment key={nom}>
                        {i > 0 && <span className="h-px min-w-3 flex-1" style={{ background: theme.divider }} aria-hidden="true" />}
                        <li className="flex shrink-0 items-center gap-2" aria-current={enCours ? "step" : undefined}>
                            <span className="grid h-7 w-7 place-content-center rounded-full text-[12px] font-semibold"
                                style={fait ? { background: theme.secureBadgeBg, color: theme.secureBadgeText } : enCours ? { background: theme.accent, color: theme.accentText } : { background: theme.methodHoverBg, color: theme.textMuted }}>
                                {fait ? <Check size={13} strokeWidth={3} /> : n}
                            </span>
                            <span className={`text-[13.5px] font-medium ${enCours ? "" : "hidden sm:inline"}`} style={{ color: fait || enCours ? theme.textPrimary : theme.textMuted }}>{nom}</span>
                        </li>
                    </React.Fragment>
                );
            })}
        </ol>
    );
}

/**
 * La coque, dans le style choisi par le marchand (lib/checkout-styles.ts) :
 * - classique : deux colonnes, le detail a gauche, la carte a droite ;
 * - boutique et express : le detail dans une carte a gauche, un grand panneau
 *   a droite avec les etapes en haut ;
 * - cartes : des cartes empilees sur telephone, cote a cote sur ordinateur.
 */
export function Coque({ theme, test, gauche, children, largeurCarte = 480, langue = "fr", style = "classique", etape }: {
    theme: CheckoutTheme; test?: boolean; gauche: ReactNode; children: ReactNode; largeurCarte?: number; langue?: LangueCoque; style?: CheckoutStyleId; etape?: 1 | 2 | 3;
}) {
    const bandeauTest = test && (
        <div className="sticky top-0 z-[60] px-3 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wider" style={{ background: "#FBBF24", color: "#7C2D12" }}>
            {mot(langue, "modeTest")}
        </div>
    );
    const carte = { background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, boxShadow: theme.cardShadow } as const;
    // Fond du document et barre d'etat accordes au theme du marchand : c'est ce
    // que le navigateur montre sous la barre d'etat, au rebond du defilement et
    // avant que la page soit peinte (voir html.page-paiement, globals.css).
    useEffect(() => {
        document.documentElement.style.setProperty("--fond-paiement", theme.pageBg);
        document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.pageBg);
    }, [theme.pageBg]);

    let corps: ReactNode;
    if (STYLES_A_ETAPES.includes(style)) {
        corps = (
            <div className="mx-auto w-full max-w-[1200px] px-4 pb-10 pt-5 lg:flex lg:items-start lg:gap-8 lg:px-8 lg:py-10">
                <aside className="lg:w-[42%] lg:shrink-0">
                    <div className="rounded-2xl p-5 lg:p-6" style={carte}>{gauche}</div>
                    <div className="mt-6 hidden lg:block"><PiedCartflox theme={theme} /></div>
                </aside>
                <main className="mt-4 lg:mt-0 lg:min-w-0 lg:flex-1">
                    <div className="overflow-hidden rounded-2xl" style={carte}>
                        {etape && (
                            <div className="px-6 pt-6 lg:px-10 lg:pt-8">
                                <Etapes theme={theme} actif={etape} langue={langue} />
                                <div className="mt-6 h-px" style={{ background: theme.divider }} />
                            </div>
                        )}
                        <div className="lg:px-4 lg:py-2">{children}</div>
                    </div>
                    <div className="mt-6 lg:hidden"><PiedCartflox theme={theme} /></div>
                </main>
            </div>
        );
    } else if (style === "cartes") {
        // Telephone : les cartes empilees. Ordinateur : les deux cartes cote a
        // cote, le recapitulatif a gauche (colle en haut au defilement).
        corps = (
            <div className="mx-auto w-full max-w-[600px] px-4 pb-10 pt-5 sm:px-6 sm:py-10 lg:max-w-[1100px] lg:px-8">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
                    <section className="rounded-[26px] p-5 sm:p-6 lg:sticky lg:top-8 lg:w-[42%] lg:shrink-0" style={carte}>{gauche}</section>
                    <section className="overflow-hidden rounded-[26px] lg:min-w-0 lg:flex-1" style={carte}>{children}</section>
                </div>
                <div className="mt-4 px-2"><PiedCartflox theme={theme} /></div>
            </div>
        );
    } else {
        corps = (
            <div className="mx-auto w-full max-w-[1080px] lg:flex lg:min-h-screen">
                <aside className="px-5 pt-5 lg:flex lg:w-[46%] lg:shrink-0 lg:flex-col lg:px-12 lg:py-16">
                    {gauche}
                    <div className="mt-auto hidden pt-12 lg:block"><PiedCartflox theme={theme} /></div>
                </aside>
                <main className="px-4 pb-10 pt-4 lg:flex-1 lg:px-12 lg:py-16">
                    <div className="mx-auto w-full overflow-hidden rounded-2xl" style={{ maxWidth: largeurCarte, ...carte }}>
                        {children}
                    </div>
                    <div className="mx-auto mt-6 w-full lg:hidden" style={{ maxWidth: largeurCarte }}><PiedCartflox theme={theme} /></div>
                </main>
            </div>
        );
    }

    return (
        <LangueContexte.Provider value={langue}>
        <div className="min-h-screen" style={{ background: theme.pageBg, color: theme.textPrimary, fontFamily: POLICE_TEXTE }}>
            {bandeauTest}
            {corps}
        </div>
        </LangueContexte.Provider>
    );
}

/**
 * Lien WhatsApp du MARCHAND : le numero qu'il a connecte a Cartflox, sinon le
 * telephone de son compte. Le client qui a un probleme parle au vendeur, pas
 * a Cartflox. Sans numero, pas de lien plutot qu'un mauvais interlocuteur.
 */
export function whatsappMarchand(application?: { whatsapp?: { phoneNumber?: string | null } | null; user?: { phone?: string | null } | null } | null): string | undefined {
    const brut = application?.whatsapp?.phoneNumber || application?.user?.phone || "";
    const chiffres = String(brut).replace(/\D/g, "");
    return chiffres.length >= 8 ? `https://wa.me/${chiffres}` : undefined;
}

/** Pied de la carte : chiffrement + aide WhatsApp du marchand (si connu). */
export function PiedCarte({ theme, whatsapp }: { theme: CheckoutTheme; whatsapp?: string }) {
    const langue = useLangueCoque();
    return (
        <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4 text-[11.5px]" style={{ borderTop: `1px solid ${theme.divider}`, color: theme.textMuted }}>
            <span className="inline-flex items-center gap-1.5"><Lock size={12} /> {mot(langue, "chiffre")}</span>
            {whatsapp && (
                <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="font-medium underline-offset-2 hover:underline" style={{ color: theme.textSecondary }}>{mot(langue, "aide")}</a>
            )}
        </div>
    );
}

export function BoutonPrincipal({ theme, children, ...rest }: { theme: CheckoutTheme; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button {...rest}
            className={`flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 ${rest.className || ""}`}
            style={{ background: theme.accent, color: theme.accentText, ...(rest.style || {}) }}>
            {children}
        </button>
    );
}

export function BoutonSecondaire({ theme, children, ...rest }: { theme: CheckoutTheme; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button {...rest}
            className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-4 text-[13px] font-medium transition-colors ${rest.className || ""}`}
            style={{ background: theme.methodHoverBg, color: theme.textSecondary, ...(rest.style || {}) }}>
            {children}
        </button>
    );
}

export function Etiquette({ theme, children, droite }: { theme: CheckoutTheme; children: ReactNode; droite?: ReactNode }) {
    return (
        <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[12.5px] font-medium" style={{ color: theme.textSecondary }}>{children}</span>
            {droite}
        </div>
    );
}

export function champStyle(theme: CheckoutTheme, erreur?: boolean): React.CSSProperties {
    return { background: theme.methodHoverBg, border: `1px solid ${erreur ? "#ef4444" : theme.methodBorder}`, color: theme.textPrimary, fontSize: 16 };
}

export function Alerte({ theme, titre, texte, action }: { theme: CheckoutTheme; titre: string; texte?: ReactNode; action?: ReactNode }) {
    return (
        <div className="flex items-start gap-3 rounded-xl p-3.5" style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)" }}>
            <span className="grid h-8 w-8 shrink-0 place-content-center rounded-full" style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444" }}><AlertTriangle size={15} /></span>
            <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold" style={{ color: theme.textPrimary }}>{titre}</p>
                {texte && <p className="mt-0.5 text-[12px] leading-relaxed" style={{ color: theme.textSecondary }}>{texte}</p>}
                {action && <div className="mt-2">{action}</div>}
            </div>
        </div>
    );
}

export function LogosOperateurs({ logos, theme }: { logos: string[]; theme: CheckoutTheme }) {
    if (!logos.length) return null;
    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {logos.slice(0, 8).map((src) => (
                <span key={src} className="grid h-7 w-7 place-content-center rounded-full" style={{ background: "#fff", border: `1px solid ${theme.divider}` }}>
                    <img src={src} alt="" className="h-4 w-4 object-contain" />
                </span>
            ))}
        </div>
    );
}
