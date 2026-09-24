"use client";

import { Button, Tag, Dropdown, Input } from "@lobehub/ui";
import { formaterMontant } from "@/lib/devises";
import { Tooltip } from "antd";
import { BarreFiltres, bornes, DATES_TOUTES, type Dates } from "@/components/dashboard/barre-filtres";
import CustomerAvatar from "@/components/dashboard/customer-avatar";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    Calendar,
    ChevronRight,
    Download,
    Filter,
    Search,
    CheckCircle2,
    Clock,
    XCircle,
    CreditCard,
    Smartphone,
    RefreshCw,
    ChevronLeft,
    Copy,
    Eye,
    Ban,
    RotateCcw,
    Loader2,
    Bell,
    BellOff,
    Link2
} from "lucide-react";
import { useEffect, useState, useCallback, useRef } from "react";
import { getTransactions, getTransactionStats, syncAllPendingTransactions } from "@/lib/actions/transactions";
import { useDebounce } from "@/hooks/use-debounce";
import { goeyToast } from "goey-toast";
import { Drapeau } from "@/components/ui/drapeau";

// ── Style « Moneroo » : tag de statut coloré + double avatar passerelle/méthode ──
const STATUS_STYLE: Record<string, { label: string; color: string; bg: string; Icon: any; spin?: boolean }> = {
    initiated: { label: "Initié", color: "#6366f1", bg: "rgba(99,102,241,0.12)", Icon: Loader2, spin: true },
    pending: { label: "En attente", color: "#f59e0b", bg: "rgba(245,158,11,0.12)", Icon: Clock, spin: false },
    success: { label: "Succès", color: "#12a594", bg: "rgba(18,165,148,0.12)", Icon: CheckCircle2 },
    failed: { label: "Échec", color: "#ef4444", bg: "rgba(239,68,68,0.12)", Icon: XCircle },
    cancelled: { label: "Annulé", color: "#94a3b8", bg: "rgba(148,163,184,0.14)", Icon: Ban },
    refunded: { label: "Remboursé", color: "#3b82f6", bg: "rgba(59,130,246,0.12)", Icon: RotateCcw },
};

/** État affiché : distingue « Initié » (pas encore poussé) de « En attente ». */
function displayStatus(tx: any): string {
    if (tx.status === "pending") return tx.initiated ? "initiated" : "pending";
    return tx.status;
}

function StatusTag({ status }: { status: string }) {
    const s = STATUS_STYLE[status] || STATUS_STYLE.failed;
    const Icon = s.Icon;
    return (
        <span
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold whitespace-nowrap"
            style={{ background: s.bg, color: s.color, border: `1px solid ${s.color}33` }}
        >
            <Icon className={`h-3.5 w-3.5 ${s.spin ? "animate-spin" : ""}`} style={{ color: s.color }} />
            {s.label}
        </span>
    );
}

function methodIconSrc(operator?: string, paymentType?: string, methodLogo?: string): string | null {
    if (methodLogo) return methodLogo;
    const op = (operator || '').toLowerCase();
    const pt = (paymentType || '').toLowerCase();
    if (op === 'orange' || pt.includes('orange')) return '/icons/methods/orange_money.svg';
    if (op === 'wave' || pt.includes('wave')) return '/icons/methods/wave.svg';
    if (op === 'mtn' || pt.includes('mtn')) return '/icons/methods/momo.svg';
    if (op === 'moov' || pt.includes('moov')) return '/icons/methods/moov_money.svg';
    if (op === 'free' || pt.includes('free')) return '/icons/methods/freemoney_sn.svg';
    if (op === 'tmoney' || pt.includes('tmoney')) return '/icons/methods/togocel.svg';
    return null;
}

