"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import dayjs from "dayjs";
import { RefreshCw, Plug, LineChart as LineIcon } from "lucide-react";
import fr from "react-phone-number-input/locale/fr";
import { getStatistiques } from "@/lib/actions/statistiques";
import { Page, Bloc, Bouton, Vide, Squelette, Aide, LienCarte, fmtMontant, Montants } from "@/components/dashboard/kit";
import { BarreFiltres, bornes, type Dates } from "@/components/dashboard/barre-filtres";
import { Drapeau } from "@/components/ui/drapeau";
import { moyenAffiche } from "@/components/dashboard/passerelles/catalogue";
import { Aire, Barres, Entonnoir, ListeBarres } from "@/components/dashboard/graphiques";

/**
 * Statistiques : les paiements du marchand en chiffres, sur la periode qu'il
 * choisit. Un seul filtre en haut, et TOUT le suit : les quatre chiffres cles,
 * les courbes, les repartitions. Chaque chiffre dit a quoi il se compare.
 *
 * Les montants gardent leur devise. Le taux de reussite ne compte que les
 * paiements arrives chez un agregateur : une page ouverte puis quittee est un
 * abandon, pas un refus, et il est compte a part.
 */
type Donnees = Awaited<ReturnType<typeof getStatistiques>>;

const VERT = "#12a594";
const AMBRE = "#d97706";
const GRIS = "#94a3b8";
const NOMS_PAYS = fr as unknown as Record<string, string>;

function plage(d: Dates): [string | undefined, string | undefined] {
    const b = bornes(d);
    const j = (x?: string) => (x ? dayjs(x).format("YYYY-MM-DD") : undefined);
    return [j(b.from), j(b.to)];
}

const fmtNb = (n: number) => (n || 0).toLocaleString("fr-FR");
const pluriel = (n: number, un: string, plusieurs: string) => `${fmtNb(n)} ${n > 1 ? plusieurs : un}`;

/** Une evolution : un point de couleur pour le sens, le chiffre en encre normale. */
function Evolution({ valeur, unite = "%", jours }: { valeur?: number | null; unite?: string; jours?: number }) {
    if (valeur === null || valeur === undefined) return null;
    const couleur = valeur > 0 ? VERT : valeur < 0 ? "#f87171" : "var(--dt-text-muted)";
    const reference = !jours ? "la période précédente" : jours === 1 ? "la veille" : `les ${jours} jours précédents`;
    return (
        <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: couleur }} />
            {valeur > 0 ? "+" : ""}{valeur.toLocaleString("fr-FR")} {unite} vs {reference}
        </span>
    );
}

/** Un chiffre cle : assez grand pour etre lu, et ce a quoi il se compare. */
function Tuile({ label, valeur, sous, evolution }: { label: string; valeur: ReactNode; sous?: ReactNode; evolution?: ReactNode }) {
    return (
        <div className="min-w-0 rounded-2xl p-5" style={{ background: "var(--dt-card-bg)", border: "1px solid var(--dt-border)" }}>
            <p className="text-[13px] font-medium" style={{ color: "var(--dt-text-muted)" }}>{label}</p>
            <div className="mt-2 text-[26px] font-semibold leading-tight tracking-tight" style={{ color: "var(--dt-text-primary)" }}>{valeur}</div>
            {sous && <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: "var(--dt-text-muted)" }}>{sous}</p>}
            {evolution && <p className="mt-1 text-[12px]" style={{ color: "var(--dt-text-secondary)" }}>{evolution}</p>}
        </div>
    );
}

function Logo({ src }: { src: string | null }) {
    if (!src) return null;
    return <img src={src} alt="" width={16} height={16} style={{ width: 16, height: 16, objectFit: "contain", borderRadius: 3, flexShrink: 0 }} />;
}

