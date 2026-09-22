"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, CreditCard, Globe, LayoutDashboard, LinkIcon, Lock, Puzzle, Settings, Send, Smartphone, Terminal, Users, Users2, UserCircle, BookOpen, LifeBuoy } from "lucide-react";
import { signOut, useSession } from "@/lib/auth-client";
import { MARQUE, MARQUE_ICONE } from "@/lib/marque";
import { DashboardThemeContext } from "@/components/dashboard/theme-context";
import { RechargeSiPerime } from "@/components/dashboard/recharge-si-perime";
import { BadgeSandbox } from "@/components/dashboard/badge-sandbox";
import { Header } from "@/components/dashboard/header";
import { Palette } from "@/components/dashboard/palette";
import { AppSwitcher } from "@/components/dashboard/app-switcher";
import { CoqueTableau } from "@/components/coque/coque-tableau";
import { useThemeTableau } from "@/components/coque/theme-tableau";
import type { EntreeNav, GroupeNav } from "@/components/coque/nav-principale";

/** Numero WhatsApp du support de cette instance (chiffres avec indicatif), facultatif. */
const SUPPORT_WHATSAPP = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || "";

/** La navigation du tableau de bord marchand, par groupes. */
const GROUPES: GroupeNav[] = [
    { label: "Suivi", entrees: [
        { href: "/dashboard", label: "Vue d'ensemble", icone: LayoutDashboard, exact: true },
        { href: "/transactions", label: "Transactions", icone: CreditCard },
        { href: "/statistics", label: "Statistiques", icone: BarChart3 },
    ] },
    { label: "Encaissement", entrees: [
        { href: "/gateways", label: "Passerelles", icone: Globe },
        { href: "/methods", label: "Moyens de paiement", icone: Smartphone },
        { href: "/payment-links", label: "Liens de paiement", icone: LinkIcon },
        { href: "/integrations", label: "Intégrations", icone: Puzzle },
    ] },
    { label: "Transferts d'argent", entrees: [
        { href: "/transfers", label: "Transferts", icone: Send },
        { href: "/transfers/gateways", label: "Passerelles", icone: Globe },
        { href: "/transfers/methods", label: "Méthodes", icone: Smartphone },
    ] },
    { label: "Clients", entrees: [
        { href: "/customers", label: "Répertoire", icone: Users },
    ] },
    { label: "Compte", entrees: [
        { href: "/team", label: "Équipe", icone: Users2 },
        { href: "/developer", label: "API & Logs", icone: Terminal },
        { href: "/security", label: "Sécurité", icone: Lock },
        { href: "/settings", label: "Paramètres", icone: Settings },
    ] },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname() || "/";
    const { data: session } = useSession();
    const { theme, style, basculer, sombre } = useThemeTableau();
    const [avatar, setAvatar] = useState<string | null>(null);

    useEffect(() => {
        try { setAvatar(localStorage.getItem("afriflow-profile-pic")); } catch { /* stockage indisponible */ }
        const h = (e: Event) => setAvatar((e as CustomEvent).detail);
        window.addEventListener("afriflow-profile-pic-change", h);
        return () => window.removeEventListener("afriflow-profile-pic-change", h);
    }, []);

    const actif = (e: EntreeNav) => {
        if (e.exact) return pathname === e.href;
        if (e.href === "/transactions") return pathname === "/transactions" || (pathname.startsWith("/transactions/") && !pathname.startsWith("/transactions/follow-ups"));
        // Une entree plus precise (/transfers/gateways) prime sur sa parente (/transfers).
        const plusPrecise = GROUPES.flatMap((g) => g.entrees).some((x) => x.href !== e.href && x.href.startsWith(e.href + "/") && pathname.startsWith(x.href));
        return pathname === e.href || (pathname.startsWith(e.href + "/") && !plusPrecise);
    };
    const groupes = GROUPES;
    const large = pathname === "/gateways" || pathname.startsWith("/gateways/") || pathname === "/methods";
    const user = session?.user;

    return (
        <DashboardThemeContext.Provider value={theme}>
            <RechargeSiPerime />
            <CoqueTableau
                style={style}
                marque={{ logo: <img src={MARQUE_ICONE} alt="" className="size-7" />, titre: MARQUE, sousTitre: "Tableau de bord", href: "/dashboard" }}
                sousMarque={<div className="px-1 pb-1"><AppSwitcher /></div>}
                groupes={groupes}
                secondaires={[
                    { href: "/docs", label: "Documentation", icone: BookOpen },
                    ...(SUPPORT_WHATSAPP ? [{ href: `https://wa.me/${SUPPORT_WHATSAPP}`, label: "Aide", icone: LifeBuoy }] : []),
                ]}
                compte={user ? {
                    nom: user.name || "", email: user.email || "", avatar: avatar || (user.image as string | null),
                    menu: [
                        { href: "/settings?tab=profil", label: "Profil", icone: UserCircle },
                        { href: "/security", label: "Sécurité", icone: Lock },
                        { href: "/settings", label: "Paramètres", icone: Settings },
                    ],
                    onDeconnexion: () => signOut({ callbackUrl: "/auth/login" }),
                    themeSombre: sombre, onTheme: basculer,
                } : null}
                racine={{ label: "Tableau de bord", url: "/dashboard" }}
                actif={actif}
                actions={<Header />}
                recherche={() => window.dispatchEvent(new CustomEvent("cf:palette"))}
                large={large}>
                <Palette />
                <BadgeSandbox />
                {children}
            </CoqueTableau>
        </DashboardThemeContext.Provider>
    );
}
