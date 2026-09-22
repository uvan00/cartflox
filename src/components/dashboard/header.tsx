"use client";

import { useEffect, useState } from "react";
import { NotificationDropdown } from "./notification-dropdown";
import { BasculeSandbox } from "./bascule-sandbox";
import { getEnvironmentMode } from "@/lib/actions/gateways";

/**
 * Les actions de droite de l'en-tete du tableau de bord marchand : la
 * pastille « clés de test » quand une passerelle en utilise, le commutateur
 * test / production (seul repere du mode), les notifications. La barre
 * elle-meme, le bouton de menu et le fil d'Ariane viennent de la coque.
 */
export function Header() {
    const [clesTest, setClesTest] = useState<string[]>([]);

    useEffect(() => {
        let actif = true;
        const charger = () => {
            getEnvironmentMode().then((r) => { if (actif) setClesTest(r.mode === "test" ? r.testGateways : []); }).catch(() => { });
        };
        charger();
        window.addEventListener("afriflow-env-mode-change", charger);
        return () => { actif = false; window.removeEventListener("afriflow-env-mode-change", charger); };
    }, []);

    return (
        <div className="flex items-center gap-3">
            {clesTest.length > 0 && (
                <span title={`Passerelles branchées avec des clés de test : ${clesTest.join(", ")}.`}
                    className="hidden h-6 select-none items-center gap-1.5 rounded-md px-2 text-[11px] font-medium sm:inline-flex"
                    style={{ background: "rgba(217,119,6,0.12)", color: "#b45309", border: "1px solid rgba(217,119,6,0.3)" }}>
                    Clés de test
                </span>
            )}
            <BasculeSandbox compact />
            <NotificationDropdown />
        </div>
    );
}
