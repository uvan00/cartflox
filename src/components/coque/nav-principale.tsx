"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem } from "@/components/coque/ui/sidebar";

export type EntreeNav = { href: string; label: string; icone: LucideIcon; externe?: boolean; exact?: boolean; compteur?: number };
export type GroupeNav = { label: string; entrees: EntreeNav[] };

/** Un groupe de navigation : un lien par entree, l'entree courante en surbrillance. */
export function NavPrincipale({ groupe, actif, chemin }: { groupe: GroupeNav; actif: (e: EntreeNav) => boolean; chemin: (href: string) => string }) {
    return (
        <SidebarGroup>
            <SidebarGroupLabel>{groupe.label}</SidebarGroupLabel>
            <SidebarMenu>
                {groupe.entrees.map((e) => (
                    <SidebarMenuItem key={e.href}>
                        <SidebarMenuButton tooltip={e.label} isActive={actif(e)}
                            render={e.externe ? <a href={e.href} target="_blank" rel="noopener noreferrer" /> : <Link href={chemin(e.href)} />}>
                            <e.icone />
                            <span>{e.label}</span>
                        </SidebarMenuButton>
                        {e.compteur ? (
                            <SidebarMenuBadge className="rounded-full" style={{ background: "#864FFE", color: "#ffffff" }}>
                                {e.compteur > 99 ? "99+" : e.compteur}
                            </SidebarMenuBadge>
                        ) : null}
                    </SidebarMenuItem>
                ))}
            </SidebarMenu>
        </SidebarGroup>
    );
}
