"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft, LayoutDashboard, CreditCard, Globe, LinkIcon, Users, Settings, Terminal, MessageCircle, ShieldCheck, Smartphone, Puzzle, Store, Activity, ScrollText, Plus, Plug } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { rechercheGlobale } from "@/lib/actions/compte";
// Version ouverte : pas de recherche d'administration.
const adminRechercheGlobale = async (_s: string): Promise<any[]> => [];

/**
 * Palette de commandes (Cmd+K / Ctrl+K) : aller a une page, lancer une
 * action, retrouver une transaction, un client ou un lien par sa reference,
 * son nom, son e-mail ou son telephone. Meme composant pour le tableau de
 * bord marchand et l'administration.
 */

type Entree = { id: string; titre: string; sous?: string; href: string; icone?: LucideIcon; groupe: string };

const PAGES_MARCHAND: Entree[] = [
    { id: "p-dashboard", titre: "Vue d'ensemble", href: "/dashboard", icone: LayoutDashboard, groupe: "Pages" },
    { id: "p-tx", titre: "Transactions", href: "/transactions", icone: CreditCard, groupe: "Pages" },
    { id: "p-gw", titre: "Passerelles", href: "/gateways", icone: Globe, groupe: "Pages" },
    { id: "p-me", titre: "Moyens de paiement et routage", href: "/methods", icone: Smartphone, groupe: "Pages" },
    { id: "p-pl", titre: "Liens de paiement", href: "/payment-links", icone: LinkIcon, groupe: "Pages" },
    { id: "p-cu", titre: "Clients", href: "/customers", icone: Users, groupe: "Pages" },
    { id: "p-in", titre: "Intégrations", href: "/integrations", icone: Puzzle, groupe: "Pages" },
    { id: "p-dev", titre: "API & Logs", href: "/developer", icone: Terminal, groupe: "Pages" },
    { id: "p-sec", titre: "Sécurité", href: "/security", icone: ShieldCheck, groupe: "Pages" },
    { id: "p-set", titre: "Paramètres", href: "/settings", icone: Settings, groupe: "Pages" },
    { id: "a-link", titre: "Créer un lien de paiement", href: "/payment-links/new", icone: Plus, groupe: "Actions" },
    { id: "a-gw", titre: "Brancher une passerelle", href: "/gateways", icone: Plug, groupe: "Actions" },
    { id: "a-theme", titre: "Personnaliser ma page de paiement", href: "/settings?tab=checkout", icone: Settings, groupe: "Actions" },
];
const PAGES_ADMIN: Entree[] = [
    { id: "p-home", titre: "Vue d'ensemble", href: "/", icone: LayoutDashboard, groupe: "Pages" },
    { id: "p-m", titre: "Marchands", href: "/marchands", icone: Store, groupe: "Pages" },
    { id: "p-t", titre: "Transactions", href: "/transactions", icone: CreditCard, groupe: "Pages" },
    { id: "p-v", titre: "Vérifications", href: "/verifications", icone: ShieldCheck, groupe: "Pages" },
    { id: "p-u", titre: "Utilisateurs", href: "/utilisateurs", icone: Users, groupe: "Pages" },
    { id: "p-w", titre: "WhatsApp", href: "/whatsapp", icone: MessageCircle, groupe: "Pages" },
    { id: "p-s", titre: "Santé", href: "/sante", icone: Activity, groupe: "Pages" },
    { id: "p-j", titre: "Journal", href: "/journal", icone: ScrollText, groupe: "Pages" },
];

const ICONES: Record<string, LucideIcon> = { transaction: CreditCard, client: Users, lien: LinkIcon, marchand: Store, utilisateur: Users };

export function BoutonRecherche({ compact }: { compact?: boolean }) {
    const ouvrir = () => window.dispatchEvent(new CustomEvent("cf:palette"));
    const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "");
    return (
        <button type="button" onClick={ouvrir} className={`flex items-center gap-2 rounded-lg text-[13px] transition-colors ${compact ? "h-8 px-2.5" : "h-8 w-full max-w-xs px-2.5"}`}
            style={{ background: "var(--dt-input-bg)", border: "1px solid var(--dt-input-border)", color: "var(--dt-text-muted)" }} aria-label="Rechercher">
            <Search className="h-3.5 w-3.5" />
            {!compact && <span className="flex-1 text-left">Rechercher...</span>}
            <kbd className="rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: "var(--dt-item-hover)", border: "1px solid var(--dt-border)" }}>{mac ? "⌘" : "Ctrl"} K</kbd>
        </button>
    );
}