/** Deux pastilles rondes superposées : passerelle (badge) + méthode (avatar). */
function MethodAvatars({ tx }: { tx: any }) {
    const methodSrc = methodIconSrc(tx.operator, tx.paymentType, tx.methodLogo);
    const gatewaySrc = tx.gatewayDisplay?.logo;
    return (
        <div className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center">
            <span className="grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-white shadow-sm ring-1 ring-black/5">
                {methodSrc ? (
                    <img src={methodSrc} alt="" className="h-5 w-5 object-contain" />
                ) : tx.method === "Mobile Money" ? (
                    <Smartphone className="h-4 w-4 text-blue-500" />
                ) : (
                    <CreditCard className="h-4 w-4 text-purple-500" />
                )}
            </span>
            {gatewaySrc && (
                <span
                    className="absolute -left-1.5 -top-1 grid h-4 w-4 place-items-center overflow-hidden rounded-full bg-white"
                    style={{ boxShadow: '0 0 0 2px var(--dt-card-bg)' }}
                    title={tx.gatewayDisplay?.label || tx.gateway}
                >
                    <img src={gatewaySrc} alt="" className="h-full w-full object-contain" />
                </span>
            )}
        </div>
    );
}

// Sonnerie de notification (Web Audio, aucun fichier à héberger) : petit carillon
// à deux notes joué quand une nouvelle transaction en cours arrive.
let _audioCtx: AudioContext | null = null;
function playChime() {
    try {
        const AC = (window.AudioContext || (window as any).webkitAudioContext);
        if (!AC) return;
        _audioCtx = _audioCtx || new AC();
        const ctx = _audioCtx;
        if (ctx.state === "suspended") ctx.resume();
        const now = ctx.currentTime;
        ;[880, 1174.66].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.value = freq;
            const t = now + i * 0.14;
            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t);
            osc.stop(t + 0.5);
        });
    } catch {
        /* audio indisponible — on ignore */
    }
}


