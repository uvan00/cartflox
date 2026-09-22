"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Eye, EyeOff, Globe, Info, KeyRound, Lock, Pause, Play, RefreshCw, Search, Smartphone, Trash2, X } from "lucide-react";
import { goeyToast } from "goey-toast";
import { createGateway, deleteGateway, updateGateway, updateGatewayStatus, validateGatewayCredentials } from "@/lib/actions/gateways";
import { getPaymentMethods, togglePaymentMethod } from "@/lib/actions/methods";
import { Aide, Bouton, Interrupteur, Onglets, Pastille, champStyle } from "@/components/dashboard/kit";
import { aideCles, cleFournisseur, codeDuPays, estCarte, estMobileMoney, getMethodLogo, nomPays, paysDeMethode, siteFournisseur, type Fournisseur } from "./catalogue";
import { Drapeau } from "@/components/ui/drapeau";
import { getCountryByCode } from "@/lib/countries";

/**
 * Panneau de configuration d'une passerelle : ses cles API (live ou test)
 * et les moyens de paiement qu'elle propose. Toute la logique metier vient
 * de l'ancienne page, seule la presentation change.
 */

type Onglet = "cles" | "moyens" | "pays";
type Filtre = "tous" | "mobile" | "carte";
type EtatMoyen = { dbId: string; isActive: boolean };

const normaliser = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

/** Retrouve en base les moyens qui correspondent au nom affiche (accents, alias, noms composes). */
function correspondances(nomAffiche: string, moyensBase: any[]): any[] {
    const parNom = (m: any, cible: string) => m.name === cible || (Array.isArray(m.aliases) && m.aliases.includes(cible));
    const exact = moyensBase.find((m) => parNom(m, nomAffiche));
    if (exact) return [exact];
    const cibleNorm = normaliser(nomAffiche);
    const parNomNorm = (m: any) => normaliser(m.name) === cibleNorm || (Array.isArray(m.aliases) && m.aliases.some((a: string) => normaliser(a) === cibleNorm));
    const normExact = moyensBase.find(parNomNorm);
    if (normExact) return [normExact];
    if (nomAffiche.includes("/") || nomAffiche.includes(",")) {
        const parties = nomAffiche.split(/[\/,]/).map((p) => p.trim()).filter(Boolean);
        const trouves: any[] = [];
        for (const partie of parties) {
            const pn = normaliser(partie);
            const m = moyensBase.find((x) => { const mn = normaliser(x.name); return mn.includes(pn) || pn.includes(mn); });
            if (m) trouves.push(m);
        }
        if (trouves.length > 0) return trouves;
    }
    const flou = moyensBase.find((m) => { const mn = normaliser(m.name); return mn.includes(cibleNorm) || cibleNorm.includes(mn); });
    return flou ? [flou] : [];
}

