"use client";

import { ChampDate } from "@/components/coque/champ-date";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    ReferenceLine,
    Brush,
    Tooltip,
    LineChart,
    Line,
} from "recharts";
import {
    Calendar,
    ChevronDown,
    RefreshCw,
    Download,
    Settings2,
    ArrowUpRight,
    ArrowDownRight,
    Wallet,
    Activity,
    CheckCircle2,
    CreditCard,
} from "lucide-react";
import { getUsageData, type UsageData } from "@/lib/actions/usage";
import { useDashboardTheme } from "@/components/dashboard/theme-context";

const PURPLE = "#1f93ff";
const ORANGE = "#12a594";
const PINK = "#e5484d";
const INDIGO = "#5eb1ff";

const PRESETS = [
    { label: "7 jours", days: 7 },
    { label: "30 jours", days: 30 },
    { label: "90 jours", days: 90 },
    { label: "12 mois", days: 365 },
    { label: "Tout", days: 0 },
] as const;

const toISO = (d: Date) => d.toISOString().split("T")[0];

const fmtMoney = (v: number) => {
    const n = Number.isFinite(v) ? v : 0;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
    return `${Math.round(n)}`;
};

export default function AnalyticsPage() {
    const theme = useDashboardTheme();
    const today = new Date();
    const [preset, setPreset] = useState<number>(30);
    const [startDate, setStartDate] = useState(toISO(new Date(Date.now() - 29 * 86400_000)));
    const [endDate, setEndDate] = useState(toISO(today));
    const [showPicker, setShowPicker] = useState(false);
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<UsageData | null>(null);

    const load = useCallback(async (sd: string, ed: string) => {
        setLoading(true);
        try {
            setData(await getUsageData(sd, ed));
        } catch {
            setData(null);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        load(startDate, endDate);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const applyPreset = (days: number) => {
        setPreset(days);
        setShowPicker(false);
        const sd = days === 0 ? "2020-01-01" : toISO(new Date(Date.now() - days * 86400_000));
        const ed = toISO(today);
        setStartDate(sd);
        setEndDate(ed);
        load(sd, ed);
    };

    const applyCustom = () => {
        setPreset(-1);
        setShowPicker(false);
        load(startDate, endDate);
    };

    const series = data?.series ?? [];

    const exportCsv = () => {
        if (!series.length) return;
        const head = "date,volume_xof,transactions,reussies,echouees";
        const rows = series.map((p) => `${p.key},${p.volume},${p.count},${p.success},${p.failed}`);
        const blob = new Blob([[head, ...rows].join("\n")], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `usage-${data?.rangeStart}-${data?.rangeEnd}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const monthProgress = useMemo(
        () => (data ? Math.max(0, Math.min(100, data.successRate)) : 0),
        [data]
    );

    const CardBorder = { borderBottom: `1px solid ${theme.divider}` };

    const VolumeTooltip = ({ active, payload }: any) => {
        if (!active || !payload?.length) return null;
        const p = payload[0].payload as UsageData["series"][number];
        return (
            <div
                className="rounded-lg px-3 py-2 text-xs"
                style={{
                    background: theme.dropdownBg,
                    border: `1px solid ${theme.dropdownBorder}`,
                    color: theme.textPrimary,
                    boxShadow: theme.dropdownShadow,
                }}
            >
                <div className="mb-1 font-medium">{p.label}</div>
                <div style={{ color: theme.textMuted }}>
                    Encaissé : <span style={{ color: PURPLE }}>{fmtMoney(p.volume)} F</span>
                </div>
                <div style={{ color: theme.textMuted }}>
                    {p.count} transaction{p.count > 1 ? "s" : ""} ({p.success} ok)
                </div>
            </div>
        );
    };

    const kpis = data
        ? [
              { label: "Total encaissé", value: `${fmtMoney(data.totalSpend)} F`, trend: data.spendTrend, icon: Wallet, color: PURPLE },
              { label: "Transactions", value: data.totalTransactions.toLocaleString("fr-FR"), trend: data.txTrend, icon: Activity, color: INDIGO },
              { label: "Taux de réussite", value: `${data.successRate.toFixed(1)}%`, trend: data.successTrend, icon: CheckCircle2, color: ORANGE },
              { label: "Panier moyen", value: `${fmtMoney(data.avgTicket)} F`, trend: { val: `${data.uniqueClients} clients`, up: true }, icon: CreditCard, color: PINK },
          ]
        : Array(4).fill(null);

    // Barre de répartition (façon BarList OpenAI)
    const BarList = ({ rows, max }: { rows: { name: string; value: number }[]; max: number }) => (
        <div className="flex flex-col gap-2">
            {rows.length === 0 && (
                <div className="py-6 text-center text-sm" style={{ color: theme.textMuted }}>
                    Aucune donnée
                </div>
            )}
            {rows.map((r) => (
                <div key={r.name} className="relative flex items-center justify-between overflow-hidden rounded-md px-3 py-2">
                    <div
                        className="absolute inset-y-0 left-0 rounded-md"
                        style={{ width: `${max > 0 ? Math.max(6, (r.value / max) * 100) : 0}%`, background: `${PURPLE}22` }}
                    />
                    <span className="relative z-10 truncate text-sm" style={{ color: theme.textPrimary }}>
                        {r.name}
                    </span>
                    <span className="relative z-10 text-sm tabular-nums" style={{ color: theme.textSecondary }}>
                        {fmtMoney(r.value)} F
                    </span>
                </div>
            ))}
        </div>
    );

    const providerMax = Math.max(1, ...(data?.byProvider ?? []).map((p) => p.volume));
    const countryMax = Math.max(1, ...(data?.byCountry ?? []).map((p) => p.volume));

    return (
        <div className="flex min-h-full w-full flex-col" style={{ color: theme.textPrimary }}>
            {/* ── Header ── */}
            <div
                className="sticky top-0 z-20 flex flex-row flex-wrap items-center gap-x-4 gap-y-3 px-6 py-3"
                style={{ borderBottom: `1px solid ${theme.divider}`, background: theme.headerBg }}
            >
                <h1 className="m-0 text-xl font-semibold tracking-normal">Usage</h1>

                <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:justify-end">
                    {/* Presets + custom */}
                    <div className="no-scrollbar flex max-w-full items-center overflow-x-auto rounded-full" style={{ border: `1px solid ${theme.border}` }}>
                        {PRESETS.map((p) => {
                            const active = preset === p.days;
                            return (
                                <button
                                    key={p.days}
                                    type="button"
                                    onClick={() => applyPreset(p.days)}
                                    className="px-3 py-1.5 text-xs transition-colors"
                                    style={{
                                        background: active ? theme.itemActiveBg : "transparent",
                                        color: active ? theme.textPrimary : theme.textMuted,
                                        fontWeight: active ? 600 : 400,
                                    }}
                                >
                                    {p.label}
                                </button>
                            );
                        })}
                        <button
                            type="button"
                            onClick={() => setShowPicker((v) => !v)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs tabular-nums transition-colors"
                            style={{
                                background: preset === -1 ? theme.itemActiveBg : "transparent",
                                color: preset === -1 ? theme.textPrimary : theme.textMuted,
                            }}
                        >
                            <Calendar className="h-3.5 w-3.5" />
                            {preset === -1 && data ? `${data.rangeStart} - ${data.rangeEnd}` : "Personnalisé"}
                            <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                    </div>

                    <button
                        type="button"
                        aria-label="Rafraîchir"
                        onClick={() => load(startDate, endDate)}
                        className="grid h-8 w-8 place-items-center rounded-full"
                        style={{ color: theme.textSecondary }}
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                    </button>
                    <button
                        type="button"
                        aria-label="Exporter"
                        onClick={exportCsv}
                        className="grid h-8 w-8 place-items-center rounded-full"
                        style={{ color: theme.textSecondary }}
                    >
                        <Download className="h-4 w-4" />
                    </button>
                </div>

                {/* Popover plage personnalisée */}
                {showPicker && (
                    <div
                        className="flex w-full flex-wrap items-end gap-3 rounded-xl p-4"
                        style={{ background: theme.cardBg, border: `1px solid ${theme.border}` }}
                    >
                        <div className="flex flex-col gap-1">
                            <label className="text-xs" style={{ color: theme.textMuted }}>Du</label>
                            <ChampDate taille="sm" value={startDate} max={endDate} onChange={(v) => { setStartDate(v); setPreset(-1); }} />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs" style={{ color: theme.textMuted }}>Au</label>
                            <ChampDate taille="sm" value={endDate} min={startDate} max={toISO(today)} onChange={(v) => { setEndDate(v); setPreset(-1); }} />
                        </div>
                        <button
                            type="button"
                            onClick={applyCustom}
                            className="rounded-lg px-4 py-1.5 text-xs font-medium text-white"
                            style={{ background: PURPLE }}
                        >
                            Appliquer
                        </button>
                    </div>
                )}
            </div>

            {/* ── KPI row ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4" style={{ borderBottom: `1px solid ${theme.divider}` }}>
                {kpis.map((k: any, i: number) => (
                    <div
                        key={i}
                        className="p-4"
                        style={{ borderRight: i < 3 ? `1px solid ${theme.divider}` : "none" }}
                    >
                        {k ? (
                            <>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs" style={{ color: theme.textMuted }}>{k.label}</span>
                                    <k.icon className="h-3.5 w-3.5" style={{ color: k.color }} />
                                </div>
                                <div className="mt-1.5 text-xl font-semibold">{k.value}</div>
                                <div className="mt-1 flex items-center gap-1 text-xs">
                                    {k.trend.up ? (
                                        <ArrowUpRight className="h-3 w-3 text-teal-400" />
                                    ) : (
                                        <ArrowDownRight className="h-3 w-3 text-red-400" />
                                    )}
                                    <span className={k.trend.up ? "text-teal-400" : "text-red-400"}>{k.trend.val}</span>
                                </div>
                            </>
                        ) : (
                            <div className="space-y-2">
                                <div className="h-3 w-20 rounded" style={{ background: theme.divider }} />
                                <div className="h-5 w-24 rounded" style={{ background: theme.divider }} />
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* ── Corps : graphe principal + colonne de cartes ── */}
            <div className="flex flex-1 flex-col lg:flex-row">
                <div className="min-w-0 flex-1" style={{ borderBottom: `1px solid ${theme.divider}` }}>
                    <div className="p-4">
                        <div className="flex flex-row items-start justify-between gap-4">
                            <div>
                                <div className="px-3 pt-1 pb-2 text-sm" style={{ color: theme.textMuted }}>Total encaissé</div>
                                <div className="px-3 text-xl font-semibold">{data ? `${fmtMoney(data.totalSpend)} F` : "—"}</div>
                            </div>
                            <span
                                className="rounded px-2 py-1 text-xs font-semibold"
                                style={{ background: theme.itemActiveBg, color: theme.textPrimary }}
                            >
                                {data?.granularity === "month" ? "1 mois" : "1 jour"}
                            </span>
                        </div>

                        <div className="relative px-1 pt-3">
                            {loading && (
                                <div className="absolute inset-0 z-10 grid place-items-center">
                                    <RefreshCw className="h-5 w-5 animate-spin" style={{ color: theme.textMuted }} />
                                </div>
                            )}
                            <div style={{ width: "100%", height: 300 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={series} margin={{ top: 24, right: 8, left: 8, bottom: 0 }}>
                                        <XAxis
                                            dataKey="label"
                                            tickLine={false}
                                            axisLine={false}
                                            interval="preserveStartEnd"
                                            minTickGap={9999}
                                            tick={{ fill: theme.textMuted, fontSize: 13 }}
                                        />
                                        <YAxis hide domain={[0, "dataMax"]} />
                                        <Tooltip cursor={{ fill: theme.itemHoverBg }} content={<VolumeTooltip />} />
                                        {data && data.avgPerDay > 0 && (
                                            <ReferenceLine
                                                y={data.avgPerDay}
                                                stroke={PURPLE}
                                                strokeDasharray="3 3"
                                                label={{ value: `${fmtMoney(data.avgPerDay)} F`, position: "insideTopLeft", fill: PURPLE, fontSize: 12 }}
                                            />
                                        )}
                                        <Bar dataKey="volume" fill={PURPLE} radius={0} maxBarSize={54} />
                                        <Brush dataKey="label" height={26} travellerWidth={8} stroke={PURPLE} fill={theme.cardBg} tickFormatter={() => ""} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Colonne de droite */}
                <div className="w-full shrink-0 lg:w-[340px]" style={{ borderLeft: `1px solid ${theme.divider}` }}>
                    <div className="flex flex-col justify-center p-4" style={CardBorder}>
                        <div className="flex items-center justify-between">
                            <span className="text-sm" style={{ color: theme.textMuted }}>Encaissé ce mois</span>
                            <Settings2 className="h-3.5 w-3.5" style={{ color: theme.textMuted }} />
                        </div>
                        <div className="mt-1 text-lg font-semibold">
                            {data ? `${fmtMoney(data.monthSpend)} F` : "—"}
                            <span className="ml-2 text-xs font-normal" style={{ color: theme.textMuted }}>
                                {data ? `${data.monthCount} paiement${data.monthCount > 1 ? "s" : ""}` : ""}
                            </span>
                        </div>
                        <div className="mt-3">
                            <div className="mb-1 flex items-center justify-between text-xs" style={{ color: theme.textMuted }}>
                                <span>Taux de réussite</span>
                                <span>{data ? `${data.successRate.toFixed(1)}%` : "—"}</span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: theme.itemHoverBg }}>
                                <div className="h-full rounded-full transition-all" style={{ width: `${monthProgress}%`, background: PURPLE }} />
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col justify-center p-4" style={CardBorder}>
                        <div className="text-sm" style={{ color: theme.textMuted }}>Total transactions</div>
                        <div className="text-lg font-semibold">{data ? data.totalTransactions.toLocaleString("fr-FR") : "—"}</div>
                        <div className="mt-1 flex items-center gap-3 text-[11px]" style={{ color: theme.textMuted }}>
                            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: ORANGE }} />Réussies</span>
                            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: PINK }} />Échouées</span>
                        </div>
                        <div className="mt-2" style={{ width: "100%", height: 48 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={series} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                                    <Line type="monotone" dataKey="success" stroke={ORANGE} strokeWidth={2} dot={false} />
                                    <Line type="monotone" dataKey="failed" stroke={PINK} strokeWidth={2} dot={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="flex flex-col justify-center p-4">
                        <div className="text-sm" style={{ color: theme.textMuted }}>Paiements réussis</div>
                        <div className="text-lg font-semibold">{data ? data.totalSuccess.toLocaleString("fr-FR") : "—"}</div>
                        <div className="mt-2" style={{ width: "100%", height: 48 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={series} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                                    <Bar dataKey="success" fill={INDIGO} radius={[2, 2, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Répartitions ── */}
            <div className="grid grid-cols-1 md:grid-cols-2" style={{ borderTop: `1px solid ${theme.divider}` }}>
                <div className="p-5" style={{ borderRight: `1px solid ${theme.divider}` }}>
                    <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-sm font-medium">Par passerelle</h3>
                        <span className="text-xs" style={{ color: theme.textMuted }}>Volume encaissé</span>
                    </div>
                    <BarList rows={(data?.byProvider ?? []).map((p) => ({ name: p.name, value: p.volume }))} max={providerMax} />
                </div>
                <div className="p-5">
                    <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-sm font-medium">Par pays</h3>
                        <span className="text-xs" style={{ color: theme.textMuted }}>Volume encaissé</span>
                    </div>
                    <BarList rows={(data?.byCountry ?? []).map((p) => ({ name: p.name, value: p.volume }))} max={countryMax} />
                </div>
            </div>
        </div>
    );
}
