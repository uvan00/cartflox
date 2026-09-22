"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getCountryCallingCode } from "react-phone-number-input/input";
import Link from "next/link";
import { ArrowRight, Globe, RefreshCw, Send, ShieldCheck, Wallet } from "lucide-react";
import { goeyToast } from "goey-toast";
import { optionsTransfert, mesTransferts, envoyerTransfert, actualiserTransfert } from "@/lib/actions/transferts";
import { Page, Bloc, Champ, Entree, Choix, Bouton, Pastille, Aide, Vide, Squelette, fmtDate, fmtMontant } from "@/components/dashboard/kit";
import { fournisseurAffiche, moyenAffiche } from "@/components/dashboard/passerelles/catalogue";
import { Drapeau } from "@/components/ui/drapeau";

/**
 * Transferts d'argent : le marchand envoie une somme vers un compte Mobile
 * Money (fournisseur, salarie, client rembourse...). L'argent part de son
 * agregateur (ses cles) ou, pour un espace Connect, de son solde Cartflox.
 *
 * Deux temps avant que l'argent parte : le formulaire, puis un recapitulatif a
 * confirmer. Une cle d'idempotence par saisie rend un double clic inoffensif.
 */
type Options = Awaited<ReturnType<typeof optionsTransfert>>;
type Transfert = Awaited<ReturnType<typeof mesTransferts>>[number];

const ETAT: Record<string, { label: string; couleur: string }> = {
    EN_ATTENTE: { label: "En attente", couleur: "#f59e0b" },
    EN_COURS: { label: "En cours", couleur: "#60a5fa" },
    REUSSI: { label: "Envoyé", couleur: "#12a594" },
    ECHOUE: { label: "Échoué", couleur: "#f87171" },
};
const SUPPORT = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ? `https://wa.me/${process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP}` : "";

function Logo({ src, taille = 16 }: { src: string | null; taille?: number }) {
    if (!src) return null;
    return <img src={src} alt="" width={taille} height={taille} style={{ width: taille, height: taille, objectFit: "contain", borderRadius: 3, flexShrink: 0 }} />;
}

