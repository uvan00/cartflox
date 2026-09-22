"use client";

import { GoeyToaster } from "goey-toast";
import "goey-toast/styles.css";
import { ThemeProvider } from "@lobehub/ui";
import { useEffect, useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
    const [mounted, setMounted] = useState(false);
    const [appearance, setAppearance] = useState<'dark' | 'light'>('dark');

    useEffect(() => {
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

    if (!mounted) {
        return <>{children}</>;
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
