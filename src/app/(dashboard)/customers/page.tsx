"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Drawer, Modal } from "antd";
import { Users, UserPlus, Download, Mail, Phone, MapPin, CreditCard, ArrowRight, ChevronLeft, ChevronRight, Link2 } from "lucide-react";
import { goeyToast } from "goey-toast";
import { getCustomers, getCustomerStats, createCustomer, exportCustomersAction } from "@/lib/actions/customers";
import { useDebounce } from "@/hooks/use-debounce";
import { COUNTRIES, PRIORITY_COUNTRY_CODES } from "@/lib/countries";
import CustomerAvatar from "@/components/dashboard/customer-avatar";
import { Page, Bloc, Bouton, Champ, Entree, Choix, Pastille, Vide, Squelette, Aide } from "@/components/dashboard/kit";
import { BarreFiltres } from "@/components/dashboard/barre-filtres";
import { Drapeau } from "@/components/ui/drapeau";

/**
 * Repertoire : toutes les personnes qui ont paye (ou tente de payer) chez le
 * marchand, remplies automatiquement a chaque transaction. Les filtres
 * (statut, pays, recherche) s'appliquent cote serveur, sur tout le fichier.
 */
const TAILLE_PAGE = 25;
const PAYS = [...COUNTRIES].sort((a, b) => (PRIORITY_COUNTRY_CODES.indexOf(a.code) + 1 || 999) - (PRIORITY_COUNTRY_CODES.indexOf(b.code) + 1 || 999) || a.name.localeCompare(b.name, "fr"));
const nombre = (s: any) => parseInt(String(s ?? "0").replace(/\D/g, ""), 10) || 0;

