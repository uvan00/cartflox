"use client";

import { H1, H2, H3, P, SectionBadge, NavButtons } from "./shared";
import type { SectionId } from "@/app/docs/page";

const RELEASES = [
    {
        version: "v2.1.0",
        date: "Mars 2026",
        type: "minor",
        changes: [
            { type: "new",  text: "Ajout du support Flutter SDK pour iOS & Android" },
            { type: "new",  text: "Nouvelle méthode de paiement : Free Money (Sénégal)" },
            { type: "new",  text: "Endpoint GET /v2/transfers pour lister les transferts" },
            { type: "imp",  text: "Performance améliorée du checkout mobile (-40% temps de chargement)" },
            { type: "fix",  text: "Correction d'un bug de signature webhook avec des payloads > 1MB" },
        ],
    },
    {
        version: "v2.0.0",
        date: "Janvier 2026",
        type: "major",
        changes: [
            { type: "break", text: "Nouvelle version majeure de l'API : migration requise depuis v1" },
            { type: "new",   text: "Support du transfert d'argent inter-pays (15+ pays)" },
            { type: "new",   text: "SDK officiel Python avec support Django & FastAPI" },
            { type: "new",   text: "Système d'idempotence sur toutes les requêtes POST" },
            { type: "new",   text: "Pagination par curseur sur toutes les routes de liste" },
            { type: "new",   text: "Nouveau dashboard avec analytics avancés" },
            { type: "imp",   text: "Réponse API unifiée avec champ success/data/error" },
            { type: "imp",   text: "Retry automatique avec backoff dans les SDKs" },
            { type: "dep",   text: "Dépréciation de l'API v1 (support jusqu'au 1er juillet 2026)" },
        ],
    },
    {
        version: "v1.8.2",
        date: "Novembre 2025",
        type: "patch",
        changes: [
            { type: "fix", text: "Correction du header de signature webhook pour les requêtes Express" },
            { type: "fix", text: "Correction du timeout sur les paiements MTN MoMo en Côte d'Ivoire" },
            { type: "imp", text: "Amélioration des messages d'erreur INSUFFICIENT_FUNDS" },
        ],
    },
    {
        version: "v1.8.0",
        date: "Octobre 2025",
        type: "minor",
        changes: [
            { type: "new", text: "Support Moov Money Bénin & Togo" },
            { type: "new", text: "Plugin WooCommerce v2 avec support HPOS" },
            { type: "new", text: "Nouveau webhook : payment.expired" },
            { type: "imp", text: "Réduction du délai de confirmation Wave de 5s à 2s" },
        ],
    },
    {
        version: "v1.7.0",
        date: "Août 2025",
        type: "minor",
        changes: [
            { type: "new", text: "Remboursements partiels disponibles sur tous les plans" },
            { type: "new", text: "Support Airtel Money (Kenya, Nigeria, Ghana)" },
            { type: "imp", text: "IP Allowlist disponible sur les plans Business et Enterprise" },
        ],
    },
];

const TYPE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
    new:   { label: "Nouveau",   color: "rgba(52,211,153,1)",   bg: "rgba(52,211,153,0.1)"  },
    imp:   { label: "Amélio.",   color: "rgba(96,165,250,1)",   bg: "rgba(96,165,250,0.1)"  },
    fix:   { label: "Correction",color: "rgba(251,146,60,1)",   bg: "rgba(251,146,60,0.1)"  },
    break: { label: "Breaking",  color: "rgba(248,113,113,1)",  bg: "rgba(239,68,68,0.1)"   },
    dep:   { label: "Déprécié",  color: "rgba(161,161,170,1)",  bg: "rgba(255,255,255,0.05)" },
};

const VERSION_COLORS: Record<string, { color: string; bg: string; border: string }> = {
    major: { color: "rgba(248,113,113,1)",  bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.2)"   },
    minor: { color: "rgba(52,211,153,1)",   bg: "rgba(52,211,153,0.08)",  border: "rgba(52,211,153,0.2)"  },
    patch: { color: "rgba(161,161,170,1)",  bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.1)" },
};

export function SectionChangelog({ setSection }: { setSection: (s: SectionId) => void }) {
    return (
        <>
            <SectionBadge color="green">Référence</SectionBadge>
            <H1>Changelog</H1>
            <P>Historique des mises à jour de l'API Cartflox et des SDKs officiels.</P>

            <div className="flex gap-3 flex-wrap my-4 mb-8">
                {Object.entries(TYPE_LABELS).map(([key, val]) => (
                    <div key={key} className="flex items-center gap-1.5">
                        <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: val.bg, color: val.color }}>{val.label}</span>
                    </div>
                ))}
            </div>

            <div className="flex flex-col gap-6">
                {RELEASES.map((release) => {
                    const vc = VERSION_COLORS[release.type];
                    return (
                        <div key={release.version} className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
                            <div className="flex items-center justify-between px-5 py-4" style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                                <div className="flex items-center gap-3">
                                    <span className="text-[15px] font-bold text-white font-mono">{release.version}</span>
                                    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase" style={{ background: vc.bg, color: vc.color, border: `1px solid ${vc.border}` }}>
                                        {release.type}
                                    </span>
                                </div>
                                <span className="text-[12px]" style={{ color: "rgba(113,113,122,1)" }}>{release.date}</span>
                            </div>
                            <div className="p-4 flex flex-col gap-2">
                                {release.changes.map((change, i) => {
                                    const t = TYPE_LABELS[change.type];
                                    return (
                                        <div key={i} className="flex items-start gap-3 text-[13px]">
                                            <span className="inline-flex shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold mt-0.5" style={{ background: t.bg, color: t.color }}>
                                                {t.label}
                                            </span>
                                            <span style={{ color: "rgba(161,161,170,1)" }}>{change.text}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="mt-10 p-5 rounded-2xl text-center" style={{ background: "rgba(52,211,153,0.04)", border: "1px solid rgba(52,211,153,0.12)" }}>
                <p className="text-[13px] font-semibold text-white mb-1">Restez informé des mises à jour</p>
                <p className="text-[12px]" style={{ color: "rgba(113,113,122,1)" }}>
                    Abonnez-vous à notre newsletter technique ou suivez notre{" "}
                    <a href="https://github.com/cartflox" target="_blank" className="text-emerald-400 hover:underline">GitHub</a>
                    {" "}pour être notifié des nouvelles versions.
                </p>
            </div>

            <NavButtons
                prev={{ id: "rate-limits", label: "Limites de taux" }}
                setSection={setSection}
            />
        </>
    );
}
