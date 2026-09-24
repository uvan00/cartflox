"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Drawer, Modal, Tooltip } from "antd";
import { ArrowLeft, ArrowRight, Ban, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock, Copy, CreditCard, Download, ExternalLink, Eye, Link2, Loader2, Mail, MapPin, MessageCircle, PauseCircle, PlayCircle, Phone, QrCode, RotateCcw, Smartphone, Trash2, Users, XCircle } from "lucide-react";
import { goeyToast } from "goey-toast";
import { getPaymentLinkDetail, setPaymentLinkStatus, deletePaymentLink, qrPaymentLink, type ClientDuLien } from "@/lib/actions/payment-links";
import { getTransactions } from "@/lib/actions/transactions";
import { useDebounce } from "@/hooks/use-debounce";
import { Bloc, Bouton, Pastille, Vide, Squelette, Aide, Onglets, fmtMontant, fmtDate } from "@/components/dashboard/kit";
import { BarreFiltres, bornes, DATES_TOUTES, type Dates } from "@/components/dashboard/barre-filtres";
import CustomerAvatar from "@/components/dashboard/customer-avatar";
import { Drapeau } from "@/components/ui/drapeau";

/**
 * Un lien de paiement vu de pres : ce qu'il a rapporte, chaque paiement recu
 * par ce lien (avec ses filtres), et les clients qui sont passes par lui.
 * Un clic sur un client ouvre sa fiche ; un clic sur un paiement, son detail.
 */
const TAILLE_PAGE = 20;
const ETAT: Record<string, { label: string; couleur: string }> = {
    active: { label: "Actif", couleur: "#12a594" },
    inactive: { label: "En pause", couleur: "#94a3b8" },
    expired: { label: "Expiré", couleur: "#f59e0b" },
};
const STATUT: Record<string, { label: string; couleur: string; Icone: any; spin?: boolean }> = {
    initiated: { label: "Initié", couleur: "#6366f1", Icone: Loader2, spin: true },
    pending: { label: "En attente", couleur: "#f59e0b", Icone: Clock },
    success: { label: "Réussi", couleur: "#12a594", Icone: CheckCircle2 },
    failed: { label: "Échec", couleur: "#ef4444", Icone: XCircle },
    cancelled: { label: "Annulé", couleur: "#94a3b8", Icone: Ban },
    refunded: { label: "Remboursé", couleur: "#3b82f6", Icone: RotateCcw },
};

function EtiquetteStatut({ statut }: { statut: string }) {
    const s = STATUT[statut] || STATUT.failed;
    return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-semibold" style={{ background: `${s.couleur}1f`, color: s.couleur, border: `1px solid ${s.couleur}33` }}>
            <s.Icone className={`h-3.5 w-3.5 ${s.spin ? "animate-spin" : ""}`} />{s.label}
        </span>
    );
}

/** Le statut affiche d'une ligne de `getTransactions` : « Initié » tant que rien n'est parti chez l'opérateur. */
const statutDe = (tx: any) => (tx.status === "pending" && tx.initiated ? "initiated" : tx.status);

function iconeMethode(tx: any): string | null {
    if (tx.methodLogo) return tx.methodLogo;
    const op = String(tx.operator || "").toLowerCase();
    const pt = String(tx.paymentType || "").toLowerCase();
    if (op === "orange" || pt.includes("orange")) return "/icons/methods/orange_money.svg";
    if (op === "wave" || pt.includes("wave")) return "/icons/methods/wave.svg";
    if (op === "mtn" || pt.includes("mtn")) return "/icons/methods/momo.svg";
    if (op === "moov" || pt.includes("moov")) return "/icons/methods/moov_money.svg";
    if (op === "free" || pt.includes("free")) return "/icons/methods/freemoney_sn.svg";
    if (op === "tmoney" || pt.includes("tmoney")) return "/icons/methods/togocel.svg";
    return null;
}

