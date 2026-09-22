"use client";

import type { ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

/**
 * Les graphiques des statistiques (recharts, conteneur shadcn), aux couleurs
 * du theme (--chart-1..5), donc justes en clair comme en sombre.
 *
 * Regles tenues ici : marques fines (barres de 22 px au plus, traits de 2 px),
 * aire en lavis leger, grille en filet, un seul axe, une legende des qu'il y a
 * deux series, une infobulle partout. Et une seule devise par courbe.
 */
const court = (v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M` : v >= 1_000 ? `${Math.round(v / 1_000)} k` : String(Math.round(v)));
export const montantCourt = (v: number, devise = "XOF") => `${court(v)} ${devise}`;
const axe = { tickLine: false, axisLine: false, tickMargin: 8 } as const;

function Valeur({ nom, valeur }: { nom: ReactNode; valeur: ReactNode }) {
    return (
        <div className="flex w-full items-center justify-between gap-3">
            <span className="text-muted-foreground">{nom}</span>
            <span className="font-medium tabular-nums">{valeur}</span>
        </div>
    );
}

/** Une aire unique dans le temps (l'encaisse). */
export function Aire({ donnees, index, cle, label, format, couleur = "var(--chart-1)", hauteur = 240 }: {
    donnees: Record<string, unknown>[]; index: string; cle: string; label: string;
    format?: (v: number) => string; couleur?: string; hauteur?: number;
}) {
    const config = { [cle]: { label, color: couleur } } satisfies ChartConfig;
    const id = `aire-${cle}`;
    return (
        <ChartContainer config={config} className="w-full" style={{ height: hauteur }}>
            <AreaChart data={donnees} margin={{ left: 4, right: 8, top: 6 }}>
                <defs>
                    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={couleur} stopOpacity={0.35} />
                        <stop offset="95%" stopColor={couleur} stopOpacity={0.03} />
                    </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis dataKey={index} {...axe} minTickGap={28} />
                <YAxis {...axe} width={48} tickFormatter={(v) => court(Number(v))} />
                <ChartTooltip cursor={{ stroke: "var(--dt-border)" }} content={<ChartTooltipContent indicator="line"
                    formatter={(v) => <Valeur nom={label} valeur={format ? format(Number(v)) : String(v)} />} />} />
                <Area dataKey={cle} type="monotone" fill={`url(#${id})`} stroke={couleur} strokeWidth={2} dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--dt-card-bg)" }} />
            </AreaChart>
        </ChartContainer>
    );
}

/**
 * Barres, empilees quand il y a plusieurs series. Un trait de la couleur de la
 * surface separe les segments : c'est le vide qui separe, pas un contour.
 */
export function Barres({ donnees, index, series, hauteur = 220, format, legende }: {
    donnees: Record<string, unknown>[]; index: string; series: { cle: string; label: string; couleur: string }[];
    hauteur?: number; format?: (v: number) => string; legende?: boolean;
}) {
    const config = Object.fromEntries(series.map((s) => [s.cle, { label: s.label, color: s.couleur }])) satisfies ChartConfig;
    const avecLegende = legende ?? series.length > 1;
    return (
        <ChartContainer config={config} className="w-full" style={{ height: hauteur }}>
            <BarChart data={donnees} margin={{ left: 4, right: 8, top: 6 }} barCategoryGap="30%">
                <CartesianGrid vertical={false} />
                <XAxis dataKey={index} {...axe} minTickGap={20} />
                <YAxis {...axe} width={34} allowDecimals={false} />
                <ChartTooltip cursor={{ fill: "var(--dt-item-hover)" }} content={<ChartTooltipContent indicator="dot"
                    formatter={(v, nom) => <Valeur nom={config[nom as keyof typeof config]?.label || String(nom)} valeur={format ? format(Number(v)) : String(v)} />} />} />
                {avecLegende && <ChartLegend content={<ChartLegendContent />} />}
                {series.map((s, i) => (
                    <Bar key={s.cle} dataKey={s.cle} stackId="a" fill={s.couleur} maxBarSize={22}
                        stroke="var(--dt-card-bg)" strokeWidth={1}
                        radius={i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                ))}
            </BarChart>
        </ChartContainer>
    );
}

/**
 * Classement en barres horizontales (moyens de paiement, pays). Dessine a la
 * main plutot qu'avec un graphique : c'est une liste, et elle porte un logo
 * ou un drapeau a cote du nom.
 */
export function ListeBarres({ donnees, format, couleur = "var(--chart-1)" }: {
    donnees: { name: string; value: number; icon?: ReactNode; sous?: ReactNode }[]; format?: (v: number) => string; couleur?: string;
}) {
    const max = Math.max(...donnees.map((d) => d.value), 1);
    return (
        <ul className="grid grid-cols-1 gap-3">
            {donnees.map((d) => (
                <li key={d.name}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-[13px]">
                        <span className="flex min-w-0 items-center gap-2" style={{ color: "var(--dt-text-primary)" }}>{d.icon}<span className="truncate">{d.name}</span></span>
                        <span className="shrink-0 tabular-nums" style={{ color: "var(--dt-text-primary)" }}>{format ? format(d.value) : d.value}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--dt-item-hover)" }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.max(2, (d.value / max) * 100)}%`, background: couleur }} />
                    </div>
                    {d.sous && <p className="mt-1 text-[11.5px]" style={{ color: "var(--dt-text-muted)" }}>{d.sous}</p>}
                </li>
            ))}
        </ul>
    );
}

/**
 * Entonnoir a trois marches, teintes ordonnees d'une seule couleur : la marche
 * la plus claire est la plus large, la plus foncee est celle qui compte.
 */
const TEINTES_ENTONNOIR = ["#a78bfa", "#864FFE", "#6d28d9"];

export function Entonnoir({ etapes }: { etapes: { nom: string; valeur: number; detail?: ReactNode }[] }) {
    const base = etapes[0]?.valeur || 0;
    return (
        <div className="grid grid-cols-1 gap-3.5">
            {etapes.map((e, i) => {
                const pct = base ? Math.round((e.valeur / base) * 100) : 0;
                return (
                    <div key={e.nom}>
                        <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
                            <span style={{ color: "var(--dt-text-primary)" }}>{e.nom}</span>
                            <span className="shrink-0 tabular-nums" style={{ color: "var(--dt-text-primary)" }}>
                                {e.valeur.toLocaleString("fr-FR")} <span style={{ color: "var(--dt-text-muted)" }}>({pct} %)</span>
                            </span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full" style={{ background: "var(--dt-item-hover)" }}>
                            <div className="h-full rounded-full" style={{ width: `${Math.max(pct, e.valeur ? 2 : 0)}%`, background: TEINTES_ENTONNOIR[i] || TEINTES_ENTONNOIR[2] }} />
                        </div>
                        {e.detail && <p className="mt-1 text-[11.5px]" style={{ color: "var(--dt-text-muted)" }}>{e.detail}</p>}
                    </div>
                );
            })}
        </div>
    );
}
