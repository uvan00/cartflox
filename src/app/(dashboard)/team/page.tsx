"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "antd";
import { Users2, UserPlus, Trash2, Mail, ScrollText } from "lucide-react";
import { goeyToast } from "goey-toast";
import { getTeamMembers, inviteTeamMember, removeTeamMember, getAuditLogs } from "@/lib/actions/team";
import { Page, Bloc, Bouton, Champ, Entree, Choix, Pastille, Vide, Squelette, Aide, fmtDate } from "@/components/dashboard/kit";
import { BarreFiltres, filtrerLocal } from "@/components/dashboard/barre-filtres";

/**
 * Equipe : qui a acces a cet espace, avec quel role, et ce qui s'y passe.
 */
const PERMISSIONS = [
    { value: "Super Admin", label: "Administrateur", aide: "Tout, y compris les clés API et l'équipe" },
    { value: "Manager", label: "Gestionnaire", aide: "Paiements, clients, liens, relances" },
    { value: "Consultant", label: "Lecture seule", aide: "Consulte sans rien modifier" },
    { value: "Support", label: "Support", aide: "Clients et transactions, sans les réglages" },
];
const COULEUR: Record<string, string> = { "Super Admin": "#a78bfa", Manager: "#60a5fa", Consultant: "#94a3b8", Support: "#f59e0b" };

