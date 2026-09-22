"use client";

import { useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import { usePathname } from "next/navigation";

/**
 * Bulle de service client (Chatwoot auto-heberge) dans le tableau de bord.
 * L'adresse et le jeton viennent de /api/public-config : tant que le jeton
 * est vide, rien ne s'affiche. Le marchand connecte est identifie dans
 * Chatwoot (nom, e-mail) pour que le support sache a qui il parle.
 */
declare global {
    interface Window { chatwootSDK?: any; $chatwoot?: any; chatwootSettings?: any; }
}

/**
 * Pages vues par les clients du marchand : le support Cartflox n'y a pas sa place.
 *
 * On regarde l'hote AUTANT que le chemin : sur le domaine dedie au paiement,
 * l'adresse est courte (checkout.exemple.com/<id>), donc le chemin ne commence
 * pas par /checkout et la regle sur le chemin seule laissait passer la bulle.
 */
function pagePaiement(chemin: string) {
    if (typeof window !== "undefined" && /^checkout\./i.test(window.location.hostname)) return true;
    return chemin.startsWith("/checkout") || chemin.startsWith("/pay/") || chemin.startsWith("/mobile/");
}

export function ChatSupport() {
    const { data: session } = useSession();
    const chemin = usePathname() || "/";
    const masquer = pagePaiement(chemin);

    useEffect(() => {
        if (masquer) {
            // Deja charge puis navigation vers une page de paiement : on le retire.
            try { window.$chatwoot?.toggleBubbleVisibility?.("hide"); } catch { /* ignore */ }
            return;
        }
        try { window.$chatwoot?.toggleBubbleVisibility?.("show"); } catch { /* ignore */ }
        let annule = false;
        fetch("/api/public-config").then((r) => r.json()).then((cfg: any) => {
            const url = cfg?.chatwoot?.url, token = cfg?.chatwoot?.token;
            if (annule || !url || !token || document.getElementById("cf-chatwoot-sdk")) return;
            window.chatwootSettings = { locale: "fr", position: "right", type: "standard", launcherTitle: "Une question ?", darkMode: "auto" };
            const s = document.createElement("script");
            s.id = "cf-chatwoot-sdk";
            s.src = `${url}/packs/js/sdk.js`;
            s.async = true;
            s.onload = () => { try { window.chatwootSDK?.run({ websiteToken: token, baseUrl: url }); } catch { /* ignore */ } };
            document.body.appendChild(s);
        }).catch(() => { /* pas de support configure */ });
        return () => { annule = true; };
    }, [masquer]);

    // Identifie le marchand des que le widget est pret (et si la session arrive apres).
    useEffect(() => {
        const email = session?.user?.email;
        if (!email) return;
        const identifier = () => {
            try { window.$chatwoot?.setUser(email, { email, name: session?.user?.name || email }); } catch { /* ignore */ }
        };
        if (window.$chatwoot) identifier();
        window.addEventListener("chatwoot:ready", identifier);
        return () => window.removeEventListener("chatwoot:ready", identifier);
    }, [session?.user?.email, session?.user?.name]);

    return null;
}
