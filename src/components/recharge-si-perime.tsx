"use client";

import { useEffect } from "react";

/**
 * Un deploiement renomme les identifiants des actions serveur de Next. Un
 * onglet reste ouvert sur l'ancienne version appelle donc une action que le
 * serveur ne connait plus (« Server Action ... was not found on the server »),
 * et l'ecran se fige sur une erreur incomprehensible.
 *
 * On reconnait cette erreur precise et on recharge la page, une seule fois :
 * la personne retrouve la version a jour au lieu d'un message technique. Le
 * verrou en sessionStorage empeche toute boucle si le rechargement ne suffit
 * pas, et il est leve des que la page vit une minute sans incident.
 */
const VERROU = "cf-rechargement-action";
// Next 15 disait « Server Action ... was not found on the server », Next 16 dit
// « Failed to find Server Action ... This request might be from an older or newer
// deployment » : on reconnait les deux, sinon le rechargement ne partait jamais
// (224 appels perdus dans la journee du 18/09/2026, apres neuf mises en ligne).
const EST_PERIMEE = (m: unknown) => typeof m === "string" && m.includes("Server Action") && (m.includes("was not found on the server") || m.includes("Failed to find Server Action") || m.includes("older or newer deployment"));

export function RechargeSiPerime() {
    useEffect(() => {
        const dejaTente = sessionStorage.getItem(VERROU);
        const bonneSante = setTimeout(() => sessionStorage.removeItem(VERROU), 60_000);

        const recharger = () => {
            if (dejaTente) return;        // deja recharge : on laisse l'erreur visible
            sessionStorage.setItem(VERROU, "1");
            window.location.reload();
        };
        const surRejet = (e: PromiseRejectionEvent) => { if (EST_PERIMEE(e.reason?.message ?? e.reason)) recharger(); };
        const surErreur = (e: ErrorEvent) => { if (EST_PERIMEE(e.message)) recharger(); };

        window.addEventListener("unhandledrejection", surRejet);
        window.addEventListener("error", surErreur);
        return () => {
            clearTimeout(bonneSante);
            window.removeEventListener("unhandledrejection", surRejet);
            window.removeEventListener("error", surErreur);
        };
    }, []);
    return null;
}
