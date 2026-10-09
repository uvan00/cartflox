"use client";

import { GoeyToaster } from "goey-toast";
import "goey-toast/styles.css";
import { ThemeProvider } from "@lobehub/ui";
import { useEffect, useState } from "react";
import { estPagePaiement } from "@/lib/page-paiement";

export function Providers({ children }: { children: React.ReactNode }) {
    const [mounted, setMounted] = useState(false);
    const [appearance, setAppearance] = useState<'dark' | 'light'>('dark');
    const [pagePaiement, setPagePaiement] = useState(false);

    useEffect(() => {
        // Page de paiement : le script de <head> l'a deja mise en clair. On ne
        // lui applique pas le theme du tableau de bord, et le kit @lobehub/ui
        // n'y est pas monte : son style global peignait le fond de la page en
        // noir, chargeait quatre feuilles de style depuis un CDN, et son montage
        // reconstruisait toute la page (squelette et chargement en double).
        if (estPagePaiement(window.location.pathname, window.location.hostname)) {
            setPagePaiement(true);
            return;
        }

        const getStoredTheme = (): 'dark' | 'light' => {
            const t = localStorage.getItem('afriflow-dashboard-theme');
            return t === 'light' ? 'light' : 'dark';
        };

        const applyThemeToDOM = (tid: string) => {
            const isLight = tid === 'light';
            document.documentElement.classList.toggle('dark', !isLight);
            document.documentElement.classList.toggle('light', isLight);
            setAppearance(isLight ? 'light' : 'dark');
        };

        applyThemeToDOM(getStoredTheme());
        setMounted(true);

        const handleThemeChange = (e: Event) => {
            applyThemeToDOM((e as CustomEvent).detail ?? 'dark');
        };
        const handleStorage = (e: StorageEvent) => {
            if (e.key === 'afriflow-dashboard-theme' && e.newValue) {
                applyThemeToDOM(e.newValue);
            }
        };

        window.addEventListener('afriflow-dashboard-theme-change', handleThemeChange);
        window.addEventListener('storage', handleStorage);
        return () => {
            window.removeEventListener('afriflow-dashboard-theme-change', handleThemeChange);
            window.removeEventListener('storage', handleStorage);
        };
    }, []);

    // Le fournisseur de theme de @lobehub/ui ne rend pas la meme chose sur le
    // serveur et au premier passage client : monte des l'hydratation, il faisait
    // echouer celle-ci (erreur React 418 sur chaque page, verifie le 23/09/2026).
    // On le pose donc apres le montage, au prix d'une reconstruction de la page.
    // Les pages de paiement gardent la meme forme d'arbre du debut a la fin : la
    // page n'est pas reconstruite, seules les notifications s'ajoutent (sombres,
    // comme elles l'etaient deja pour les clients).
    if (pagePaiement || !mounted) {
        return <>{children}{pagePaiement && <GoeyToaster position="bottom-right" theme="dark" />}</>;
    }

    return (
        <ThemeProvider
            appearance={appearance}
            customTheme={{ primaryColor: "blue", neutralColor: "slate" }}
        >
            {children}
            <GoeyToaster position="bottom-right" theme={appearance} />
        </ThemeProvider>
    );
}
