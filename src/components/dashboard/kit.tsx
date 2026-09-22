"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/coque/ui/select";
import { formaterMontant } from "@/lib/devises";

/**
 * Kit d'interface du tableau de bord marchand : les memes briques sur tous
 * les ecrans, pour que le marchand retrouve partout la meme logique.
 * Tout s'appuie sur les variables CSS du theme (--dt-*).
 */

export const carte = { background: "var(--dt-card-bg)", border: "1px solid var(--dt-border)" } as const;
export const champStyle = { background: "var(--dt-input-bg)", border: "1px solid var(--dt-input-border)", color: "var(--dt-text-primary)" } as const;

export function Page({ titre, sousTitre, action, children, large }: { titre: string; sousTitre?: ReactNode; action?: ReactNode; children: ReactNode; large?: boolean }) {
    return (
        <div className={`mx-auto flex flex-col gap-5 pb-24 md:pb-8 ${large ? "max-w-7xl" : "max-w-5xl"}`}>
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                    <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--dt-text-primary)" }}>{titre}</h1>
                    {sousTitre && <p className="mt-1 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--dt-text-muted)" }}>{sousTitre}</p>}
                </div>
                {action}
            </div>
            {children}
        </div>
    );
}

/**
 * Carte de contenu. `min-w-0` est indispensable : sans lui, un enfant large
 * (tableau, cle API) etire la carte au-dela de l'ecran au lieu de defiler dedans.
 */
export function Bloc({ titre, sousTitre, action, children, id }: { titre?: ReactNode; sousTitre?: ReactNode; action?: ReactNode; children: ReactNode; id?: string }) {
    return (
        <section id={id} className="min-w-0 rounded-2xl p-5 md:p-6" style={carte}>
            {(titre || action) && (
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                        {titre && <h2 className="text-[15px] font-semibold" style={{ color: "var(--dt-text-primary)" }}>{titre}</h2>}
                        {sousTitre && <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--dt-text-muted)" }}>{sousTitre}</p>}
                    </div>
                    {action}
                </div>
            )}
            {children}
        </section>
    );
}

export function Champ({ label, aide, children }: { label: string; aide?: ReactNode; children: ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1.5 block text-xs font-medium" style={{ color: "var(--dt-text-secondary)" }}>{label}</span>
            {children}
            {aide && <span className="mt-1 block text-[11px]" style={{ color: "var(--dt-text-muted)" }}>{aide}</span>}
        </label>
    );
}

export function Entree(props: React.InputHTMLAttributes<HTMLInputElement>) {
    return <input {...props} className={`h-10 w-full rounded-lg px-3 text-sm outline-none disabled:opacity-60 ${props.className || ""}`} style={{ ...champStyle, ...(props.style || {}) }} />;
}

export function Zone(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return <textarea {...props} className={`w-full rounded-lg px-3 py-2 text-sm outline-none ${props.className || ""}`} style={{ ...champStyle, ...(props.style || {}) }} />;
}

