"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Smartphone, Route, ListChecks, ArrowUp, ArrowDown, Play, RotateCcw, Plug, Plus, Trash2 } from "lucide-react";
import { goeyToast } from "goey-toast";
import { getPaymentMethods, togglePaymentMethod } from "@/lib/actions/methods";
import { getGateways } from "@/lib/actions/gateways";
import {
    getRoutingConfig, saveRoutingConfig, assignMethodProvider, simulateRouting, listRoutingDecisions, resetSuccessScores,
    type RoutingConfigData, type RoutingAlgorithmKind, type RoutingRule, type SimulationResult, type DecisionListItem,
} from "@/lib/actions/routing";
import { Page, Bloc, Onglets, Interrupteur, Pastille, Aide, Vide, Squelette, Bouton, Choix, Entree, Champ, fmtDate, fmtMontant, carte } from "@/components/dashboard/kit";
import { Drapeau } from "@/components/ui/drapeau";

/**
 * Moyens de paiement : ce que vos clients voient, qui les sert, et comment
 * Cartflox choisit la passerelle. Trois onglets, du plus simple au plus fin.
 */

type Onglet = "moyens" | "routage" | "decisions";

const STRATEGIES: { cle: RoutingAlgorithmKind; titre: string; texte: string; conseil?: string }[] = [
    { cle: "PRIORITY", titre: "Priorité avec secours", texte: "Vous classez vos passerelles. Si la première échoue, Cartflox essaie la suivante, sans que le client s'en aperçoive.", conseil: "Recommandé" },
    { cle: "SINGLE", titre: "Une seule passerelle", texte: "Tout passe par la passerelle choisie. Simple, mais aucun secours si elle tombe." },
    { cle: "DYNAMIC", titre: "Automatique", texte: "Cartflox envoie chaque paiement à la passerelle qui réussit le mieux ces derniers jours, et s'adapte en continu." },
    { cle: "VOLUME_SPLIT", titre: "Répartition", texte: "Vous répartissez le volume en pourcentages, par exemple 70 % sur l'une et 30 % sur l'autre, pour comparer ou négocier." },
    { cle: "ADVANCED", titre: "Règles personnalisées", texte: "Vos propres règles : selon le montant, le pays, la devise ou l'opérateur, vous décidez qui encaisse." },
];

const RESULTAT: Record<string, { label: string; couleur: string }> = {
    SUCCESS: { label: "Réussi", couleur: "#12a594" }, FAILED: { label: "Échoué", couleur: "#f87171" }, PENDING: { label: "En attente", couleur: "#f59e0b" },
};

