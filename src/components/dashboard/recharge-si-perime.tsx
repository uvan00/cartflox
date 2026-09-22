"use client";

import { useEffect } from "react";

/**
 * Onglet resté ouvert pendant une mise en ligne : ses appels d'actions serveur
 * visent des identifiants qui n'existent plus, Next répond 404 (« Failed to find
 * Server Action... older or newer deployment ») et la page continue de tourner
 * avec des données figées, sans rien dire (615 fois dans le journal du 19/09).
 *
 * Ici, le premier appel d'action serveur qui revient en 404 recharge la page,
 * une seule fois par minute au plus (verrou en sessionStorage) : l'utilisateur
 * retrouve la version en ligne sans s'en apercevoir. Ne rend rien.
 */
const VERROU = "cartflox-recharge-perime";

export function RechargeSiPerime() {
    useEffect(() => {
        const w = window as Window & { __cfRechargePerime?: boolean };
        if (w.__cfRechargePerime) return;
        w.__cfRechargePerime = true;
        const original = window.fetch.bind(window);
        window.fetch = async (entree: RequestInfo | URL, init?: RequestInit) => {
            const reponse = await original(entree, init);
            try {
                const entetes = new Headers(init?.headers ?? (entree instanceof Request ? entree.headers : undefined));
                if (reponse.status === 404 && entetes.has("next-action")) {
                    const dernier = Number(sessionStorage.getItem(VERROU) || 0);
                    if (Date.now() - dernier > 60_000) {
                        sessionStorage.setItem(VERROU, String(Date.now()));
                        window.location.reload();
                    }
                }
            } catch { /* jamais bloquant */ }
            return reponse;
        };
    }, []);
    return null;
}