export function Choix({ value, onChange, options, className, disabled, ...rest }: { value: string; onChange: (v: string) => void; options: { value: string; label: ReactNode }[] } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value">) {
    // Meme signature qu'avant (c'etait un <select> natif) : les pages qui
    // l'utilisent n'ont pas bouge, seul le rendu est desormais le notre.
    const courant = options.find((o) => o.value === value);
    return (
        <Select items={options} value={value} onValueChange={(v) => onChange(String(v ?? ""))} disabled={disabled}>
            <SelectTrigger className={`w-full ${className || ""}`} aria-label={String(rest["aria-label"] || "Choisir")}>
                <SelectValue>{courant?.label ?? ""}</SelectValue>
            </SelectTrigger>
            <SelectContent>
                {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
        </Select>
    );
}

export function Bouton({ variante = "principal", chargement, icone: Icone, children, ...rest }: { variante?: "principal" | "secondaire" | "danger" | "discret"; chargement?: boolean; icone?: LucideIcon; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
    const styles: Record<string, React.CSSProperties> = {
        principal: { background: "var(--dt-primary, var(--dt-brand))", color: "#ffffff" },
        secondaire: { background: "var(--dt-item-hover)", color: "var(--dt-text-primary)", border: "1px solid var(--dt-border)" },
        danger: { background: "rgba(239,68,68,0.12)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)" },
        discret: { background: "transparent", color: "var(--dt-text-muted)" },
    };
    return (
        <button {...rest} disabled={rest.disabled || chargement} className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-50 ${rest.className || ""}`} style={{ ...styles[variante], ...(rest.style || {}) }}>
            {chargement ? <Loader2 className="h-4 w-4 animate-spin" /> : Icone ? <Icone className="h-4 w-4" /> : null}
            {children}
        </button>
    );
}

export function Interrupteur({ actif, onChange, disabled }: { actif: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
    return (
        <button type="button" role="switch" aria-checked={actif} disabled={disabled} onClick={() => onChange(!actif)}
            className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50"
            style={{ background: actif ? "var(--dt-brand)" : "var(--dt-item-hover)", border: "1px solid var(--dt-border)" }}>
            <span className="inline-block h-4 w-4 rounded-full bg-white transition-transform" style={{ transform: actif ? "translateX(23px)" : "translateX(3px)" }} />
        </button>
    );
}

export function Pastille({ label, couleur = "#94a3b8" }: { label: ReactNode; couleur?: string }) {
    return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `${couleur}1f`, color: couleur }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: couleur }} />{label}
        </span>
    );
}

export function Onglets<T extends string>({ items, actif, onChange }: { items: { cle: T; label: string; icone?: LucideIcon }[]; actif: T; onChange: (c: T) => void }) {
    return (
        <div className="flex flex-wrap gap-1 rounded-xl p-1 sm:flex-nowrap sm:overflow-x-auto" style={{ background: "var(--dt-item-hover)", border: "1px solid var(--dt-border)" }}>
            {items.map((i) => (
                <button key={i.cle} type="button" onClick={() => onChange(i.cle)} className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                    style={actif === i.cle ? { background: "var(--dt-card-bg)", color: "var(--dt-text-primary)", border: "1px solid var(--dt-border)" } : { color: "var(--dt-text-muted)", border: "1px solid transparent" }}>
                    {i.icone && <i.icone className="h-3.5 w-3.5" />}{i.label}
                </button>
            ))}
        </div>
    );
}

export function Aide({ children, ton = "info" }: { children: ReactNode; ton?: "info" | "attention" | "ok" }) {
    const c = ton === "attention" ? "#f59e0b" : ton === "ok" ? "#12a594" : "#60a5fa";
    return <div className="rounded-lg px-3.5 py-3 text-xs leading-relaxed" style={{ background: `${c}14`, border: `1px solid ${c}33`, color: "var(--dt-text-secondary)" }}>{children}</div>;
}

export function Vide({ icone: Icone, titre, texte, action }: { icone?: LucideIcon; titre: string; texte?: ReactNode; action?: ReactNode }) {
    return (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl px-4 py-12 text-center" style={{ border: "1px dashed var(--dt-border)" }}>
            {Icone && <Icone className="mb-1 h-7 w-7" style={{ color: "var(--dt-text-muted)" }} />}
            <p className="text-sm font-semibold" style={{ color: "var(--dt-text-primary)" }}>{titre}</p>
            {texte && <p className="max-w-md text-xs leading-relaxed" style={{ color: "var(--dt-text-muted)" }}>{texte}</p>}
            {action && <div className="mt-2">{action}</div>}
        </div>
    );
}

export function Squelette({ lignes = 5 }: { lignes?: number }) {
    return <div className="animate-pulse space-y-3">{Array.from({ length: lignes }).map((_, i) => <div key={i} className="h-12 rounded-lg" style={{ background: "var(--dt-card-bg)" }} />)}</div>;
}

export function Copier({ valeur, label = "Copier" }: { valeur: string; label?: string }) {
    const [ok, setOk] = useState(false);
    return (
        <button type="button" onClick={() => { navigator.clipboard.writeText(valeur).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); }); }}
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs" style={{ background: "var(--dt-item-hover)", color: ok ? "#12a594" : "var(--dt-text-muted)" }} title={label}>
            {ok ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{ok ? "Copié" : label}
        </button>
    );
}

export function Code({ children }: { children: string }) {
    return (
        <div className="relative">
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl p-4 font-mono text-[12px] leading-relaxed" style={{ background: "#0d0d0d", color: "#d4d4d8", border: "1px solid var(--dt-border)" }}>{children}</pre>
            <div className="absolute right-2 top-2"><Copier valeur={children} /></div>
        </div>
    );
}

export function LienCarte({ href, titre, texte, icone: Icone, externe }: { href: string; titre: string; texte: string; icone?: LucideIcon; externe?: boolean }) {
    const contenu = (
        <div className="flex items-start gap-3 rounded-xl p-4 transition-colors hover:bg-white/[0.03]" style={carte}>
            {Icone && <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: "var(--dt-item-hover)", color: "var(--dt-text-secondary)" }}><Icone className="h-4 w-4" /></span>}
            <div><p className="text-sm font-semibold" style={{ color: "var(--dt-text-primary)" }}>{titre}</p><p className="text-xs leading-relaxed" style={{ color: "var(--dt-text-muted)" }}>{texte}</p></div>
        </div>
    );
    return externe ? <a href={href} target="_blank" rel="noopener noreferrer">{contenu}</a> : <Link href={href}>{contenu}</Link>;
}

export const fmtDate = (d?: string | Date | null) => d ? new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
export const fmtMontant = (n: number, devise = "XOF") => formaterMontant(n, devise);

/**
 * Plusieurs devises, jamais additionnees : la principale en avant, les autres
 * dessous en plus petit. Additionner des francs et des euros puis coller
 * « XOF » au bout donnait un chiffre faux et rassurant.
 */
export function Montants({ valeurs }: { valeurs?: { devise: string; montant: number }[] | null }) {
    const lignes = (valeurs || []).filter((v) => v && v.montant !== 0);
    if (lignes.length === 0) return <>{fmtMontant(0, "XOF")}</>;
    const [premier, ...reste] = lignes;
    return (
        <>
            <span>{fmtMontant(premier.montant, premier.devise)}</span>
            {reste.map((m) => (
                <span key={m.devise} className="block text-[14px] font-medium" style={{ color: "var(--dt-text-muted)" }}>{fmtMontant(m.montant, m.devise)}</span>
            ))}
        </>
    );
}