export function Palette({ admin = false }: { admin?: boolean }) {
    const router = useRouter();
    const [ouvert, setOuvert] = useState(false);
    const [q, setQ] = useState("");
    const [resultats, setResultats] = useState<Entree[]>([]);
    const [chargement, setChargement] = useState(false);
    const [index, setIndex] = useState(0);
    const champ = useRef<HTMLInputElement | null>(null);
    const pages = admin ? PAGES_ADMIN : PAGES_MARCHAND;

    useEffect(() => {
        const clavier = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOuvert((o) => !o); }
            if (e.key === "Escape") setOuvert(false);
        };
        const evt = () => setOuvert(true);
        window.addEventListener("keydown", clavier);
        window.addEventListener("cf:palette", evt);
        return () => { window.removeEventListener("keydown", clavier); window.removeEventListener("cf:palette", evt); };
    }, []);

    useEffect(() => { if (ouvert) { setQ(""); setResultats([]); setIndex(0); setTimeout(() => champ.current?.focus(), 30); } }, [ouvert]);

    // Recherche serveur, avec un petit delai pour ne pas interroger a chaque frappe.
    useEffect(() => {
        if (!ouvert) return;
        const s = q.trim();
        if (s.length < 2) { setResultats([]); return; }
        setChargement(true);
        const t = setTimeout(async () => {
            try {
                const r: any[] = admin ? await adminRechercheGlobale(s) : await rechercheGlobale(s);
                setResultats((r || []).map((x: any) => ({ id: x.id, titre: x.titre, sous: x.sous, href: x.href, icone: ICONES[x.type] || Search, groupe: x.groupe })));
            } catch { setResultats([]); }
            setChargement(false);
        }, 250);
        return () => clearTimeout(t);
    }, [q, ouvert, admin]);

    const liste = useMemo(() => {
        const s = q.trim().toLowerCase();
        const locales = pages.filter((p) => !s || p.titre.toLowerCase().includes(s));
        return [...resultats, ...locales];
    }, [q, resultats, pages]);

    useEffect(() => { setIndex(0); }, [liste.length, q]);

    const aller = useCallback((e: Entree) => { setOuvert(false); router.push(e.href); }, [router]);

    if (!ouvert) return null;

    const groupes = Array.from(new Set(liste.map((e) => e.groupe)));
    let compteur = -1;

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 p-4 pt-[12vh]" onMouseDown={() => setOuvert(false)}>
            <div className="w-full max-w-xl overflow-hidden rounded-2xl shadow-2xl" style={{ background: "var(--dt-dropdown-bg, #161616)", border: "1px solid var(--dt-dropdown-border, rgba(255,255,255,0.08))" }} onMouseDown={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-3 px-4" style={{ borderBottom: "1px solid var(--dt-border)" }}>
                    <Search className="h-4 w-4 shrink-0" style={{ color: "var(--dt-text-muted)" }} />
                    <input ref={champ} value={q} onChange={(e) => setQ(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, liste.length - 1)); }
                            if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
                            if (e.key === "Enter" && liste[index]) aller(liste[index]);
                        }}
                        placeholder={admin ? "Marchand, e-mail, transaction, référence, téléphone..." : "Transaction, référence, client, téléphone, lien, page..."}
                        className="h-12 flex-1 bg-transparent text-sm outline-none" style={{ color: "var(--dt-text-primary)" }} />
                    {chargement && <span className="text-[11px]" style={{ color: "var(--dt-text-muted)" }}>Recherche...</span>}
                    <kbd className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: "var(--dt-item-hover)", color: "var(--dt-text-muted)" }}>Esc</kbd>
                </div>
                <div className="max-h-[60vh] overflow-y-auto py-2">
                    {liste.length === 0 && <p className="px-4 py-6 text-center text-sm" style={{ color: "var(--dt-text-muted)" }}>{q.trim().length >= 2 && !chargement ? "Rien trouvé." : "Tapez pour chercher, ou choisissez une page."}</p>}
                    {groupes.map((g) => (
                        <div key={g}>
                            <p className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--dt-text-muted)" }}>{g}</p>
                            {liste.filter((e) => e.groupe === g).map((e) => {
                                compteur += 1; const i = compteur; const actif = i === index; const Icone = e.icone || Search;
                                return (
                                    <button key={e.id} type="button" onMouseEnter={() => setIndex(i)} onClick={() => aller(e)} className="flex w-full items-center gap-3 px-4 py-2 text-left"
                                        style={{ background: actif ? "var(--dt-item-active)" : "transparent" }}>
                                        <Icone className="h-4 w-4 shrink-0" style={{ color: "var(--dt-text-muted)" }} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm" style={{ color: "var(--dt-text-primary)" }}>{e.titre}</span>
                                            {e.sous && <span className="block truncate text-[11px]" style={{ color: "var(--dt-text-muted)" }}>{e.sous}</span>}
                                        </span>
                                        {actif && <CornerDownLeft className="h-3.5 w-3.5" style={{ color: "var(--dt-text-muted)" }} />}
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
