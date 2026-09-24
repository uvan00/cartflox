"use client";

import { useEffect, useState, type ReactNode } from "react";
import { MARQUE } from "@/lib/marque";
import { chiffreMontant, formaterMontant } from "@/lib/devises";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getTransactionById, getTransactionLogs, syncTransactionStatus, refundTransaction, sendPaymentReminder } from "@/lib/actions/transactions";
import { getRoutingDecisionByTransactionId, type DecisionListItem } from "@/lib/actions/routing";
import { Button } from "@lobehub/ui";
import {
    ChevronLeft,
    Terminal,
    Clock,
    User,
    Mail,
    Phone,
    CreditCard,
    Smartphone,
    Globe,
    ShieldCheck,
    Receipt,
    RotateCcw,
    Zap,
    Download,
    RefreshCw,
    Copy,
    Check,
    GitBranch,
    ArrowRight,
    ChevronDown,
    AlertTriangle,
    CheckCircle2,
    XCircle,
    Hourglass,
    Hash,
    Banknote,
    MessageCircle,
    Link2,
} from "lucide-react";
import {
    Dialog,
    DialogContent,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { goeyToast } from "goey-toast";
import { cn } from "@/lib/utils";
import CustomerAvatar from "@/components/dashboard/customer-avatar";
import { Drapeau } from "@/components/ui/drapeau";

// Pays deduit de l'indicatif du numero.
const DIAL_INFO: Record<string, { iso: string; name: string }> = {
    '225': { iso: 'ci', name: "Côte d'Ivoire" }, '221': { iso: 'sn', name: 'Sénégal' },
    '229': { iso: 'bj', name: 'Bénin' }, '237': { iso: 'cm', name: 'Cameroun' },
    '223': { iso: 'ml', name: 'Mali' }, '226': { iso: 'bf', name: 'Burkina Faso' },
    '228': { iso: 'tg', name: 'Togo' }, '224': { iso: 'gn', name: 'Guinée' },
    '227': { iso: 'ne', name: 'Niger' }, '233': { iso: 'gh', name: 'Ghana' },
    '234': { iso: 'ng', name: 'Nigeria' }, '242': { iso: 'cg', name: 'Congo' },
    '243': { iso: 'cd', name: 'RD Congo' }, '241': { iso: 'ga', name: 'Gabon' },
};
function phoneCountry(phone?: string | null): { iso: string; name: string } | null {
    if (!phone) return null;
    const d = phone.replace(/\D/g, '');
    const code = Object.keys(DIAL_INFO).sort((a, b) => b.length - a.length).find(c => d.startsWith(c));
    return code ? DIAL_INFO[code] : null;
}

/** Une ligne libellé + valeur facon Moneroo (libellé fixe a gauche). */
function InfoRow({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex items-start gap-3">
            <div className="text-[12px] font-medium shrink-0 w-36" style={{ color: 'var(--dt-text-muted)' }}>{label}</div>
            <div className="text-[13px] min-w-0 flex-1" style={{ color: 'var(--dt-text-primary)' }}>{children}</div>
        </div>
    );
}

function CopyChip({ text, label }: { text: string; label?: string }) {
    const [copied, setCopied] = useState(false);
    const onCopy = () => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };
    return (
        <button
            onClick={onCopy}
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-mono text-[11px] hover:bg-white/5 transition-colors"
            style={{ background: 'var(--dt-item-hover)', border: '1px solid var(--dt-border)', color: 'var(--dt-text-primary)' }}
            title={label ? `Copier ${label}` : 'Copier'}
        >
            <span className="truncate max-w-[180px]">{text}</span>
            {copied ? <Check size={11} className="text-teal-400 shrink-0" /> : <Copy size={11} style={{ color: 'var(--dt-text-muted)' }} className="shrink-0" />}
        </button>
    );
}

function StatusBadge({ status }: { status: string }) {
    const map: Record<string, { color: string; bg: string; border: string; icon: any; label: string }> = {
        SUCCESS:   { color: 'rgb(52,211,153)',  bg: 'rgba(18,165,148,0.1)', border: 'rgba(18,165,148,0.3)', icon: CheckCircle2, label: 'Réussi' },
        PENDING:   { color: 'rgb(251,191,36)',  bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.3)', icon: Hourglass,    label: 'En attente' },
        FAILED:    { color: 'rgb(248,113,113)', bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.3)',  icon: XCircle,      label: 'Échoué' },
        CANCELLED: { color: 'rgb(148,163,184)', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.3)', icon: XCircle,    label: 'Annulé' },
        REFUNDED:  { color: 'rgb(96,165,250)',  bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.3)', icon: RotateCcw,    label: 'Remboursé' },
    };
    const s = map[status] || map.PENDING;
    const Icon = s.icon;
    return (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color }}>
            <Icon size={12} />
            <span className="text-[11px] font-medium">{s.label}</span>
        </div>
    );
}

