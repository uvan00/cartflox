"use client";

import type { LucideIcon } from "lucide-react";
import { SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/coque/ui/sidebar";

export type EntreeSecondaire = { href: string; label: string; icone: LucideIcon; onClick?: () => void };

/** Liens de pied de barre (aide, documentation, retour) en petite taille. */
export function NavSecondaire({ entrees, ...props }: { entrees: EntreeSecondaire[] } & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
    return (
        <SidebarGroup {...props}>
            <SidebarGroupContent>
                <SidebarMenu>
                    {entrees.map((e) => (
                        <SidebarMenuItem key={e.label}>
                            <SidebarMenuButton size="sm" tooltip={e.label}
                                render={e.onClick
                                    ? <button type="button" onClick={e.onClick} />
                                    : <a href={e.href} target={e.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" />}>
                                <e.icone />
                                <span>{e.label}</span>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    ))}
                </SidebarMenu>
            </SidebarGroupContent>
        </SidebarGroup>
    );
}
