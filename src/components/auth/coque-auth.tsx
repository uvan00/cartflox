"use client";

const SUPPORT_WHATSAPP = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || "";
import type { ReactNode } from "react";
import { Check, KeyRound, Lock } from "lucide-react";
import { getThemeById } from "@/lib/checkout-themes";
import { PiedCartflox, POLICE_TEXTE } from "@/components/checkout/coque";
import { MARQUE, MARQUE_ICONE, MARQUE_MOT, MARQUE_SITE, MARQUE_SITE_DEFINI, MARQUE_VILLE } from "@/lib/marque";

/**
 * Coque des pages de compte (connexion, inscription, mot de passe, ouverture
 * d'espace) : l'ecran entier, en deux colonnes. A gauche le formulaire, aligne
 * sur un seul axe (marque, titre, champs, mentions) ; a droite le panneau de
 * marque, encre et violet comme l'accueil de cartflox.com, qui rappelle ce que
 * le compte ouvre. Sur telephone, seule la colonne du formulaire reste.
 */
export const themeAuth = getThemeById("cartflox");

const ENCRE = "#0F0F14";
const VIOLET = "#864FFE";
const ANNEE = new Date().getFullYear();
/** Quelques moyens de paiement, en ronds, comme preuve visuelle. */
const LOGOS = ["wave", "orange_money", "momo", "moov_money", "credit_card"];

/* Champs de la colonne : blancs, bord fin, halo violet au focus. */
const STYLES = `
.auth-cartflox .champ-auth{background:#fff;border:1px solid #DCDCE3;color:#1a1a1c}
.auth-cartflox .champ-auth::placeholder{color:#9a9aa3}
.auth-cartflox .champ-auth:focus{border-color:${VIOLET};box-shadow:0 0 0 3px rgba(134,79,254,.16)}
.auth-cartflox .champ-auth[aria-invalid="true"]{border-color:#ef4444}
.auth-cartflox .bouton-oidc:hover:not(:disabled){background:#F7F7FA}
`;

type Panneau = { pastille: string; titre: ReactNode; texte: string; points: string[] };

const PANNEAU: Panneau = {
    pastille: "Orchestrateur de paiement",
    titre: <>Une seule intégration.<br />Toute l&apos;Afrique qui encaisse.</>,
    texte: "Wave, Orange Money, MTN MoMo, Moov, cartes et crypto : les agrégateurs du continent réunis dans un seul tableau de bord.",
    points: [
        "Le paiement se fait dans votre page, sans redirection.",
        "Un routage mesuré : chaque paiement part vers la passerelle qui réussit le mieux.",
        "Vos encaissements et vos transferts sortants au même endroit.",
    ],
};

