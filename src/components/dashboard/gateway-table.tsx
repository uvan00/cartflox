"use client";

import { Globe, Smartphone, MoreVertical, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { getGateways } from "@/lib/actions/gateways";
import { useDashboardTheme } from "./theme-context";

export function GatewayTable() {
    const [gateways, setGateways] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const theme = useDashboardTheme();

    useEffect(() => {
        getGateways().then((data) => {
            setGateways(data);
            setIsLoading(false);
        });
    }, []);

    return (
        <div className="rounded-xl overflow-hidden" style={{ background: theme.cardBg, border: `1px solid ${theme.border}` }}>
            <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: `1px solid ${theme.divider}` }}>
                <div>
                    <p className="text-[14px] font-medium" style={{ color: theme.textPrimary }}>Passerelles</p>
                    <p className="text-[12px] mt-0.5" style={{ color: theme.textMuted }}>Statut en temps réel</p>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="flex items-center gap-1 text-[10px] rounded-md px-2 py-1" style={{ color: theme.textMuted, background: theme.itemHoverBg }}>
                        <Globe size={10} /> 12 Pays
                    </span>
                    <span className="flex items-center gap-1 text-[10px] rounded-md px-2 py-1" style={{ color: theme.textMuted, background: theme.itemHoverBg }}>
                        <Smartphone size={10} /> Mobile Money
                    </span>
                </div>
            </div>

            {isLoading ? (
                <div className="p-8 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin" style={{ color: theme.textDisabled }} />
                </div>
            ) : gateways.length === 0 ? (
                <div className="p-8 text-center text-sm" style={{ color: theme.textMuted }}>
                    Aucune passerelle configurée
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr style={{ borderBottom: `1px solid ${theme.divider}` }}>
                                {["Passerelle", "Régions", "Statut", "Uptime", "Succès", ""].map(h => (
                                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-medium" style={{ color: theme.textDisabled }}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {gateways.map((gw) => {
                                const rate = parseFloat(gw.successRate);
                                const isActive = gw.status === "active";
                                const isMaint = gw.status === "maintenance";
                                return (
                                    <tr
                                        key={gw.id}
                                        className="transition-colors"
                                        style={{ borderBottom: `1px solid ${theme.divider}` }}
                                        onMouseEnter={e => { e.currentTarget.style.background = theme.itemHoverBg; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                                    >
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center gap-2.5">
                                                <div className="h-7 w-7 rounded-lg flex items-center justify-center overflow-hidden p-1 shrink-0" style={{ background: theme.itemHoverBg }}>
                                                    {gw.logo
                                                        ? <img src={gw.logo} alt={gw.name} className="w-full h-full object-contain" />
                                                        : <span className="text-[9px] font-semibold" style={{ color: theme.textMuted }}>{gw.name.substring(0, 2).toUpperCase()}</span>
                                                    }
                                                </div>
                                                <span className="text-[13px] font-medium" style={{ color: theme.textPrimary }}>{gw.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <div className="flex flex-wrap gap-1">
                                                {gw.countries?.slice(0, 4).map((c: string) => (
                                                    <span key={c} className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ background: theme.itemHoverBg, color: theme.textMuted }}>{c}</span>
                                                ))}
                                                {gw.countries?.length > 4 && (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(91,141,239,0.08)", color: "rgba(91,141,239,0.7)" }}>+{gw.countries.length - 4}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center gap-1.5">
                                                <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-teal-400" : isMaint ? "bg-amber-400" : "bg-red-400"}`} />
                                                <span className="text-[11px]" style={{ color: isActive ? "#0bd8b6" : isMaint ? "#FAAD14" : "#f87171" }}>
                                                    {isActive ? "Actif" : isMaint ? "Maintenance" : "Inactif"}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2.5 font-mono text-[11px]" style={{ color: theme.textMuted }}>{gw.uptime}</td>
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center gap-2">
                                                <div className="w-14 h-1 rounded-full overflow-hidden" style={{ background: theme.divider }}>
                                                    <div
                                                        className="h-full rounded-full"
                                                        style={{
                                                            width: gw.successRate,
                                                            background: rate > 95 ? "#0bd8b6" : rate > 85 ? "#FAAD14" : "#f87171",
                                                            opacity: 0.7,
                                                        }}
                                                    />
                                                </div>
                                                <span className="text-[11px] font-mono" style={{ color: theme.textMuted }}>{gw.successRate}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <button
                                                className="transition-colors"
                                                style={{ color: theme.textDisabled }}
                                                onMouseEnter={e => { e.currentTarget.style.color = theme.textSecondary; }}
                                                onMouseLeave={e => { e.currentTarget.style.color = theme.textDisabled; }}
                                            >
                                                <MoreVertical className="h-3.5 w-3.5" />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