export default function MethodesPage() {
    const [onglet, setOnglet] = useState<Onglet>(() => {
        if (typeof window !== "undefined") {
            const t = new URLSearchParams(window.location.search).get("tab");
            if (t === "routage" || t === "decisions") return t;
        }
        return "moyens";
    });
    const [methodes, setMethodes] = useState<any[] | null>(null);
    const [passerelles, setPasserelles] = useState<any[]>([]);
    const [config, setConfig] = useState<RoutingConfigData | null>(null);
    const [decisions, setDecisions] = useState<DecisionListItem[] | null>(null);
    const [occupe, setOccupe] = useState("");

    const charger = useCallback(async () => {
        const [m, g, c] = await Promise.all([getPaymentMethods(), getGateways(), getRoutingConfig()]);
        setMethodes(m || []); setPasserelles((g || []).filter((x: any) => x.status === "active")); setConfig(c);
    }, []);
    useEffect(() => { charger(); }, [charger]);
    useEffect(() => { if (onglet === "decisions" && decisions === null) listRoutingDecisions(50).then(setDecisions).catch(() => setDecisions([])); }, [onglet, decisions]);

    const nomPasserelle = (id: string) => passerelles.find((g) => g.id === id)?.name || id;

    /* ------------------------------------------------------------ moyens */
    const parPays = useMemo(() => {
        const g = new Map<string, any[]>();
        for (const m of methodes || []) { const k = m.country || "Autres"; if (!g.has(k)) g.set(k, []); g.get(k)!.push(m); }
        return Array.from(g.entries()).sort((a, b) => a[0].localeCompare(b[0], "fr"));
    }, [methodes]);

    async function basculer(m: any) {
        setOccupe(m.id);
        const r = await togglePaymentMethod(m.id, !m.isActive, { name: m.name, country: m.country, provider: m.gateway, flag: m.flag, type: m.type === "Card" ? "CARD" : "MOBILE_MONEY", logo: m.logo, code: m.code });
        setOccupe("");
        if (r?.success === false) { goeyToast.error(r.error || "Échec"); return; }
        goeyToast.success(!m.isActive ? `${m.name} proposé à vos clients` : `${m.name} masqué`);
        charger();
    }
    async function attribuer(m: any, gatewayId: string) {
        setOccupe(m.id + ":g");
        const r = await assignMethodProvider(m.code, m.country, gatewayId);
        setOccupe("");
        if (!r.success) { goeyToast.error(r.error || "Échec"); return; }
        goeyToast.success(gatewayId ? `${m.name} : servi par ${nomPasserelle(gatewayId)}` : `${m.name} : choix automatique`);
        charger();
    }

    /* ------------------------------------------------------------ routage */
    const maj = (patch: Partial<RoutingConfigData>) => setConfig((c) => c ? { ...c, ...patch } : c);
    async function sauver() {
        if (!config) return;
        if (config.algorithmKind === "VOLUME_SPLIT") {
            const total = config.volumeSplits.reduce((a, s) => a + (Number(s.split) || 0), 0);
            if (total !== 100) { goeyToast.error(`La répartition doit faire 100 % (actuellement ${total} %).`); return; }
        }
        if (config.algorithmKind === "SINGLE" && config.fallbackOrder.length === 0) { goeyToast.error("Choisissez la passerelle."); return; }
        setOccupe("save");
        const r = await saveRoutingConfig(config);
        setOccupe("");
        r.success ? goeyToast.success("Routage enregistré") : goeyToast.error(r.error || "Échec");
    }
    const deplacer = (i: number, sens: -1 | 1) => {
        if (!config) return;
        const l = [...config.fallbackOrder]; const j = i + sens;
        if (j < 0 || j >= l.length) return;
        [l[i], l[j]] = [l[j], l[i]]; maj({ fallbackOrder: l });
    };
    const ordreComplet = useMemo(() => {
        if (!config) return [];
        const ids = passerelles.map((g) => g.id);
        return [...config.fallbackOrder.filter((id) => ids.includes(id)), ...ids.filter((id) => !config.fallbackOrder.includes(id))];
    }, [config, passerelles]);

    /* ------------------------------------------------------------ simulateur */
    const [sim, setSim] = useState({ amount: 5000, currency: "XOF", country: "CI", methodCode: "" });
    const [simRes, setSimRes] = useState<SimulationResult | null>(null);
    async function simuler() {
        const code = sim.methodCode || methodes?.[0]?.code || "";
        setOccupe("sim");
        const r = await simulateRouting({ ...sim, methodCode: code, methodType: (methodes || []).find((m) => m.code === code)?.type === "Card" ? "CARD" : "MOBILE_MONEY" }).catch((e) => ({ success: false, error: e?.message, orderedGateways: [], chosen: null, algorithmKind: "PRIORITY" as RoutingAlgorithmKind, maxAttempts: 0, steps: [] }));
        setOccupe(""); setSimRes(r);
        if (!r.success && r.error) goeyToast.error(r.error);
    }

    const ONGLETS = [
        { cle: "moyens" as Onglet, label: "Moyens de paiement", icone: Smartphone },
        { cle: "routage" as Onglet, label: "Routage", icone: Route },
        { cle: "decisions" as Onglet, label: "Décisions", icone: ListChecks },
    ];

    return (
        <Page titre="Moyens de paiement" sousTitre="Ce que vos clients voient au moment de payer, la passerelle qui sert chaque moyen, et la façon dont Cartflox choisit en cas de doute." large>
            <Onglets items={ONGLETS} actif={onglet} onChange={setOnglet} />

            {methodes === null ? <Squelette /> : passerelles.length === 0 ? (
                <Vide icone={Plug} titre="Aucune passerelle branchée" texte="Les moyens de paiement viennent de vos passerelles : branchez PayDunya, CinetPay, PawaPay, Stripe... et ils apparaîtront ici."
                    action={<Link href="/gateways"><Bouton icone={Plug}>Brancher une passerelle</Bouton></Link>} />
            ) : onglet === "moyens" ? (
                <div className="space-y-4">
                    <Aide>Un moyen désactivé n&apos;est plus proposé à vos clients. Quand plusieurs passerelles savent servir le même opérateur, choisissez laquelle encaisse, ou laissez Cartflox décider selon le routage.</Aide>
                    {parPays.map(([pays, liste]) => (
                        <Bloc key={pays} titre={<span className="flex items-center gap-2"><Drapeau code={liste[0]?.flag || ""} taille={14} />{pays}</span>} sousTitre={`${liste.filter((m) => m.isActive).length} sur ${liste.length} proposé${liste.length > 1 ? "s" : ""}`}>
                            <div className="divide-y" style={{ borderColor: "var(--dt-divider)" }}>
                                {liste.map((m) => {
                                    const cle = `${m.code}||${m.country}`;
                                    const attribue = config?.methodAssignments?.[cle] || "";
                                    const plusieurs = (m.providers || []).length > 1;
                                    return (
                                        <div key={m.id} className="flex flex-wrap items-center gap-3 py-3">
                                            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white">{m.logo ? <img src={m.logo} alt="" className="h-6 w-6 object-contain" /> : <span className="text-xs font-bold text-black">{(m.name || "?").charAt(0)}</span>}</span>
                                            <div className="min-w-[160px] flex-1">
                                                <p className="text-sm font-medium" style={{ color: m.isActive ? "var(--dt-text-primary)" : "var(--dt-text-muted)" }}>{m.name}</p>
                                                <p className="text-[11px]" style={{ color: "var(--dt-text-muted)" }}>{m.type === "Card" ? "Carte bancaire" : "Mobile Money"}{plusieurs ? ` · ${m.providers.length} passerelles disponibles` : ` · via ${m.gateway}`}</p>
                                            </div>
                                            {plusieurs ? (
                                                <Choix value={attribue} onChange={(v) => attribuer(m, v)} disabled={occupe === m.id + ":g"} options={[{ value: "", label: "Automatique (routage)" }, ...m.providers.map((p: any) => ({ value: p.gatewayId, label: `Servi par ${p.provider}` }))]} />
                                            ) : (
                                                <span className="text-xs" style={{ color: "var(--dt-text-muted)" }}>Servi par {m.gateway}</span>
                                            )}
                                            <Interrupteur actif={!!m.isActive} onChange={() => basculer(m)} disabled={occupe === m.id} />
                                        </div>
                                    );
                                })}
                            </div>
                        </Bloc>
                    ))}
                </div>
            ) : onglet === "routage" ? (
                !config ? <Squelette /> : (
                    <div className="space-y-4">
                        <Bloc titre="Comment Cartflox choisit la passerelle" sousTitre="S'applique quand un moyen de paiement peut être servi par plusieurs passerelles, et pour le secours en cas d'échec.">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                                {STRATEGIES.map((s) => {
                                    const actif = config.algorithmKind === s.cle;
                                    return (
                                        <button key={s.cle} type="button" onClick={() => maj({ algorithmKind: s.cle })} className="rounded-xl p-4 text-left transition-colors"
                                            style={{ background: actif ? "rgba(18,165,148,0.08)" : "var(--dt-item-hover)", border: `1px solid ${actif ? "rgba(18,165,148,0.5)" : "var(--dt-border)"}` }}>
                                            <div className="mb-1 flex items-center justify-between gap-2">
                                                <p className="text-sm font-semibold" style={{ color: "var(--dt-text-primary)" }}>{s.titre}</p>
                                                {s.conseil && <Pastille label={s.conseil} couleur="#12a594" />}
                                            </div>
                                            <p className="text-xs leading-relaxed" style={{ color: "var(--dt-text-muted)" }}>{s.texte}</p>
                                        </button>
                                    );
                                })}
                            </div>
                        </Bloc>

                        {(config.algorithmKind === "PRIORITY" || config.algorithmKind === "SINGLE") && (
                            <Bloc titre={config.algorithmKind === "SINGLE" ? "La passerelle qui encaisse" : "Ordre de priorité"} sousTitre={config.algorithmKind === "SINGLE" ? "Tout passe par elle." : "La première est essayée en premier. En cas d'échec, la suivante prend le relais."}>
                                {config.algorithmKind === "SINGLE" ? (
                                    <Choix value={config.fallbackOrder[0] || ""} onChange={(v) => maj({ fallbackOrder: v ? [v] : [] })} options={[{ value: "", label: "Choisir une passerelle" }, ...passerelles.map((g) => ({ value: g.id, label: g.name }))]} />
                                ) : (
                                    <div className="space-y-2">
                                        {ordreComplet.map((id, i) => (
                                            <div key={id} className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: "var(--dt-item-hover)" }}>
                                                <span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold" style={{ background: i === 0 ? "#12a594" : "var(--dt-card-bg)", color: i === 0 ? "#ffffff" : "var(--dt-text-muted)" }}>{i + 1}</span>
                                                <span className="flex-1 text-sm" style={{ color: "var(--dt-text-primary)" }}>{nomPasserelle(id)}{i === 0 && <span className="ml-2 text-[11px]" style={{ color: "#12a594" }}>principale</span>}</span>
                                                <button type="button" onClick={() => { maj({ fallbackOrder: ordreComplet }); setTimeout(() => deplacer(i, -1), 0); }} disabled={i === 0} className="rounded p-1 disabled:opacity-30" style={{ color: "var(--dt-text-muted)" }} aria-label="Monter"><ArrowUp className="h-4 w-4" /></button>
                                                <button type="button" onClick={() => { maj({ fallbackOrder: ordreComplet }); setTimeout(() => deplacer(i, 1), 0); }} disabled={i === ordreComplet.length - 1} className="rounded p-1 disabled:opacity-30" style={{ color: "var(--dt-text-muted)" }} aria-label="Descendre"><ArrowDown className="h-4 w-4" /></button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </Bloc>
                        )}

                        {config.algorithmKind === "VOLUME_SPLIT" && (
                            <Bloc titre="Répartition du volume" sousTitre="Le total doit faire 100 %.">
                                <div className="space-y-2">
                                    {passerelles.map((g) => {
                                        const v = config.volumeSplits.find((s) => s.gatewayId === g.id)?.split ?? 0;
                                        return (
                                            <div key={g.id} className="flex items-center gap-3">
                                                <span className="w-40 text-sm" style={{ color: "var(--dt-text-primary)" }}>{g.name}</span>
                                                <input type="range" min={0} max={100} value={v} onChange={(e) => { const n = Number(e.target.value); maj({ volumeSplits: [...config.volumeSplits.filter((s) => s.gatewayId !== g.id), { gatewayId: g.id, split: n }].filter((s) => s.split > 0) }); }} className="flex-1" />
                                                <span className="w-12 text-right text-sm tabular-nums" style={{ color: "var(--dt-text-secondary)" }}>{v} %</span>
                                            </div>
                                        );
                                    })}
                                    <p className="text-xs" style={{ color: config.volumeSplits.reduce((a, s) => a + s.split, 0) === 100 ? "#12a594" : "#f59e0b" }}>Total : {config.volumeSplits.reduce((a, s) => a + s.split, 0)} %</p>
                                </div>
                            </Bloc>
                        )}

                        {config.algorithmKind === "DYNAMIC" && (
                            <Bloc titre="Taux de réussite observés" sousTitre="Cartflox privilégie la passerelle au meilleur score. Les scores évoluent à chaque paiement."
                                action={<Bouton variante="secondaire" icone={RotateCcw} chargement={occupe === "reset"} onClick={async () => { setOccupe("reset"); const r = await resetSuccessScores(); setOccupe(""); r.success ? (goeyToast.success("Scores remis à zéro"), charger()) : goeyToast.error(r.error || "Échec"); }}>Remettre à zéro</Bouton>}>
                                <div className="space-y-2">
                                    {passerelles.map((g) => { const s = Math.round(config.successScores?.[g.id] ?? 50); return (
                                        <div key={g.id} className="flex items-center gap-3">
                                            <span className="w-40 text-sm" style={{ color: "var(--dt-text-primary)" }}>{g.name}</span>
                                            <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--dt-item-hover)" }}><div className="h-full rounded-full" style={{ width: `${s}%`, background: s >= 70 ? "#12a594" : s >= 40 ? "#f59e0b" : "#f87171" }} /></div>
                                            <span className="w-12 text-right text-sm tabular-nums" style={{ color: "var(--dt-text-secondary)" }}>{s}</span>
                                        </div>
                                    ); })}
                                </div>
                            </Bloc>
                        )}

                        {config.algorithmKind === "ADVANCED" && (
                            <Bloc titre="Vos règles" sousTitre="Évaluées dans l'ordre. La première règle qui correspond désigne la passerelle. Sans correspondance, l'ordre de priorité s'applique."
                                action={<Bouton variante="secondaire" icone={Plus} onClick={() => maj({ routingRules: [...config.routingRules, { name: `Règle ${config.routingRules.length + 1}`, conditions: [{ field: "amount", operator: "gt", value: 50000 }], gatewayIds: passerelles[0] ? [passerelles[0].id] : [] }] })}>Ajouter une règle</Bouton>}>
                                {config.routingRules.length === 0 ? <p className="text-sm" style={{ color: "var(--dt-text-muted)" }}>Aucune règle. Exemple : « si le montant dépasse 50 000, passer par Stripe ».</p> : (
                                    <div className="space-y-3">
                                        {config.routingRules.map((r, i) => (
                                            <RegleEditeur key={i} regle={r} passerelles={passerelles}
                                                onChange={(n) => maj({ routingRules: config.routingRules.map((x, j) => (j === i ? n : x)) })}
                                                onSupprimer={() => maj({ routingRules: config.routingRules.filter((_, j) => j !== i) })} />
                                        ))}
                                    </div>
                                )}
                            </Bloc>
                        )}

                        <Bloc titre="Secours et passerelles autorisées">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <Champ label="Nombre de tentatives de secours" aide="Combien de passerelles suivantes essayer si la première échoue. 0 = aucune.">
                                    <Choix value={String(config.maxRetries)} onChange={(v) => maj({ maxRetries: Number(v) })} options={[0, 1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))} />
                                </Champ>
                                <div>
                                    <span className="mb-1.5 block text-xs font-medium" style={{ color: "var(--dt-text-secondary)" }}>Passerelles autorisées</span>
                                    <div className="flex flex-wrap gap-2">
                                        {passerelles.map((g) => { const on = config.allowedProviders.length === 0 || config.allowedProviders.includes(g.id); return (
                                            <button key={g.id} type="button" onClick={() => { const tous = passerelles.map((x) => x.id); const cur = config.allowedProviders.length === 0 ? tous : config.allowedProviders; const nouv = on ? cur.filter((x) => x !== g.id) : [...cur, g.id]; maj({ allowedProviders: nouv.length === tous.length ? [] : nouv }); }}
                                                className="rounded-full px-3 py-1 text-xs font-medium" style={{ background: on ? "rgba(18,165,148,0.12)" : "var(--dt-item-hover)", color: on ? "#12a594" : "var(--dt-text-muted)", border: `1px solid ${on ? "rgba(18,165,148,0.4)" : "var(--dt-border)"}` }}>{g.name}</button>
                                        ); })}
                                    </div>
                                    <p className="mt-1 text-[11px]" style={{ color: "var(--dt-text-muted)" }}>Une passerelle exclue n&apos;est jamais utilisée, même en secours.</p>
                                </div>
                            </div>
                            <div className="mt-4 flex justify-end"><Bouton chargement={occupe === "save"} onClick={sauver}>Enregistrer le routage</Bouton></div>
                        </Bloc>

                        <Bloc titre="Tester une décision" sousTitre="Décrivez un paiement fictif : Cartflox vous dit quelle passerelle il choisirait, et pourquoi.">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                                <Champ label="Montant"><Entree type="number" value={sim.amount} onChange={(e) => setSim({ ...sim, amount: Number(e.target.value) })} /></Champ>
                                <Champ label="Devise"><Choix value={sim.currency} onChange={(v) => setSim({ ...sim, currency: v })} options={["XOF", "XAF", "GHS", "NGN", "USD", "EUR"].map((c) => ({ value: c, label: c }))} /></Champ>
                                <Champ label="Pays"><Choix value={sim.country} onChange={(v) => setSim({ ...sim, country: v })} options={["CI", "SN", "BJ", "TG", "ML", "BF", "CM", "GN", "GH", "NG"].map((c) => ({ value: c, label: c }))} /></Champ>
                                <Champ label="Moyen de paiement"><Choix value={sim.methodCode || methodes?.[0]?.code || ""} onChange={(v) => setSim({ ...sim, methodCode: v })} options={(methodes || []).map((m) => ({ value: m.code, label: m.name }))} /></Champ>
                            </div>
                            <div className="mt-3 flex items-center gap-3"><Bouton variante="secondaire" icone={Play} chargement={occupe === "sim"} onClick={simuler}>Simuler</Bouton></div>
                            {simRes && simRes.success && (
                                <div className="mt-4 rounded-lg p-4" style={{ background: "var(--dt-item-hover)" }}>
                                    <p className="text-sm" style={{ color: "var(--dt-text-primary)" }}>Passerelle choisie : <strong>{simRes.chosen?.name || "aucune"}</strong>{simRes.orderedGateways.length > 1 && <span style={{ color: "var(--dt-text-muted)" }}> puis, en secours : {simRes.orderedGateways.slice(1).map((g) => g.name).join(", ")}</span>}</p>
                                    <ol className="mt-2 space-y-1 text-xs" style={{ color: "var(--dt-text-muted)" }}>{simRes.steps.map((s, i) => <li key={i}>{i + 1}. {s.label}{s.detail ? ` : ${s.detail}` : ""}</li>)}</ol>
                                </div>
                            )}
                        </Bloc>
                    </div>
                )
            ) : (
                <Bloc titre="Décisions de routage" sousTitre="Pour chaque paiement, la passerelle retenue, les secours prévus et le résultat. Utile pour comprendre un échec.">
                    {decisions === null ? <Squelette /> : decisions.length === 0 ? <Vide icone={ListChecks} titre="Aucune décision enregistrée" texte="Elles apparaissent dès qu'un client lance un paiement." /> : (
                        <div className="min-w-0 overflow-x-auto">
                            <table className="w-full text-sm" style={{ minWidth: 720 }}>
                                <thead><tr style={{ borderBottom: "1px solid var(--dt-border)" }}>{["Quand", "Moyen", "Pays", "Montant", "Passerelle", "Secours", "Résultat"].map((h) => <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--dt-text-muted)" }}>{h}</th>)}</tr></thead>
                                <tbody>
                                    {decisions.map((d) => { const r = RESULTAT[d.outcome] || { label: d.outcome, couleur: "#94a3b8" }; return (
                                        <tr key={d.id} style={{ borderBottom: "1px solid var(--dt-divider)" }}>
                                            <td className="px-3 py-2.5" style={{ color: "var(--dt-text-muted)" }}>{fmtDate(d.createdAt)}</td>
                                            <td className="px-3 py-2.5" style={{ color: "var(--dt-text-primary)" }}>{d.methodCode}</td>
                                            <td className="px-3 py-2.5" style={{ color: "var(--dt-text-muted)" }}>{d.country}</td>
                                            <td className="px-3 py-2.5 tabular-nums" style={{ color: "var(--dt-text-primary)" }}>{fmtMontant(d.amount, d.currency)}</td>
                                            <td className="px-3 py-2.5" style={{ color: "var(--dt-text-primary)" }}>{d.chosen?.name || "?"}{d.assignedOverride && <span className="ml-1 text-[10px]" style={{ color: "var(--dt-text-muted)" }}>(attribué)</span>}</td>
                                            <td className="px-3 py-2.5 text-xs" style={{ color: "var(--dt-text-muted)" }}>{d.orderedGateways.slice(1).map((g) => g.name).join(", ") || "aucun"}</td>
                                            <td className="px-3 py-2.5"><Pastille label={r.label} couleur={r.couleur} />{d.reason && <span className="ml-2 text-[11px]" style={{ color: "var(--dt-text-muted)" }}>{d.reason}</span>}</td>
                                        </tr>
                                    ); })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Bloc>
            )}
        </Page>
    );
}

const CHAMPS = [{ v: "amount", l: "Montant" }, { v: "currency", l: "Devise" }, { v: "country", l: "Pays" }, { v: "methodCode", l: "Code du moyen" }, { v: "methodType", l: "Type (MOBILE_MONEY, CARD)" }];
const OPERATEURS = [{ v: "eq", l: "est égal à" }, { v: "neq", l: "est différent de" }, { v: "gt", l: "est supérieur à" }, { v: "gte", l: "est au moins" }, { v: "lt", l: "est inférieur à" }, { v: "lte", l: "est au plus" }, { v: "in", l: "fait partie de (séparés par des virgules)" }];

function RegleEditeur({ regle, passerelles, onChange, onSupprimer }: { regle: RoutingRule; passerelles: any[]; onChange: (r: RoutingRule) => void; onSupprimer: () => void }) {
    const majCond = (i: number, patch: any) => onChange({ ...regle, conditions: regle.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
    return (
        <div className="rounded-lg p-3" style={carte}>
            <div className="mb-2 flex items-center gap-2">
                <Entree value={regle.name} onChange={(e) => onChange({ ...regle, name: e.target.value })} className="max-w-xs" />
                <span className="text-xs" style={{ color: "var(--dt-text-muted)" }}>alors passer par</span>
                <Choix value={regle.gatewayIds[0] || ""} onChange={(v) => onChange({ ...regle, gatewayIds: v ? [v] : [] })} options={[{ value: "", label: "Choisir" }, ...passerelles.map((g) => ({ value: g.id, label: g.name }))]} />
                <button type="button" onClick={onSupprimer} className="ml-auto rounded p-1.5" style={{ color: "#f87171" }} aria-label="Supprimer la règle"><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="space-y-2">
                {regle.conditions.map((c, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
                        <span style={{ color: "var(--dt-text-muted)" }}>{i === 0 ? "Si" : "et"}</span>
                        <Choix value={c.field} onChange={(v) => majCond(i, { field: v })} options={CHAMPS.map((x) => ({ value: x.v, label: x.l }))} />
                        <Choix value={c.operator} onChange={(v) => majCond(i, { operator: v })} options={OPERATEURS.map((x) => ({ value: x.v, label: x.l }))} />
                        <Entree value={Array.isArray(c.value) ? c.value.join(",") : String(c.value)} onChange={(e) => majCond(i, { value: c.operator === "in" ? e.target.value.split(",").map((s) => s.trim()) : (c.field === "amount" ? Number(e.target.value) : e.target.value) })} className="max-w-[160px]" />
                        {regle.conditions.length > 1 && <button type="button" onClick={() => onChange({ ...regle, conditions: regle.conditions.filter((_, j) => j !== i) })} style={{ color: "var(--dt-text-muted)" }}>retirer</button>}
                    </div>
                ))}
                <button type="button" onClick={() => onChange({ ...regle, conditions: [...regle.conditions, { field: "country", operator: "eq", value: "CI" }] })} className="text-xs underline" style={{ color: "var(--dt-text-muted)" }}>Ajouter une condition</button>
            </div>
        </div>
    );
}