export function CoqueAuth({ children, largeur = 400, marque = MARQUE }: { children: ReactNode; largeur?: number; marque?: string }) {
    const t = themeAuth;
    const p = PANNEAU;
    const lien = { color: t.textMuted, textDecoration: "none" } as const;
    return (
        <div className="auth-cartflox flex min-h-screen w-full" style={{ background: "#ffffff", color: t.textPrimary, fontFamily: POLICE_TEXTE }}>
            <style>{STYLES}</style>

            {/* Colonne du formulaire */}
            <div className="flex min-h-screen w-full flex-col px-6 sm:px-10 lg:w-1/2">
                <div className="mx-auto flex w-full flex-1 flex-col" style={{ maxWidth: largeur }}>
                    <header className="pt-7 lg:pt-9">
                        <a href={MARQUE_SITE} className="inline-flex items-center gap-2 no-underline" aria-label={marque}>
                            <img src={MARQUE_MOT} alt="" className="h-7 w-auto" />
                        </a>
                    </header>

                    <div className="flex flex-1 flex-col justify-center py-10">{children}</div>

                    <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-7 pr-20 text-[12px] sm:pr-0 lg:pb-9" style={{ color: t.textMuted }}>
                        <span className="inline-flex items-center gap-1.5"><Lock size={12} /> Connexion sécurisée</span>
                        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                            {MARQUE_SITE_DEFINI && (<>
                                <a href={`${MARQUE_SITE}/privacy`} target="_blank" rel="noopener noreferrer" className="transition-opacity hover:opacity-70" style={lien}>Confidentialité</a>
                                <a href={`${MARQUE_SITE}/compliance`} target="_blank" rel="noopener noreferrer" className="transition-opacity hover:opacity-70" style={lien}>Sécurité</a>
                            </>)}
                            {SUPPORT_WHATSAPP && <a href={`https://wa.me/${SUPPORT_WHATSAPP}`} target="_blank" rel="noopener noreferrer" className="font-medium transition-opacity hover:opacity-70" style={lien}>Aide</a>}
                        </span>
                    </footer>
                </div>
            </div>

            {/* Panneau de marque */}
            <aside className="relative hidden overflow-hidden lg:flex lg:w-1/2 lg:flex-col" style={{ background: ENCRE }} aria-hidden="true">
                <div className="pointer-events-none absolute inset-0" style={{
                    backgroundImage:
                        "radial-gradient(720px 720px at 100% 0%, rgba(134,79,254,0.34), rgba(134,79,254,0) 70%)," +
                        "radial-gradient(640px 640px at 0% 100%, rgba(109,40,217,0.22), rgba(109,40,217,0) 70%)",
                }} />
                {/* Le symbole, en filigrane. */}
                <svg className="pointer-events-none absolute -bottom-24 -right-24 opacity-[0.10]" width="520" height="520" viewBox="0 0 24 24">
                    <path d="M0 0 L6 0 L14 12 L6 24 L0 24 Z" fill="#6D28D9" />
                    <path d="M9 0 L24 0 L24 24 L9 24 L17 12 Z" fill="#A855F7" />
                </svg>

                <div className="relative px-12 pt-12 xl:px-16 xl:pt-14">
                    {/* Badge contour avec avatar (motif shadcn) : l'icone ronde, puis le libelle. */}
                    <span className="inline-flex h-auto w-fit items-center gap-2 whitespace-nowrap rounded-full border p-1 pr-3 text-[12.5px] font-medium" style={{ borderColor: "rgba(255,255,255,0.2)", color: "#ffffff" }}>
                        <img src={MARQUE_ICONE} alt="" className="size-6 rounded-full bg-white object-contain p-1" />
                        {p.pastille}
                    </span>
                </div>

                <div className="relative my-auto px-12 py-12 xl:px-16">
                    <h2 className="text-[34px] font-semibold leading-[1.12] tracking-[-0.025em] text-white xl:text-[40px]">{p.titre}</h2>
                    <p className="mt-4 max-w-[460px] text-[15.5px] leading-relaxed" style={{ color: "rgba(255,255,255,0.68)" }}>{p.texte}</p>

                    <div className="mt-8 flex items-center gap-3">
                        <div className="flex -space-x-2">
                            {LOGOS.map((l) => (
                                <img key={l} src={`/icons/methods/${l}.svg`} alt="" width={36} height={36}
                                    className="h-9 w-9 rounded-full bg-white object-contain p-1" style={{ boxShadow: `0 0 0 2px ${ENCRE}` }} />
                            ))}
                        </div>
                        <span className="text-[13px]" style={{ color: "rgba(255,255,255,0.6)" }}>Mobile money, cartes et crypto</span>
                    </div>

                    <ul className="mt-8 grid grid-cols-1 gap-3">
                        {p.points.map((point) => (
                            <li key={point} className="flex items-start gap-3 text-[14px] leading-snug" style={{ color: "rgba(255,255,255,0.82)" }}>
                                <span className="mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full" style={{ background: "rgba(134,79,254,0.22)", color: "#D6C6FF" }}>
                                    <Check size={12} strokeWidth={3} />
                                </span>
                                {point}
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="relative px-12 pb-10 text-[12.5px] xl:px-16" style={{ color: "rgba(255,255,255,0.45)" }}>
                    © {ANNEE} {MARQUE}{MARQUE_VILLE ? `, ${MARQUE_VILLE}` : ""}
                </div>
            </aside>
        </div>
    );
}

export function Titre({ titre, sousTitre }: { titre: string; sousTitre?: string }) {
    const t = themeAuth;
    return (
        <div className="mb-7">
            <h1 className="text-[26px] font-semibold leading-[1.2] tracking-[-0.02em] sm:text-[30px]" style={{ color: t.textPrimary }}>{titre}</h1>
            {sousTitre && <p className="mt-2 text-[14.5px] leading-relaxed" style={{ color: "#62626b" }}>{sousTitre}</p>}
        </div>
    );
}

/** Etiquette d'un champ, reliee a son controle. */
export function EtiquetteAuth({ htmlFor, children, droite }: { htmlFor: string; children: ReactNode; droite?: ReactNode }) {
    const t = themeAuth;
    return (
        <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor={htmlFor} className="text-[13.5px] font-medium" style={{ color: t.textSecondary }}>{children}</label>
            {droite}
        </div>
    );
}

/** Champ de saisie de la colonne : 48 px, coins 12, halo violet au focus. */
export function ChampAuth({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <input {...props}
            className={`champ-auth h-12 w-full rounded-xl px-4 text-[16px] outline-none transition-[border-color,box-shadow] duration-150 ${className}`} />
    );
}

export function BoutonGoogle({ onClick, occupe, texte }: { onClick: () => void; occupe?: boolean; texte: string }) {
    const t = themeAuth;
    return (
        <button type="button" onClick={onClick} disabled={occupe}
            className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl text-[14.5px] font-medium transition-colors disabled:opacity-50"
            style={{ background: t.cardBg, border: `1px solid ${t.methodBorder}`, color: t.textPrimary }}>
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5h-1.6V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.5 6.5 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z" />
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.5 7.5 29.5 5 24 5 16.1 5 9.3 9 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.4 0 10.3-2.1 14-5.4l-6.5-5.5C29.5 34.9 26.9 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.6 5.1C9.2 39.5 16 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.5H24v8h11.3c-.8 2.3-2.3 4.2-4.3 5.6l6.5 5.5c-.5.4 6.5-4.6 6.5-15.6 0-1.2-.1-2.4-.4-3.5z" />
            </svg>
            {texte}
        </button>
    );
}

/** Connexion par le fournisseur OpenID Connect configure (OIDC_ISSUER). */
export function BoutonOIDC({ onClick, occupe, texte }: { onClick: () => void; occupe?: boolean; texte: string }) {
    const t = themeAuth;
    return (
        <button type="button" onClick={onClick} disabled={occupe}
            className="bouton-oidc flex h-12 w-full items-center justify-center gap-2.5 rounded-xl text-[15px] font-medium transition-colors disabled:opacity-50"
            style={{ background: "#ffffff", border: "1px solid #DCDCE3", color: t.textPrimary }}>
            <KeyRound size={18} aria-hidden="true" />
            {texte}
        </button>
    );
}

/** Ecran de passage vers le fournisseur d'identite, dans son propre fichier. */
export { TransitionOIDC } from "@/components/auth/transition-oidc";

export function Separateur({ texte = "ou" }: { texte?: string }) {
    const t = themeAuth;
    return (
        <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1" style={{ background: t.divider }} />
            <span className="text-[12.5px]" style={{ color: t.textMuted }}>{texte}</span>
            <span className="h-px flex-1" style={{ background: t.divider }} />
        </div>
    );
}

/** Ligne discrete sous un formulaire, quand il y a quelque chose a rassurer. */
export function PiedCarteAuth({ texte = "Connexion sécurisée" }: { texte?: string }) {
    const t = themeAuth;
    return (
        <p className="mt-6 inline-flex items-center gap-1.5 text-[12.5px]" style={{ color: t.textMuted }}>
            <Lock size={12} /> {texte}
        </p>
    );
}

export { PiedCartflox };
