"use client";

import { useEffect, useState, type ReactNode } from "react";
import { KeyRound, Lock } from "lucide-react";
import { POLICE_TEXTE } from "@/components/checkout/coque";
import { MARQUE, MARQUE_ICONE } from "@/lib/marque";
import { OIDC_NOM } from "@/lib/auth-client";

/**
 * Ecran de passage vers le fournisseur d'identite (OpenID Connect), le temps
 * que le navigateur y parte : la marque et le fournisseur sur une carte, un
 * point qui voyage de l'une a l'autre, et une phrase.
 *
 * Si le depart tarde (reseau lent, navigateur integre a WhatsApp), une issue
 * apparait apres quelques secondes plutot que de laisser tourner dans le vide.
 */

const ENCRE = "#0F0F14";
const VIOLET = "#864FFE";
const DELAI_ISSUE = 8000;

const STYLES = `
@keyframes cf-transit-point { 0% { transform: translateX(0); opacity: 0; } 12% { opacity: 1; } 88% { opacity: 1; } 100% { transform: translateX(var(--course)); opacity: 0; } }
@keyframes cf-transit-entree { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.cf-transit-point { animation: cf-transit-point 1.8s cubic-bezier(.45,0,.35,1) infinite; }
.cf-transit-point-2 { animation-delay: .22s; }
.cf-transit-carte { animation: cf-transit-entree .45s cubic-bezier(.2,.7,.2,1) both; }
.cf-transit-issue { animation: cf-transit-entree .4s ease-out both; }
@media (prefers-reduced-motion: reduce) {
  .cf-transit-point { animation: none; transform: translateX(var(--course)); opacity: 1; }
  .cf-transit-point-2 { display: none; }
  .cf-transit-carte, .cf-transit-issue { animation: none; }
}
`;

/** Une marque dans sa tuile. */
function Tuile({ children }: { children: ReactNode }) {
    return (
        <span className="flex size-[76px] shrink-0 items-center justify-center rounded-[22px] bg-white"
            style={{ border: "1px solid #E6E6EC", boxShadow: "0 10px 24px -14px rgba(15,15,20,.35), 0 1px 2px rgba(15,15,20,.06)" }}>
            {children}
        </span>
    );
}

/** Le trajet entre les deux : pointille, chevron, et un point qui voyage. */
function Trajet() {
    const largeur = 108;
    return (
        <span className="relative block h-6 shrink-0" style={{ width: largeur, ["--course" as string]: "84px" }} aria-hidden="true">
            <svg className="absolute inset-0" width={largeur} height="24" viewBox={`0 0 ${largeur} 24`} fill="none">
                <line x1="4" y1="12" x2={largeur - 4} y2="12" stroke="#DCDCE3" strokeWidth="2" strokeLinecap="round" strokeDasharray="1 7" />
                <path d={`M${largeur - 12} 7 L${largeur - 6} 12 L${largeur - 12} 17`} stroke="#B4B4BF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="cf-transit-point absolute left-0 top-2 size-2 rounded-full" style={{ background: VIOLET, boxShadow: "0 0 0 4px rgba(134,79,254,.16)" }} />
            <span className="cf-transit-point cf-transit-point-2 absolute left-0 top-[9px] size-1.5 rounded-full" style={{ background: VIOLET, opacity: .5 }} />
        </span>
    );
}

/** Le fournisseur d'identite, sans logo connu d'avance : une cle. */
function SigneFournisseur({ taille = 34 }: { taille?: number }) {
    return <KeyRound size={taille} color={VIOLET} aria-hidden="true" />;
}

export function TransitionOIDC({ titre = `Connexion avec ${OIDC_NOM}` }: { titre?: string }) {
    const [tarde, setTarde] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => setTarde(true), DELAI_ISSUE);
        return () => clearTimeout(t);
    }, []);

    return (
        <div role="status" aria-live="polite" className="fixed inset-0 z-[100] flex items-center justify-center px-5"
            style={{ background: "#F5F5F7", fontFamily: POLICE_TEXTE }}>
            <style>{STYLES}</style>
            <div className="cf-transit-carte w-full max-w-[440px] rounded-3xl bg-white px-6 py-9 text-center sm:px-10 sm:py-11"
                style={{ border: "1px solid #ECECF1", boxShadow: "0 30px 60px -36px rgba(15,15,20,.28)" }}>
                <div className="flex items-center justify-center gap-4">
                    <Tuile><img src={MARQUE_ICONE} alt={MARQUE} width={40} height={40} className="h-10 w-10 object-contain" /></Tuile>
                    <Trajet />
                    <Tuile><SigneFournisseur /></Tuile>
                </div>

                <h1 className="mt-8 text-[19px] font-semibold leading-tight" style={{ color: ENCRE }}>{titre}</h1>
                <p className="mx-auto mt-2 max-w-[310px] text-[14px] leading-relaxed" style={{ color: "#6B6B76" }}>
                    {`Vous allez vous identifier sur ${OIDC_NOM}, puis revenir ici.`}
                </p>

                {tarde && (
                    <p className="cf-transit-issue mt-6 text-[14px]" style={{ color: "#6B6B76" }}>
                        La redirection tarde ?{" "}
                        <button type="button" onClick={() => window.location.reload()}
                            className="font-medium underline underline-offset-4" style={{ color: VIOLET }}>Réessayer</button>
                    </p>
                )}
            </div>

            <p className="absolute bottom-8 inline-flex items-center gap-1.5 text-[12.5px]" style={{ color: "#8A8A95" }}>
                <Lock size={12} aria-hidden="true" /> Connexion sécurisée
            </p>
        </div>
    );
}
