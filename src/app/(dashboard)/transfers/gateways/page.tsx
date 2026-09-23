"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, ExternalLink } from "lucide-react";
import { goeyToast } from "goey-toast";
import { passerellesPourTransferts, basculerPasserelleTransferts } from "@/lib/actions/transferts";
import { Page, Bloc, Bouton, Pastille, Aide, Vide, Squelette, Interrupteur, carte } from "@/components/dashboard/kit";
import { fournisseurAffiche, NOMS_PAYS } from "@/components/dashboard/passerelles/catalogue";

/**
 * Passerelles de transfert : les memes que pour encaisser, puisque c'est le
 * portefeuille de l'agregateur qui envoie l'argent. Ici le marchand voit
 * lesquelles savent envoyer, ce qui leur manque, et coupe celles qu'il ne veut
 * pas voir servir aux transferts.
 */
type Donnees = Awaited<ReturnType<typeof passerellesPourTransferts>>;

function Logo({ src }: { src: string | null }) {
    if (!src) return null;
    return <img src={src} alt="" width={28} height={28} style={{ width: 28, height: 28, objectFit: "contain", borderRadius: 6, flexShrink: 0 }} />;
}

export default function PasserellesTransfertPage() {
    const [d, setD] = useState<Donnees | null | undefined>(undefined);
    const [occupe, setOccupe] = useState<string | null>(null);

    const charger = useCallback(() => { passerellesPourTransferts().then(setD).catch(() => setD(null)); }, []);
    useEffect(() => { charger(); }, [charger]);

    const basculer = async (id: string, actif: boolean) => {
        setOccupe(id);
        try {
            const r = await basculerPasserelleTransferts(id, actif);
            if (!r.ok) { goeyToast.error(r.message || "Échec"); return; }
            goeyToast.success(actif ? "Cette passerelle peut servir aux transferts" : "Cette passerelle ne servira plus aux transferts");
            charger();
        } finally { setOccupe(null); }
    };

    return (
        <Page titre="Passerelles de transfert" sousTitre="Les mêmes passerelles que pour encaisser : c'est le portefeuille de votre agrégateur qui envoie l'argent, avec les clés que vous avez déjà saisies. Vous voyez ici lesquelles savent le faire, et vous choisissez celles que Cartflox peut utiliser." large>
            {d === undefined ? <Squelette lignes={3} /> : d === null ? (
                <Aide ton="attention">Impossible de charger vos passerelles pour le moment.</Aide>
            ) : d.managed ? (
                <Bloc titre="Passerelles gérées par Cartflox" sousTitre="Sur un espace Connect, vos transferts partent des passerelles de Cartflox, depuis votre solde.">
                    {d.passerelles.filter((p) => p.saitEnvoyer).length === 0 ? <Vide titre="Aucune passerelle d'envoi pour le moment" texte="Cartflox n'a pas encore ouvert de passerelle capable d'envoyer de l'argent." /> : (
                        <div className="grid grid-cols-1 gap-3">
                            {d.passerelles.filter((p) => p.saitEnvoyer).map((p) => (
                                <div key={p.id} className="flex items-center gap-3 rounded-xl p-4" style={carte}>
                                    <Logo src={fournisseurAffiche(p.fournisseurCle || p.nom).logo} />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium" style={{ color: "var(--dt-text-primary)" }}>{p.nom}</p>
                                        <p className="text-[12px]" style={{ color: "var(--dt-text-muted)" }}>{p.pays.map((c) => NOMS_PAYS[c] || c).join(", ")}</p>
                                    </div>
                                    <Pastille label="Prête" couleur="#12a594" />
                                </div>
                            ))}
                        </div>
                    )}
                </Bloc>
            ) : (
                <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm" style={{ color: "var(--dt-text-muted)" }}>PawaPay, PayDunya, Hub2, Notch Pay, Monetbil, Flutterwave, Paystack, FedaPay et FeexPay savent envoyer de l'argent.</p>
                        <Link href="/gateways"><Bouton icone={Plus}>Ajouter ou modifier une passerelle</Bouton></Link>
                    </div>
                    {d.passerelles.length === 0 ? (
                        <Vide titre="Aucune passerelle" texte="Ajoutez une passerelle dans Encaissement : ses clés servent aussi aux transferts." />
                    ) : (
                        <div className="grid grid-cols-1 gap-3">
                            {d.passerelles.map((p) => {
                                const enPause = p.statut !== "active";
                                const etat = !p.saitEnvoyer ? { label: "Encaissement seulement", couleur: "#94a3b8" }
                                    : enPause ? { label: "Passerelle en pause", couleur: "#94a3b8" }
                                    : p.manquants.length ? { label: "Clés à compléter", couleur: "#f59e0b" }
                                    : p.actif ? { label: "Prête", couleur: "#12a594" } : { label: "Coupée pour les transferts", couleur: "#94a3b8" };
                                return (
                                    <div key={p.id} className="rounded-2xl p-4 md:p-5" style={carte}>
                                        <div className="flex flex-wrap items-center gap-3">
                                            <Logo src={fournisseurAffiche(p.fournisseurCle || p.nom).logo} />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium" style={{ color: "var(--dt-text-primary)" }}>{p.nom}{p.modeTest ? <span className="ml-2 text-[11px] font-normal" style={{ color: "var(--dt-text-muted)" }}>bac à sable</span> : null}</p>
                                                <p className="text-[12px]" style={{ color: "var(--dt-text-muted)" }}>
                                                    {p.saitEnvoyer ? `Envois possibles vers ${p.pays.length} pays : ${p.pays.map((c) => NOMS_PAYS[c] || c).join(", ")}` : "Ce fournisseur ne propose pas d'envoi d'argent vers un tiers"}
                                                </p>
                                            </div>
                                            <Pastille label={etat.label} couleur={etat.couleur} />
                                            {p.saitEnvoyer && <Interrupteur actif={p.actif} onChange={(v) => basculer(p.id, v)} disabled={enPause || occupe === p.id} />}
                                        </div>
                                        {p.saitEnvoyer && p.manquants.length > 0 && (
                                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-[12.5px]" style={{ background: "var(--dt-item-hover)", color: "var(--dt-text-secondary)" }}>
                                                <span>Il manque : {p.manquants.join(", ")}.</span>
                                                <Link href="/gateways" className="inline-flex items-center gap-1 font-medium underline underline-offset-2" style={{ color: "var(--dt-text-primary)" }}>Compléter les clés <ExternalLink className="h-3 w-3" /></Link>
                                            </div>
                                        )}
                                        {p.saitEnvoyer && p.avertissement && <p className="mt-3 text-[12px]" style={{ color: "var(--dt-text-muted)" }}>{p.avertissement}</p>}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}
        </Page>
    );
}
