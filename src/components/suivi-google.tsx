"use client";

import { useEffect } from "react";

/**
 * Balise Google (Analytics et Ads), chargee a l'execution.
 *
 * L'identifiant vient de /api/public-config, donc de l'environnement : tant
 * qu'il n'est pas renseigne, RIEN n'est charge et aucune donnee ne part. Poser
 * la balise ne demande donc pas de reconstruire l'application, seulement un
 * `pm2 restart`.
 *
 * On garde aussi le `gclid` du clic publicitaire dans un cookie de 90 jours :
 * c'est ce qui permettra plus tard de dire a Google Ads quels clics ont donne
 * un marchand qui encaisse VRAIMENT, et pas seulement une inscription.
 */
declare global {
    interface Window { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void; }
}

const COOKIE_CLIC = "cf_gclid";

/** Enregistre l'identifiant de clic publicitaire, s'il y en a un dans l'adresse. */
function retenirLeClic() {
    try {
        const p = new URLSearchParams(window.location.search);
        const clic = p.get("gclid") || p.get("wbraid") || p.get("gbraid");
        if (!clic || !/^[\w.-]{5,200}$/.test(clic)) return;
        const domaine = "";
        document.cookie = `${COOKIE_CLIC}=${encodeURIComponent(clic)}; Path=/; Max-Age=${90 * 24 * 3600}${domaine}; SameSite=Lax; Secure`;
    } catch { /* pas de cookie possible : on continue sans */ }
}

export function SuiviGoogle() {
    useEffect(() => {
        retenirLeClic();
        if (document.getElementById("cf-google-tag")) return;
        let annule = false;
        fetch("/api/public-config")
            .then((r) => r.json())
            .then((cfg: any) => {
                const ids: string[] = [cfg?.google?.mesure, cfg?.google?.ads].filter(Boolean);
                if (annule || ids.length === 0) return;
                const dataLayer = (window.dataLayer = window.dataLayer || []);
                const gtag = (...args: unknown[]) => { dataLayer.push(args); };
                window.gtag = gtag;
                gtag("js", new Date());
                for (const id of ids) gtag("config", id);
                const s = document.createElement("script");
                s.id = "cf-google-tag";
                s.async = true;
                s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ids[0])}`;
                document.head.appendChild(s);
            })
            .catch(() => { /* pas de suivi configure */ });
        return () => { annule = true; };
    }, []);

    return null;
}

/**
 * Signale une conversion a Google Ads (inscription, premier encaissement...).
 * Sans balise posee, l'appel ne fait rien : aucune erreur, aucune requete.
 */
export async function conversionGoogle(nom: "inscription" | "espace" | "paiement", valeur?: number) {
    try {
        const cfg = await fetch("/api/public-config").then((r) => r.json());
        const etiquette = cfg?.google?.conversions?.[nom];
        if (!etiquette || typeof window.gtag !== "function") return;
        window.gtag("event", "conversion", {
            send_to: etiquette,
            ...(valeur ? { value: valeur, currency: "XOF" } : {}),
        });
    } catch { /* la conversion n'est pas un chemin critique */ }
}