export default function TransactionsPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);
    const [isTableLoading, setIsTableLoading] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    /** Un total par devise : un chiffre unique melangeant francs et dollars n'a aucun sens. */
    type MontantDevise = { devise: string; montant: number };
    const [stats, setStats] = useState<{ successToday: MontantDevise[]; pending: MontantDevise[]; failed24h: MontantDevise[] }>({
        successToday: [],
        pending: [],
        failed24h: []
    });
    const [data, setData] = useState<any>({
        transactions: [],
        pagination: { total: 0, page: 1, pageSize: 10, totalPages: 0 }
    });
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [period, setPeriod] = useState<{ key: string; label: string; from?: string; to?: string }>({ key: "all", label: "Période" });
    const [datesFiltre, setDatesFiltre] = useState<Dates>(DATES_TOUTES);
    useEffect(() => { const q = new URLSearchParams(window.location.search).get("q"); if (q) setSearch(q); }, []);
    const [page, setPage] = useState(1);
    const debouncedSearch = useDebounce(search, 500);

    // Sonnerie « nouvelle transaction en cours » : on suit les IDs déjà vus pour
    // ne sonner que sur les nouvelles arrivées (pas au chargement initial).
    const [soundOn, setSoundOn] = useState(false);
    const seenIdsRef = useRef<Set<string>>(new Set());
    const soundReadyRef = useRef(false);

    useEffect(() => {
        try {
            if (localStorage.getItem("afriflow_tx_sound") === "1") setSoundOn(true);
        } catch {}
    }, []);

    const toggleSound = () => {
        setSoundOn((on) => {
            const next = !on;
            try { localStorage.setItem("afriflow_tx_sound", next ? "1" : "0"); } catch {}
            if (next) playChime(); // débloque l'audio (geste utilisateur) + confirme
            return next;
        });
    };

    // Détecte les nouvelles transactions EN COURS (Initié / En attente) sur la vue
    // par défaut et joue la sonnerie. Le 1er passage sert d'amorçage (aucun son).
    useEffect(() => {
        const list: any[] = data.transactions || [];
        const fresh = list.filter((t) => !seenIdsRef.current.has(t.id));
        list.forEach((t) => seenIdsRef.current.add(t.id));
        if (!soundReadyRef.current) {
            soundReadyRef.current = true;
            return;
        }
        if (!soundOn || page !== 1 || statusFilter !== "ALL") return;
        const incoming = fresh.filter((t) => t.status === "pending" || t.initiated);
        if (incoming.length > 0) {
            playChime();
            goeyToast.info(
                incoming.length > 1
                    ? `${incoming.length} nouvelles transactions en cours`
                    : "Nouvelle transaction en cours"
            );
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, soundOn, page, statusFilter]);

    const setPeriodPreset = (key: string) => {
        const now = new Date();
        const start = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.toISOString(); };
        const end = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x.toISOString(); };
        let from: string | undefined, to: string | undefined, label = "Période";
        switch (key) {
            case "today": from = start(now); to = end(now); label = "Aujourd'hui"; break;
            case "7d": { const d = new Date(now); d.setDate(d.getDate() - 6); from = start(d); to = end(now); label = "7 derniers jours"; break; }
            case "30d": { const d = new Date(now); d.setDate(d.getDate() - 29); from = start(d); to = end(now); label = "30 derniers jours"; break; }
            case "month": { const d = new Date(now.getFullYear(), now.getMonth(), 1); from = start(d); to = end(now); label = "Ce mois-ci"; break; }
            case "lastmonth": { const s = new Date(now.getFullYear(), now.getMonth() - 1, 1); const e = new Date(now.getFullYear(), now.getMonth(), 0); from = start(s); to = end(e); label = "Mois dernier"; break; }
            case "year": { const d = new Date(now.getFullYear(), 0, 1); from = start(d); to = end(now); label = "Cette année"; break; }
            default: from = undefined; to = undefined; label = "Période"; break;
        }
        setPeriod({ key, label, from, to });
    };

    const loadStats = useCallback(async () => {
        const s = await getTransactionStats();
        setStats(s);
    }, []);

    const loadTransactions = useCallback(async (isInitial = false) => {
        if (isInitial) setIsLoading(true);
        else setIsTableLoading(true);

        const res = await getTransactions({
            page,
            search: debouncedSearch,
            status: statusFilter === "ALL" ? undefined : statusFilter,
            from: period.from,
            to: period.to
        });

        setData(res);
        setIsLoading(false);
        setIsTableLoading(false);

    }, [page, debouncedSearch, statusFilter, period.from, period.to]);

    const handleGlobalSync = async () => {
        setIsSyncing(true);
        try {
            await syncAllPendingTransactions();
            await Promise.all([loadStats(), loadTransactions(false)]);
            goeyToast.success("Synchronisation effectuée");
        } catch (e) {
            goeyToast.error("Échec de la synchronisation");
        } finally {
            setIsSyncing(false);
        }
    };

    useEffect(() => {
        loadStats();

        // Auto-sync on page load
        const autoSync = async () => {
            const res = await syncAllPendingTransactions();
            if (res && res.count > 0) {
                await Promise.all([loadStats(), loadTransactions(false)]);
            }
        };
        autoSync();
    }, [loadStats]);

    useEffect(() => {
        loadTransactions(isLoading);
    }, [loadTransactions, page, debouncedSearch, statusFilter]);

    useEffect(() => {
        setPage(1); // Reset page on filter change
    }, [debouncedSearch, statusFilter, period.key]);

    // Auto-refresh: poll toutes les 7s pour refléter EN DIRECT les changements de
    // statut (Initié → En attente → Succès/Échec), sans rechargement. La signature
    // inclut id + statut + « initié » : le tableau se met à jour dès qu'un état bouge.
    useEffect(() => {
        const interval = setInterval(async () => {
            const res = await getTransactions({
                page,
                search: debouncedSearch,
                status: statusFilter === "ALL" ? undefined : statusFilter,
                from: period.from,
                to: period.to
            });
            setData((prev: any) => {
                const sig = (list: any[]) => list.map((t: any) => `${t.id}:${t.status}:${t.initiated ? 1 : 0}`).join(',');
                if (sig(prev.transactions) !== sig(res.transactions) || prev.pagination.total !== res.pagination.total) {
                    loadStats();
                    return res;
                }
                return prev;
            });
        }, 7000);
        return () => clearInterval(interval);
    }, [page, debouncedSearch, statusFilter, period.from, period.to, loadStats]);

    // Export de la page affichee (les filtres en cours s'appliquent).
    const exporterCsv = () => {
        const lignes: any[] = data.transactions || [];
        if (!lignes.length) { goeyToast.info("Rien à exporter sur cette page."); return; }
        const cellule = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const entetes = ["Référence", "Date", "Client", "E-mail", "Téléphone", "Pays", "Montant", "Statut", "Méthode", "Passerelle"];
        const corps = lignes.map((t) => [t.id, t.date, t.customer, t.email, t.phone, t.country?.name, t.amount, STATUS_STYLE[displayStatus(t)]?.label || t.status, t.paymentType || t.method, t.gatewayDisplay?.label || t.gateway]);
        const csv = [entetes, ...corps].map((l) => l.map(cellule).join(";")).join("\n");
        const url = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff) + csv], { type: "text/csv;charset=utf-8" }));
        const a = document.createElement("a"); a.href = url; a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
    };

    if (isLoading) {
        return (
            <div className="p-6 md:p-8 animate-pulse space-y-6">
                <div className="flex justify-between items-center">
                    <div className="h-8 w-48 rounded-lg" style={{ background: 'var(--dt-card-bg)' }} />
                    <div className="flex gap-2">
                        <div className="h-9 w-24 rounded-lg" style={{ background: 'var(--dt-card-bg)' }} />
                        <div className="h-9 w-24 rounded-lg" style={{ background: 'var(--dt-card-bg)' }} />
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                    <div className="h-20 rounded-xl" style={{ background: 'var(--dt-card-bg)' }} />
                    <div className="h-20 rounded-xl" style={{ background: 'var(--dt-card-bg)' }} />
                    <div className="h-20 rounded-xl" style={{ background: 'var(--dt-card-bg)' }} />
                </div>
                <div className="h-96 rounded-xl" style={{ background: 'var(--dt-card-bg)' }} />
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto flex flex-col gap-6">
            {/* Header Section */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--dt-text-primary)' }}>
                        Transactions
                    </h1>
                    <p className="text-sm" style={{ color: 'var(--dt-text-muted)' }}>
                        Tous les paiements reçus, en attente ou échoués, mis à jour en direct. Cliquez sur une ligne pour le détail.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button icon={<Download className="h-3.5 w-3.5" />} onClick={exporterCsv} style={{ borderRadius: 8, height: 36, fontSize: 13 }}>
                        Exporter la page (CSV)
                    </Button>
                </div>
            </div>

            {/* Stats Summary Area */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                    { label: "Réussies aujourd'hui", value: stats.successToday, icon: CheckCircle2, text: "text-teal-400" },
                    { label: "En attente", value: stats.pending, icon: Clock, text: "text-amber-400" },
                    { label: "Échecs (24h)", value: stats.failed24h, icon: XCircle, text: "text-red-400" },
                ].map((stat, i) => (
                    <div key={i} className="rounded-xl p-4 transition-colors" style={{ background: 'var(--dt-card-bg)', border: '1px solid var(--dt-border)' }}>
                        <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--dt-item-hover)' }}>
                                <stat.icon className={`h-4 w-4 ${stat.text}`} />
                            </div>
                            <div>
                                <p className="text-xs" style={{ color: 'var(--dt-text-muted)' }}>{stat.label}</p>
                                <p className="text-lg font-semibold" style={{ color: 'var(--dt-text-primary)' }}>
                                    {stat.value.length === 0 ? '0 XOF' : formaterMontant(stat.value[0].montant, stat.value[0].devise)}
                                </p>
                                {stat.value.slice(1).map((m) => (
                                    <p key={m.devise} className="text-xs" style={{ color: 'var(--dt-text-muted)' }}>
                                        {formaterMontant(m.montant, m.devise)}
                                    </p>
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Main Content Area */}
            <div className="rounded-xl overflow-hidden relative" style={{ background: 'var(--dt-card-bg)', border: '1px solid var(--dt-border)' }}>
                {isTableLoading && (
                    <div className="absolute inset-0 bg-background/30 z-20 flex items-center justify-center">
                        <RefreshCw className="h-5 w-5 animate-spin" style={{ color: 'var(--dt-text-muted)' }} />
                    </div>
                )}
                <div className="flex flex-row items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--dt-divider)' }}>
                    <div className="flex-1 min-w-0">
                        <BarreFiltres
                            statut={{ cle: "statut", valeur: statusFilter, onChange: setStatusFilter, options: [
                                { value: "ALL", label: "Toutes", count: data?.pagination?.total },
                                { value: "SUCCESS", label: "Réussies" }, { value: "PENDING", label: "En attente" }, { value: "FAILED", label: "Échouées" },
                                { value: "CANCELLED", label: "Annulées" }, { value: "REFUNDED", label: "Remboursées" },
                            ] }}
                            recherche={{ valeur: search, onChange: setSearch, placeholder: "Rechercher (référence, client, e-mail, téléphone, montant)..." }}
                            dates={{ valeur: datesFiltre, onChange: (d) => { setDatesFiltre(d); const b = bornes(d); setPeriod({ key: d.preset, label: "", from: b.from, to: b.to }); } }}
                            extra={<div className="flex items-center gap-2">
                        <Button
                            icon={soundOn ? <Bell className="h-3.5 w-3.5" style={{ color: "#6366f1" }} /> : <BellOff className="h-3.5 w-3.5" />}
                            onClick={toggleSound}
                            style={{ borderRadius: 8, height: 36, width: 36 }}
                            title={soundOn ? "Sonnerie activée : son à chaque nouvelle transaction en cours" : "Activer la sonnerie des nouvelles transactions"}
                        />
                        <Button
                            icon={<RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />}
                            onClick={handleGlobalSync}
                            disabled={isSyncing}
                            style={{ borderRadius: 8, height: 36, width: 36 }}
                            title="Synchroniser les statuts"
                        />
                            </div>}
                        />
                    </div>
                </div>
                {/* Telephone : une fiche par paiement. Un tableau a sept colonnes
                    devient illisible sous 768 px, et se faisait rogner. */}
                <div className="cf-transactions-mobile md:hidden">
                    {data.transactions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-3 px-4 py-14 text-center" style={{ color: 'var(--dt-text-muted)' }}>
                            <div className="h-12 w-12 rounded-full flex items-center justify-center" style={{ background: 'var(--dt-item-hover)' }}>
                                <Search className="h-5 w-5 opacity-50" />
                            </div>
                            <div className="space-y-0.5">
                                <p className="text-sm font-medium" style={{ color: 'var(--dt-text-secondary)' }}>Aucune transaction trouvée</p>
                                <p className="text-xs">Aucun paiement ne correspond à ces filtres.</p>
                            </div>
                        </div>
                    ) : data.transactions.map((tx: any) => (
                        <div
                            key={tx.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => router.push(`/transactions/${tx.id}`)}
                            onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/transactions/${tx.id}`); }}
                            className="flex w-full flex-col gap-2.5 px-4 py-3.5 text-left"
                            style={{ borderBottom: '1px solid var(--dt-divider)' }}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <span className="text-[17px] font-semibold tracking-tight" style={{ color: 'var(--dt-text-primary)' }}>{tx.amount}</span>
                                <StatusTag status={displayStatus(tx)} />
                            </div>
                            <div className="flex items-center gap-2.5">
                                <div className="relative shrink-0">
                                    <CustomerAvatar email={tx.email} name={tx.customer} size={30} />
                                    {tx.country && <span className="absolute -bottom-1 -right-1 leading-none"><Drapeau code={tx.country.code} nom={tx.country.name} taille={9} /></span>}
                                </div>
                                <div className="flex min-w-0 flex-1 flex-col">
                                    {tx.marchand && <span className="truncate text-[11px] font-medium" style={{ color: 'var(--dt-brand)' }}>{tx.marchand}</span>}
                                    <span className="truncate text-[13.5px] font-medium" style={{ color: 'var(--dt-text-primary)' }}>{tx.customer}</span>
                                    <span className="truncate text-[11.5px]" style={{ color: 'var(--dt-text-muted)' }}>{tx.email}</span>
                                </div>
                                <div className="shrink-0"><MethodAvatars tx={tx} /></div>
                            </div>
                            <div className="flex items-center justify-between gap-3 text-[11.5px]" style={{ color: 'var(--dt-text-muted)' }}>
                                <span className="truncate font-mono">{tx.id}</span>
                                <span className="shrink-0 whitespace-nowrap">{tx.date}</span>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Tablette et ordinateur : le tableau complet, qui defile si besoin. */}
                <div className="hidden overflow-x-auto p-0 md:block">
                    <table className="w-full text-sm" style={{ minWidth: 760 }}>
                        <thead style={{ background: 'var(--dt-item-hover)' }}>
                            <tr style={{ borderBottom: '1px solid var(--dt-divider)' }}>
                                <th className="pl-5 py-3 text-left text-xs font-semibold" style={{ color: 'var(--dt-text-muted)' }}>Montant</th>
                                <th className="py-3 text-left text-xs font-semibold" style={{ color: 'var(--dt-text-muted)' }}>Statut</th>
                                <th className="py-3 text-left text-xs font-semibold" style={{ color: 'var(--dt-text-muted)' }}>Méthode</th>
                                <th className="py-3 text-left text-xs font-semibold" style={{ color: 'var(--dt-text-muted)' }}>Client</th>
                                <th className="py-3 text-left text-xs font-semibold" style={{ color: 'var(--dt-text-muted)' }}>Référence</th>
                                <th className="py-3 text-left text-xs font-semibold" style={{ color: 'var(--dt-text-muted)' }}>Date</th>
                                <th className="pr-5 py-3 text-right text-xs font-semibold" style={{ color: 'var(--dt-text-muted)' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                                {data.transactions.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="h-48 text-center">
                                            <div className="flex flex-col items-center justify-center gap-3" style={{ color: 'var(--dt-text-muted)' }}>
                                                <div className="h-12 w-12 rounded-full flex items-center justify-center" style={{ background: 'var(--dt-item-hover)' }}>
                                                    <Search className="h-5 w-5 opacity-50" />
                                                </div>
                                                <div className="space-y-0.5">
                                                    <p className="text-sm font-medium" style={{ color: 'var(--dt-text-secondary)' }}>Aucune transaction trouvée</p>
                                                    <p className="text-xs" style={{ color: 'var(--dt-text-muted)' }}>Aucun paiement ne correspond à ces filtres. Dès qu'un client paie, il apparaît ici en direct.</p>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    data.transactions.map((tx: any) => (
                                        <tr
                                            key={tx.id}
                                            className="transition-colors cursor-pointer"
                                            style={{ borderBottom: '1px solid var(--dt-divider)' }}
                                            onClick={() => router.push(`/transactions/${tx.id}`)}
                                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--dt-item-hover)'; }}
                                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                                        >
                                            {/* Montant */}
                                            <td className="pl-5 py-3.5">
                                                <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--dt-text-primary)' }}>{tx.amount}</span>
                                            </td>
                                            {/* Statut */}
                                            <td className="py-3.5">
                                                <StatusTag status={displayStatus(tx)} />
                                            </td>
                                            {/* Méthode : double avatar passerelle + méthode */}
                                            <td className="py-3.5">
                                                <MethodAvatars tx={tx} />
                                            </td>
                                            {/* Client */}
                                            <td className="py-3.5">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="relative shrink-0">
                                                        <CustomerAvatar email={tx.email} name={tx.customer} size={28} />
                                                        {tx.country && (
                                                            <Tooltip
                                                                title={tx.country.name}
                                                                mouseEnterDelay={0.1}
                                                                color="#ffffff"
                                                                overlayInnerStyle={{ color: "#1f1f1f", fontWeight: 600 }}
                                                            >
                                                                <span className="absolute -bottom-1 -right-1 cursor-help leading-none">
                                                                    <Drapeau code={tx.country.code} taille={9} />
                                                                </span>
                                                            </Tooltip>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-col min-w-0">
                                                        {tx.marchand && <span className="text-[11px] font-medium truncate" style={{ color: 'var(--dt-brand)' }}>{tx.marchand}</span>}
                                                        <span className="text-sm font-medium truncate" style={{ color: 'var(--dt-text-primary)' }}>{tx.customer}</span>
                                                        <div className="flex items-center gap-1">
                                                            <span className="text-[11px] truncate" style={{ color: 'var(--dt-text-muted)' }}>{tx.email}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            {/* Référence + copie */}
                                            <td className="py-3.5" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-mono text-[11px]" style={{ color: 'var(--dt-text-secondary)' }}>{tx.id}</span>
                                                    <button
                                                        onClick={() => { navigator.clipboard?.writeText(tx.id); goeyToast.success('Référence copiée'); }}
                                                        className="p-0.5 rounded transition-colors shrink-0"
                                                        title="Copier la référence"
                                                        style={{ color: 'var(--dt-text-muted)' }}
                                                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--dt-text-primary)'; }}
                                                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--dt-text-muted)'; }}
                                                    >
                                                        <Copy className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                                {/* Paiement recu par un lien de paiement : on dit lequel. */}
                                                {tx.lien && (tx.lien.titre ? (
                                                    <Link href={`/payment-links/${tx.lien.id}`} className="mt-0.5 flex items-center gap-1 text-[11px] hover:underline" style={{ color: 'var(--dt-text-muted)' }} title="Voir ce lien de paiement">
                                                        <Link2 className="h-3 w-3 shrink-0" /><span className="max-w-[180px] truncate">{tx.lien.titre}</span>
                                                    </Link>
                                                ) : (
                                                    <span className="mt-0.5 flex items-center gap-1 text-[11px]" style={{ color: 'var(--dt-text-muted)' }}><Link2 className="h-3 w-3 shrink-0" />Lien de paiement supprimé</span>
                                                ))}
                                            </td>
                                            {/* Date */}
                                            <td className="py-3.5 text-xs whitespace-nowrap" style={{ color: 'var(--dt-text-muted)' }}>{tx.date}</td>
                                            {/* Détails */}
                                            <td className="pr-5 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    onClick={() => router.push(`/transactions/${tx.id}`)}
                                                    className="ml-auto inline-grid h-8 w-8 place-items-center rounded-lg transition-colors"
                                                    title="Voir les détails"
                                                    style={{ color: 'var(--dt-text-muted)' }}
                                                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--dt-item-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--dt-text-primary)'; }}
                                                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--dt-text-muted)'; }}
                                                >
                                                    <Eye className="h-4 w-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: '1px solid var(--dt-divider)' }}>
                    <p className="text-xs" style={{ color: 'var(--dt-text-muted)' }}>
                        {data.pagination.total > 0 ? (
                            `${(data.pagination.page - 1) * data.pagination.pageSize + 1}-${Math.min(data.pagination.page * data.pagination.pageSize, data.pagination.total)} sur ${data.pagination.total}`
                        ) : (
                            "Aucune transaction"
                        )}
                    </p>
                    <div className="flex gap-1.5 items-center">
                        <Button
                            size="small"
                            disabled={page === 1}
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            icon={<ChevronLeft className="h-3.5 w-3.5" />}
                            style={{ borderRadius: 8, height: 32, fontSize: 12 }}
                        >
                            Précédent
                        </Button>
                        <span className="text-xs px-2" style={{ color: 'var(--dt-text-muted)' }}>
                            {page} / {data.pagination.totalPages || 1}
                        </span>
                        <Button
                            size="small"
                            disabled={page >= data.pagination.totalPages}
                            onClick={() => setPage(p => p + 1)}
                            style={{ borderRadius: 8, height: 32, fontSize: 12 }}
                        >
                            Suivant <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
