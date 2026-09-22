"use client";

import { useEffect, useState } from "react";
import { ORANGE_SANDBOX } from "@/components/dashboard/bascule-sandbox";

/**
 * Repere du bac a sable sur le contenu : un filet orange pleine largeur, et une
 * pastille « Donnees de test » suspendue au centre, coins arrondis en bas. Il
 * suit l'interrupteur de l'en-tete par l'evenement `afriflow-sandbox-etat`,
 * sans appel serveur supplementaire.
 */
export function BadgeSandbox() {
    const [sandbox, setSandbox] = useState(false);

    useEffect(() => {
        const suivre = (e: Event) => setSandbox(!!(e as CustomEvent<{ sandbox: boolean }>).detail?.sandbox);
        setSandbox(document.documentElement.dataset.sandbox === "1");
        window.addEventListener("afriflow-sandbox-etat", suivre);
        return () => window.removeEventListener("afriflow-sandbox-etat", suivre);
    }, []);

    if (!sandbox) return null;
    return (
        <div className="-mx-3 mb-4 flex flex-col items-center md:-mx-4" aria-hidden="true">
            <div style={{ width: "100%", background: ORANGE_SANDBOX, height: 3 }} />
            <div style={{
                width: "fit-content",
                background: ORANGE_SANDBOX,
                padding: "5px 13px",
                color: "#ffffff",
                borderBottomRightRadius: 10,
                borderBottomLeftRadius: 10,
                fontSize: 12.5,
                fontWeight: 600,
                lineHeight: 1.2,
            }}>
                Données de test
            </div>
        </div>
    );
}
