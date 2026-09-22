"use client";

import { DonutChart } from "@lobehub/charts";
import { Loader2, PieChart } from "lucide-react";
import { useEffect, useState } from "react";
import { getAnalyticsData } from "@/lib/actions/analytics";
import { useDashboardTheme } from "./theme-context";

export function GatewayDonutCard() {
    const [donutData, setDonutData] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const theme = useDashboardTheme();

    useEffect(() => {
        getAnalyticsData(30).then((data) => {
            const ignored = new Set(["cartflox", "afriflow", "", "pending"]);
            const filtered = (data.gatewayMixData || []).filter(
                (d: any) => !ignored.has((d.name || "").toLowerCase().trim())
            );
            setDonutData(filtered);
            setIsLoading(false);
        });
    }, []);

    return (
        <div className="rounded-xl h-full" style={{ background: theme.cardBg, border: `1px solid ${theme.border}` }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${theme.divider}` }}>
                <div>
                    <h3 className="text-[14px] font-medium" style={{ color: theme.textPrimary }}>Passerelles</h3>
                    <p className="text-[12px] mt-0.5" style={{ color: theme.textMuted }}>Répartition (30 jours)</p>
                </div>
                <PieChart className="h-4 w-4" style={{ color: theme.textMuted }} />
            </div>
            <div className="px-5 py-4">
                {isLoading ? (
                    <div className="h-[320px] flex items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin" style={{ color: theme.textDisabled }} />
                    </div>
                ) : donutData.length === 0 ? (
                    <div className="h-[320px] flex flex-col items-center justify-center gap-2">
                        <PieChart className="h-8 w-8 opacity-20" style={{ color: theme.textMuted }} />
                        <p className="text-xs text-center" style={{ color: theme.textMuted }}>
                            Aucune transaction<br />enregistrée
                        </p>
                    </div>
                ) : (
                    <DonutChart
                        data={donutData}
                        index="name"
                        category="value"
                        colors={["emerald", "blue", "orange", "yellow", "violet", "cyan"]}
                        className="h-[320px]"
                        showLabel
                        showTooltip
                    />
                )}
            </div>
        </div>
    );
}