export default function EquipePage() {
    const [membres, setMembres] = useState<any[] | null>(null);
    const [journal, setJournal] = useState<any[]>([]);
    const [q, setQ] = useState("");
    const [perm, setPerm] = useState("TOUS");
    const [ouvert, setOuvert] = useState(false);
    const [occupe, setOccupe] = useState("");
    const [form, setForm] = useState({ name: "", email: "", role: "", permission: "Manager" });

    const charger = () => { getTeamMembers().then((m) => setMembres(m || [])).catch(() => setMembres([])); getAuditLogs().then((l) => setJournal(l || [])).catch(() => { }); };
    useEffect(charger, []);

    const visibles = useMemo(() => filtrerLocal(membres || [], { recherche: q, champs: (m) => [m.name, m.email, m.role, m.permission] }).filter((m) => perm === "TOUS" || m.permission === perm), [membres, q, perm]);

    async function inviter() {
        if (!form.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { goeyToast.error("Nom et e-mail valides requis."); return; }
        setOccupe("invite");
        const r = await inviteTeamMember({ name: form.name.trim(), email: form.email.trim().toLowerCase(), role: form.role.trim() || "Membre", permission: form.permission });
        setOccupe("");
        if (!r?.success) { goeyToast.error(r?.error || "Invitation impossible"); return; }
        goeyToast.success(`Invitation envoyée à ${form.email}`); setOuvert(false); setForm({ name: "", email: "", role: "", permission: "Manager" }); charger();
    }
    async function retirer(m: any) {
        if (!window.confirm(`Retirer ${m.name} de l'équipe ? Cette personne n'aura plus accès à cet espace.`)) return;
        setOccupe(m.id);
        const r = await removeTeamMember(m.id);
        setOccupe("");
        if (!r?.success) { goeyToast.error(r?.error || "Échec"); return; }
        goeyToast.success("Accès retiré"); charger();
    }

    return (
        <Page titre="Équipe" sousTitre="Les personnes qui ont accès à cet espace, et ce qu'elles y font. Chaque invité reçoit un e-mail pour se connecter." large
            action={<Bouton icone={UserPlus} onClick={() => setOuvert(true)}>Inviter un collaborateur</Bouton>}>
            <BarreFiltres
                statut={{ cle: "perm", valeur: perm, onChange: setPerm, options: [{ value: "TOUS", label: "Tous les rôles", count: membres?.length }, ...PERMISSIONS.map((p) => ({ value: p.value, label: p.label, count: (membres || []).filter((m) => m.permission === p.value).length }))] }}
                recherche={{ valeur: q, onChange: setQ, placeholder: "Rechercher (nom, e-mail, poste)..." }}
                total={membres ? visibles.length : undefined}
            />
            {membres === null ? <Squelette /> : visibles.length === 0 ? (
                <Vide icone={Users2} titre={membres.length === 0 ? "Vous êtes seul sur cet espace" : "Aucun membre ne correspond"} texte={membres.length === 0 ? "Invitez un collaborateur : il reçoit un e-mail et accède à l'espace avec le rôle que vous choisissez." : undefined}
                    action={membres.length === 0 ? <Bouton icone={UserPlus} onClick={() => setOuvert(true)}>Inviter</Bouton> : undefined} />
            ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {visibles.map((m) => (
                        <div key={m.id} className="flex items-start gap-3 rounded-xl p-4" style={{ background: "var(--dt-card-bg)", border: "1px solid var(--dt-border)" }}>
                            <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full" style={{ background: "var(--dt-item-hover)" }}>
                                {m.avatar ? <img src={m.avatar} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center font-semibold" style={{ color: "var(--dt-text-muted)" }}>{(m.name || "?").charAt(0)}</span>}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="truncate text-sm font-semibold" style={{ color: "var(--dt-text-primary)" }}>{m.name}</p>
                                    <button type="button" onClick={() => retirer(m)} disabled={occupe === m.id} className="rounded p-1.5 opacity-60 hover:opacity-100" style={{ color: "#f87171" }} aria-label="Retirer"><Trash2 className="h-3.5 w-3.5" /></button>
                                </div>
                                <p className="truncate text-xs" style={{ color: "var(--dt-text-muted)" }}>{m.email}</p>
                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                    <Pastille label={PERMISSIONS.find((p) => p.value === m.permission)?.label || m.permission} couleur={COULEUR[m.permission] || "#94a3b8"} />
                                    {m.role && <span className="text-[11px]" style={{ color: "var(--dt-text-muted)" }}>{m.role}</span>}
                                </div>
                                <p className="mt-1.5 text-[11px]" style={{ color: "var(--dt-text-muted)" }}>Invité le {fmtDate(m.createdAt)}{m.lastActive && m.lastActive !== "Jamais" ? ` · vu ${m.lastActive}` : ""}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Bloc titre={<span className="flex items-center gap-2"><ScrollText className="h-4 w-4" /> Activité récente</span>} sousTitre="Les 20 dernières actions sur cet espace.">
                {journal.length === 0 ? <p className="text-sm" style={{ color: "var(--dt-text-muted)" }}>Rien pour le moment.</p> : (
                    <div className="divide-y" style={{ borderColor: "var(--dt-divider)" }}>
                        {journal.map((l) => (
                            <div key={l.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                                <span style={{ color: "var(--dt-text-primary)" }}>{l.action}</span>
                                <span className="text-xs" style={{ color: "var(--dt-text-muted)" }}>{l.actorName} · {fmtDate(l.createdAt)}</span>
                            </div>
                        ))}
                    </div>
                )}
            </Bloc>

            <Modal open={ouvert} onCancel={() => setOuvert(false)} footer={null} title="Inviter un collaborateur" destroyOnHidden>
                <div className="space-y-4 pt-2">
                    <Champ label="Nom complet"><Entree value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex. Awa Koné" /></Champ>
                    <Champ label="E-mail" aide="L'invitation part à cette adresse."><Entree type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="awa@entreprise.com" /></Champ>
                    <Champ label="Poste (facultatif)"><Entree value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Ex. Comptable, Support client" /></Champ>
                    <Champ label="Rôle" aide={PERMISSIONS.find((p) => p.value === form.permission)?.aide}>
                        <Choix value={form.permission} onChange={(v) => setForm({ ...form, permission: v })} options={PERMISSIONS.map((p) => ({ value: p.value, label: p.label }))} className="w-full" />
                    </Champ>
                    <Aide>La personne se connecte avec son propre compte Cartflox (créé à la première invitation). Vous pouvez retirer l&apos;accès à tout moment.</Aide>
                    <div className="flex justify-end gap-2"><Bouton variante="discret" onClick={() => setOuvert(false)}>Annuler</Bouton><Bouton icone={Mail} chargement={occupe === "invite"} onClick={inviter}>Envoyer l&apos;invitation</Bouton></div>
                </div>
            </Modal>
        </Page>
    );
}
