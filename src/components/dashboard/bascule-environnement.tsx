"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { FlaskConical, Lock, Loader2 } from "lucide-react";
import { etatEnvironnement, basculerEnvironnement, type EtatEnvironnement } from "@/lib/actions/environnement";

/**
 * Bascule bac a sable / production, a poser dans un en-tete.
 *
 * L'interrupteur dit la verite sur ce que fera le prochain paiement :
 * ETEINT = mode test, rien n'est encaisse pour de vrai ; ALLUME = production,
 * les clients paient vraiment. Un espace dont l'identite n'est pas verifiee le
 * voit ETEINT et VERROUILLE : il ne peut pas s'ouvrir tout seul l'encaissement
 * reel, il passe par la verification.
 */
export function BasculeEnvironnement({ compact = false, surEtat }: { compact?: boolean; surEtat?: (e: EtatEnvironnement) => void }) {
    const [etat, setEtat] = useState<EtatEnvironnement | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [enCours, demarrer] = useTransition();

    const charger = () => { etatEnvironnement().then((e) => { setEtat(e); if (e) surEtat?.(e); }).catch(() => { }); };
    useEffect(() => {
        charger();
        window.addEventListener("afriflow-env-mode-change", charger);
        return () => window.removeEventListener("afriflow-env-mode-change", charger);
    }, []);

    if (!etat) return null;

    const bascule = () => {
        if (enCours) return;
        const vers = !etat.bacASable;
        demarrer(async () => {
            const r = await basculerEnvironnement(vers);
            setMessage(r.message || null);
            if (r.ok) {
                const neuf = { ...etat, bacASable: vers };
                setEtat(neuf); surEtat?.(neuf);
                window.dispatchEvent(new CustomEvent("afriflow-env-mode-change"));
            }
            setTimeout(() => setMessage(null), 6000);
        });
    };

    const verrouille = etat.verrouille;
    // L'interrupteur est ALLUME en production : on l'allume pour encaisser pour de vrai.
    const enProd = !etat.bacASable;
    const titre = verrouille
        ? "Votre identité n'est pas encore vérifiée : l'espace reste en mode test."
        : enProd
            ? "Production : vos clients paient pour de vrai. Cliquez pour passer en mode test."
            : "Mode test : aucun paiement n'est envoyé à votre agrégateur. Cliquez pour passer en production.";

    return (
        <div className="relative flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: enProd ? "var(--dt-text-muted)" : "#d97706" }}>
                {enProd ? null : <FlaskConical size={13} />}
                {compact ? (enProd ? "Prod" : "Test") : (enProd ? "Production" : "Mode test")}
            </span>

            <button
                type="button" role="switch" aria-checked={enProd} aria-label="Basculer entre mode test et production"
                title={titre} onClick={verrouille ? undefined : bascule} disabled={enCours || verrouille}
                className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed"
                style={{
                    background: enProd ? "var(--dt-brand)" : "var(--dt-item-hover)",
                    border: "1px solid var(--dt-border)",
                    opacity: verrouille ? 0.7 : 1,
                }}>
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-white transition-transform"
                    style={{ transform: enProd ? "translateX(23px)" : "translateX(3px)" }}>
                    {enCours ? <Loader2 className="h-2.5 w-2.5 animate-spin" style={{ color: "var(--dt-text-muted)" }} />
                        : verrouille ? <Lock size={8} style={{ color: "var(--dt-text-muted)" }} /> : null}
                </span>
            </button>


            {message && (
                <span className="absolute right-0 top-full z-20 mt-2 w-64 rounded-lg px-3 py-2 text-[12px] leading-snug shadow-lg"
                    style={{ background: "var(--dt-dropdown-bg)", border: "1px solid var(--dt-dropdown-border)", color: "var(--dt-text-secondary)" }}>
                    {message}
                </span>
            )}
        </div>
    );
}