export default function RepertoirePage() {
    const [stats, setStats] = useState<any>(null);
    const [data, setData] = useState<any>(null);
    const [chargeTable, setChargeTable] = useState(false);
    const [q, setQ] = useState("");
    const [statut, setStatut] = useState("TOUS");
    const [pays, setPays] = useState("TOUS");
    const [page, setPage] = useState(1);
    const [fiche, setFiche] = useState<any>(null);
    const [ouvert, setOuvert] = useState(false);
    const [occupe, setOccupe] = useState("");
    const [form, setForm] = useState({ name: "", email: "", phone: "", country: "CI" });
    const qDiffere = useDebounce(q, 400);

    useEffect(() => { const s = new URLSearchParams(window.location.search).get("q"); if (s) setQ(s); }, []);
    const chargerStats = useCallback(() => getCustomerStats().then(setStats).catch(() => { }), []);
    useEffect(() => { chargerStats(); }, [chargerStats]);

    const charger = useCallback(async () => {
        setChargeTable(true);
        const r = await getCustomers({ page, pageSize: TAILLE_PAGE, search: qDiffere, status: statut === "TOUS" ? undefined : statut, country: pays === "TOUS" ? undefined : pays });
        setData(r); setChargeTable(false);
    }, [page, qDiffere, statut, pays]);
    useEffect(() => { charger(); }, [charger]);
    useEffect(() => { setPage(1); }, [qDiffere, statut, pays]);

    const lignes: any[] = data?.customers || [];
    const totalClients = nombre(stats?.totalCustomers);
    const payeurs = nombre(stats?.activeCustomers);

    async function creer() {
        if (!form.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { goeyToast.error("Nom et e-mail valides requis."); return; }
        const p = PAYS.find((x) => x.code === form.country);
        const tel = form.phone.replace(/\s+/g, "");
        setOccupe("creer");
        const r = await createCustomer({ name: form.name.trim(), email: form.email.trim().toLowerCase(), phone: tel ? (tel.startsWith("+") ? tel : `${p?.dial || ""}${tel}`) : undefined, country: p?.name });
        setOccupe("");
        if (!r.success) { goeyToast.error(r.error || "Création impossible"); return; }
        goeyToast.success("Client ajouté"); setOuvert(false); setForm({ name: "", email: "", phone: "", country: "CI" }); charger(); chargerStats();
    }
    async function exporter() {
        setOccupe("export");
        const r = await exportCustomersAction();
        setOccupe("");
        if (!r.success || !r.csvContent) { goeyToast.error(r.error || "Export impossible"); return; }
        const url = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff) + r.csvContent], { type: "text/csv;charset=utf-8" }));
        const a = document.createElement("a"); a.href = url; a.download = `clients-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
    }

    const total = data?.pagination?.total || 0;
    const pages = data?.pagination?.totalPages || 1;
    const filtre = q || statut !== "TOUS" || pays !== "TOUS";

    return (
        <Page titre="Répertoire" sousTitre="Toutes les personnes qui ont payé ou tenté de payer chez vous. La liste se remplit toute seule à chaque paiement." large
            action={<div className="flex gap-2"><Bouton variante="secondaire" icone={Download} chargement={occupe === "export"} onClick={exporter}>Exporter (CSV)</Bouton><Bouton icone={UserPlus} onClick={() => setOuvert(true)}>Ajouter un client</Bouton></div>}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                {[
                    { label: "Clients", valeur: stats?.totalCustomers, sous: stats?.customersThisMonth, couleur: "#60a5fa" },
                    { label: "Ont déjà payé", valeur: stats?.activeCustomers, sous: stats?.retentionRate, couleur: "#12a594" },
                    { label: "Nouveaux (24 h)", valeur: stats?.newCustomers24h, sous: "depuis hier", couleur: "#a78bfa" },
                    { label: "Panier moyen", valeur: stats?.avgBasket, sous: "par paiement réussi", couleur: "#f59e0b" },
                ].map((s) => (
                    <div key={s.label} className="rounded-xl p-4" style={{ background: "var(--dt-card-bg)", border: "1px solid var(--dt-border)" }}>
                        <p className="text-xs" style={{ color: "var(--dt-text-muted)" }}>{s.label}</p>
                        <p className="mt-1 text-xl font-semibold tabular-nums" style={{ color: "var(--dt-text-primary)" }}>{stats ? s.valeur : "…"}</p>
                        <p className="mt-0.5 text-[11px]" style={{ color: s.couleur }}>{stats ? s.sous : ""}</p>
                    </div>
                ))}
            </div>

            <BarreFiltres
                statut={{ cle: "s", valeur: statut, onChange: setStatut, options: [{ value: "TOUS", label: "Tous", count: stats ? totalClients : undefined }, { value: "active", label: "Ont payé", count: stats ? payeurs : undefined }, { value: "inactive", label: "Jamais payé", count: stats ? Math.max(totalClients - payeurs, 0) : undefined }] }}
                recherche={{ valeur: q, onChange: setQ, placeholder: "Rechercher (nom, e-mail, téléphone)..." }}
                selections={[{ cle: "pays", valeur: pays, onChange: setPays, recherche: true, options: [{ value: "TOUS", label: "Tous pays" }, ...PAYS.map((p) => ({ value: p.name, texte: p.name, label: <span className="inline-flex items-center gap-2"><Drapeau code={p.code} taille={12} />{p.name}</span> }))] }]}
                total={data ? total : undefined}
            />

            <Bloc>
                {data === null ? <Squelette /> : lignes.length === 0 ? (
                    <Vide icone={Users} titre={!filtre ? "Aucun client pour le moment" : "Aucun client ne correspond"} texte={!filtre ? "Dès qu'un client paie (lien de paiement, votre site, WooCommerce), il apparaît ici avec son historique." : "Essayez un autre mot, un autre pays ou un autre statut."}
                        action={!filtre ? <Link href="/payment-links/new"><Bouton icone={Link2}>Créer un lien de paiement</Bouton></Link> : undefined} />
                ) : (
                    <div className={`min-w-0 overflow-x-auto ${chargeTable ? "opacity-60" : ""}`}>
                        <table className="w-full text-sm" style={{ minWidth: 720 }}>
                            <thead><tr style={{ borderBottom: "1px solid var(--dt-border)" }}>{["Client", "Contact", "Pays", "Paiements", "Total payé", "Dernière activité", ""].map((h) => <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--dt-text-muted)" }}>{h}</th>)}</tr></thead>
                            <tbody>
                                {lignes.map((c) => (
                                    <tr key={c.id + c.email} className="cursor-pointer transition-colors hover:bg-white/[0.03]" style={{ borderBottom: "1px solid var(--dt-divider)" }} onClick={() => setFiche(c)}>
                                        <td className="px-3 py-2.5"><div className="flex items-center gap-2.5"><CustomerAvatar email={c.email} name={c.name} size={28} /><div className="min-w-0"><p className="truncate font-medium" style={{ color: "var(--dt-text-primary)" }}>{c.name}</p><p className="text-[11px]" style={{ color: "var(--dt-text-muted)" }}>{c.id}</p></div></div></td>
                                        <td className="px-3 py-2.5 text-xs" style={{ color: "var(--dt-text-secondary)" }}>{c.email}{c.phone && c.phone !== "N/A" ? <span className="block" style={{ color: "var(--dt-text-muted)" }}>{c.phone}</span> : null}</td>
                                        <td className="px-3 py-2.5 text-xs" style={{ color: "var(--dt-text-secondary)" }}>{c.country}</td>
                                        <td className="px-3 py-2.5 tabular-nums" style={{ color: "var(--dt-text-primary)" }}>{c.transactions}</td>
                                        <td className="px-3 py-2.5 tabular-nums font-medium" style={{ color: "var(--dt-text-primary)" }}>{c.totalSpent}</td>
                                        <td className="px-3 py-2.5 text-xs" style={{ color: "var(--dt-text-muted)" }}>{c.lastActive}</td>
                                        <td className="px-3 py-2.5"><Pastille label={c.status === "active" ? "A payé" : "Jamais payé"} couleur={c.status === "active" ? "#12a594" : "#94a3b8"} /></td>
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

            <Drawer open={!!fiche} onClose={() => setFiche(null)} title={fiche?.name} width={400} destroyOnHidden>
                {fiche && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3"><CustomerAvatar email={fiche.email} name={fiche.name} size={44} /><div><p className="font-semibold">{fiche.name}</p><Pastille label={fiche.status === "active" ? "A payé" : "Jamais payé"} couleur={fiche.status === "active" ? "#12a594" : "#94a3b8"} /></div></div>
                        <div className="space-y-2 text-sm">
                            <p className="flex items-center gap-2"><Mail className="h-4 w-4 opacity-60" /> {fiche.email}</p>
                            {fiche.phone && fiche.phone !== "N/A" && <p className="flex items-center gap-2"><Phone className="h-4 w-4 opacity-60" /> {fiche.phone}</p>}
                            <p className="flex items-center gap-2"><MapPin className="h-4 w-4 opacity-60" /> {fiche.country}</p>
                            <p className="flex items-center gap-2"><CreditCard className="h-4 w-4 opacity-60" /> {fiche.transactions} paiement{fiche.transactions > 1 ? "s" : ""}, {fiche.totalSpent} au total</p>
                        </div>
                        <div className="flex flex-col gap-2">
                            <Link href={`/transactions?q=${encodeURIComponent(fiche.email)}`}><Bouton variante="secondaire" icone={ArrowRight} className="w-full">Voir ses paiements</Bouton></Link>
                            <Link href="/payment-links/new"><Bouton icone={Link2} className="w-full">Lui envoyer un lien de paiement</Bouton></Link>
                        </div>
                        <Aide>Dernière activité : {fiche.lastActive}. Les rappels aux paiements non terminés se règlent dans <Link href="/whatsapp-relance" className="underline">Relance WhatsApp</Link>.</Aide>
                    </div>
                )}
            </Drawer>

            <Modal open={ouvert} onCancel={() => setOuvert(false)} footer={null} title="Ajouter un client" destroyOnHidden>
                <div className="space-y-4 pt-2">
                    <Champ label="Nom complet"><Entree value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex. Awa Koné" /></Champ>
                    <Champ label="E-mail"><Entree type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="awa@exemple.com" /></Champ>
                    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2">
                        <Champ label="Pays"><Choix value={form.country} onChange={(v) => setForm({ ...form, country: v })} options={PAYS.map((p) => ({ value: p.code, label: p.name }))} className="w-full" /></Champ>
                        <Champ label="Téléphone (facultatif)" aide={`Indicatif ${PAYS.find((p) => p.code === form.country)?.dial || ""} ajouté automatiquement`}><Entree value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="07 00 00 00 00" inputMode="tel" /></Champ>
                    </div>
                    <div className="flex justify-end gap-2"><Bouton variante="discret" onClick={() => setOuvert(false)}>Annuler</Bouton><Bouton icone={UserPlus} chargement={occupe === "creer"} onClick={creer}>Ajouter</Bouton></div>
                </div>
            </Modal>
        </Page>
    );
}
