"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plug, ArrowRight, Plus } from "lucide-react";
import { getGateways } from "@/lib/actions/gateways";
import { Bouton, Pastille, Vide, Squelette } from "./kit";

/**
 * Les comptes agregateurs du marchand, tels quels : nom, pays, etat et taux
 * de reussite observe sur ses propres paiements. Pas d'uptime invente.
 */
const ETAT: Record<string, { label: string; couleur: string }> = {
    active: { label: "En service", couleur: "#12a594" },
    maintenance: { label: "Maintenance", couleur: "#f59e0b" },
    inactive: { label: "En pause", couleur: "#94a3b8" },
};

export function GatewayList() {
    const [gws, setGws] = useState<any[] | null>(null);
    useEffect(() => { getGateways().then((d) => setGws(d || [])).catch(() => setGws([])); }, []);

    return (
        <section className="rounded-xl p-5" style={{ background: "var(--dt-card-bg)", border: "1px solid var(--dt-border)" }}>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-[15px] font-semibold" style={{ color: "var(--dt-text-primary)" }}>Passerelles</h2>
                    <p className="mt-0.5 text-xs" style={{ color: "var(--dt-text-muted)" }}>Vos comptes chez les agrégateurs. L&apos;argent y arrive directement.</p>
                </div>
                <Link href="/gateways" className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: "var(--dt-text-secondary)" }}>Gérer <ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
            {gws === null ? <Squelette lignes={3} /> : gws.length === 0 ? (
                <Vide icone={Plug} titre="Aucune passerelle connectée" texte="Branchez votre compte PayDunya, CinetPay, PawaPay, Stripe... en collant ses clés API. Sans lui, vos clients ne peuvent pas payer."
                    action={<Link href="/gateways"><Bouton icone={Plus}>Connecter une passerelle</Bouton></Link>} />
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm" style={{ minWidth: 560 }}>
                        <thead><tr style={{ borderBottom: "1px solid var(--dt-border)" }}>{["Passerelle", "Pays", "État", "Taux de réussite"].map((h) => <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--dt-text-muted)" }}>{h}</th>)}</tr></thead>
                        <tbody>
                            {gws.map((gw) => {
                                const taux = parseFloat(gw.successRate) || 0;
                                const e = ETAT[gw.status] || ETAT.inactive;
                                return (
                                    <tr key={gw.id} style={{ borderBottom: "1px solid var(--dt-divider)" }}>
                                        <td className="px-3 py-2.5">
                                            <div className="flex items-center gap-2.5">
                                                <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1">{gw.logo ? <img src={gw.logo} alt="" className="h-full w-full object-contain" /> : <span className="text-[10px] font-bold text-black">{String(gw.name || "?").slice(0, 2).toUpperCase()}</span>}</span>
                                                <span className="font-medium" style={{ color: "var(--dt-text-primary)" }}>{gw.name}</span>
                                                {gw.mode === "test" && <Pastille label="Test" couleur="#f59e0b" />}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2.5"><div className="flex flex-wrap gap-1">{(gw.countries || []).slice(0, 4).map((c: string) => <span key={c} className="rounded px-1.5 py-0.5 font-mono text-[10px]" style={{ background: "var(--dt-item-hover)", color: "var(--dt-text-muted)" }}>{c}</span>)}{(gw.countries?.length || 0) > 4 && <span className="text-[10px]" style={{ color: "var(--dt-text-muted)" }}>+{gw.countries.length - 4}</span>}</div></td>
                                        <td className="px-3 py-2.5"><Pastille label={e.label} couleur={e.couleur} /></td>
                                        <td className="px-3 py-2.5">
                                            <div className="flex items-center gap-2">
                                                <div className="h-1.5 w-16 overflow-hidden rounded-full" style={{ background: "var(--dt-item-hover)" }}><div className="h-full rounded-full" style={{ width: `${taux}%`, background: taux >= 90 ? "#12a594" : taux >= 70 ? "#f59e0b" : "#f87171" }} /></div>
                                                <span className="text-xs tabular-nums" style={{ color: "var(--dt-text-muted)" }}>{gw.successRate}</span>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