export function ConfigurationPasserelle({ fournisseur, passerelle, ongletInitial = "cles", onUpdate, onClose }: {
    fournisseur: Fournisseur;
    passerelle: any | null;
    ongletInitial?: Onglet;
    onUpdate: () => void;
    onClose: () => void;
}) {
    const connectee = !!passerelle;
    const active = connectee && passerelle.status === "active";
    const enTest = connectee && passerelle.config?.mode === "test";
    const aide = aideCles(fournisseur.name);

    const [onglet, setOnglet] = useState<Onglet>(connectee ? ongletInitial : "cles");
    // Instructions de connexion (ou trouver les cles, webhook a declarer) : repliees, comme chez Moneroo.
    const [instructions, setInstructions] = useState(!connectee);
    // Cles API
    const [valeurs, setValeurs] = useState<Record<string, string>>({});
    const [visibles, setVisibles] = useState<Record<string, boolean>>({});
    const [mode, setMode] = useState<"live" | "test">("live");
    const [connexion, setConnexion] = useState(false);
    const [enregistrement, setEnregistrement] = useState(false);
    const [verification, setVerification] = useState(false);
    const [bascule, setBascule] = useState(false);
    const [confirmerSuppression, setConfirmerSuppression] = useState(false);
    const [suppression, setSuppression] = useState(false);
    // Pays couverts
    const [cherchePays, setCherchePays] = useState("");
    const moyensParPays = useMemo(() => {
        const par: Record<string, string[]> = {};
        for (const nom of fournisseur.methods) (par[paysDeMethode(nom)] ||= []).push(nom);
        return par;
    }, [fournisseur]);
    const paysTrouves = useMemo(() => {
        const q = cherchePays.trim().toLowerCase();
        return fournisseur.countries.filter((c) => !q || nomPays(c).toLowerCase().includes(q) || c.toLowerCase().includes(q));
    }, [fournisseur, cherchePays]);

    // Moyens de paiement
    const [etats, setEtats] = useState<Record<string, EtatMoyen>>({});
    /**
     * Comptes marchands par pays, pour les fournisseurs qui en ouvrent un par
     * pays (Hub2). Les valeurs deja enregistrees arrivent CHIFFREES du serveur :
     * on ne les affiche jamais, on liste seulement les pays configures et on
     * laisse retaper un couple pour en ajouter ou en remplacer un.
     */
    const [comptesPays, setComptesPays] = useState<Record<string, { merchantId: string; apiKey: string }>>({});
    const [paysEnCours, setPaysEnCours] = useState("");
    const [idEnCours, setIdEnCours] = useState("");
    const [cleEnCours, setCleEnCours] = useState("");
    const [recherche, setRecherche] = useState("");
    const [filtre, setFiltre] = useState<Filtre>("tous");
    const [synchro, setSynchro] = useState(false);
    const [chargementMoyens, setChargementMoyens] = useState(false);

    /* ---------- Cles API ---------- */

    const chargerChamps = useCallback((m: "live" | "test") => {
        const config = passerelle?.config || {};
        const v: Record<string, string> = {};
        fournisseur.apiFields.forEach((f) => {
            if (m === "test") v[f.key] = config.testKeys?.[f.key] || "";
            else if (f.configKey) v[f.key] = config[f.key] || "";
            else v[f.key] = passerelle?.[f.key] || "";
        });
        setValeurs(v);
        setVisibles({});
        setComptesPays((config.comptesPays as any) || {});
        setPaysEnCours(""); setIdEnCours(""); setCleEnCours("");
    }, [fournisseur, passerelle]);

    useEffect(() => {
        const m = passerelle?.config?.mode === "test" ? "test" : "live";
        setMode(m);
        chargerChamps(m);
        setConfirmerSuppression(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fournisseur.id, passerelle?.id, passerelle?.updatedAt, JSON.stringify(passerelle?.config)]);

    const toutesLesCles = fournisseur.apiFields.every((f) => f.optionnel || (valeurs[f.key] || "").trim().length > 0);

    const chargeUtile = () => {
        const existante = passerelle?.config || {};
        if (mode === "test") {
            const testKeys: Record<string, string> = { ...(existante.testKeys || {}) };
            fournisseur.apiFields.forEach((f) => { testKeys[f.key] = valeurs[f.key] || ""; });
            return { config: { ...existante, mode: "test", testKeys } } as any;
        }
        const dansConfig: Record<string, string> = {};
        const aPlat: Record<string, string> = {};
        fournisseur.apiFields.forEach((f) => { (f.configKey ? dansConfig : aPlat)[f.key] = valeurs[f.key] || ""; });
        const surPays = fournisseur.comptesParPays ? { comptesPays } : {};
        return { ...aPlat, config: { ...existante, ...dansConfig, ...surPays, mode: "live" } } as any;
    };
    const donneesVerif = () => {
        const d: Record<string, string> = {};
        fournisseur.apiFields.forEach((f) => { d[f.key] = valeurs[f.key] || ""; });
        d.mode = mode;
        // Une carte par pays (Djamo) : l'adaptateur choisit son hote d'apres le pays.
        if (fournisseur.countries.length === 1) d.pays = fournisseur.countries[0];
        return d;
    };
    const signalerChangement = () => { window.dispatchEvent(new Event("afriflow-env-mode-change")); onUpdate(); };

    const connecter = async () => {
        if (!toutesLesCles) { goeyToast.error("Renseignez toutes les clés API"); return; }
        setConnexion(true);
        try {
            const v = await validateGatewayCredentials(cleFournisseur(fournisseur.id), donneesVerif());
            if (!v.success) { goeyToast.error(`Clés refusées par ${fournisseur.name} : ${v.message || "vérifiez-les"}`); return; }
            const p = chargeUtile();
            const r = await createGateway({ name: fournisseur.name, countries: fournisseur.countries, apiKey: p.apiKey || "", apiSecret: p.apiSecret || "", config: p.config || {}, status: "active", logo: fournisseur.logo });
            if (r.success) {
                goeyToast.success(`${fournisseur.name} connecté${mode === "test" ? " en mode test" : ""}. Activez maintenant ses moyens de paiement.`);
                signalerChangement();
                setOnglet("moyens");
            } else goeyToast.error(r.error || "Connexion impossible");
        } catch { goeyToast.error("Connexion impossible"); }
        finally { setConnexion(false); }
    };
    const enregistrer = async () => {
        if (!connectee) return;
        setEnregistrement(true);
        try {
            const v = await validateGatewayCredentials(cleFournisseur(fournisseur.id), donneesVerif());
            if (!v.success) { goeyToast.error(`Clés refusées par ${fournisseur.name} : ${v.message || "vérifiez-les"}`); return; }
            await updateGateway(passerelle.id, chargeUtile());
            goeyToast.success(mode === "test" ? "Clés enregistrées : mode test actif sur votre page de paiement" : "Clés enregistrées : mode live actif");
            signalerChangement();
        } catch { goeyToast.error("Enregistrement impossible"); }
        finally { setEnregistrement(false); }
    };
    const verifier = async () => {
        if (!toutesLesCles) { goeyToast.error("Renseignez toutes les clés API"); return; }
        setVerification(true);
        try {
            const r = await validateGatewayCredentials(cleFournisseur(fournisseur.id), donneesVerif());
            if (r.success) goeyToast.success(`${fournisseur.name} reconnaît ces clés`);
            else goeyToast.error(r.message || "Clés refusées");
        } catch { goeyToast.error("Vérification impossible"); }
        finally { setVerification(false); }
    };
    const basculerStatut = async () => {
        if (!connectee) return;
        setBascule(true);
        try {
            await updateGatewayStatus(passerelle.id, active ? "inactive" : "active");
            goeyToast.success(active ? "Passerelle mise en pause : elle n'encaisse plus" : "Passerelle réactivée");
            signalerChangement();
        } catch { goeyToast.error("Changement impossible"); }
        finally { setBascule(false); }
    };
    const supprimer = async () => {
        if (!connectee) return;
        setSuppression(true);
        try {
            const r = await deleteGateway(passerelle.id);
            if (!r.success) { goeyToast.error(r.error || "Suppression impossible"); return; }
            goeyToast.success(`${fournisseur.name} retiré de votre compte`);
            signalerChangement();
            onClose();
        } finally { setSuppression(false); }
    };

    /* ---------- Moyens de paiement ---------- */

    const nomLc = fournisseur.name.toLowerCase();
    const moyensDuFournisseur = useCallback((tous: any[]) => tous.filter((m) =>
        m.gateway?.toLowerCase() === nomLc || m.gatewayId === passerelle?.id ||
        (Array.isArray(m.providers) && m.providers.some((p: any) => p.gatewayId === passerelle?.id || p.provider?.toLowerCase() === nomLc))
    ), [nomLc, passerelle?.id]);

    const chargerMoyens = useCallback(async () => {
        if (!connectee) return;
        const tous = await getPaymentMethods();
        const liste = moyensDuFournisseur(tous);
        const s: Record<string, EtatMoyen> = {};
        fournisseur.methods.forEach((nom) => {
            const trouves = correspondances(nom, liste);
            if (trouves.length === 0) return;
            const m: any = trouves[0];
            const propre = Array.isArray(m.providers) ? m.providers.find((p: any) => p.gatewayId === passerelle?.id || p.provider?.toLowerCase() === nomLc) : null;
            s[nom] = { dbId: propre?.methodId || m.id, isActive: propre ? (propre.isActive ?? true) : trouves.every((x: any) => x.isActive) };
        });
        setEtats(s);
        return s;
    }, [connectee, fournisseur.methods, moyensDuFournisseur, nomLc, passerelle?.id]);

    useEffect(() => {
        if (!connectee) return;
        setChargementMoyens(true);
        chargerMoyens().catch(() => { }).finally(() => setChargementMoyens(false));
    }, [connectee, chargerMoyens]);

    const basculerMoyen = async (nom: string) => {
        const courant = etats[nom];
        if (!courant) {
            // Jamais enregistre en base : on le cree directement, actif.
            const meta = { name: nom, country: paysDeMethode(nom), provider: fournisseur.name, flag: "", type: estCarte(nom) ? "CARD" : "MOBILE_MONEY", logo: getMethodLogo(nom) || fournisseur.logo };
            const tempId = `temp-${nom.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
            setEtats((e) => ({ ...e, [nom]: { dbId: tempId, isActive: true } }));
            const r: any = await togglePaymentMethod(tempId, true, meta);
            if (r.success) { setEtats((e) => ({ ...e, [nom]: { dbId: r.newId || tempId, isActive: true } })); goeyToast.success(`${nom} proposé à vos clients`); }
            else { setEtats((e) => { const s = { ...e }; delete s[nom]; return s; }); goeyToast.error("Activation impossible"); }
            return;
        }
        const nouveau = !courant.isActive;
        setEtats((e) => ({ ...e, [nom]: { ...courant, isActive: nouveau } }));
        const r: any = await togglePaymentMethod(courant.dbId, nouveau);
        if (r.success) {
            if (r.newId) setEtats((e) => ({ ...e, [nom]: { dbId: r.newId, isActive: nouveau } }));
            goeyToast.success(nouveau ? `${nom} proposé à vos clients` : `${nom} retiré de la page de paiement`);
        } else {
            setEtats((e) => ({ ...e, [nom]: { ...courant, isActive: !nouveau } }));
            goeyToast.error("Mise à jour impossible");
        }
    };

    const basculerTout = async (activer: boolean) => {
        const entrees = Object.entries(etats);
        if (entrees.length === 0) { goeyToast.error("Aucun moyen synchronisé : activez-en un d'abord"); return; }
        const avant = { ...etats };
        setEtats(Object.fromEntries(entrees.map(([n, s]) => [n, { ...s, isActive: activer }])));
        let echecs = 0;
        for (const [, s] of entrees) {
            if (s.isActive !== activer) { const r: any = await togglePaymentMethod(s.dbId, activer); if (!r.success) echecs++; }
        }
        if (echecs > 0) { goeyToast.error(`${echecs} moyen(s) n'ont pas pu être modifiés`); setEtats(avant); chargerMoyens().catch(() => { }); }
        else goeyToast.success(activer ? "Tous les moyens sont proposés" : "Tous les moyens sont retirés");
    };

    const resynchroniser = async () => {
        setSynchro(true);
        try { const s = await chargerMoyens(); goeyToast.success(`${Object.keys(s || {}).length} moyens synchronisés`); }
        catch { goeyToast.error("Synchronisation impossible"); }
        finally { setSynchro(false); }
    };

    const nbMobile = useMemo(() => fournisseur.methods.filter(estMobileMoney).length, [fournisseur.methods]);
    const nbActifs = Object.values(etats).filter((s) => s.isActive).length;
    const listeMoyens = useMemo(() => {
        const q = recherche.trim().toLowerCase();
        return fournisseur.methods
            .filter((m) => (!q || m.toLowerCase().includes(q)) && (filtre === "tous" || (filtre === "mobile" ? estMobileMoney(m) : !estMobileMoney(m))))
            .sort((a, b) => a.localeCompare(b, "fr"));
    }, [fournisseur.methods, recherche, filtre]);

    /* ---------- Rendu ---------- */

    const bandeau = connectee
        ? (active
            ? <Aide ton="ok"><CheckCircle2 className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" style={{ color: "#12a594" }} /><strong style={{ color: "var(--dt-text-primary)" }}>{fournisseur.name} encaisse vos clients</strong>{enTest ? " avec vos clés de test : aucun argent réel ne circule." : " en production."} Vos clés sont chiffrées (AES-GCM) et ne sont jamais réaffichées en clair.</Aide>
            : <Aide ton="attention"><Pause className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" style={{ color: "#f59e0b" }} /><strong style={{ color: "var(--dt-text-primary)" }}>Passerelle en pause.</strong> Ses moyens de paiement ne sont plus proposés à vos clients. Réactivez-la en bas de ce panneau.</Aide>)
        : <Aide>Collez les clés API de votre compte {fournisseur.name}. Cartflox les vérifie auprès de {fournisseur.name} avant de les enregistrer : si elles sont bonnes, vos clients peuvent payer tout de suite.</Aide>;

    return (
        <div className="flex h-full min-h-0 flex-col">
            {/* En-tete */}
            <div className="flex items-start gap-3 px-5 pt-5 pb-4" style={{ borderBottom: "1px solid var(--dt-border)" }}>
                <img src={fournisseur.logo} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" style={{ border: "1px solid var(--dt-border)" }} />
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold" style={{ color: "var(--dt-text-primary)" }}>{fournisseur.name}</h2>
                        {connectee ? <Pastille label={active ? "Active" : "En pause"} couleur={active ? "#12a594" : "#f59e0b"} /> : <Pastille label="Non connectée" couleur="#8b8d98" />}
                        {enTest && <Pastille label="Mode test" couleur="#f59e0b" />}
                    </div>
                    <p className="mt-0.5 text-xs" style={{ color: "var(--dt-text-muted)" }}>{fournisseur.description}</p>
                </div>
                <button type="button" onClick={onClose} aria-label="Fermer" className="grid h-8 w-8 shrink-0 place-content-center rounded-lg transition-colors hover:bg-white/5" style={{ color: "var(--dt-text-muted)" }}><X className="h-4 w-4" /></button>
            </div>

            <div className="px-5 pt-4">
                <Onglets<Onglet>
                    items={[
                        { cle: "cles", label: "Clés API", icone: KeyRound },
                        { cle: "moyens", label: connectee ? `Moyens de paiement (${nbActifs}/${fournisseur.methods.length})` : "Moyens de paiement", icone: Smartphone },
                        { cle: "pays", label: `Pays (${fournisseur.countries.length})`, icone: Globe },
                    ]}
                    actif={onglet} onChange={setOnglet} />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                {onglet === "cles" && (
                    <div className="flex flex-col gap-4">
                        {bandeau}

                        {/* Environnement : masque quand le fournisseur ne delivre que des cles de production */}
                        {fournisseur.sansSandbox ? (
                            <p className="rounded-xl px-4 py-3 text-xs leading-relaxed" style={{ border: "1px solid var(--dt-border)", color: "var(--dt-text-muted)" }}>
                                {fournisseur.name} ne propose pas de bac à sable : ces clés sont celles de production, chaque paiement est réel.
                            </p>
                        ) : (
                        <div className="rounded-xl p-4" style={{ border: "1px solid var(--dt-border)" }}>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm font-medium" style={{ color: "var(--dt-text-primary)" }}>Environnement</p>
                                    <p className="text-xs" style={{ color: "var(--dt-text-muted)" }}>Chaque environnement garde son propre jeu de clés.</p>
                                </div>
                                <div className="inline-flex rounded-lg p-0.5" style={{ background: "var(--dt-item-hover)", border: "1px solid var(--dt-border)" }}>
                                    {(["live", "test"] as const).map((m) => (
                                        <button key={m} type="button" onClick={() => { setMode(m); chargerChamps(m); }}
                                            className="h-8 rounded-md px-3.5 text-xs font-medium transition-colors"
                                            style={mode === m ? { background: m === "test" ? "rgba(245,158,11,0.18)" : "var(--dt-card-bg)", color: m === "test" ? "#f59e0b" : "var(--dt-text-primary)", border: "1px solid var(--dt-border)" } : { color: "var(--dt-text-muted)", border: "1px solid transparent" }}>
                                            {m === "live" ? "Live" : "Test (sandbox)"}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <p className="mt-2 text-xs leading-relaxed" style={{ color: mode === "test" ? "#f59e0b" : "var(--dt-text-muted)" }}>
                                {mode === "test"
                                    ? <>Les champs affichent vos clés <strong>de test</strong> ({fournisseur.name} sandbox) : aucun argent réel ne circule. Vos clés live restent enregistrées. Enregistrez pour passer votre page de paiement en mode test.</>
                                    : <>Les champs affichent vos clés <strong>de production</strong>. Vos clés de test restent enregistrées. Enregistrez pour passer votre page de paiement en mode live.</>}
                            </p>
                        </div>
                        )}

                        {/* Instructions de connexion : un seul bloc, replie une fois la passerelle connectee */}
                        <div className="rounded-xl" style={{ background: "var(--dt-item-hover)", color: "var(--dt-text-secondary)" }}>
                            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                                <span className="inline-flex items-center gap-2 text-sm font-medium" style={{ color: "var(--dt-text-primary)" }}><Info className="h-4 w-4" /> Consultez les instructions</span>
                                <button type="button" onClick={() => setInstructions((v) => !v)} className="h-8 rounded-lg px-3 text-xs font-medium" style={{ background: "var(--dt-card-bg)", border: "1px solid var(--dt-border)", color: "var(--dt-text-primary)" }}>
                                    {instructions ? "Masquer" : "Voir les instructions"}
                                </button>
                            </div>
                            {instructions && (
                                <ol className="flex flex-col gap-2.5 px-4 pb-4 text-xs leading-relaxed">
                                    {fournisseur.famille && fournisseur.countries[0] && (
                                        <li className="flex gap-2.5"><span className="mt-px grid h-5 w-5 shrink-0 place-content-center rounded-full text-[11px] font-semibold" style={{ background: "var(--dt-card-bg)", color: "var(--dt-text-primary)", border: "1px solid var(--dt-border)" }}>1</span>
                                            <span>{fournisseur.famille.nom} ouvre un compte par pays : cette carte est celle de <strong style={{ color: "var(--dt-text-primary)" }}>{nomPays(fournisseur.countries[0])}</strong>. Pour un autre pays, connectez sa propre carte.</span></li>
                                    )}
                                    <li className="flex gap-2.5"><span className="mt-px grid h-5 w-5 shrink-0 place-content-center rounded-full text-[11px] font-semibold" style={{ background: "var(--dt-card-bg)", color: "var(--dt-text-primary)", border: "1px solid var(--dt-border)" }}>{fournisseur.famille && fournisseur.countries[0] ? 2 : 1}</span>
                                        <span>Ouvrez votre compte {fournisseur.name.replace(/ (Côte d'Ivoire|Sénégal|Bénin|Mali|Burkina Faso|Togo|Cameroun)$/, "")}{aide ? `, ${aide.ou}` : ", rubrique API ou Développeurs"}, et copiez vos identifiants tels quels dans les champs ci-dessous ({fournisseur.apiFields.filter((f) => !f.optionnel).map((f) => f.label).join(", ")}). Pas encore de compte ? Il s&apos;ouvre en ligne en quelques minutes.
                                            {" "}<a href={aide?.url || siteFournisseur(fournisseur.id)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium" style={{ color: "var(--dt-brand)" }}>Ouvrir {fournisseur.name.replace(/ (Côte d'Ivoire|Sénégal|Bénin|Mali|Burkina Faso|Togo|Cameroun)$/, "")} <ExternalLink className="h-3 w-3" /></a></span></li>
                                    {fournisseur.webhook && (
                                        <li className="flex gap-2.5"><span className="mt-px grid h-5 w-5 shrink-0 place-content-center rounded-full text-[11px] font-semibold" style={{ background: "var(--dt-card-bg)", color: "var(--dt-text-primary)", border: "1px solid var(--dt-border)" }}>{fournisseur.famille && fournisseur.countries[0] ? 3 : 2}</span>
                                            <span><strong style={{ color: "var(--dt-text-primary)" }}>Webhook.</strong> {fournisseur.webhook}
                                                <code className="mt-1.5 block select-all rounded-md px-2 py-1.5 font-mono text-[12px]" style={{ background: "var(--dt-card-bg)", color: "var(--dt-text-primary)" }}>
                                                    {`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/webhooks/${cleFournisseur(fournisseur.id)}`}
                                                </code></span></li>
                                    )}
                                    <li className="flex gap-2.5"><span className="mt-px grid h-5 w-5 shrink-0 place-content-center rounded-full text-[11px] font-semibold" style={{ background: "var(--dt-card-bg)", color: "var(--dt-text-primary)", border: "1px solid var(--dt-border)" }}>{(fournisseur.famille && fournisseur.countries[0] ? 3 : 2) + (fournisseur.webhook ? 1 : 0)}</span>
                                        <span>Enregistrez : Cartflox vérifie vos identifiants auprès de {fournisseur.famille?.nom || fournisseur.name}, puis activez vos moyens de paiement dans l&apos;onglet Moyens.</span></li>
                                </ol>
                            )}
                        </div>

                        {/* Champs */}
                        <div className="flex flex-col gap-3">
                            {fournisseur.apiFields.map((f) => (
                                <label key={f.key} className="block">
                                    <span className="mb-1.5 flex items-center justify-between text-xs font-medium" style={{ color: "var(--dt-text-secondary)" }}>
                                        {f.label}{f.optionnel && <span className="font-normal" style={{ color: "var(--dt-text-muted)" }}>facultatif</span>}{mode === "test" && <span className="font-normal" style={{ color: "#f59e0b" }}>clé de test</span>}
                                    </span>
                                    <span className="relative block">
                                        <input type={visibles[f.key] ? "text" : "password"} value={valeurs[f.key] || ""} onChange={(e) => setValeurs((v) => ({ ...v, [f.key]: e.target.value }))}
                                            placeholder={f.placeholder} autoComplete="off" spellCheck={false}
                                            className="h-10 w-full rounded-lg pl-3 pr-10 font-mono text-[13px] outline-none" style={champStyle} />
                                        <button type="button" onClick={() => setVisibles((v) => ({ ...v, [f.key]: !v[f.key] }))} aria-label={visibles[f.key] ? "Masquer" : "Afficher"}
                                            className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-content-center rounded-md" style={{ color: "var(--dt-text-muted)" }}>
                                            {visibles[f.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </span>
                                </label>
                            ))}
                        </div>

                        {/* Comptes par pays : un fournisseur comme Hub2 ouvre un compte
                            marchand distinct dans chaque pays ou il opere. */}
                        {fournisseur.comptesParPays && mode === "live" && (
                            <div className="rounded-xl p-4" style={{ border: "1px solid var(--dt-border)" }}>
                                <p className="text-sm font-medium" style={{ color: "var(--dt-text-primary)" }}>Comptes par pays</p>
                                <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--dt-text-muted)" }}>
                                    {fournisseur.name} ouvre un compte marchand par pays, chacun avec son propre {fournisseur.comptesParPays.idLabel}.
                                    Ajoutez ici celui de chaque pays où vous encaissez. Un pays sans compte propre utilisera les clés principales ci-dessus.
                                </p>

                                {Object.keys(comptesPays).length > 0 && (
                                    <div className="mt-3 flex flex-col gap-1.5">
                                        {Object.keys(comptesPays).sort().map((code) => (
                                            <div key={code} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ background: "var(--dt-item-hover)" }}>
                                                <span className="text-[13px]" style={{ color: "var(--dt-text-primary)" }}>
                                                    {getCountryByCode(code)?.name || code}
                                                </span>
                                                <span className="flex items-center gap-3">
                                                    <span className="font-mono text-[11px]" style={{ color: "var(--dt-text-muted)" }}>compte enregistré</span>
                                                    <button type="button" onClick={() => setComptesPays((c) => { const s = { ...c }; delete s[code]; return s; })}
                                                        className="text-[11px] font-medium" style={{ color: "#f87171" }}>Retirer</button>
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="mt-3 flex flex-wrap items-end gap-2">
                                    <label className="min-w-[150px] flex-1">
                                        <span className="mb-1.5 block text-xs font-medium" style={{ color: "var(--dt-text-secondary)" }}>Pays</span>
                                        <select value={paysEnCours} onChange={(e) => setPaysEnCours(e.target.value)}
                                            className="h-10 w-full rounded-lg px-3 text-[13px] outline-none" style={champStyle}>
                                            <option value="">Choisir un pays</option>
                                            {fournisseur.countries.map((code) => (
                                                <option key={code} value={code}>{getCountryByCode(code)?.name || code}</option>
                                            ))}
                                        </select>
                                    </label>
                                    <label className="min-w-[150px] flex-1">
                                        <span className="mb-1.5 block text-xs font-medium" style={{ color: "var(--dt-text-secondary)" }}>{fournisseur.comptesParPays.idLabel}</span>
                                        <input value={idEnCours} onChange={(e) => setIdEnCours(e.target.value)} autoComplete="off" spellCheck={false}
                                            className="h-10 w-full rounded-lg px-3 font-mono text-[13px] outline-none" style={champStyle} />
                                    </label>
                                    <label className="min-w-[150px] flex-1">
                                        <span className="mb-1.5 block text-xs font-medium" style={{ color: "var(--dt-text-secondary)" }}>{fournisseur.comptesParPays.cleLabel}</span>
                                        <input type="password" value={cleEnCours} onChange={(e) => setCleEnCours(e.target.value)} autoComplete="off" spellCheck={false}
                                            className="h-10 w-full rounded-lg px-3 font-mono text-[13px] outline-none" style={champStyle} />
                                    </label>
                                    <Bouton variante="secondaire" disabled={!paysEnCours || !idEnCours.trim() || !cleEnCours.trim()}
                                        onClick={() => {
                                            setComptesPays((c) => ({ ...c, [paysEnCours]: { merchantId: idEnCours.trim(), apiKey: cleEnCours.trim() } }));
                                            setPaysEnCours(""); setIdEnCours(""); setCleEnCours("");
                                        }}>Ajouter</Bouton>
                                </div>
                                <p className="mt-2 text-[11px]" style={{ color: "var(--dt-text-muted)" }}>
                                    Les comptes ajoutés sont enregistrés avec le bouton {connectee ? "Enregistrer" : "Connecter"} ci-dessous.
                                </p>
                            </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <span className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: "var(--dt-text-muted)" }}><Lock className="h-3.5 w-3.5" /> Chiffrées AES-GCM sur nos serveurs.</span>
                            <div className="flex flex-wrap gap-2">
                                <Bouton variante="secondaire" onClick={verifier} chargement={verification} disabled={!toutesLesCles}>Vérifier les clés</Bouton>
                                {connectee
                                    ? <Bouton onClick={enregistrer} chargement={enregistrement} disabled={!toutesLesCles}>Enregistrer</Bouton>
                                    : <Bouton onClick={connecter} chargement={connexion} disabled={!toutesLesCles}>Connecter {fournisseur.name}</Bouton>}
                            </div>
                        </div>

                        {connectee && (
                            <div className="mt-2 rounded-xl" style={{ border: "1px solid var(--dt-border)" }}>
                                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--dt-border)" }}>
                                    <div>
                                        <p className="text-sm font-medium" style={{ color: "var(--dt-text-primary)" }}>{active ? "Mettre en pause" : "Réactiver la passerelle"}</p>
                                        <p className="text-xs" style={{ color: "var(--dt-text-muted)" }}>{active ? "Ses moyens de paiement disparaissent de votre page de paiement, vos clés restent enregistrées." : "Ses moyens de paiement réapparaissent immédiatement."}</p>
                                    </div>
                                    <Bouton variante="secondaire" icone={active ? Pause : Play} onClick={basculerStatut} chargement={bascule}>{active ? "Mettre en pause" : "Réactiver"}</Bouton>
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                                    <div>
                                        <p className="text-sm font-medium" style={{ color: "var(--dt-text-primary)" }}>Retirer {fournisseur.name}</p>
                                        <p className="text-xs" style={{ color: "var(--dt-text-muted)" }}>Supprime les clés et la configuration des moyens. Les paiements déjà encaissés restent dans votre historique.</p>
                                    </div>
                                    {confirmerSuppression ? (
                                        <div className="flex items-center gap-2">
                                            <span className="inline-flex items-center gap-1 text-xs" style={{ color: "#f87171" }}><AlertTriangle className="h-3.5 w-3.5" /> Sûr ?</span>
                                            <Bouton variante="danger" onClick={supprimer} chargement={suppression}>Oui, retirer</Bouton>
                                            <Bouton variante="discret" onClick={() => setConfirmerSuppression(false)}>Annuler</Bouton>
                                        </div>
                                    ) : (
                                        <Bouton variante="danger" icone={Trash2} onClick={() => setConfirmerSuppression(true)}>Retirer</Bouton>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {onglet === "moyens" && (
                    !connectee ? (
                        <div className="flex flex-col items-center gap-3 rounded-xl px-4 py-10 text-center" style={{ border: "1px dashed var(--dt-border)" }}>
                            <KeyRound className="h-6 w-6" style={{ color: "var(--dt-text-muted)" }} />
                            <p className="text-sm font-medium" style={{ color: "var(--dt-text-primary)" }}>Connectez d&apos;abord {fournisseur.name}</p>
                            <p className="max-w-sm text-xs leading-relaxed" style={{ color: "var(--dt-text-muted)" }}>Une fois vos clés enregistrées, vous choisirez ici les {fournisseur.methods.length} moyens de paiement à proposer à vos clients ({nbMobile} Mobile Money, {fournisseur.methods.length - nbMobile} cartes et autres).</p>
                            <Bouton variante="secondaire" onClick={() => setOnglet("cles")}>Saisir mes clés</Bouton>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs" style={{ color: "var(--dt-text-muted)" }}>
                                    <strong style={{ color: "var(--dt-text-primary)" }}>{nbActifs}</strong> proposé{nbActifs > 1 ? "s" : ""} à vos clients sur {fournisseur.methods.length}. Un moyen jamais activé est créé au premier clic.
                                </p>
                                <div className="flex items-center gap-1">
                                    <button type="button" onClick={() => basculerTout(true)} className="h-7 rounded-md px-2 text-xs font-medium" style={{ color: "var(--dt-text-secondary)", background: "var(--dt-item-hover)" }}>Tout proposer</button>
                                    <button type="button" onClick={() => basculerTout(false)} className="h-7 rounded-md px-2 text-xs font-medium" style={{ color: "var(--dt-text-secondary)", background: "var(--dt-item-hover)" }}>Tout retirer</button>
                                    <button type="button" onClick={resynchroniser} title="Resynchroniser avec la base" className="grid h-7 w-7 place-content-center rounded-md" style={{ color: "var(--dt-text-muted)", background: "var(--dt-item-hover)" }}>
                                        <RefreshCw className={`h-3.5 w-3.5 ${synchro ? "animate-spin" : ""}`} />
                                    </button>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="relative min-w-[180px] flex-1">
                                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" style={{ color: "var(--dt-text-muted)" }} />
                                    <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un opérateur, un pays…" className="h-9 w-full rounded-lg pl-9 pr-3 text-sm outline-none" style={champStyle} />
                                </div>
                                <div className="inline-flex rounded-lg p-0.5" style={{ background: "var(--dt-item-hover)", border: "1px solid var(--dt-border)" }}>
                                    {([["tous", `Tous (${fournisseur.methods.length})`], ["mobile", `Mobile Money (${nbMobile})`], ["carte", `Cartes et autres (${fournisseur.methods.length - nbMobile})`]] as [Filtre, string][]).map(([cle, label]) => (
                                        <button key={cle} type="button" onClick={() => setFiltre(cle)} className="h-7 whitespace-nowrap rounded-md px-2.5 text-xs font-medium transition-colors"
                                            style={filtre === cle ? { background: "var(--dt-card-bg)", color: "var(--dt-text-primary)", border: "1px solid var(--dt-border)" } : { color: "var(--dt-text-muted)", border: "1px solid transparent" }}>{label}</button>
                                    ))}
                                </div>
                            </div>

                            <div className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--dt-border)" }}>
                                {chargementMoyens && Object.keys(etats).length === 0 && (
                                    <div className="px-4 py-3 text-xs" style={{ color: "var(--dt-text-muted)" }}>Lecture de vos moyens de paiement…</div>
                                )}
                                {listeMoyens.map((nom, i) => {
                                    const etat = etats[nom];
                                    const pays = paysDeMethode(nom);
                                    return (
                                        <div key={nom} className="flex items-center gap-3 px-3 py-2.5" style={{ borderTop: i === 0 ? "none" : "1px solid var(--dt-divider)" }}>
                                            <img src={getMethodLogo(nom) || fournisseur.logo} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" style={{ background: "#fff" }} />
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-medium" style={{ color: "var(--dt-text-primary)" }}>{nom}</p>
                                                <p className="text-[11px]" style={{ color: "var(--dt-text-muted)" }}>
                                                    <Drapeau code={codeDuPays(pays)} taille={10} style={{ marginRight: 4 }} />{pays}, {estMobileMoney(nom) ? "Mobile Money" : estCarte(nom) ? "Carte bancaire" : "Autre"}{!etat && " : jamais activé"}
                                                </p>
                                            </div>
                                            <Interrupteur actif={!!etat?.isActive} onChange={() => basculerMoyen(nom)} />
                                        </div>
                                    );
                                })}
                                {listeMoyens.length === 0 && <div className="px-4 py-8 text-center text-xs" style={{ color: "var(--dt-text-muted)" }}>Aucun moyen ne correspond.</div>}
                            </div>
                        </div>
                    )
                )}

                {onglet === "pays" && (
                    <div className="flex flex-col gap-3">
                        <p className="text-xs leading-relaxed" style={{ color: "var(--dt-text-muted)" }}>
                            Les pays que Cartflox sait router avec {fournisseur.name}, et le moyen de paiement proposé dans chacun.{" "}
                            {fournisseur.name} en couvre parfois davantage : dites-le nous si le vôtre manque.
                        </p>

                        {moyensParPays.Global?.length ? (
                            <div className="rounded-lg px-3.5 py-3 text-xs leading-relaxed" style={{ background: "var(--dt-item-hover)", color: "var(--dt-text-secondary)" }}>
                                <strong style={{ color: "var(--dt-text-primary)" }}>Partout dans cette liste :</strong> {moyensParPays.Global.join(", ")}.
                            </div>
                        ) : null}

                        <label className="relative block">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--dt-text-muted)" }} />
                            <input value={cherchePays} onChange={(e) => setCherchePays(e.target.value)} placeholder="Rechercher un pays" spellCheck={false}
                                className="h-10 w-full rounded-lg pl-9 pr-3 text-sm outline-none" style={champStyle} />
                        </label>

                        {paysTrouves.length === 0 ? (
                            <p className="px-1 py-6 text-center text-xs" style={{ color: "var(--dt-text-muted)" }}>Aucun pays ne correspond. {fournisseur.name} n&apos;est peut-être pas la bonne passerelle pour ce marché.</p>
                        ) : (
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {paysTrouves.map((c) => {
                                    const locaux = moyensParPays[nomPays(c)] || [];
                                    return (
                                        <div key={c} className="flex items-start gap-2.5 rounded-lg px-3 py-2.5" style={{ border: "1px solid var(--dt-border)" }}>
                                            <span className="mt-0.5 shrink-0"><Drapeau code={c} taille={13} /></span>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-[13px] font-medium" style={{ color: "var(--dt-text-primary)" }}>{nomPays(c)}</p>
                                                <p className="mt-0.5 text-[11px] leading-relaxed" style={{ color: "var(--dt-text-muted)" }}>
                                                    {locaux.length ? locaux.join(", ") : "Carte bancaire uniquement"}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