export default function StatistiquesPage() {
    const [dates, setDates] = useState<Dates>({ preset: "all" });
    const [data, setData] = useState<Donnees | null | undefined>(undefined);
    const [charge, setCharge] = useState(false);

    const charger = useCallback(async () => {
        setCharge(true);
        const [de, a] = plage(dates);
        try { setData(await getStatistiques(de, a)); } catch { setData(null); }
        setCharge(false);
    }, [dates]);
    useEffect(() => { charger(); }, [charger]);

    const k = data?.kpis;
    const c = data?.comparaison;
    const jours = c?.jours;
    const devise = data?.devisePrincipale || "XOF";
    const autresDevises = (k?.encaisse || []).filter((e) => e.devise !== devise).map((e) => e.devise);
    const vide = !!data && data.entonnoir.sessions === 0;
    // Sur un ou deux jours, une courbe par jour n'a qu'un point : on trace les heures.
    const courte = !!data && data.periode.jours <= 2;
    const serie = courte ? data!.heures : data?.serie || [];
    const pas = courte ? "Par heure (GMT)" : data?.periode.granularite === "mois" ? "Par mois" : "Par jour";

    return (
        <Page titre="Statistiques" sousTitre="Vos paiements en chiffres. Tout suit la période choisie : les chiffres clés, les courbes et les répartitions." large>
            <BarreFiltres dates={{ valeur: dates, onChange: setDates }}
                extra={<Bouton variante="secondaire" icone={RefreshCw} chargement={charge} onClick={charger}>Actualiser</Bouton>} />

            {data === undefined ? <Squelette lignes={4} /> : data === null ? (
                <Aide ton="attention">Impossible de calculer les statistiques pour le moment. Réessayez dans un instant.</Aide>
            ) : vide ? (
                <Vide icone={LineIcon} titre="Aucun paiement sur cette période" texte="Élargissez la période, ou attendez vos premiers paiements : tout se calcule automatiquement." />
            ) : (
                <div className={`flex flex-col gap-4 transition-opacity ${charge ? "opacity-60" : ""}`}>
                    {/* Les quatre chiffres cles */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <Tuile label="Encaissé" valeur={<Montants valeurs={k!.encaisse} />}
                            sous={<>panier moyen {k!.panierMoyen.map((p) => fmtMontant(p.montant, p.devise)).join(", ")}</>}
                            evolution={<Evolution valeur={c?.encaisse} jours={jours} />} />
                        <Tuile label="Paiements réussis" valeur={fmtNb(k!.reussis)}
                            sous={`sur ${pluriel(k!.tentes, "paiement tenté", "paiements tentés")} chez un agrégateur`}
                            evolution={<Evolution valeur={c?.reussis} jours={jours} />} />
                        <Tuile label="Taux de réussite" valeur={`${k!.tauxReussite.toLocaleString("fr-FR")} %`}
                            sous={`${pluriel(k!.refuses, "refusé", "refusés")} par l'opérateur, ${pluriel(k!.annules, "annulé", "annulés")} en cours de paiement, ${pluriel(k!.abandons, "page quittée", "pages quittées")} avant tout paiement (non comptées)`}
                            evolution={<Evolution valeur={c?.taux} unite="pt" jours={jours} />} />
                        <Tuile label="Clients" valeur={fmtNb(k!.clients)} sous="personnes distinctes ayant payé"
                            evolution={<Evolution valeur={c?.clients} jours={jours} />} />
                    </div>

                    {/* L'encaisse dans le temps, dans UNE devise */}
                    <Bloc titre={`Encaissé, en ${devise}`}
                        sousTitre={autresDevises.length
                            ? `${pas}, paiements réussis. Vos paiements en ${autresDevises.join(" et ")} sont dans le chiffre « Encaissé » ci-dessus, jamais additionnés à ceux en ${devise}.`
                            : `${pas}, paiements réussis.`}>
                        <Aire donnees={serie} index="label" cle="encaisse" label={`Encaissé (${devise})`} format={(v) => fmtMontant(v, devise)} couleur="var(--chart-1)" hauteur={240} />
                    </Bloc>

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                        <div className="min-w-0 lg:col-span-8">
                            <Bloc titre="Paiements" sousTitre={`${pas}. Réussis, refusés ou annulés chez l'agrégateur, et pages quittées avant tout paiement.`}>
                                <Barres donnees={serie} index="label" hauteur={240} series={[
                                    { cle: "reussis", label: "Réussis", couleur: VERT },
                                    { cle: "nonAboutis", label: "Refusés ou annulés", couleur: AMBRE },
                                    { cle: "abandons", label: "Quittés avant paiement", couleur: GRIS },
                                ]} />
                            </Bloc>
                        </div>
                        <div className="min-w-0 lg:col-span-4">
                            <Bloc titre="Moyens de paiement" sousTitre="Paiements réussis par moyen, et tentatives.">
                                {data.parMoyen.length === 0 ? <p className="py-8 text-center text-sm" style={{ color: "var(--dt-text-muted)" }}>Pas encore de répartition sur cette période.</p> : (
                                    <ListeBarres format={(v) => pluriel(v, "paiement", "paiements")} donnees={data.parMoyen.map((m) => {
                                        const a = moyenAffiche(m.code, m.type);
                                        return { name: a.nom, value: m.reussis, icon: <Logo src={a.logo} />, sous: `${m.part} % des réussis, ${pluriel(m.tentatives, "tentative", "tentatives")}` };
                                    })} />
                                )}
                            </Bloc>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                        <div className="min-w-0 lg:col-span-4">
                            <Bloc titre="Du clic au paiement" sousTitre="Ce que deviennent les pages de paiement ouvertes sur la période.">
                                <Entonnoir etapes={[
                                    { nom: "Pages de paiement ouvertes", valeur: data.entonnoir.sessions },
                                    { nom: "Paiement tenté chez un agrégateur", valeur: data.entonnoir.tentes },
                                    { nom: "Paiement réussi", valeur: data.entonnoir.reussis },
                                ]} />
                            </Bloc>
                        </div>
                        <div className="min-w-0 lg:col-span-4">
                            <Bloc titre="Pays" sousTitre="D'après l'indicatif du numéro, paiements réussis.">
                                {data.parPays.length === 0 ? <p className="py-8 text-center text-sm" style={{ color: "var(--dt-text-muted)" }}>Pas encore de répartition par pays.</p> : (
                                    <ListeBarres format={(v) => pluriel(v, "paiement", "paiements")} donnees={data.parPays.map((p) => ({
                                        name: p.code ? NOMS_PAYS[p.code] || p.code : "Numéro non renseigné",
                                        value: p.reussis,
                                        icon: p.code ? <Drapeau code={p.code} taille={12} /> : undefined,
                                        sous: p.encaisse ? fmtMontant(p.encaisse, devise) : undefined,
                                    }))} />
                                )}
                            </Bloc>
                        </div>
                        <div className="min-w-0 lg:col-span-4">
                            <Bloc titre="Heures de paiement" sousTitre="Paiements réussis selon l'heure, en GMT (l'heure d'Abidjan et de Dakar).">
                                <Barres donnees={data.heures} index="label" hauteur={200} series={[{ cle: "reussis", label: "Réussis", couleur: VERT }]} />
                            </Bloc>
                        </div>
                    </div>

                    <LienCarte href="/gateways" icone={Plug} titre="Détail par passerelle" texte="L'état de chaque compte agrégateur et son taux de réussite se trouvent dans Passerelles." />
                </div>
            )}
        </Page>
    );
}
