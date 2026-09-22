"use client";

import { useMemo, type ReactNode } from "react";
import { Select, Input, Button, DatePicker } from "antd";
import { Search, Calendar } from "lucide-react";
import dayjs, { type Dayjs } from "dayjs";

/**
 * Barre de filtres commune a tous les tableaux :
 *   [Statut avec compteur] [Recherche] [autres selecteurs] [Toutes dates | Aujourd'hui | Cette semaine | Ce mois | Du .. Au ..]
 *
 * Les dates sont un objet { preset, from, to } : les pages n'ont qu'a le
 * passer a leur chargement. `bornes()` le traduit en bornes ISO.
 */

export type Dates = { preset: "all" | "today" | "week" | "month" | "custom"; from?: string; to?: string };
export type Selection = { cle: string; valeur: string; onChange: (v: string) => void; options: { value: string; label: ReactNode; count?: number; texte?: string }[]; largeur?: number; recherche?: boolean };

export const DATES_TOUTES: Dates = { preset: "all" };

export function bornes(d: Dates): { from?: string; to?: string } {
    const debutJour = (x: Dayjs) => x.startOf("day").toISOString();
    const finJour = (x: Dayjs) => x.endOf("day").toISOString();
    const maintenant = dayjs();
    switch (d.preset) {
        case "today": return { from: debutJour(maintenant), to: finJour(maintenant) };
        case "week": return { from: debutJour(maintenant.subtract(6, "day")), to: finJour(maintenant) };
        case "month": return { from: debutJour(maintenant.startOf("month")), to: finJour(maintenant) };
        case "custom": return { from: d.from, to: d.to };
        default: return {};
    }
}

const { RangePicker } = DatePicker;

export function BarreFiltres({
    statut, recherche, selections = [], dates, extra, total,
}: {
    statut?: Selection;
    recherche?: { valeur: string; onChange: (v: string) => void; placeholder?: string };
    selections?: Selection[];
    dates?: { valeur: Dates; onChange: (d: Dates) => void };
    extra?: ReactNode;
    total?: number;
}) {
    // Un libelle peut etre du JSX (drapeau + nom) : la recherche porte alors sur `texte`.
    const options = (s: Selection) => s.options.map((o) => ({ value: o.value, texte: o.texte ?? (typeof o.label === "string" ? o.label : ""), label: o.count != null ? <>{o.label} ({o.count})</> : o.label }));
    const filtre = (saisie: string, option?: { texte?: string }) => String(option?.texte || "").toLowerCase().includes(saisie.toLowerCase());
    const plage = useMemo<[Dayjs | null, Dayjs | null] | null>(() => dates?.valeur.preset === "custom" && dates.valeur.from && dates.valeur.to ? [dayjs(dates.valeur.from), dayjs(dates.valeur.to)] : null, [dates?.valeur]);

    return (
        <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
            {statut && (
                <Select value={statut.valeur} onChange={statut.onChange} options={options(statut)} className="w-full md:!w-48" showSearch={statut.recherche} filterOption={filtre} />
            )}
            {recherche && (
                <Input
                    value={recherche.valeur}
                    onChange={(e) => recherche.onChange(e.target.value)}
                    placeholder={recherche.placeholder || "Rechercher..."}
                    allowClear
                    prefix={<Search className="h-4 w-4" style={{ color: "var(--dt-text-muted)" }} />}
                    className="min-w-0 flex-1"
                />
            )}
            {selections.map((s) => (
                <Select key={s.cle} value={s.valeur} onChange={s.onChange} options={options(s)} showSearch={s.recherche} filterOption={filtre} className="w-full md:!w-auto" style={{ minWidth: s.largeur || 176 }} popupMatchSelectWidth={false} />
            ))}
            {dates && (
                <div className="flex flex-wrap items-center gap-1">
                    {([["all", "Toutes dates"], ["today", "Aujourd'hui"], ["week", "Cette semaine"], ["month", "Ce mois"]] as const).map(([p, l]) => (
                        <Button key={p} size="small" type={dates.valeur.preset === p ? "primary" : "default"} icon={<Calendar className="h-3.5 w-3.5" />} onClick={() => dates.onChange({ preset: p })}>{l}</Button>
                    ))}
                    <RangePicker
                        size="small"
                        value={plage}
                        placeholder={["Du", "Au"]}
                        format="DD/MM/YYYY"
                        onChange={(v) => {
                            if (!v || !v[0] || !v[1]) return dates.onChange({ preset: "all" });
                            dates.onChange({ preset: "custom", from: v[0].startOf("day").toISOString(), to: v[1].endOf("day").toISOString() });
                        }}
                    />
                </div>
            )}
            {extra}
            {total != null && <span className="text-xs md:ml-auto" style={{ color: "var(--dt-text-muted)" }}>{total.toLocaleString("fr-FR")} résultat{total > 1 ? "s" : ""}</span>}
        </div>
    );
}

/** Filtre cote client : dates + recherche plein texte sur des champs. */
export function filtrerLocal<T>(lignes: T[], o: { dates?: Dates; dateDe?: (l: T) => string | Date | null | undefined; recherche?: string; champs?: (l: T) => (string | null | undefined)[] }): T[] {
    const b = o.dates ? bornes(o.dates) : {};
    const q = (o.recherche || "").trim().toLowerCase();
    return lignes.filter((l) => {
        if ((b.from || b.to) && o.dateDe) {
            const d = o.dateDe(l); if (!d) return false;
            const t = new Date(d).getTime();
            if (b.from && t < new Date(b.from).getTime()) return false;
            if (b.to && t > new Date(b.to).getTime()) return false;
        }
        if (q && o.champs) return o.champs(l).some((c) => (c || "").toLowerCase().includes(q));
        return true;
    });
}
