"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, Lock } from "lucide-react";
import { etatEnvironnement, basculerEnvironnement, definirVueTest, type EtatEnvironnement } from "@/lib/actions/environnement";

/** Orange du bac a sable, partage avec le bandeau du contenu (badge-sandbox). */
export const ORANGE_SANDBOX = "#EF7D00";

/**
 * Production ou Sandbox : un interrupteur avec le mot de chaque cote, celui
 * qui est actif etant le seul mis en avant. Le monde d'un PAIEMENT reste
 * decide par la cle utilisee (af_live_ ou af_test_) : cet interrupteur ne
 * bloque jamais un encaissement reel, il choisit ce que le tableau de bord
 * montre. Un espace dont l'identite n'est pas verifiee reste en sandbox,
 * interrupteur verrouille.
 */
export function BasculeSandbox({ compact = false }: { compact?: boolean }) {
    const [etat, setEtat] = useState<EtatEnvironnement | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [enCours, demarrer] = useTransition();

    const charger = () => {
        etatEnvironnement().then((e) => {
            if (!e) return;
            setEtat(e);
            document.documentElement.dataset.sandbox = e.vueTest ? "1" : "0";
            window.dispatchEvent(new CustomEvent("afriflow-sandbox-etat", { detail: { sandbox: e.vueTest } }));
        }).catch(() => { });
    };
    useEffect(() => {
        charger();
        window.addEventListener("afriflow-env-mode-change", charger);
        return () => window.removeEventListener("afriflow-env-mode-change", charger);
    }, []);

    if (!etat) return null;

    const verrouille = etat.verrouille;
    const sandbox = etat.vueTest;

    const bascule = () => {
        if (enCours || verrouille) return;
        demarrer(async () => {
            if (sandbox) {
                // Vers la production. Un espace resté en bac à sable forcé le quitte ici.
                if (etat.bacASable) {
                    const r = await basculerEnvironnement(false);
                    if (!r.ok) { setMessage(r.message || null); setTimeout(() => setMessage(null), 6000); return; }
                }
                await definirVueTest(false);
            } else {
                await definirVueTest(true);
            }
            window.dispatchEvent(new CustomEvent("afriflow-env-mode-change"));
            window.location.reload();
        });
    };

    const titre = verrouille
        ? "Votre identité n'est pas encore vérifiée : l'espace reste en sandbox."
        : sandbox
            ? "Sandbox : vous voyez les données de test. Cliquez pour revenir en production."
            : "Production : vous voyez vos vrais paiements. Cliquez pour passer en sandbox.";

    const mot = (actif: boolean, couleurActive: string) => ({
        fontSize: 13,
        lineHeight: 1.2,
        fontWeight: actif ? 600 : 400,
        color: actif ? couleurActive : "var(--dt-text-muted)",
        whiteSpace: "nowrap" as const,
    });

    return (
        <div className="relative flex items-center gap-2">
            <span style={mot(!sandbox, "var(--dt-text-primary)")}>Production</span>

            <button
                type="button" role="switch" aria-checked={sandbox} aria-label="Production ou Sandbox"
                title={titre} onClick={bascule} disabled={enCours || verrouille}
                className="relative inline-flex h-[22px] w-[40px] shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed"
                style={{
                    background: sandbox ? ORANGE_SANDBOX : "var(--dt-item-hover)",
                    border: `1px solid ${sandbox ? ORANGE_SANDBOX : "var(--dt-border)"}`,
                    opacity: verrouille ? 0.75 : 1,
                }}>
                <span className="inline-flex h-[16px] w-[16px] items-center justify-center rounded-full bg-white transition-transform"
                    style={{ transform: sandbox ? "translateX(21px)" : "translateX(3px)", boxShadow: "0 1px 2px rgba(0,0,0,.25)" }}>
                    {enCours ? <Loader2 className="h-2.5 w-2.5 animate-spin" style={{ color: "var(--dt-text-muted)" }} />
                        : verrouille ? <Lock size={8} style={{ color: "var(--dt-text-muted)" }} /> : null}
                </span>
            </button>

            <span style={mot(sandbox, ORANGE_SANDBOX)}>Sandbox</span>

            {message && (
                <span className="absolute right-0 top-full z-20 mt-2 w-64 rounded-lg px-3 py-2 text-[12px] leading-snug shadow-lg"
                    style={{ background: "var(--dt-dropdown-bg)", border: "1px solid var(--dt-dropdown-border)", color: "var(--dt-text-secondary)" }}>
                    {message}
                </span>
            )}
        </div>
    );
}
