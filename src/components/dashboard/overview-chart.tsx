"use client";

import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import { ChevronDown, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/coque/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/coque/ui/dropdown-menu";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { getVolumeSerie, type PointVolume } from "@/lib/actions/dashboard";

/**
 * Ce qui est entre, jour par jour, en aires empilees : Mobile Money et carte
 * bancaire se cumulent donc sur le total encaisse. Trois periodes, comme sur
 * les tableaux de bord de paiement.
 */
const PERIODES = [
    { jours: 90, label: "3 derniers mois" },
    { jours: 30, label: "30 derniers jours" },
    { jours: 7, label: "7 derniers jours" },
] as const;

const config = {
    mobile: { label: "Mobile Money", color: "var(--chart-1)" },
    carte: { label: "Carte bancaire", color: "var(--chart-2)" },
} satisfies ChartConfig;

const montant = (v: number) => `${new Intl.NumberFormat("fr-FR").format(Math.round(v))} F`;
const jourCourt = (v: string) => new Date(v).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const jourLong = (v: string) => new Date(v).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

export function OverviewChart() {
    const [jours, setJours] = useState<number>(30);
    const [points, setPoints] = useState<PointVolume[] | null>(null);

    useEffect(() => {
        let vivant = true;
        setPoints(null);
        getVolumeSerie(jours).then((d) => { if (vivant) setPoints(d); }).catch(() => { if (vivant) setPoints([]); });
        return () => { vivant = false; };
    }, [jours]);

    const periode = PERIODES.find((p) => p.jours === jours) || PERIODES[1];
    const total = useMemo(() => (points || []).reduce((s, p) => s + p.mobile + p.carte, 0), [points]);
    const paiements = useMemo(() => (points || []).reduce((s, p) => s + p.paiements, 0), [points]);

    return (
        <Card className="h-full pt-0">
            <CardHeader className="flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row">
                <div className="grid grid-cols-1 flex-1 gap-1">
                    <CardTitle>Ce qui est entré</CardTitle>
                    <CardDescription>
                        {points === null ? "Chargement…"
                            : total > 0 ? `${montant(total)} sur ${paiements} paiement${paiements > 1 ? "s" : ""}, ${periode.label.toLowerCase()}.`
                                : `Aucun paiement reçu sur ${periode.label.toLowerCase()}.`}
                    </CardDescription>
                </div>
                <DropdownMenu>
                    <DropdownMenuTrigger
                        render={<button type="button" aria-label="Choisir la période" className="inline-flex h-9 w-[190px] items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 text-[13px] text-foreground sm:ml-auto" />}>
                        {periode.label}
                        <ChevronDown className="size-4 text-muted-foreground" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[190px] rounded-xl">
                        {PERIODES.map((p) => (
                            <DropdownMenuItem key={p.jours} onClick={() => setJours(p.jours)} className="rounded-lg">{p.label}</DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </CardHeader>
            <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
                {points === null ? (
                    <div className="flex h-[250px] items-center justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
                ) : (
                    <ChartContainer config={config} className="aspect-auto h-[250px] w-full">
                        <AreaChart data={points}>
                            <defs>
                                {(["mobile", "carte"] as const).map((cle) => (
                                    <linearGradient key={cle} id={`aire-${cle}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={`var(--color-${cle})`} stopOpacity={0.8} />
                                        <stop offset="95%" stopColor={`var(--color-${cle})`} stopOpacity={0.1} />
                                    </linearGradient>
                                ))}
                            </defs>
                            <CartesianGrid vertical={false} />
                            <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} tickFormatter={jourCourt} />
                            <ChartTooltip cursor={false} content={<ChartTooltipContent labelFormatter={(v) => jourLong(String(v))} formatter={(valeur, nom) => (
                                <div className="flex w-full items-center justify-between gap-3">
                                    <span className="text-muted-foreground">{config[nom as keyof typeof config]?.label || nom}</span>
                                    <span className="font-medium tabular-nums">{montant(Number(valeur))}</span>
                                </div>
                            )} indicator="dot" />} />
                            <Area dataKey="carte" type="natural" fill="url(#aire-carte)" stroke="var(--color-carte)" stackId="a" />
                            <Area dataKey="mobile" type="natural" fill="url(#aire-mobile)" stroke="var(--color-mobile)" stackId="a" />
                            <ChartLegend content={<ChartLegendContent />} />
                        </AreaChart>
                    </ChartContainer>
                )}
            </CardContent>
        </Card>
    );
}