export default function TransfertsPage() {
    const [options, setOptions] = useState<Options | null | undefined>(undefined);
    const [lignes, setLignes] = useState<Transfert[] | null>(null);
    const [f, setF] = useState({ pays: "", operateur: "", telephone: "", montant: "", nom: "", motif: "" });
    const [cle, setCle] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now())));
    const [etape, setEtape] = useState<"saisie" | "confirmation">("saisie");
    const [occupe, setOccupe] = useState(false);
    const [actualise, setActualise] = useState<string | null>(null);

    const charger = useCallback(async () => {
        try {
            const [o, l] = await Promise.all([optionsTransfert(), mesTransferts()]);
            setOptions(o);
            setLignes(l);
            const ouverts = o.pays.map((p) => ({ ...p, operateurs: p.operateurs.filter((x) => !x.desactive) })).filter((p) => p.operateurs.length > 0);
            setF((prev) => (prev.pays || !ouverts.length ? prev : { ...prev, pays: ouverts[0].code, operateur: ouverts[0].operateurs[0]?.code || "" }));
        } catch {
            setOptions(null);
            setLignes([]);
        }
    }, []);
    useEffect(() => { charger(); }, [charger]);

    // Les methodes coupees dans « Méthodes » ne sont pas proposees ici.
    const paysOuverts = useMemo(() => (options?.pays || []).map((p) => ({ ...p, operateurs: p.operateurs.filter((o) => !o.desactive) })).filter((p) => p.operateurs.length > 0), [options]);
    const pays = useMemo(() => paysOuverts.find((p) => p.code === f.pays) || null, [paysOuverts, f.pays]);
    const operateur = useMemo(() => pays?.operateurs.find((o) => o.code === f.operateur) || null, [pays, f.operateur]);
    const montant = Math.round(Number(f.montant) || 0);
    const frais = options?.managed ? Math.round((montant * (options.fraisBps || 0)) / 10000) : 0;
    const solde = options?.soldes.find((s) => s.devise === pays?.devise)?.montant;
    const indicatif = pays ? (() => { try { return `+${getCountryCallingCode(pays.code as any)}`; } catch { return ""; } })() : "";

    const maj = (k: keyof typeof f, v: string) => setF((prev) => ({ ...prev, [k]: v }));
    const choisirPays = (code: string) => {
        const p = paysOuverts.find((x) => x.code === code);
        setF((prev) => ({ ...prev, pays: code, operateur: p?.operateurs[0]?.code || "" }));
    };

    const verifier = () => {
        if (!pays || !operateur) { goeyToast.error("Choisissez le pays et l'opérateur du bénéficiaire."); return; }
        if (!f.telephone.trim()) { goeyToast.error("Le numéro du bénéficiaire est obligatoire."); return; }
        if (montant <= 0) { goeyToast.error("Indiquez un montant."); return; }
        if (options?.managed && solde !== undefined && solde < montant + frais) { goeyToast.error(`Solde insuffisant : ${fmtMontant(solde, pays.devise)} disponibles.`); return; }
        setEtape("confirmation");
    };

    const envoyer = async () => {
        if (!pays || !operateur) return;
        setOccupe(true);
        try {
            const r = await envoyerTransfert({ montant, pays: pays.code, operateur: operateur.code, telephone: f.telephone, nomBeneficiaire: f.nom || undefined, motif: f.motif || undefined, cle });
            if (!r.ok) { goeyToast.error(r.message); setEtape("saisie"); return; }
            const t: any = r.transfert;
            if (t.statut === "ECHOUE") goeyToast.error(`Transfert refusé : ${t.echecMessage || "le fournisseur a dit non"}.`);
            else if (t.statut === "REUSSI") goeyToast.success("Transfert envoyé.");
            else goeyToast.success("Transfert confié au fournisseur, il vous préviendra de l'issue.");
            setF((prev) => ({ ...prev, telephone: "", montant: "", nom: "", motif: "" }));
            setCle(typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()));
            setEtape("saisie");
            await charger();
        } finally { setOccupe(false); }
    };

    const rafraichir = async (id: string) => {
        setActualise(id);
        try { await actualiserTransfert(id); await charger(); } finally { setActualise(null); }
    };

    return (
        <Page titre="Transferts d'argent" sousTitre="Envoyez une somme vers un compte Mobile Money : fournisseur, salarié, client à rembourser. Vous choisissez le pays, l'opérateur et le numéro, Cartflox fait le reste." large>
            {options === undefined ? <Squelette lignes={4} /> : options === null ? (
                <Aide ton="attention">Impossible de charger les transferts pour le moment. Réessayez dans un instant.</Aide>
            ) : !options.actifs ? (
                <Bloc titre="Transferts fermés sur cet espace" sousTitre="L'administration Cartflox a fermé les transferts d'argent pour cet espace. Le support vous dira pourquoi, et comment les rouvrir.">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="text-sm leading-relaxed" style={{ color: "var(--dt-text-secondary)" }}>
                            <p>Une fois rouverts, vous envoyez de l'argent depuis cette page ou par l'API (<span className="font-mono text-[12px]">POST /api/v1/transfers</span>), vers {options.pays.length > 0 ? `${options.pays.length} pays` : "les pays de vos passerelles"}.</p>
                            <p className="mt-2">{options.managed ? "L'argent part de votre solde Cartflox, frais compris." : "L'argent part du portefeuille de votre agrégateur : c'est lui qui le débite, avec ses propres frais."}</p>
                        </div>
                        <div className="flex flex-col items-start gap-3">
                            <a href={SUPPORT} target="_blank" rel="noopener noreferrer"><Bouton icone={Send}>Contacter le support</Bouton></a>
                            {options.pays.length === 0 && <Aide ton="info">Aucune de vos passerelles ne sait encore envoyer de l'argent. PawaPay, PayDunya, Hub2, Notch Pay, Monetbil, Flutterwave, Paystack, FedaPay et FeexPay le permettent.</Aide>}
                        </div>
                    </div>
                </Bloc>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                        <div className="min-w-0 lg:col-span-7">
                            <Bloc titre="Envoyer de l'argent" sousTitre={etape === "saisie" ? "Le bénéficiaire reçoit l'argent sur son compte Mobile Money, en général dans la minute." : "Vérifiez avant de confirmer : un transfert envoyé ne se rappelle pas."}>
                                {paysOuverts.length === 0 ? (
                                    <Aide ton="attention">Aucune de vos passerelles actives ne sait envoyer de l'argent. Branchez PawaPay, PayDunya, Hub2, Notch Pay, Monetbil, Flutterwave, Paystack, FedaPay ou FeexPay dans Passerelles, puis vérifiez <Link href="/transfers/gateways" className="underline">vos passerelles de transfert</Link>.</Aide>
                                ) : etape === "saisie" ? (
                                    <div className="grid grid-cols-1 gap-4">
                                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                            <Champ label="Pays du bénéficiaire">
                                                <Choix value={f.pays} onChange={choisirPays} options={paysOuverts.map((p) => ({
                                                    value: p.code,
                                                    label: <span className="inline-flex min-w-0 items-center gap-2"><Drapeau code={p.code} taille={12} /><span className="truncate">{p.nom}</span><span style={{ color: "var(--dt-text-muted)" }}>({p.devise})</span></span>,
                                                }))} />
                                            </Champ>
                                            <Champ label="Opérateur" aide={operateur ? <span className="inline-flex items-center gap-1.5">Envoyé par <Logo src={fournisseurAffiche(operateur.fournisseurCle).logo} taille={14} />{operateur.fournisseur}</span> : undefined}>
                                                <Choix value={f.operateur} onChange={(v) => maj("operateur", v)} options={(pays?.operateurs || []).map((o) => ({
                                                    value: o.code,
                                                    label: <span className="inline-flex min-w-0 items-center gap-2"><Logo src={moyenAffiche(o.code).logo} /><span className="truncate">{o.nom}</span></span>,
                                                }))} />
                                            </Champ>
                                        </div>
                                        {operateur?.avertissement && <Aide ton="attention">{operateur.avertissement}</Aide>}
                                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                            <Champ label="Numéro du bénéficiaire" aide={indicatif ? `Tel qu'on le compose dans le pays, l'indicatif ${indicatif} est ajouté pour vous.` : undefined}>
                                                <Entree type="tel" inputMode="tel" value={f.telephone} onChange={(e) => maj("telephone", e.target.value)} placeholder="07 12 34 56 78" />
                                            </Champ>
                                            <Champ label="Montant">
                                                <div className="relative">
                                                    <Entree type="number" inputMode="numeric" min={1} value={f.montant} onChange={(e) => maj("montant", e.target.value)} placeholder="5000" className="pr-16" />
                                                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold" style={{ color: "var(--dt-text-muted)" }}>{pays?.devise || ""}</span>
                                                </div>
                                            </Champ>
                                        </div>
                                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                            <Champ label="Nom du bénéficiaire" aide="Facultatif, pour vous y retrouver.">
                                                <Entree value={f.nom} onChange={(e) => maj("nom", e.target.value)} placeholder="Ex. Awa Koné" maxLength={120} />
                                            </Champ>
                                            <Champ label="Motif" aide="Facultatif, transmis quand l'opérateur l'affiche.">
                                                <Entree value={f.motif} onChange={(e) => maj("motif", e.target.value)} placeholder="Ex. Salaire septembre" maxLength={200} />
                                            </Champ>
                                        </div>
                                        <div className="flex justify-end"><Bouton icone={ArrowRight} onClick={verifier}>Vérifier</Bouton></div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-4">
                                        <div className="rounded-xl p-4 text-sm" style={{ background: "var(--dt-item-hover)" }}>
                                            <div className="flex items-center justify-between gap-3 py-1.5"><span style={{ color: "var(--dt-text-muted)" }}>Bénéficiaire</span><span style={{ color: "var(--dt-text-primary)" }}>{f.nom ? `${f.nom}, ` : ""}{indicatif} {f.telephone}</span></div>
                                            <div className="flex items-center justify-between gap-3 py-1.5"><span style={{ color: "var(--dt-text-muted)" }}>Opérateur</span><span className="inline-flex items-center gap-2" style={{ color: "var(--dt-text-primary)" }}><Logo src={moyenAffiche(operateur?.code).logo} />{operateur?.nom}, <Drapeau code={pays?.code || ""} taille={12} /> {pays?.nom}</span></div>
                                            <div className="flex items-center justify-between gap-3 py-1.5"><span style={{ color: "var(--dt-text-muted)" }}>Montant reçu</span><span className="font-semibold" style={{ color: "var(--dt-text-primary)" }}>{fmtMontant(montant, pays?.devise)}</span></div>
                                            {options.managed && (
                                                <>
                                                    <div className="flex items-center justify-between gap-3 py-1.5"><span style={{ color: "var(--dt-text-muted)" }}>Frais Cartflox ({(options.fraisBps || 0) / 100} %)</span><span style={{ color: "var(--dt-text-primary)" }}>{fmtMontant(frais, pays?.devise)}</span></div>
                                                    <div className="flex items-center justify-between gap-3 border-t py-1.5" style={{ borderColor: "var(--dt-border)" }}><span style={{ color: "var(--dt-text-muted)" }}>Débité de votre solde</span><span className="font-semibold" style={{ color: "var(--dt-text-primary)" }}>{fmtMontant(montant + frais, pays?.devise)}</span></div>
                                                </>
                                            )}
                                            {f.motif && <div className="flex items-center justify-between gap-3 py-1.5"><span style={{ color: "var(--dt-text-muted)" }}>Motif</span><span style={{ color: "var(--dt-text-primary)" }}>{f.motif}</span></div>}
                                        </div>
                                        <div className="flex flex-wrap justify-end gap-2">
                                            <Bouton variante="secondaire" onClick={() => setEtape("saisie")} disabled={occupe}>Modifier</Bouton>
                                            <Bouton icone={Send} onClick={envoyer} chargement={occupe}>Confirmer l'envoi</Bouton>
                                        </div>
                                    </div>
                                )}
                            </Bloc>
                        </div>
                        <div className="min-w-0 lg:col-span-5">
                            <Bloc titre="Comment ça marche">
                                <div className="grid grid-cols-1 gap-3 text-sm" style={{ color: "var(--dt-text-secondary)" }}>
                                    {options.managed ? (
                                        <>
                                            <p className="flex items-start gap-2"><Wallet className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#12a594" }} /><span>L'argent part de votre solde Cartflox, frais compris ({(options.fraisBps || 0) / 100} %). Si l'opérateur refuse, tout revient sur votre solde.</span></p>
                                            {options.soldes.map((s) => (
                                                <div key={s.devise} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "var(--dt-item-hover)" }}>
                                                    <span style={{ color: "var(--dt-text-muted)" }}>Solde disponible</span><span className="font-semibold" style={{ color: "var(--dt-text-primary)" }}>{fmtMontant(s.montant, s.devise)}</span>
                                                </div>
                                            ))}
                                            {!options.identiteVerifiee && <Aide ton="attention">Votre identité n'est pas encore vérifiée : elle est exigée pour envoyer de l'argent depuis un solde Connect.</Aide>}
                                        </>
                                    ) : (
                                        <p className="flex items-start gap-2"><Wallet className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#12a594" }} /><span>L'argent part du portefeuille de votre agrégateur ({options.fournisseurs.join(", ") || "vos passerelles"}), qui le débite avec ses propres frais. Cartflox ne prélève rien.</span></p>
                                    )}
                                    <p className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#60a5fa" }} /><span>Au plus {options.maxParJour} transferts par jour sur cet espace. Par l'API : <span className="font-mono text-[12px]">POST /api/v1/transfers</span> avec votre clé secrète.</span></p>
                                    <p className="flex items-start gap-2"><Globe className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#a78bfa" }} /><span>Choisissez les <Link href="/transfers/gateways" className="underline">passerelles</Link> qui peuvent envoyer, et coupez les <Link href="/transfers/methods" className="underline">méthodes</Link> que vous ne voulez pas utiliser.</span></p>
                                </div>
                            </Bloc>
                        </div>
                    </div>

                    <Bloc titre="Historique" sousTitre="Vos derniers transferts, du plus récent au plus ancien." action={<Bouton variante="secondaire" icone={RefreshCw} onClick={charger}>Actualiser</Bouton>}>
                        {lignes === null ? <Squelette lignes={3} /> : lignes.length === 0 ? <Vide titre="Aucun transfert pour le moment" texte="Le premier apparaîtra ici dès son envoi." /> : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm" style={{ minWidth: 720 }}>
                                    <thead>
                                        <tr style={{ borderBottom: "1px solid var(--dt-border)" }}>
                                            {["Date", "Bénéficiaire", "Opérateur", "Montant", "Statut", ""].map((e) => <th key={e} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--dt-text-muted)" }}>{e}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {lignes.map((t: any) => {
                                            const e = ETAT[t.statut] || { label: t.statut, couleur: "#94a3b8" };
                                            const m = moyenAffiche(t.operateur);
                                            const ouvert = t.statut === "EN_ATTENTE" || t.statut === "EN_COURS";
                                            return (
                                                <tr key={t.id} style={{ borderBottom: "1px solid var(--dt-divider)" }}>
                                                    <td className="px-3 py-3 align-top" style={{ color: "var(--dt-text-muted)" }}>{fmtDate(t.createdAt)}</td>
                                                    <td className="px-3 py-3 align-top" style={{ color: "var(--dt-text-primary)" }}>{t.nomBeneficiaire || "Sans nom"}<span className="block text-[11px]" style={{ color: "var(--dt-text-muted)" }}>+{t.telephone}{t.motif ? `, ${t.motif}` : ""}</span></td>
                                                    <td className="px-3 py-3 align-top"><span className="inline-flex items-center gap-2" style={{ color: "var(--dt-text-primary)" }}><Drapeau code={t.pays} taille={12} /><Logo src={m.logo} />{m.nom}</span><span className="mt-0.5 inline-flex items-center gap-1.5 text-[11px]" style={{ color: "var(--dt-text-muted)" }}>via <Logo src={fournisseurAffiche(t.fournisseur).logo} taille={12} />{fournisseurAffiche(t.fournisseur).nom}</span></td>
                                                    <td className="px-3 py-3 align-top text-right tabular-nums" style={{ color: "var(--dt-text-primary)" }}>{fmtMontant(t.montant, t.devise)}{t.frais > 0 && <span className="block text-[11px]" style={{ color: "var(--dt-text-muted)" }}>frais {fmtMontant(t.frais, t.devise)}</span>}</td>
                                                    <td className="px-3 py-3 align-top"><Pastille label={e.label} couleur={e.couleur} />{t.statut === "ECHOUE" && t.echecMessage && <span className="mt-1 block max-w-xs text-[11px]" style={{ color: "var(--dt-text-muted)" }}>{t.echecMessage}</span>}</td>
                                                    <td className="px-3 py-3 align-top text-right">{ouvert && <button type="button" onClick={() => rafraichir(t.id)} disabled={actualise === t.id} className="text-[12px] underline underline-offset-2 disabled:opacity-50" style={{ color: "var(--dt-text-secondary)" }}>{actualise === t.id ? "Vérification" : "Vérifier"}</button>}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Bloc>
                </>
            )}
        </Page>
    );
}