function Methode({ tx }: { tx: any }) {
    const logo = iconeMethode(tx);
    const passerelle = typeof tx.gatewayDisplay === "string" ? tx.gatewayDisplay : tx.gatewayDisplay?.label;
    return (
        <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-white ring-1 ring-black/5">
                {logo ? <img src={logo} alt="" className="h-4 w-4 object-contain" /> : tx.method === "Mobile Money" ? <Smartphone className="h-3.5 w-3.5 text-blue-500" /> : <CreditCard className="h-3.5 w-3.5 text-purple-500" />}
            </span>
            <div className="min-w-0">
                <p className="truncate text-xs font-medium" style={{ color: "var(--dt-text-primary)" }}>{tx.method}</p>
                {passerelle && passerelle !== tx.method && <p className="truncate text-[11px]" style={{ color: "var(--dt-text-muted)" }}>{passerelle}</p>}
            </div>
        </div>
    );
}

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;
const chiffres = (tel?: string | null) => String(tel || "").replace(/\D/g, "");

export default function DetailLienPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const [detail, setDetail] = useState<any>(null);
    const [onglet, setOnglet] = useState<"paiements" | "clients">("paiements");
    const [statut, setStatut] = useState("ALL");
    const [statutClient, setStatutClient] = useState("TOUS");
    const [q, setQ] = useState("");
    const qDiffere = useDebounce(q, 400);
    const [dates, setDates] = useState<Dates>(DATES_TOUTES);
    const [page, setPage] = useState(1);
    const [paiements, setPaiements] = useState<any>(null);
    const [chargeTable, setChargeTable] = useState(false);
    const [fiche, setFiche] = useState<ClientDuLien | null>(null);
    const [copie, setCopie] = useState(false);
    const [qr, setQr] = useState<{ dataUrl: string; url: string } | null>(null);
    const [occupe, setOccupe] = useState("");

    const chargerDetail = useCallback(() => getPaymentLinkDetail(id).then((d) => setDetail(d || false)).catch(() => setDetail(false)), [id]);
    useEffect(() => { chargerDetail(); }, [chargerDetail]);

    const chargerPaiements = useCallback(async () => {
        setChargeTable(true);
        const b = bornes(dates);
        const r = await getTransactions({ paymentLinkId: id, page, pageSize: TAILLE_PAGE, search: qDiffere || undefined, status: statut === "ALL" ? undefined : statut, from: b.from, to: b.to });
        setPaiements(r); setChargeTable(false);
    }, [id, page, qDiffere, statut, dates]);
    useEffect(() => { chargerPaiements(); }, [chargerPaiements]);
    useEffect(() => { setPage(1); }, [qDiffere, statut, dates]);

    const lien = detail?.lien;
    const stats = detail?.stats;
    const clients: ClientDuLien[] = detail?.clients || [];
    const clientsVisibles = useMemo(() => {
        const s = q.trim().toLowerCase();
        return clients.filter((c) => (statutClient === "TOUS" || (statutClient === "PAYE") === c.aPaye) && (!s || [c.nom, c.email, c.telephone].some((v) => String(v || "").toLowerCase().includes(s))));
    }, [clients, q, statutClient]);

    function copier() {
        navigator.clipboard.writeText(lien.url).then(() => { setCopie(true); goeyToast.success("Lien copié"); setTimeout(() => setCopie(false), 1500); });
    }
    function whatsapp() {
        const prix = lien.amountFree ? "vous choisissez le montant" : fmtMontant(lien.amount, lien.currency);
        window.open(`https://wa.me/?text=${encodeURIComponent(`${lien.title} : ${prix}. Payez ici, par Mobile Money ou carte : ${lien.url}`)}`, "_blank", "noopener");
    }
    async function afficherQr() {
        const r = await qrPaymentLink(lien.slug);
        if (!r.success || !r.dataUrl) { goeyToast.error("QR code indisponible"); return; }
        setQr({ dataUrl: r.dataUrl, url: r.url });
    }
    async function basculer() {
        setOccupe("etat");
        const r = await setPaymentLinkStatus(lien.id, lien.status === "active" ? "inactive" : "active");
        setOccupe("");
        if (!r.success) { goeyToast.error(r.error || "Échec"); return; }
        goeyToast.success(lien.status === "active" ? "Lien mis en pause : la page n'accepte plus de paiement" : "Lien réactivé"); chargerDetail();
    }
    async function supprimer() {
        if (!window.confirm(`Supprimer le lien « ${lien.title} » ? La page ${lien.url} ne fonctionnera plus. Les paiements déjà reçus restent dans Transactions.`)) return;
        setOccupe("suppr");
        const r = await deletePaymentLink(lien.id);
        setOccupe("");
        if (!r.success) { goeyToast.error(r.error || "Échec"); return; }
        goeyToast.success("Lien supprimé"); router.push("/payment-links");
    }
    /** La fiche d'un client depuis une ligne de paiement : celle du lien si on la connait, sinon ce que dit le paiement. */
    function ouvrirClient(tx: any) {
        const email = String(tx.email || "").trim().toLowerCase();
        const c = clients.find((x) => x.email === email) || clients.find((x) => x.telephone && chiffres(x.telephone) === chiffres(tx.phone));
        setFiche(c || { nom: tx.customer || "Client", email, telephone: tx.phone || null, pays: tx.country ? { code: tx.country.code, nom: tx.country.name } : null, paiements: 1, reussis: tx.status === "success" ? 1 : 0, total: 0, devise: lien?.currency || "XOF", premier: new Date(), dernier: new Date(), aPaye: tx.status === "success", derniers: [] });
    }

    if (detail === null) return <div className="mx-auto max-w-7xl"><Squelette lignes={6} /></div>;
    if (detail === false) {
        return (
            <div className="mx-auto max-w-7xl">
                <Vide icone={Link2} titre="Lien introuvable" texte="Ce lien n'existe pas ou n'appartient pas à cet espace." action={<Link href="/payment-links"><Bouton icone={ArrowLeft}>Liens de paiement</Bouton></Link>} />
            </div>
        );
    }

    const e = ETAT[lien.statut] || ETAT.inactive;
    const devise = lien.currency || "XOF";
    const options = [
        { value: "ALL", label: "Tous les paiements", count: stats.paiements },
        { value: "SUCCESS", label: "Réussis", count: stats.reussis },
        { value: "PENDING", label: "En attente", count: stats.enAttente },
        { value: "FAILED", label: "Échoués", count: stats.echoues },
        ...(stats.rembourses > 0 ? [{ value: "REFUNDED", label: "Remboursés", count: stats.rembourses }] : []),
    ];
    const lignes: any[] = paiements?.transactions || [];
    const total: number = paiements?.pagination?.total || 0;
    const pages: number = paiements?.pagination?.totalPages || 0;

    return (
        <div className="mx-auto flex max-w-7xl flex-col gap-5 pb-24 md:pb-8">
            <Link href="/payment-links" className="inline-flex w-fit items-center gap-1.5 text-sm hover:underline" style={{ color: "var(--dt-text-muted)" }}><ArrowLeft className="h-4 w-4" /> Liens de paiement</Link>

            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                    {lien.images?.[0] && <img src={lien.images[0]} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" style={{ border: "1px solid var(--dt-border)" }} />}
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--dt-text-primary)" }}>{lien.title}</h1>
                            <Pastille label={e.label} couleur={e.couleur} />
                        </div>
                        <p className="mt-0.5 text-sm" style={{ color: "var(--dt-text-secondary)" }}>
                            {lien.amountFree ? `Montant libre${lien.amountMin ? `, minimum ${fmtMontant(lien.amountMin, devise)}` : ""}${lien.amountMax ? `, maximum ${fmtMontant(lien.amountMax, devise)}` : ""}` : fmtMontant(lien.amount, devise)}
                            {lien.allowQuantity ? ", quantité au choix" : ""}{lien.requestPhone ? ", numéro demandé" : ""}
                        </p>
                        <p className="mt-1 truncate font-mono text-[12px]" style={{ color: "var(--dt-text-muted)" }}>{lien.url.replace(/^https?:\/\//, "")}</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Bouton icone={copie ? Check : Copy} onClick={copier}>{copie ? "Copié" : "Copier le lien"}</Bouton>
                    <button type="button" onClick={whatsapp} title="Envoyer sur WhatsApp" className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "var(--dt-item-hover)", border: "1px solid var(--dt-border)" }}><img src="/logos/whatsapp.svg" alt="WhatsApp" className="h-4 w-4" /></button>
                    <button type="button" onClick={afficherQr} title="QR code" className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "var(--dt-item-hover)", border: "1px solid var(--dt-border)", color: "var(--dt-text-primary)" }}><QrCode className="h-4 w-4" /></button>
                    <a href={lien.url} target="_blank" rel="noopener noreferrer" title="Ouvrir la page" className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "var(--dt-item-hover)", border: "1px solid var(--dt-border)", color: "var(--dt-text-primary)" }}><ExternalLink className="h-4 w-4" /></a>
                    <Bouton variante="secondaire" icone={lien.status === "active" ? PauseCircle : PlayCircle} chargement={occupe === "etat"} onClick={basculer}>{lien.status === "active" ? "Mettre en pause" : "Réactiver"}</Bouton>
                    <Bouton variante="danger" icone={Trash2} chargement={occupe === "suppr"} onClick={supprimer}>Supprimer</Bouton>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                    { label: "Paiements reçus", valeur: String(stats.paiements), sous: stats.paiements ? `${pluriel(stats.reussis, "réussi")}, ${stats.taux} % de réussite` : "Aucun pour le moment", couleur: "#60a5fa" },
                    { label: "Encaissé", valeur: fmtMontant(stats.encaisse, devise), sous: stats.dernierReussi ? `Dernier le ${fmtDate(stats.dernierReussi)}` : "Aucun paiement réussi", couleur: "#12a594" },
                    { label: "Non aboutis", valeur: String(stats.enAttente + stats.echoues), sous: `${stats.enAttente} en attente, ${stats.echoues} échoué${stats.echoues > 1 ? "s" : ""}`, couleur: "#f59e0b" },
                    { label: "Clients", valeur: String(stats.clients), sous: `${stats.clientsPayeurs} ${stats.clientsPayeurs > 1 ? "ont" : "a"} payé`, couleur: "#a78bfa" },
                ].map((s) => (
                    <div key={s.label} className="rounded-xl p-4" style={{ background: "var(--dt-card-bg)", border: "1px solid var(--dt-border)" }}>
                        <p className="text-xs" style={{ color: "var(--dt-text-muted)" }}>{s.label}</p>
                        <p className="mt-1 text-xl font-semibold tabular-nums" style={{ color: "var(--dt-text-primary)" }}>{s.valeur}</p>
                        <p className="mt-0.5 text-[11px]" style={{ color: s.couleur }}>{s.sous}</p>
                    </div>
                ))}
            </div>

            {(lien.description || lien.expiresAt || lien.allowQuantity) && (
                <p className="text-xs leading-relaxed" style={{ color: "var(--dt-text-muted)" }}>
                    {lien.description ? `${lien.description} ` : ""}
                    Créé le {new Date(lien.createdAt).toLocaleDateString("fr-FR")}{lien.expiresAt ? `, expire le ${new Date(lien.expiresAt).toLocaleDateString("fr-FR")}` : ""}{lien.allowQuantity && stats.quantite > 0 ? `, ${pluriel(stats.quantite, "unité")} vendue${stats.quantite > 1 ? "s" : ""}` : ""}.
                </p>
            )}

            <Onglets<"paiements" | "clients"> items={[{ cle: "paiements", label: `Paiements (${stats.paiements})`, icone: CreditCard }, { cle: "clients", label: `Clients (${stats.clients})`, icone: Users }]} actif={onglet} onChange={setOnglet} />

            {onglet === "paiements" ? (
                <>
                    {stats.paiements > 0 && (
                        <BarreFiltres
                            statut={{ cle: "statut", valeur: statut, onChange: setStatut, options }}
                            recherche={{ valeur: q, onChange: setQ, placeholder: "Nom, e-mail, référence..." }}
                            dates={{ valeur: dates, onChange: setDates }}
                            total={paiements ? total : undefined}
                        />
                    )}
                    <Bloc>
                        {paiements === null ? <Squelette /> : lignes.length === 0 ? (
                            stats.paiements === 0
                                ? <Vide icone={CreditCard} titre="Aucun paiement par ce lien" texte="Partagez-le par WhatsApp, e-mail ou QR code : chaque paiement reçu apparaîtra ici, avec le client qui l'a fait." action={<Bouton icone={Copy} onClick={copier}>Copier le lien</Bouton>} />
                                : <Vide titre="Aucun paiement ne correspond" texte="Essayez un autre mot, un autre statut ou une autre période." />
                        ) : (
                            <div className={`min-w-0 overflow-x-auto ${chargeTable ? "opacity-60" : ""}`}>
                                <table className="w-full text-sm" style={{ minWidth: 760 }}>
                                    <thead><tr style={{ borderBottom: "1px solid var(--dt-border)" }}>{["Montant", "Statut", "Méthode", "Client", "Référence", "Date", ""].map((h) => <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--dt-text-muted)" }}>{h}</th>)}</tr></thead>
                                    <tbody>
                                        {lignes.map((tx) => (
                                            <tr key={tx.id} className="cursor-pointer transition-colors hover:bg-white/[0.03]" style={{ borderBottom: "1px solid var(--dt-divider)" }} onClick={() => router.push(`/transactions/${tx.id}`)}>
                                                <td className="px-3 py-2.5 whitespace-nowrap font-semibold tabular-nums" style={{ color: "var(--dt-text-primary)" }}>{tx.amount}</td>
                                                <td className="px-3 py-2.5"><EtiquetteStatut statut={statutDe(tx)} /></td>
                                                <td className="px-3 py-2.5"><Methode tx={tx} /></td>
                                                <td className="px-3 py-2.5" onClick={(ev) => { ev.stopPropagation(); ouvrirClient(tx); }} title="Voir la fiche du client">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="relative shrink-0">
                                                            <CustomerAvatar email={tx.email} name={tx.customer} size={28} />
                                                            {tx.country && <Tooltip title={tx.country.name}><span className="absolute -bottom-1 -right-1 leading-none"><Drapeau code={tx.country.code} taille={9} /></span></Tooltip>}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="truncate font-medium hover:underline" style={{ color: "var(--dt-text-primary)" }}>{tx.customer}</p>
                                                            <p className="truncate text-[11px]" style={{ color: "var(--dt-text-muted)" }}>{tx.email}{tx.phone ? ` · ${tx.phone}` : ""}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2.5 font-mono text-[11px]" style={{ color: "var(--dt-text-secondary)" }}>{tx.id}</td>
                                                <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--dt-text-muted)" }}>{tx.date}</td>
                                                <td className="px-3 py-2.5 text-right"><Eye className="ml-auto h-4 w-4" style={{ color: "var(--dt-text-muted)" }} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {pages > 1 && (
                            <div className="mt-3 flex items-center justify-between text-xs" style={{ color: "var(--dt-text-muted)" }}>
                                <span>{(page - 1) * TAILLE_PAGE + 1}-{Math.min(page * TAILLE_PAGE, total)} sur {total}</span>
                                <div className="flex items-center gap-1">
                                    <Bouton variante="secondaire" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="!h-8 !px-2"><ChevronLeft className="h-4 w-4" /></Bouton>
                                    <span className="px-2">{page} / {pages}</span>
                                    <Bouton variante="secondaire" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="!h-8 !px-2"><ChevronRight className="h-4 w-4" /></Bouton>
                                </div>
                            </div>
                        )}
                    </Bloc>
                </>
            ) : (
                <>
                    {clients.length > 0 && (
                        <BarreFiltres
                            statut={{ cle: "client", valeur: statutClient, onChange: setStatutClient, options: [{ value: "TOUS", label: "Tous les clients", count: clients.length }, { value: "PAYE", label: "Ont payé", count: stats.clientsPayeurs }, { value: "JAMAIS", label: "N'ont pas abouti", count: clients.length - stats.clientsPayeurs }] }}
                            recherche={{ valeur: q, onChange: setQ, placeholder: "Nom, e-mail, téléphone..." }}
                            total={clientsVisibles.length}
                        />
                    )}
                    <Bloc>
                        {clients.length === 0 ? (
                            <Vide icone={Users} titre="Aucun client par ce lien" texte="Chaque personne qui ouvre ce lien et renseigne ses coordonnées apparaît ici, qu'elle ait payé ou non." />
                        ) : clientsVisibles.length === 0 ? (
                            <Vide titre="Aucun client ne correspond" texte="Essayez un autre mot ou un autre statut." />
                        ) : (
                            <div className="min-w-0 overflow-x-auto">
                                <table className="w-full text-sm" style={{ minWidth: 720 }}>
                                    <thead><tr style={{ borderBottom: "1px solid var(--dt-border)" }}>{["Client", "Contact", "Pays", "Paiements", "Total payé", "Dernier paiement", ""].map((h) => <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--dt-text-muted)" }}>{h}</th>)}</tr></thead>
                                    <tbody>
                                        {clientsVisibles.map((c) => (
                                            <tr key={c.email || c.telephone || c.nom} className="cursor-pointer transition-colors hover:bg-white/[0.03]" style={{ borderBottom: "1px solid var(--dt-divider)" }} onClick={() => setFiche(c)}>
                                                <td className="px-3 py-2.5"><div className="flex items-center gap-2.5"><CustomerAvatar email={c.email} name={c.nom} size={28} /><p className="truncate font-medium" style={{ color: "var(--dt-text-primary)" }}>{c.nom}</p></div></td>
                                                <td className="px-3 py-2.5 text-xs" style={{ color: "var(--dt-text-secondary)" }}>{c.email}{c.telephone ? <span className="block" style={{ color: "var(--dt-text-muted)" }}>{c.telephone}</span> : null}</td>
                                                <td className="px-3 py-2.5 text-xs" style={{ color: "var(--dt-text-secondary)" }}>{c.pays ? <span className="inline-flex items-center gap-1.5"><Drapeau code={c.pays.code} taille={12} />{c.pays.nom}</span> : "?"}</td>
                                                <td className="px-3 py-2.5 tabular-nums" style={{ color: "var(--dt-text-primary)" }}>{c.paiements}<span className="text-[11px]" style={{ color: "var(--dt-text-muted)" }}> dont {c.reussis} réussi{c.reussis > 1 ? "s" : ""}</span></td>
                                                <td className="px-3 py-2.5 tabular-nums font-medium" style={{ color: "var(--dt-text-primary)" }}>{fmtMontant(c.total, c.devise)}</td>
                                                <td className="px-3 py-2.5 text-xs" style={{ color: "var(--dt-text-muted)" }}>{fmtDate(c.dernier)}</td>
                                                <td className="px-3 py-2.5"><Pastille label={c.aPaye ? "A payé" : "Jamais abouti"} couleur={c.aPaye ? "#12a594" : "#94a3b8"} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Bloc>
                </>
            )}

            <Drawer open={!!fiche} onClose={() => setFiche(null)} title={fiche?.nom} width={420} destroyOnHidden>
                {fiche && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3"><CustomerAvatar email={fiche.email} name={fiche.nom} size={44} /><div><p className="font-semibold">{fiche.nom}</p><Pastille label={fiche.aPaye ? "A payé par ce lien" : "N'a pas abouti"} couleur={fiche.aPaye ? "#12a594" : "#94a3b8"} /></div></div>
                        <div className="space-y-2 text-sm">
                            {fiche.email && <p className="flex items-center gap-2"><Mail className="h-4 w-4 opacity-60" /> <a href={`mailto:${fiche.email}`} className="hover:underline">{fiche.email}</a></p>}
                            {fiche.telephone && <p className="flex items-center gap-2"><Phone className="h-4 w-4 opacity-60" /> <a href={`tel:${fiche.telephone}`} className="hover:underline">{fiche.telephone}</a></p>}
                            <p className="flex items-center gap-2"><MapPin className="h-4 w-4 opacity-60" /> {fiche.pays ? <span className="inline-flex items-center gap-1.5"><Drapeau code={fiche.pays.code} taille={12} />{fiche.pays.nom}</span> : "Pays inconnu"}</p>
                            <p className="flex items-center gap-2"><CreditCard className="h-4 w-4 opacity-60" /> Sur ce lien : {pluriel(fiche.paiements, "paiement")}, {fiche.reussis} réussi{fiche.reussis > 1 ? "s" : ""}, {fmtMontant(fiche.total, fiche.devise)} payés</p>
                        </div>
                        {fiche.derniers.length > 0 && (
                            <div>
                                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--dt-text-muted)" }}>Ses derniers paiements par ce lien</p>
                                <div className="divide-y rounded-lg" style={{ border: "1px solid var(--dt-border)", borderColor: "var(--dt-border)" }}>
                                    {fiche.derniers.map((p) => (
                                        <Link key={p.id} href={`/transactions/${p.id}`} className="flex items-center justify-between gap-2 px-3 py-2 text-xs transition-colors hover:bg-white/[0.03]" style={{ borderColor: "var(--dt-divider)" }}>
                                            <span className="flex items-center gap-2"><EtiquetteStatut statut={String(p.status).toLowerCase()} /><span style={{ color: "var(--dt-text-muted)" }}>{fmtDate(p.createdAt)}</span></span>
                                            <span className="flex items-center gap-1.5 font-medium tabular-nums" style={{ color: "var(--dt-text-primary)" }}>{fmtMontant(p.amount, p.currency)}{p.quantite > 1 ? <span className="text-[11px] font-normal" style={{ color: "var(--dt-text-muted)" }}>× {p.quantite}</span> : null}<ArrowRight className="h-3.5 w-3.5 opacity-50" /></span>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className="flex flex-col gap-2">
                            {fiche.telephone && <a href={`https://wa.me/${chiffres(fiche.telephone)}?text=${encodeURIComponent(`Bonjour ${fiche.nom},`)}`} target="_blank" rel="noopener noreferrer"><Bouton variante="secondaire" icone={MessageCircle} className="w-full">Lui écrire sur WhatsApp</Bouton></a>}
                            {fiche.email && <Link href={`/transactions?q=${encodeURIComponent(fiche.email)}`}><Bouton variante="secondaire" icone={ArrowRight} className="w-full">Tous ses paiements, tous liens confondus</Bouton></Link>}
                            {fiche.email && <Link href={`/customers?q=${encodeURIComponent(fiche.email)}`}><Bouton icone={Users} className="w-full">Sa fiche dans le répertoire</Bouton></Link>}
                        </div>
                        <Aide>Première visite par ce lien le {fmtDate(fiche.premier)}, dernière le {fmtDate(fiche.dernier)}.</Aide>
                    </div>
                )}
            </Drawer>

            <Modal open={!!qr} onCancel={() => setQr(null)} footer={null} title={`QR code : ${lien.title}`} destroyOnHidden>
                {qr && (
                    <div className="flex flex-col items-center gap-3 pt-2">
                        <img src={qr.dataUrl} alt="QR code" className="h-64 w-64 rounded-lg bg-white p-2" />
                        <p className="text-center text-xs" style={{ color: "var(--dt-text-muted)" }}>Le client scanne, arrive sur {qr.url.replace(/^https?:\/\//, "")} et paie.</p>
                        <a href={qr.dataUrl} download={`qr-${lien.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`}><Bouton icone={Download}>Télécharger (PNG)</Bouton></a>
                    </div>
                )}
            </Modal>
        </div>
    );
}
