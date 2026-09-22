"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { goeyToast } from "goey-toast";
import { methodesTransfert, basculerMethodeTransfert } from "@/lib/actions/transferts";
import { Page, Bloc, Aide, Vide, Squelette, Interrupteur } from "@/components/dashboard/kit";
import { fournisseurAffiche, moyenAffiche } from "@/components/dashboard/passerelles/catalogue";
import { Drapeau } from "@/components/ui/drapeau";

/**
 * Methodes de transfert : les operateurs vers lesquels les passerelles de
 * l'espace savent envoyer, pays par pays. Un operateur coupe disparait du
 * formulaire et l'API le refuse (`methode_desactivee`).
 */
type Donnees = Awaited<ReturnType<typeof methodesTransfert>>;

function Logo({ src, taille = 18 }: { src: string | null; taille?: number }) {
    if (!src) return null;
    return <img src={src} alt="" width={taille} height={taille} style={{ width: taille, height: taille, objectFit: "contain", borderRadius: 4, flexShrink: 0 }} />;
}

export default function MethodesTransfertPage() {
    const [d, setD] = useState<Donnees | null | undefined>(undefined);
    const [occupe, setOccupe] = useState<string | null>(null);

    const charger = useCallback(() => { methodesTransfert().then(setD).catch(() => setD(null)); }, []);
    useEffect(() => { charger(); }, [charger]);

    const basculer = async (pays: string, operateur: string, actif: boolean) => {
        const cle = `${pays}:${operateur}`;
        setOccupe(cle);
        try {
            await basculerMethodeTransfert(pays, operateur, actif);
            goeyToast.success(actif ? "Méthode rouverte" : "Méthode coupée pour les transferts");
            charger();
        } catch { goeyToast.error("Échec, réessayez."); } finally { setOccupe(null); }
    };

    return (
        <Page titre="Méthodes de transfert" sousTitre="Les opérateurs vers lesquels vos passerelles savent envoyer, pays par pays. Coupez ceux que vous ne voulez pas utiliser : ils disparaissent du formulaire et l'API les refuse." large>
            {d === undefined ? <Squelette lignes={3} /> : d === null ? (
                <Aide ton="attention">Impossible de charger vos méthodes pour le moment.</Aide>
            ) : d.pays.length === 0 ? (
                <Vide titre="Aucune méthode disponible" texte={<>Aucune de vos passerelles ne sait encore envoyer de l'argent. Voyez <Link href="/transfers/gateways" className="underline">vos passerelles de transfert</Link>.</>} />
            ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {d.pays.map((p) => (
                        <Bloc key={p.code} titre={<span className="inline-flex items-center gap-2"><Drapeau code={p.code} taille={14} />{p.nom}</span>} sousTitre={`Envois en ${p.devise}`}>
                            <div className="grid grid-cols-1 gap-1">
                                {p.operateurs.map((o) => {
                                    const m = moyenAffiche(o.code);
                                    const cle = `${p.code}:${o.code}`;
                                    return (
                                        <div key={o.code} className="flex items-center gap-3 py-2" style={{ borderBottom: "1px solid var(--dt-divider)" }}>
                                            <Logo src={m.logo} />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm" style={{ color: o.desactive ? "var(--dt-text-muted)" : "var(--dt-text-primary)" }}>{o.nom}</p>
                                                <p className="mt-0.5 inline-flex items-center gap-1.5 text-[11.5px]" style={{ color: "var(--dt-text-muted)" }}>via <Logo src={fournisseurAffiche(o.fournisseurCle).logo} taille={12} />{o.fournisseur}</p>
                                            </div>
                                            <Interrupteur actif={!o.desactive} onChange={(v) => basculer(p.code, o.code, v)} disabled={occupe === cle} />
                                        </div>
                                    );
                                })}
                            </div>
                        </Bloc>
                    ))}
                </div>
            )}
        </Page>
    );
}
