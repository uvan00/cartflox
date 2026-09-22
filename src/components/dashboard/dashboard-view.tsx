"use client";

import { useEffect } from "react";

import { StatsCards } from "@/components/dashboard/stats-cards";
import { conversionGoogle } from "@/components/suivi-google";
import { OverviewChart } from "@/components/dashboard/overview-chart";
import { TransactionList } from "@/components/dashboard/transaction-list";
import { GatewayList } from "@/components/dashboard/gateway-list";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { Demarrage } from "@/components/dashboard/demarrage";

export function DashboardView() {
    // Inscription terminee : on le dit UNE fois a Google Ads, puis on retire la
    // marque de l'adresse pour qu'un rechargement ne la compte pas deux fois.
    useEffect(() => {
        if (typeof window === "undefined") return;
        const p = new URLSearchParams(window.location.search);
        if (p.get("bienvenue") !== "1") return;
        conversionGoogle("inscription");
        p.delete("bienvenue");
        const reste = p.toString();
        window.history.replaceState({}, "", window.location.pathname + (reste ? `?${reste}` : ""));
    }, []);

    return (
        <div className="flex flex-col gap-6 pb-8">
            <DashboardHeader />

            <Demarrage />

            <StatsCards />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-7">
                <div className="lg:col-span-4 h-full">
                    <OverviewChart />
                </div>
                <div className="lg:col-span-3 h-full">
                    <TransactionList />
                </div>
            </div>

            <GatewayList />
        </div>
    );
}