function LogTypeBadge({ type }: { type: string }) {
    const t = type.toLowerCase();
    let color = 'rgb(148,163,184)';
    if (t.includes('fail') || t.includes('error')) color = 'rgb(248,113,113)';
    else if (t.includes('success') || t.includes('checkout')) color = 'rgb(52,211,153)';
    else if (t.includes('softpay') || t.includes('initi')) color = 'rgb(96,165,250)';
    else if (t.includes('webhook')) color = 'rgb(251,191,36)';
    return (
        <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color }}>{type}</span>
    );
}

function LogEntry({ log }: { log: any }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="rounded-lg" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--dt-border)' }}>
            <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors">
                <div className="flex items-center gap-3">
                    <LogTypeBadge type={log.type} />
                    <span className="text-[10px] font-mono" style={{ color: 'var(--dt-text-muted)' }}>
                        {format(new Date(log.timestamp), "HH:mm:ss.SSS", { locale: fr })}
                    </span>
                </div>
                <ChevronDown size={12} className={cn("transition-transform", open && "rotate-180")} style={{ color: 'var(--dt-text-muted)' }} />
            </button>
            {open && (
                <pre className="text-[10px] overflow-x-auto p-3 font-mono leading-relaxed" style={{ background: 'rgba(0,0,0,0.4)', color: 'rgb(148,163,184)', borderTop: '1px solid var(--dt-divider)' }}>
                    {JSON.stringify(log.payload, null, 2)}
                </pre>
            )}
        </div>
    );
}

