"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, RefreshCw, Receipt } from "lucide-react";
import { goeyToast } from "goey-toast";
import CustomerAvatar from "./customer-avatar";
import { getRecentTransactions } from "@/lib/actions/dashboard";
import { syncAllPendingTransactions } from "@/lib/actions/transactions";
import { Pastille, Vide, Squelette, fmtDate, fmtMontant } from "./kit";

/**
 * Les dix derniers paiements. Chaque ligne mene au detail ; les statuts en
 * attente sont resynchronises a l'ouverture.
 */
const STATUT: Record<string, { label: string; couleur: string }> = {
    SUCCESS: { label: "Réussi", couleur: "#12a594" },
    PENDING: { label: "En attente", couleur: "#f59e0b" },
    FAILED: { label: "Échoué", couleur: "#f87171" },
    CANCELLED: { label: "Annulé", couleur: "#94a3b8" },
    REFUNDED: { label: "Remboursé", couleur: "#60a5fa" },
};
const SANS_OPERATEUR = new Set(["", "cartflox", "afriflow", "pending", "non attribué"]);

export function TransactionList() {
    const [tx, setTx] = useState<any[] | null>(null);
    const [sync, setSync] = useState(false);

    const charger = () => getRecentTransactions(10).then((d) => setTx(d || [])).catch(() => setTx([]));
    useEffect(() => {
        charger();
        syncAllPendingTransactions().then((r) => { if (r && r.count > 0) charger(); }).catch(() => { });
    }, []);

    async function resynchroniser() {
        setSync(true);
        try { await syncAllPendingTransactions(); await charger(); goeyToast.success("Statuts à jour"); }
        catch { goeyToast.error("Synchronisation impossible"); }
        finally { setSync(false); }
    }

    return (
        <section className="flex h-full flex-col rounded-xl p-5" style={{ background: "var(--dt-card-bg)", border: "1px solid var(--dt-border)" }}>
            <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                    <h2 className="text-[15px] font-semibold" style={{ color: "var(--dt-text-primary)" }}>Derniers paiements</h2>
                    <p className="mt-0.5 text-xs" style={{ color: "var(--dt-text-muted)" }}>Les 10 plus récents, tous statuts.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button type="button" onClick={resynchroniser} disabled={sync} title="Vérifier les statuts en attente" className="rounded-md p-1.5" style={{ color: "var(--dt-text-muted)" }}><RefreshCw className={`h-3.5 w-3.5 ${sync ? "animate-spin" : ""}`} /></button>
                    <Link href="/transactions" className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: "var(--dt-text-secondary)" }}>Voir tout <ArrowRight className="h-3.5 w-3.5" /></Link>
                </div>
            </div>
            {tx === null ? <Squelette lignes={5} /> : tx.length === 0 ? (
                <Vide icone={Receipt} titre="Aucun paiement pour le moment" texte="Dès qu'un client paie (lien de paiement, votre site ou WooCommerce), il apparaît ici avec son statut." />
            ) : (
                <div className="-mx-2 flex-1 overflow-y-auto" style={{ maxHeight: 360 }}>
                    {tx.map((t) => {
                        const s = STATUT[t.status] || { label: t.status, couleur: "#94a3b8" };
                        const op = String(t.provider || "").trim();
                        return (
                            <Link key={t.id} href={`/transactions/${t.id}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.03]">
                                <div className="flex min-w-0 items-center gap-3">
                                    <CustomerAvatar email={t.customerEmail} name={t.customerName} size={30} />
                                    <div className="min-w-0">
                                        <p className="truncate text-[13px] font-medium" style={{ color: "var(--dt-text-primary)" }}>{t.customerName || t.customerEmail || "Client"}</p>
                                        <p className="text-[11px]" style={{ color: "var(--dt-text-muted)" }}>{fmtDate(t.createdAt)}{!SANS_OPERATEUR.has(op.toLowerCase()) ? ` via ${op}` : ""}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-[13px] font-semibold tabular-nums" style={{ color: "var(--dt-text-primary)" }}>{fmtMontant(t.amount, t.currency || "XOF")}</p>
                                    <div className="mt-0.5 flex justify-end"><Pastille label={s.label} couleur={s.couleur} /></div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
