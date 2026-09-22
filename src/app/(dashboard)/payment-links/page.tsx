"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Dropdown, Modal } from "antd";
import { Plus, Link2, Copy, Check, QrCode, ExternalLink, MoreHorizontal, Download, PauseCircle, PlayCircle, Trash2 } from "lucide-react";
import { goeyToast } from "goey-toast";
import { getPaymentLinksAvecStats, setPaymentLinkStatus, deletePaymentLink, qrPaymentLink } from "@/lib/actions/payment-links";
import { Page, Bouton, Pastille, Vide, Squelette, fmtMontant } from "@/components/dashboard/kit";
import { BarreFiltres, filtrerLocal, DATES_TOUTES, type Dates } from "@/components/dashboard/barre-filtres";

/**
 * Liens de paiement : une page a montant fixe par lien, a partager. Chaque
 * carte dit ce que le lien a rapporte et permet de le copier, l'envoyer sur
 * WhatsApp, l'afficher en QR code, le mettre en pause ou le supprimer.
 */
const ETAT: Record<string, { label: string; couleur: string }> = {
    active: { label: "Actif", couleur: "#12a594" },
    inactive: { label: "En pause", couleur: "#94a3b8" },
    expired: { label: "Expiré", couleur: "#f59e0b" },
};

export default function LiensDePaiementPage() {
    const [liens, setLiens] = useState<any[] | null>(null);
    const [copie, setCopie] = useState<string | null>(null);
    const [qr, setQr] = useState<{ titre: string; dataUrl: string; url: string } | null>(null);
    const [q, setQ] = useState("");
    const [etat, setEtat] = useState("TOUS");
    const [dates, setDates] = useState<Dates>(DATES_TOUTES);

    const charger = () => getPaymentLinksAvecStats().then((l) => setLiens(l || [])).catch(() => setLiens([]));
    useEffect(() => { charger(); }, []);

    const compte = (s: string) => (liens || []).filter((l) => s === "TOUS" || l.statut === s).length;
    const visibles = useMemo(() => filtrerLocal(liens || [], { dates, dateDe: (l: any) => l.createdAt, recherche: q, champs: (l: any) => [l.title, l.description, l.slug] }).filter((l) => etat === "TOUS" || l.statut === etat), [liens, dates, q, etat]);
    const totaux = useMemo(() => (liens || []).reduce((a, l) => ({ paiements: a.paiements + l.paiements, reussis: a.reussis + l.reussis, encaisse: a.encaisse + l.encaisse }), { paiements: 0, reussis: 0, encaisse: 0 }), [liens]);

    function copier(l: any) {
        navigator.clipboard.writeText(l.url).then(() => { setCopie(l.id); goeyToast.success("Lien copié"); setTimeout(() => setCopie(null), 1500); });
    }
    function whatsapp(l: any) {
        const prix = l.amountFree ? "vous choisissez le montant" : fmtMontant(l.amount, l.currency);
        const texte = `${l.title} : ${prix}. Payez ici, par Mobile Money ou carte : ${l.url}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(texte)}`, "_blank", "noopener");
    }
    async function afficherQr(l: any) {
        const r = await qrPaymentLink(l.slug);
        if (!r.success || !r.dataUrl) { goeyToast.error("QR code indisponible"); return; }
        setQr({ titre: l.title, dataUrl: r.dataUrl, url: r.url });
    }
    async function basculer(l: any) {
        const r = await setPaymentLinkStatus(l.id, l.status === "active" ? "inactive" : "active");
        if (!r.success) { goeyToast.error(r.error || "Échec"); return; }
        goeyToast.success(l.status === "active" ? "Lien mis en pause : la page n'accepte plus de paiement" : "Lien réactivé"); charger();
    }
    async function supprimer(l: any) {
        if (!window.confirm(`Supprimer le lien « ${l.title} » ? La page ${l.url} ne fonctionnera plus. Les paiements déjà reçus restent dans Transactions.`)) return;
        const r = await deletePaymentLink(l.id);
        if (!r.success) { goeyToast.error(r.error || "Échec"); return; }
        goeyToast.success("Lien supprimé"); charger();
    }

    return (
        <Page titre="Liens de paiement" sousTitre="Une page de paiement à partager par WhatsApp, e-mail ou sur votre site, à montant fixe ou laissé au choix du client. Le client paie par Mobile Money ou carte." large
            action={<Link href="/payment-links/new"><Bouton icone={Plus}>Créer un lien</Bouton></Link>}>
            {liens && liens.length > 0 && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    {[
                        { label: "Liens actifs", valeur: String(compte("active")), sous: `${liens.length} au total`, couleur: "#12a594" },
                        { label: "Paiements via vos liens", valeur: String(totaux.paiements), sous: `${totaux.reussis} réussi${totaux.reussis > 1 ? "s" : ""}`, couleur: "#60a5fa" },
                        { label: "Encaissé via vos liens", valeur: fmtMontant(totaux.encaisse), sous: "paiements réussis", couleur: "#a78bfa" },
                    ].map((s) => (
                        <div key={s.label} className="rounded-xl p-4" style={{ background: "var(--dt-card-bg)", border: "1px solid var(--dt-border)" }}>
                            <p className="text-xs" style={{ color: "var(--dt-text-muted)" }}>{s.label}</p>
                            <p className="mt-1 text-xl font-semibold tabular-nums" style={{ color: "var(--dt-text-primary)" }}>{s.valeur}</p>
                            <p className="mt-0.5 text-[11px]" style={{ color: s.couleur }}>{s.sous}</p>
                        </div>
                    ))}
                </div>
            )}

            {liens && liens.length > 0 && (
                <BarreFiltres
                    statut={{ cle: "etat", valeur: etat, onChange: setEtat, options: [{ value: "TOUS", label: "Tous", count: liens.length }, { value: "active", label: "Actifs", count: compte("active") }, { value: "inactive", label: "En pause", count: compte("inactive") }, { value: "expired", label: "Expirés", count: compte("expired") }] }}
                    recherche={{ valeur: q, onChange: setQ, placeholder: "Rechercher (titre, description, adresse)..." }}
                    dates={{ valeur: dates, onChange: setDates }}
                    total={visibles.length}
                />
            )}

            {liens === null ? <Squelette /> : liens.length === 0 ? (
                <Vide icone={Link2} titre="Aucun lien de paiement" texte="Créez votre premier lien : un titre, un montant, et vous obtenez une page de paiement à partager par WhatsApp, e-mail ou sur votre site. Il vous faut une passerelle branchée pour encaisser."
                    action={<Link href="/payment-links/new"><Bouton icone={Plus}>Créer mon premier lien</Bouton></Link>} />
            ) : visibles.length === 0 ? (
                <Vide titre="Aucun lien ne correspond" texte="Essayez un autre mot, un autre état ou une autre période." />
            ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {visibles.map((l) => { const e = ETAT[l.statut] || ETAT.inactive; return (
                        <div key={l.id} className="flex flex-col rounded-xl p-5" style={{ background: "var(--dt-card-bg)", border: "1px solid var(--dt-border)" }}>
                            <div className="mb-2 flex items-start justify-between gap-2">
                                <div className="flex min-w-0 gap-3">
                                    {l.vignette && <img src={l.vignette} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" style={{ border: "1px solid var(--dt-border)" }} />}
                                    <div className="min-w-0">
                                        <h3 className="truncate text-[15px] font-semibold" style={{ color: "var(--dt-text-primary)" }}>{l.title}</h3>
                                        <p className="line-clamp-2 text-xs leading-relaxed" style={{ color: "var(--dt-text-muted)" }}>{l.description || "Sans description"}</p>
                                    </div>
                                </div>
                                <Pastille label={e.label} couleur={e.couleur} />
                            </div>
                            {/* Un lien a montant libre n'a pas de prix a afficher : le montant
                                en base n'est qu'une suggestion, l'afficher seul serait un mensonge. */}
                            <p className="text-2xl font-semibold tabular-nums tracking-tight" style={{ color: "var(--dt-text-primary)" }}>
                                {l.amountFree ? <span className="text-lg font-medium">Montant libre</span> : fmtMontant(l.amount, l.currency)}
                            </p>
                            <p className="mt-1 text-xs" style={{ color: "var(--dt-text-muted)" }}>
                                {l.paiements === 0 ? "Aucun paiement pour le moment" : `${l.paiements} paiement${l.paiements > 1 ? "s" : ""}, ${l.reussis} réussi${l.reussis > 1 ? "s" : ""}, ${fmtMontant(l.encaisse, l.currency)} encaissés`}
                            </p>
                            <p className="mb-4 mt-1 truncate font-mono text-[11px]" style={{ color: "var(--dt-text-secondary)" }}>{l.url.replace(/^https?:\/\//, "")}</p>
                            <div className="mt-auto flex items-center gap-2">
                                <Bouton icone={copie === l.id ? Check : Copy} onClick={() => copier(l)} className="flex-1 whitespace-nowrap">{copie === l.id ? "Copié" : "Copier"}</Bouton>
                                <button type="button" onClick={() => whatsapp(l)} title="Envoyer sur WhatsApp" className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "var(--dt-item-hover)", border: "1px solid var(--dt-border)" }}><img src="/logos/whatsapp.svg" alt="WhatsApp" className="h-4 w-4" /></button>
                                <button type="button" onClick={() => afficherQr(l)} title="QR code" className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "var(--dt-item-hover)", border: "1px solid var(--dt-border)", color: "var(--dt-text-primary)" }}><QrCode className="h-4 w-4" /></button>
                                <a href={l.url} target="_blank" rel="noopener noreferrer" title="Ouvrir la page" className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "var(--dt-item-hover)", border: "1px solid var(--dt-border)", color: "var(--dt-text-primary)" }}><ExternalLink className="h-4 w-4" /></a>
                                <Dropdown trigger={["click"]} menu={{ items: [
                                    { key: "pause", icon: l.status === "active" ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />, label: l.status === "active" ? "Mettre en pause" : "Réactiver", onClick: () => basculer(l) },
                                    { type: "divider" },
                                    { key: "suppr", icon: <Trash2 className="h-4 w-4" />, label: "Supprimer", danger: true, onClick: () => supprimer(l) },
                                ] }}>
                                    <button type="button" className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "var(--dt-item-hover)", border: "1px solid var(--dt-border)", color: "var(--dt-text-primary)" }} aria-label="Plus d'actions"><MoreHorizontal className="h-4 w-4" /></button>
                                </Dropdown>
                            </div>
                            <p className="mt-3 text-[11px]" style={{ color: "var(--dt-text-muted)" }}>Créé le {new Date(l.createdAt).toLocaleDateString("fr-FR")}{l.expiresAt ? `, expire le ${new Date(l.expiresAt).toLocaleDateString("fr-FR")}` : ""}{l.allowQuantity ? ", quantité au choix" : ""}{l.requestPhone ? ", numéro demandé" : ""}</p>
                        </div>
                    ); })}
                </div>
            )}

            <Modal open={!!qr} onCancel={() => setQr(null)} footer={null} title={qr ? `QR code : ${qr.titre}` : ""} destroyOnHidden>
                {qr && (
                    <div className="flex flex-col items-center gap-3 pt-2">
                        <img src={qr.dataUrl} alt="QR code" className="h-64 w-64 rounded-lg bg-white p-2" />
                        <p className="text-center text-xs" style={{ color: "var(--dt-text-muted)" }}>Le client scanne, arrive sur {qr.url.replace(/^https?:\/\//, "")} et paie. Imprimez-le en boutique ou ajoutez-le à vos supports.</p>
                        <a href={qr.dataUrl} download={`qr-${qr.titre.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`}><Bouton icone={Download}>Télécharger (PNG)</Bouton></a>
                    </div>
                )}
            </Modal>
        </Page>
    );
}
