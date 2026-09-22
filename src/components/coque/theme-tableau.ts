"use client";

import { useEffect, useMemo, useState } from "react";
import { getDashboardTheme, type DashboardTheme } from "@/lib/dashboard-themes";

const CLE = "afriflow-dashboard-theme";

/**
 * Le theme des tableaux de bord : SOMBRE par defaut, clair si la personne
 * l'a choisi. Une seule source pour les trois coques : memoire
 * locale, evenement de bascule, synchronisation entre onglets, et la classe
 * `dark` posee sur <html> pour que les tiroirs et menus rendus hors de la
 * coque suivent eux aussi.
 */
export function useThemeTableau(surcharges?: Record<string, string>) {
    const [theme, setTheme] = useState<DashboardTheme>(() => {
        if (typeof window !== "undefined") {
            const memo = localStorage.getItem(CLE);
            if (memo) return getDashboardTheme(memo);
        }
        return getDashboardTheme("dark");
    });

    useEffect(() => {
        const changer = (e: Event) => {
            const id = (e as CustomEvent).detail === "dark" ? "dark" : "light";
            localStorage.setItem(CLE, id);
            setTheme(getDashboardTheme(id));
        };
        const stockage = (e: StorageEvent) => { if (e.key === CLE && e.newValue) setTheme(getDashboardTheme(e.newValue)); };
        window.addEventListener("afriflow-dashboard-theme-change", changer);
        window.addEventListener("storage", stockage);
        return () => { window.removeEventListener("afriflow-dashboard-theme-change", changer); window.removeEventListener("storage", stockage); };
    }, []);

    useEffect(() => {
        // La racine du site pose `dark` en permanence : on la retire seulement
        // le temps du tableau de bord clair, et on la remet en partant.
        document.documentElement.classList.toggle("dark", theme.id === "dark");
        return () => { document.documentElement.classList.add("dark"); };
    }, [theme.id]);

    const style = useMemo(() => ({ ...theme.cssVars, ...(surcharges || {}) }) as React.CSSProperties, [theme, surcharges]);
    const basculer = () => window.dispatchEvent(new CustomEvent("afriflow-dashboard-theme-change", { detail: theme.id === "dark" ? "light" : "dark" }));
    return { theme, style, basculer, sombre: theme.id === "dark" };
}
