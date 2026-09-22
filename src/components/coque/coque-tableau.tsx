"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SearchIcon } from "lucide-react";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/coque/ui/breadcrumb";
import { Separator } from "@/components/coque/ui/separator";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/coque/ui/sidebar";
import { NavPrincipale, type EntreeNav, type GroupeNav } from "./nav-principale";
import { NavSecondaire, type EntreeSecondaire } from "./nav-secondaire";
import { NavUtilisateur, type EntreeCompte } from "./nav-utilisateur";
import { cn } from "@/lib/utils";

/**
 * La coque commune des tableaux de bord Cartflox (marchand, Connect, admin),
 * sur le bloc shadcn « sidebar-08 » : barre laterale
 * retractable en variante inset (tiroir sur telephone), en-tete avec fil
 * d'Ariane et actions a droite, contenu centre. Chaque tableau de bord ne
 * fournit que sa marque, sa navigation et ses actions.
 */
export type Marque = { logo: ReactNode; titre: ReactNode; sousTitre?: ReactNode; href: string };
export type Compte = { nom: string; email: string; avatar?: string | null; menu: EntreeCompte[]; onDeconnexion: () => void; themeSombre?: boolean; onTheme?: () => void };

export function CoqueTableau({ marque, sousMarque, groupes, secondaires, compte, racine, actif, chemin = (h) => h, actions, bandeau, large, recherche, style, children }: {
    marque: Marque;
    /** Sous la marque : selecteur d'espace, par exemple. */
    sousMarque?: ReactNode;
    groupes: GroupeNav[];
    secondaires?: EntreeSecondaire[];
    compte: Compte | null;
    racine: { label: string; url: string };
    actif: (e: EntreeNav) => boolean;
    chemin?: (href: string) => string;
    /** Droite de l'en-tete : commutateur, notifications... */
    actions?: ReactNode;
    /** Sous l'en-tete, pleine largeur (avertissement de securite...). */
    bandeau?: ReactNode;
    /** Contenu pleine largeur (cartes de passerelles) : la marge reste. */
    large?: boolean;
    /** Ouvre la palette de recherche (Cmd+K). */
    recherche?: () => void;
    style?: React.CSSProperties;
    children: ReactNode;
}) {
    const pathname = usePathname() || "/";
    const page = groupes.flatMap((g) => g.entrees).find((e) => actif(e))?.label || "";

    return (
        <div style={style} className="coque-tableau min-h-svh w-full bg-sidebar text-foreground">
            <SidebarProvider>
                <Sidebar variant="inset" collapsible="icon">
                    <SidebarHeader>
                        <SidebarMenu>
                            <SidebarMenuItem>
                                <SidebarMenuButton size="lg" render={<Link href={marque.href} />}>
                                    <div className="flex size-9 shrink-0 items-center justify-center">{marque.logo}</div>
                                    <div className="grid flex-1 text-left leading-tight">
                                        <span className="truncate text-[15px] font-semibold">{marque.titre}</span>
                                        {marque.sousTitre && <span className="truncate text-xs text-muted-foreground">{marque.sousTitre}</span>}
                                    </div>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        </SidebarMenu>
                        {sousMarque && <div className="group-data-[collapsible=icon]:hidden">{sousMarque}</div>}
                    </SidebarHeader>
                    <SidebarContent>
                        {groupes.map((g) => <NavPrincipale key={g.label} groupe={g} actif={actif} chemin={chemin} />)}
                        {secondaires && secondaires.length > 0 && <NavSecondaire entrees={secondaires} className="mt-auto" />}
                    </SidebarContent>
                    <SidebarFooter>
                        {compte && <NavUtilisateur {...compte} />}
                    </SidebarFooter>
                </Sidebar>
                <SidebarInset className="min-w-0">
                    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur md:px-4">
                        <SidebarTrigger className="-ml-1" />
                        <Separator orientation="vertical" className="mr-1 h-4" />
                        <Breadcrumb>
                            <BreadcrumbList>
                                <BreadcrumbItem className="hidden md:block"><BreadcrumbLink render={<Link href={racine.url} />}>{racine.label}</BreadcrumbLink></BreadcrumbItem>
                                {page && page !== racine.label && <><BreadcrumbSeparator className="hidden md:block" /><BreadcrumbItem><BreadcrumbPage>{page}</BreadcrumbPage></BreadcrumbItem></>}
                            </BreadcrumbList>
                        </Breadcrumb>
                        <div className="ml-auto flex items-center gap-2">
                            {recherche && (
                                <button type="button" onClick={recherche} title="Rechercher (Cmd+K)" aria-label="Rechercher"
                                    className="inline-flex h-8 items-center gap-2 rounded-lg border border-border bg-background px-2.5 text-[12.5px] text-muted-foreground hover:bg-accent">
                                    <SearchIcon className="size-4" /><span className="hidden sm:inline">Rechercher</span><kbd className="hidden rounded border border-border px-1 text-[10px] lg:inline">⌘K</kbd>
                                </button>
                            )}
                            {actions}
                        </div>
                    </header>
                    {bandeau}
                    <div className="flex-1 px-4 py-4 md:px-8 md:py-6">
                        <div className={cn("mx-auto w-full", !large && "max-w-[1400px]")}>{children}</div>
                    </div>
                </SidebarInset>
            </SidebarProvider>
        </div>
    );
}
