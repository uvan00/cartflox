"use client";

import { useEffect, useState } from "react";
import { Wallet, CheckCircle2, Percent, Plug } from "lucide-react";
import { getDashboardStats } from "@/lib/actions/dashboard";
import { Montants } from "./kit";

/**
 * Quatre chiffres vrais, sans comparaison inventee : ce que le marchand a
 * encaisse (une ligne par devise, jamais additionnees), combien de paiements
 * ont abouti, a quel taux, avec quoi.
 */
export function StatsCards() {
    const [s, setS] = useState<any>(null);
    const [charge, setCharge] = useState(false);

    useEffect(() => { getDashboardStats().then((d) => { setS(d); setCharge(true); }).catch(() => setCharge(true)); }, []);

    const total = s?.totalTxCount || 0;
    const cartes = [
        { label: "Volume encaissé", valeur: <Montants valeurs={s?.volumes} />, sous: (s?.volumes?.length || 0) > 1 ? "paiements réussis, depuis le début, par devise" : "paiements réussis, depuis le début", Icone: Wallet, couleur: "#12a594" },
        { label: "Paiements réussis", valeur: s ? String(s.successfulTxCount || 0) : "0", sous: total > 0 ? `sur ${total} tentative${total > 1 ? "s" : ""}` : "aucune tentative encore", Icone: CheckCircle2, couleur: "#60a5fa" },
        { label: "Taux de réussite", valeur: s ? `${s.conversionRate || "0.0"} %` : "0 %", sous: total > 0 ? "réussis sur tentés" : "en attente de vos premiers paiements", Icone: Percent, couleur: "#a78bfa" },
        { label: "Passerelles actives", valeur: s ? `${s.activeGateways || 0} / ${s.totalGateways || 0}` : "0 / 0", sous: !s?.totalGateways ? "aucune connectée" : s.activeGateways < s.totalGateways ? `${s.totalGateways - s.activeGateways} en pause` : "toutes en service", Icone: Plug, couleur: "#f59e0b" },
    ];

    return (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            {cartes.map((c) => (
                <div key={c.label} className="rounded-xl p-4" style={{ background: "var(--dt-card-bg)", border: "1px solid var(--dt-border)" }}>
                    <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-medium" style={{ color: "var(--dt-text-muted)" }}>{c.label}</p>
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: `${c.couleur}1a`, color: c.couleur }}><c.Icone className="h-3.5 w-3.5" /></span>
                    </div>
                    {charge ? (
                        <>
                            <p className="text-xl font-semibold tabular-nums tracking-tight" style={{ color: "var(--dt-text-primary)" }}>{c.valeur}</p>
                            <p className="mt-1 text-[11px]" style={{ color: "var(--dt-text-muted)" }}>{c.sous}</p>
                        </>
                    ) : (
                        <div className="animate-pulse space-y-2"><div className="h-6 w-28 rounded" style={{ background: "var(--dt-item-hover)" }} /><div className="h-3 w-20 rounded" style={{ background: "var(--dt-item-hover)" }} /></div>
                    )}
                </div>
            ))}
        </div>
    );
}