export default function TransactionDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const [transaction, setTransaction] = useState<any>(null);
    const [logs, setLogs] = useState<any[]>([]);
    const [decision, setDecision] = useState<DecisionListItem | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isRefunding, setIsRefunding] = useState(false);
    const [isReminding, setIsReminding] = useState(false);
    const [isReceiptOpen, setIsReceiptOpen] = useState(false);

    /**
     * Imprime le recu seul. On recopie sa mise en page dans un document a part :
     * la boite de dialogue est centree et positionnee en fixe, ce qui donnait une
     * feuille blanche quand on imprimait la page entiere.
     */
    function imprimerRecu() {
        const recu = document.getElementById("cf-recu");
        if (!recu) { window.print(); return; }
        const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
            .map((e) => e.outerHTML).join("");
        const cadre = document.createElement("iframe");
        cadre.setAttribute("aria-hidden", "true");
        cadre.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
        document.body.appendChild(cadre);
        const doc = cadre.contentDocument;
        if (!doc) { document.body.removeChild(cadre); window.print(); return; }
        doc.open();
        doc.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8">` +
            `<title>Recu ${transaction.orderId}</title>${styles}` +
            `<style>@page{margin:14mm}html,body{background:#fff;color:#0f172a;margin:0}` +
            `#cf-recu{max-width:520px;margin:0 auto;overflow:visible}</style></head>` +
            `<body>${recu.outerHTML}</body></html>`);
        doc.close();
        const lancer = () => {
            cadre.contentWindow?.focus();
            cadre.contentWindow?.print();
            setTimeout(() => { if (cadre.parentNode) document.body.removeChild(cadre); }, 1000);
        };
        // On laisse les feuilles de style se charger avant d'ouvrir la fenetre d'impression.
        if (cadre.contentWindow?.document.readyState === "complete") setTimeout(lancer, 350);
        else cadre.onload = () => setTimeout(lancer, 350);
    }
    const [refundOpen, setRefundOpen] = useState(false);
    const [refundWord, setRefundWord] = useState("");

    const loadData = async () => {
        const id = params.id as string;
        if (!id) return;

        const [txData, logData, decisionData] = await Promise.all([
            getTransactionById(id),
            getTransactionLogs(id),
            getRoutingDecisionByTransactionId(id),
        ]);

        setTransaction(txData);
        setLogs(logData);
        setDecision(decisionData);
    };

    useEffect(() => {
        const init = async () => {
            await loadData();
            setIsLoading(false);
        };
        init();
    }, [params.id]);

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            const res = await syncTransactionStatus(transaction.id);
            if (res.error) {
                goeyToast.error(`Erreur : ${res.error}`);
            } else {
                goeyToast.success(`Statut synchronisé : ${res.status}`);
                await loadData();
            }
        } catch {
            goeyToast.error("Échec de la synchronisation");
        } finally {
            setIsSyncing(false);
        }
    };

    const handleReminder = async () => {
        if (isReminding) return;
        setIsReminding(true);
        try {
            const res = await sendPaymentReminder(transaction.id);
            if (res?.error) {
                goeyToast.error(`Relance non envoyée : ${res.error}`);
            } else {
                goeyToast.success("Relance WhatsApp envoyée au client ✅");
                await loadData();
            }
        } catch {
            goeyToast.error("Échec de la relance WhatsApp");
        } finally {
            setIsReminding(false);
        }
    };

    // Garde-fou : il faut taper le mot "remboursé" (avec ou sans accent) pour confirmer.
    const refundWordTyped = refundWord.trim().toLowerCase();
    const refundWordOk =
        refundWordTyped === "remboursé" ||
        refundWordTyped === "rembourse" ||
        refundWordTyped === "remboursee";

    // Ouvre la confirmation par saisie (ne lance PAS le remboursement directement).
    const handleRefund = () => {
        setRefundWord("");
        setRefundOpen(true);
    };

    const doRefund = async () => {
        if (!refundWordOk) return;
        const amountLabel = formaterMontant(Number(transaction.amount), transaction.currency);
        setRefundOpen(false);
        setIsRefunding(true);
        try {
            const res = await refundTransaction(transaction.id);
            if (res.error) {
                goeyToast.error(res.error);
            } else {
                goeyToast.success(`Remboursement de ${amountLabel} initié`);
                await loadData();
            }
        } catch {
            goeyToast.error("Échec du remboursement");
        } finally {
            setIsRefunding(false);
        }
    };

    if (isLoading) {
        return (
            <div className="p-6 md:p-8 animate-pulse space-y-6 max-w-5xl mx-auto">
                <div className="h-8 w-48 rounded-lg" style={{ background: 'var(--dt-card-bg)' }} />
                <div className="h-32 rounded-xl" style={{ background: 'var(--dt-card-bg)' }} />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="h-56 rounded-xl lg:col-span-2" style={{ background: 'var(--dt-card-bg)' }} />
                    <div className="h-56 rounded-xl" style={{ background: 'var(--dt-card-bg)' }} />
                </div>
            </div>
        );
    }

    if (!transaction) {
        return (
            <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
                <AlertTriangle className="h-10 w-10" style={{ color: 'var(--dt-text-muted)', opacity: 0.4 }} />
                <p className="text-base font-semibold" style={{ color: 'var(--dt-text-muted)' }}>Transaction introuvable</p>
                <Button onClick={() => router.back()}>Retour</Button>
            </div>
        );
    }

    const isMobile = (transaction.paymentType || '').toLowerCase().includes('mobile');
    const metadata = (transaction.metadata as Record<string, any>) || {};
    const metadataEntries = Object.entries(metadata).filter(([k]) => !['gatewayId', 'methodCode', 'paymentLinkId'].includes(k));
    const hasFees = transaction.platformFee != null && transaction.merchantAmount != null;
    const country = phoneCountry(transaction.customerPhone);
    const methodLabel = (metadata.methodCode || transaction.paymentType || '')
        .replace(/[-_]/g, ' ').trim() || '';
    const description = metadata.description || (transaction.orderId ? `Commande ${transaction.orderId}` : '');

    return (
        <>
            <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-5">
                {/* Header */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <button
                        className="gap-2 -ml-3 hover:bg-white/5 flex items-center px-3 py-2 rounded-lg transition-colors text-sm"
                        style={{ color: 'var(--dt-text-muted)' }}
                        onClick={() => router.back()}
                    >
                        <ChevronLeft className="h-4 w-4" /> Retour à l'historique
                    </button>
                    <div className="flex gap-2">
                        <Button
                            size="small"
                            onClick={handleSync}
                            disabled={isSyncing}
                            style={{ borderRadius: 8, height: 32, fontSize: 12 }}
                            icon={<RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />}
                        >
                            Synchroniser
                        </Button>
                        <Button
                            size="small"
                            style={{ borderRadius: 8, height: 32, fontSize: 12 }}
                            onClick={() => {
                                if (transaction.status !== 'SUCCESS') {
                                    goeyToast.error("Le reçu n'est disponible que pour les transactions réussies.");
                                    return;
                                }
                                setIsReceiptOpen(true);
                            }}
                            icon={<Receipt size={12} />}
                        >
                            Reçu
                        </Button>
                        <Button
                            size="small"
                            disabled={isReminding || !transaction.customerPhone || ['SUCCESS', 'REFUNDED'].includes(transaction.status)}
                            style={{ borderRadius: 8, height: 32, fontSize: 12 }}
                            title={!transaction.customerPhone ? 'Aucun numéro de téléphone' : ['SUCCESS', 'REFUNDED'].includes(transaction.status) ? 'Paiement déjà abouti' : 'Relancer le client par WhatsApp'}
                            onClick={handleReminder}
                            icon={<MessageCircle size={12} className={isReminding ? 'animate-pulse' : ''} />}
                        >
                            Relancer WhatsApp
                        </Button>
                        <Button
                            size="small"
                            disabled={isRefunding || transaction.status !== 'SUCCESS'}
                            style={{ borderRadius: 8, height: 32, fontSize: 12 }}
                            title={transaction.status === 'REFUNDED' ? 'Déjà remboursée' : transaction.status !== 'SUCCESS' ? 'Disponible pour les transactions réussies' : 'Rembourser le client'}
                            onClick={handleRefund}
                            icon={<RotateCcw size={12} className={isRefunding ? 'animate-spin' : ''} />}
                        >
                            {transaction.status === 'REFUNDED' ? 'Remboursé' : 'Rembourser'}
                        </Button>
                    </div>
                </div>

                {/* Hero card */}
                <div className="rounded-xl overflow-hidden" style={{ background: 'var(--dt-card-bg)', border: '1px solid var(--dt-border)' }}>
                    <div className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="space-y-2 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <StatusBadge status={transaction.status} />
                                {decision && (
                                    <span className="text-[10px] px-2 py-1 rounded-md inline-flex items-center gap-1" style={{ background: 'var(--dt-item-hover)', color: 'var(--dt-text-muted)' }}>
                                        <GitBranch size={10} /> {decision.algorithmKind}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs flex-wrap" style={{ color: 'var(--dt-text-muted)' }}>
                                <Hash size={12} />
                                <span>Commande</span>
                                <CopyChip text={transaction.orderId} label="orderId" />
                            </div>
                            {transaction.lien && (
                                <div className="flex items-center gap-1.5 text-xs flex-wrap" style={{ color: 'var(--dt-text-muted)' }}>
                                    <Link2 size={12} />
                                    <span>Lien de paiement</span>
                                    {transaction.lien.titre ? (
                                        <Link href={`/payment-links/${transaction.lien.id}`} className="font-medium hover:underline" style={{ color: 'var(--dt-text-primary)' }}>{transaction.lien.titre}</Link>
                                    ) : (
                                        <span>supprimé depuis</span>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="text-left sm:text-right shrink-0">
                            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--dt-text-muted)' }}>Montant</p>
                            <div className="flex items-baseline gap-2 sm:justify-end">
                                <span className="text-3xl font-semibold" style={{ color: 'var(--dt-text-primary)' }}>
                                    {chiffreMontant(transaction.amount, transaction.currency)}
                                </span>
                                <span className="text-sm font-medium text-primary">{transaction.currency}</span>
                            </div>
                            {hasFees && (
                                <p className="text-[10px] mt-1" style={{ color: 'var(--dt-text-muted)' }}>
                                    Net marchand : {chiffreMontant(transaction.merchantAmount, transaction.currency)}, Frais : {chiffreMontant(transaction.platformFee, transaction.currency)} {transaction.currency}
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x" style={{ borderTop: '1px solid var(--dt-divider)', borderColor: 'var(--dt-divider)' }}>
                        <div className="p-4">
                            <p className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--dt-text-muted)' }}>Méthode</p>
                            <div className="flex items-center gap-1.5 text-xs font-medium">
                                {isMobile ? <Smartphone size={12} className="text-blue-400" /> : <CreditCard size={12} className="text-purple-400" />}
                                <span className="truncate">{transaction.paymentType || ''}</span>
                            </div>
                        </div>
                        <div className="p-4">
                            <p className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--dt-text-muted)' }}>Passerelle</p>
                            <div className="flex items-center gap-1.5 text-xs font-medium">
                                <Globe size={12} className="text-teal-400" />
                                <span className="truncate">{transaction.provider || ''}</span>
                            </div>
                        </div>
                        <div className="p-4">
                            <p className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--dt-text-muted)' }}>Créée</p>
                            <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--dt-text-muted)' }}>
                                <Clock size={12} />
                                <span>{format(new Date(transaction.createdAt), "dd MMM HH:mm", { locale: fr })}</span>
                            </div>
                        </div>
                        <div className="p-4">
                            <p className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--dt-text-muted)' }}>{transaction.completedAt ? 'Complétée' : 'Mise à jour'}</p>
                            <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--dt-text-muted)' }}>
                                <Clock size={12} />
                                <span>{format(new Date(transaction.completedAt || transaction.updatedAt), "dd MMM HH:mm", { locale: fr })}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Main column */}
                    <div className="lg:col-span-2 space-y-4">

                        {/* Customer card */}
                        <div className="rounded-xl" style={{ background: 'var(--dt-card-bg)', border: '1px solid var(--dt-border)' }}>
                            <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid var(--dt-divider)' }}>
                                <User size={14} style={{ color: 'var(--dt-text-muted)' }} />
                                <h3 className="text-sm font-medium">Client</h3>
                            </div>
                            <div className="p-5 space-y-4">
                                <div className="flex items-center gap-3">
                                    <CustomerAvatar email={transaction.customerEmail} name={transaction.customerName} size={44} />
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--dt-text-primary)' }}>{transaction.customerName || ''}</p>
                                        <p className="text-[12px] truncate" style={{ color: 'var(--dt-text-muted)' }}>{transaction.customerEmail || ''}</p>
                                    </div>
                                </div>
                                <div className="space-y-3 pt-1">
                                    {transaction.customerPhone && (
                                        <InfoRow label="Téléphone"><span className="font-mono">{transaction.customerPhone}</span></InfoRow>
                                    )}
                                    {country && (
                                        <InfoRow label="Pays">
                                            <span className="inline-flex items-center gap-1.5">
                                                <Drapeau code={country.iso} nom={country.name} taille={15} />
                                                {country.name}
                                            </span>
                                        </InfoRow>
                                    )}
                                    <InfoRow label="Description">{description}</InfoRow>
                                </div>
                            </div>
                        </div>

                        {/* Passerelle card */}
                        <div className="rounded-xl" style={{ background: 'var(--dt-card-bg)', border: '1px solid var(--dt-border)' }}>
                            <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid var(--dt-divider)' }}>
                                <Globe size={14} className="text-teal-400" />
                                <h3 className="text-sm font-medium">Passerelle</h3>
                            </div>
                            <div className="p-5 space-y-3">
                                <InfoRow label="Passerelle"><span className="font-semibold">{transaction.provider || ''}</span></InfoRow>
                                <InfoRow label="Méthode"><span className="capitalize">{methodLabel}</span></InfoRow>
                                {transaction.providerRef && (
                                    <InfoRow label="Id de la transaction"><CopyChip text={transaction.providerRef} label="providerRef" /></InfoRow>
                                )}
                                <InfoRow label="Statut"><StatusBadge status={transaction.status} /></InfoRow>
                            </div>
                        </div>

                        {/* Routing decision card */}
                        {decision && (
                            <div className="rounded-xl" style={{ background: 'var(--dt-card-bg)', border: '1px solid var(--dt-border)' }}>
                                <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--dt-divider)' }}>
                                    <div className="flex items-center gap-2">
                                        <GitBranch size={14} className="text-indigo-400" />
                                        <h3 className="text-sm font-medium">Décision de routage</h3>
                                        {decision.assignedOverride && (
                                            <span className="text-[9px] px-1.5 py-0.5 rounded font-medium text-amber-400 bg-amber-500/10">affectation</span>
                                        )}
                                    </div>
                                    <Link href="/methods?tab=decisions" className="text-[11px] text-primary hover:underline">Tout voir →</Link>
                                </div>
                                <div className="p-5 space-y-4">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        {decision.orderedGateways.map((g, i) => (
                                            <span key={g.id} className="flex items-center gap-1.5">
                                                <span className={cn(
                                                    "px-2 py-1 rounded-md text-[11px] font-medium border",
                                                    decision.chosen?.id === g.id ? "bg-teal-500/10 border-teal-500/30 text-teal-400"
                                                    : i === 0 ? "bg-primary/10 border-primary/30 text-primary"
                                                    : ""
                                                )} style={i !== 0 && decision.chosen?.id !== g.id ? { background: 'var(--dt-item-hover)', border: '1px solid var(--dt-border)', color: 'var(--dt-text-muted)' } : {}}>
                                                    {i + 1}. {g.name}
                                                    {decision.chosen?.id === g.id && <Check size={10} className="inline ml-1" />}
                                                </span>
                                                {i < decision.orderedGateways.length - 1 && <ArrowRight size={10} style={{ color: 'var(--dt-text-muted)', opacity: 0.4 }} />}
                                            </span>
                                        ))}
                                    </div>
                                    {decision.reason && (
                                        <p className="text-[11px] leading-relaxed pt-3" style={{ color: 'var(--dt-text-muted)', borderTop: '1px solid var(--dt-divider)' }}>
                                            {decision.reason}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Metadata card */}
                        {metadataEntries.length > 0 && (
                            <div className="rounded-xl" style={{ background: 'var(--dt-card-bg)', border: '1px solid var(--dt-border)' }}>
                                <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid var(--dt-divider)' }}>
                                    <Banknote size={14} style={{ color: 'var(--dt-text-muted)' }} />
                                    <h3 className="text-sm font-medium">Métadonnées</h3>
                                </div>
                                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {metadataEntries.map(([k, v]) => (
                                        <div key={k}>
                                            <p className="text-[10px] uppercase tracking-wider mb-1 font-mono" style={{ color: 'var(--dt-text-muted)' }}>{k}</p>
                                            <p className="text-[11px] font-mono break-all" style={{ color: 'var(--dt-text-primary)' }}>
                                                {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Audit logs */}
                        <div className="rounded-xl" style={{ background: 'var(--dt-card-bg)', border: '1px solid var(--dt-border)' }}>
                            <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--dt-divider)' }}>
                                <div className="flex items-center gap-2">
                                    <Terminal size={14} style={{ color: 'var(--dt-text-muted)' }} />
                                    <h3 className="text-sm font-medium">Audit technique</h3>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--dt-item-hover)', color: 'var(--dt-text-muted)' }}>{logs.length}</span>
                                </div>
                            </div>
                            <div className="p-4 space-y-1.5">
                                {logs.length > 0 ? (
                                    logs.map((log, i) => <LogEntry key={i} log={log} />)
                                ) : (
                                    <div className="py-8 text-center">
                                        <Terminal size={20} className="mx-auto mb-2" style={{ color: 'var(--dt-text-muted)', opacity: 0.4 }} />
                                        <p className="text-xs" style={{ color: 'var(--dt-text-muted)' }}>Aucun log technique pour cette transaction</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-4">
                        {/* Timeline */}
                        <div className="rounded-xl" style={{ background: 'var(--dt-card-bg)', border: '1px solid var(--dt-border)' }}>
                            <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--dt-divider)' }}>
                                <h3 className="text-sm font-medium">Chronologie</h3>
                            </div>
                            <div className="p-5 space-y-0">
                                {[
                                    { ok: true, color: 'rgb(52,211,153)', icon: ShieldCheck, title: 'Transaction créée', when: transaction.createdAt },
                                    decision && { ok: true, color: 'rgb(129,140,248)', icon: GitBranch, title: 'Routage décidé', when: decision.createdAt, sub: decision.chosen ? `→ ${decision.chosen.name}` : undefined },
                                    transaction.providerRef && { ok: true, color: 'rgb(96,165,250)', icon: Globe, title: 'Provider notifié', when: transaction.updatedAt, sub: transaction.providerRef.slice(0, 24) + (transaction.providerRef.length > 24 ? '…' : '') },
                                    transaction.status === 'SUCCESS' && { ok: true, color: 'rgb(52,211,153)', icon: CheckCircle2, title: 'Paiement confirmé', when: transaction.completedAt || transaction.updatedAt, sub: 'webhook reçu' },
                                    transaction.status === 'FAILED' && { ok: false, color: 'rgb(248,113,113)', icon: XCircle, title: 'Paiement échoué', when: transaction.updatedAt },
                                    transaction.status === 'CANCELLED' && { ok: false, color: 'rgb(148,163,184)', icon: XCircle, title: 'Annulé', when: transaction.updatedAt },
                                    transaction.status === 'PENDING' && { ok: false, color: 'rgb(251,191,36)', icon: Hourglass, title: 'En attente', when: transaction.updatedAt, sub: 'webhook non reçu' },
                                ].filter(Boolean).map((step: any, i, arr) => {
                                    const Icon = step.icon;
                                    const isLast = i === arr.length - 1;
                                    return (
                                        <div key={i} className="relative">
                                            <div className="flex items-start gap-3">
                                                <div className="h-7 w-7 rounded-full flex items-center justify-center shrink-0" style={{ background: `${step.color}1f`, border: `1px solid ${step.color}40` }}>
                                                    <Icon size={12} style={{ color: step.color }} />
                                                </div>
                                                <div className="flex-1 min-w-0 pb-4">
                                                    <p className="text-xs font-medium" style={{ color: 'var(--dt-text-primary)' }}>{step.title}</p>
                                                    {step.sub && <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--dt-text-muted)' }}>{step.sub}</p>}
                                                    {step.when && <p className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--dt-text-muted)' }}>{format(new Date(step.when), "dd MMM HH:mm:ss", { locale: fr })}</p>}
                                                </div>
                                            </div>
                                            {!isLast && <div className="absolute left-[13px] top-7 bottom-0 w-px" style={{ background: 'var(--dt-divider)' }} />}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Security note */}
                        <div className="rounded-xl p-4 flex gap-3" style={{ background: 'var(--dt-card-bg)', border: '1px solid var(--dt-border)' }}>
                            <ShieldCheck size={16} className="text-teal-400 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-xs font-medium mb-1" style={{ color: 'var(--dt-text-primary)' }}>Sécurité</p>
                                <p className="text-[11px] leading-relaxed" style={{ color: 'var(--dt-text-muted)' }}>
                                    Transaction traitée via canal chiffré. Logs conservés 30 jours (PCI-DSS).
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Confirmation de remboursement : il faut taper le mot "remboursé" */}
            <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
                <DialogContent className="max-w-md bg-white text-slate-950 p-0 overflow-hidden border-none shadow-2xl">
                    <div className="p-6 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="h-11 w-11 rounded-xl bg-red-50 flex items-center justify-center text-red-600 shrink-0">
                                <RotateCcw className="h-5 w-5" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold tracking-tight text-slate-900">Confirmer le remboursement</h2>
                                <p className="text-xs text-slate-500">Action irréversible</p>
                            </div>
                        </div>
                        <p className="text-sm text-slate-600 leading-relaxed">
                            Vous allez rembourser{" "}
                            <span className="font-bold text-slate-900">
                                {transaction ? formaterMontant(Number(transaction.amount), transaction.currency) : ""}
                            </span>{" "}
                            à {transaction?.customerName || "ce client"}. Le montant sera renvoyé sur son moyen de paiement.
                        </p>
                        <div className="space-y-1.5">
                            <label className="block text-xs font-semibold text-slate-700">
                                Pour confirmer, tapez le mot{" "}
                                <span className="font-mono font-bold text-red-600">remboursé</span> :
                            </label>
                            <input
                                autoFocus
                                value={refundWord}
                                onChange={(e) => setRefundWord(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && refundWordOk) doRefund();
                                }}
                                placeholder="remboursé"
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                            />
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => setRefundOpen(false)}
                                className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100"
                            >
                                Annuler
                            </button>
                            <button
                                type="button"
                                disabled={!refundWordOk}
                                onClick={doRefund}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <RotateCcw size={14} /> Rembourser
                            </button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Recu de paiement : ce que le marchand imprime ou envoie a son client. */}
            <Dialog open={isReceiptOpen} onOpenChange={setIsReceiptOpen}>
                <DialogContent className="flex max-h-[95vh] max-w-md flex-col overflow-hidden border-none bg-white p-0 text-slate-900 shadow-2xl backdrop-blur-none">
                    <div id="cf-recu" className="overflow-y-auto">
                        <div className="space-y-5 p-6">
                            {/* Qui a encaisse */}
                            <div className="flex items-center gap-3">
                                {transaction.marchand?.id && (
                                    <img
                                        src={`/api/logo/${transaction.marchand.id}`}
                                        alt=""
                                        className="h-10 w-10 shrink-0 rounded-lg object-cover"
                                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                    />
                                )}
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-[15px] font-semibold leading-tight text-slate-900">{transaction.marchand?.nom || "Reçu de paiement"}</p>
                                    <p className="text-[12px] text-slate-500">Reçu de paiement</p>
                                </div>
                                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${transaction.status === "SUCCESS" ? "bg-teal-50 text-teal-700" : transaction.status === "REFUNDED" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                                    {transaction.status === "SUCCESS" ? "Payé" : transaction.status === "REFUNDED" ? "Remboursé" : "En attente"}
                                </span>
                            </div>

                            {/* Le montant, l'information principale */}
                            <div className="rounded-xl bg-slate-50 p-4">
                                <p className="text-[12px] text-slate-500">Montant payé</p>
                                <p className="mt-1 flex items-baseline gap-1.5">
                                    <span className="text-[30px] font-semibold leading-none tracking-tight text-slate-900">{chiffreMontant(transaction.amount, transaction.currency)}</span>
                                    <span className="text-[15px] font-medium text-slate-500">{transaction.currency}</span>
                                </p>
                                <p className="mt-2 text-[12px] text-slate-500">
                                    {format(new Date(transaction.completedAt || transaction.createdAt), "d MMMM yyyy 'à' HH:mm", { locale: fr })}
                                </p>
                            </div>

                            {/* Le detail */}
                            <dl className="space-y-2.5 text-[13px]">
                                {[
                                    ["Payé par", transaction.customerName || "Client"],
                                    ["Contact", [transaction.customerEmail, transaction.customerPhone].filter(Boolean).join(", ")],
                                    ["Objet", (transaction.metadata as any)?.description || transaction.lien?.titre || null],
                                    ["Moyen de paiement", transaction.paymentType === "CARD" ? "Carte bancaire" : transaction.paymentType === "MOBILE_MONEY" ? "Mobile Money" : transaction.paymentType || null],
                                    ["Traité par", transaction.provider || null],
                                    ["Référence", transaction.orderId],
                                    ["Référence opérateur", transaction.providerRef || null],
                                ].filter(([, v]) => v).map(([k, v]) => (
                                    <div key={k as string} className="flex items-start justify-between gap-4">
                                        <dt className="shrink-0 text-slate-500">{k}</dt>
                                        <dd className={`min-w-0 text-right font-medium text-slate-900 ${String(k).startsWith("Référence") ? "break-all font-mono text-[12px]" : ""}`}>{v as string}</dd>
                                    </div>
                                ))}
                            </dl>

                            {/* Ce que le marchand touche reellement, quand une commission s'applique */}
                            {Number(transaction.platformFee) > 0 && (
                                <div className="space-y-2 rounded-xl border border-slate-200 p-4 text-[13px]">
                                    <div className="flex justify-between"><span className="text-slate-500">Commission {MARQUE}</span><span className="font-medium text-slate-900">{chiffreMontant(transaction.platformFee, transaction.currency)} {transaction.currency}</span></div>
                                    <div className="flex justify-between"><span className="text-slate-500">Net pour {transaction.marchand?.nom || "le commerce"}</span><span className="font-semibold text-slate-900">{chiffreMontant(Number(transaction.merchantAmount || transaction.amount - transaction.platformFee), transaction.currency)} {transaction.currency}</span></div>
                                </div>
                            )}

                            <p className="border-t border-slate-200 pt-4 text-center text-[11.5px] leading-relaxed text-slate-400">
                                Reçu émis par {MARQUE}{transaction.marchand?.nom ? ` pour ${transaction.marchand.nom}` : ""}.<br />
                                Identifiant de la transaction : <span className="font-mono">{transaction.id}</span>
                            </p>
                        </div>
                    </div>

                    <div className="cf-recu-actions flex shrink-0 items-center gap-2 border-t border-slate-200 bg-white p-4">
                        <a
                            href={`/api/transactions/${transaction.id}/recu`}
                            className="inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-[14px] font-medium text-white no-underline transition-colors hover:bg-slate-800"
                        >
                            <Download className="h-4 w-4" /> Télécharger le PDF
                        </a>
                        <button
                            type="button"
                            onClick={imprimerRecu}
                            title="Imprimer le reçu"
                            className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-[14px] font-medium text-slate-700 transition-colors hover:bg-slate-50"
                        >
                            Imprimer
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsReceiptOpen(false)}
                            className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-[14px] font-medium text-slate-700 transition-colors hover:bg-slate-50"
                        >
                            Fermer
                        </button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
