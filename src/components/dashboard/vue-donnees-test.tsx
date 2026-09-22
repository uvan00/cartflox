"use client";

import { useEffect, useState, useTransition } from "react";
import { FlaskConical, Loader2 } from "lucide-react";
import { etatEnvironnement, definirVueTest } from "@/lib/actions/environnement";

/**
 * « Données de test » : pour un espace EN PRODUCTION, un bouton discret qui
 * bascule le tableau de bord sur les paiements faits avec les clés de test
 * (et inversement). Un espace en mode test voit déjà ses données de test :
 * le commutateur test / production est alors le seul repère, ce bouton
 * n'apparaît pas.
 */
export function VueDonneesTest() {
    const [etat, setEtat] = useState<{ bacASable: boolean; vueTest: boolean } | null>(null);
    const [enCours, demarrer] = useTransition();

    useEffect(() => {
        const charger = () => { etatEnvironnement().then((e) => { if (e) setEtat({ bacASable: e.bacASable, vueTest: e.vueTest }); }).catch(() => { }); };
        charger();
        window.addEventListener("afriflow-env-mode-change", charger);
        return () => window.removeEventListener("afriflow-env-mode-change", charger);
    }, []);

    if (!etat || etat.bacASable) return null;

    const actif = etat.vueTest;
    const basculer = () => {
        if (enCours) return;
        demarrer(async () => {
            const r = await definirVueTest(!actif);
            if (r.ok) window.location.reload();
        });
    };

    return (
        <button
            type="button"
            onClick={basculer}
            title={actif ? "Vous consultez les paiements faits avec vos clés de test. Cliquez pour revenir à la production." : "Voir les paiements faits avec vos clés de test."}
            className="inline-flex h-7 select-none items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-colors"
            style={actif
                ? { background: "rgba(217,119,6,0.12)", color: "#b45309", border: "1px solid rgba(217,119,6,0.35)" }
                : { background: "transparent", color: "var(--dt-text-muted)", border: "1px solid var(--dt-border)" }}
        >
            {enCours ? <Loader2 size={12} className="animate-spin" /> : <FlaskConical size={12} />}
            {actif ? "Données de test" : "Voir les tests"}
        </button>
    );
}
