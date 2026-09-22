"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronsUpDownIcon, LogOutIcon, SunMoonIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/coque/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/coque/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/coque/ui/sidebar";

export type EntreeCompte = { href: string; label: string; icone: LucideIcon; externe?: boolean };

/** Carte utilisateur en pied de barre : menu du compte, apparence, deconnexion. */
export function NavUtilisateur({ nom, email, avatar, menu, onDeconnexion, themeSombre, onTheme }: {
    nom: string; email: string; avatar?: string | null; menu: EntreeCompte[]; onDeconnexion: () => void; themeSombre?: boolean; onTheme?: () => void;
}) {
    const { isMobile } = useSidebar();
    const initiale = (nom || email || "?").trim().charAt(0).toUpperCase();
    const pastille = (
        <Avatar className="h-8 w-8 rounded-lg">
            {avatar && <AvatarImage src={avatar} alt={nom} />}
            <AvatarFallback className="rounded-lg bg-primary text-primary-foreground text-sm font-semibold">{initiale}</AvatarFallback>
        </Avatar>
    );
    const identite = (
        <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{nom || "Mon compte"}</span>
            <span className="truncate text-xs text-muted-foreground">{email}</span>
        </div>
    );
    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger render={<SidebarMenuButton size="lg" className="aria-expanded:bg-sidebar-accent" />}>
                        {pastille}{identite}
                        <ChevronsUpDownIcon className="ml-auto size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="min-w-56 rounded-lg" side={isMobile ? "bottom" : "right"} align="end" sideOffset={4}>
                        <DropdownMenuGroup>
                            <DropdownMenuLabel className="p-0 font-normal">
                                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">{pastille}{identite}</div>
                            </DropdownMenuLabel>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                            {menu.map((m) => (
                                <DropdownMenuItem key={m.href} render={m.externe ? <a href={m.href} /> : <Link href={m.href} />}>
                                    <m.icone />{m.label}
                                </DropdownMenuItem>
                            ))}
                            {onTheme && <DropdownMenuItem onClick={onTheme}><SunMoonIcon />{themeSombre ? "Apparence claire" : "Apparence sombre"}</DropdownMenuItem>}
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={onDeconnexion} variant="destructive"><LogOutIcon />Se déconnecter</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}
