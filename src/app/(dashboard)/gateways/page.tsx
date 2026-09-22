"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Globe, KeyRound, Plus, Route, Search, Settings2, Smartphone, Zap } from "lucide-react";
import { goeyToast } from "goey-toast";
import { getGateways, updateGatewayStatus } from "@/lib/actions/gateways";
import { getPaymentMethods } from "@/lib/actions/methods";
import { Bloc, Bouton, Interrupteur, Page, Pastille, Squelette, Vide, carte, champStyle } from "@/components/dashboard/kit";
import { ALL_PROVIDERS, PAYS_FILTRES, getMethodLogo, nomPays, type Fournisseur } from "@/components/dashboard/passerelles/catalogue";
import { ConfigurationPasserelle } from "@/components/dashboard/passerelles/configuration";
import { Drapeau } from "@/components/ui/drapeau";

/**
 * Passerelles : les comptes du marchand chez les agregateurs. En haut l'etat
 * de ce qui est connecte, en bas le catalogue pour en brancher une autre.
 * La configuration (cles, moyens de paiement) s'ouvre dans un panneau lateral.
 */

type Onglet = "cles" | "moyens";
type Tiroir = { fournisseur: Fournisseur; onglet: Onglet } | null;

export default function GatewaysPage() {
    const [passerelles, setPasserelles] = useState<any[]>([]);
    const [moyens, setMoyens] = useState<any[]>([]);
    const [chargement, setChargement] = useState(true);
    const [recherche, setRecherche] = useState("");
    const [pays, setPays] = useState("");
    const [tiroir, setTiroir] = useState<Tiroir>(null);
    const [enBascule, setEnBascule] = useState<string | null>(null);

    const charger = useCallback(async (silencieux = false) => {
        if (!silencieux) setChargement(true);
        const [g, m] = await Promise.all([getGateways(), getPaymentMethods().catch(() => [] as any[])]);
        setPasserelles(g || []);
        setMoyens(m || []);
        setChargement(false);
    }, []);
    useEffect(() => { charger(); }, [charger]);

    // Panneau ouvert : fermeture a la touche Echap, et la bulle du chat s'efface
    // pour ne pas recouvrir les boutons du bas.
    useEffect(() => {
        if (!tiroir) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setTiroir(null); };
        window.addEventListener("keydown", onKey);
        const chat = (window as any).$chatwoot;
        try { chat?.toggleBubbleVisibility?.("hide"); } catch { /* widget absent */ }
        return () => {
            window.removeEventListener("keydown", onKey);
            try { chat?.toggleBubbleVisibility?.("show"); } catch { /* widget absent */ }
        };
    }, [tiroir]);

    // Une passerelle porte le nom exact de sa carte. L'ancien rattachement par
    // inclusion de l'id reste pour les lignes nommees librement, sauf quand une
    // autre carte porte exactement ce nom (« Flutterwave » n'est pas « Wave »).
    const passerelleDe = useCallback((p: Fournisseur) => passerelles.find((g) => {
        const nom = String(g.name || "").toLowerCase();
        if (nom === p.name.toLowerCase()) return true;
        return !p.famille && nom.includes(p.id) && !ALL_PROVIDERS.some((x) => x.name.toLowerCase() === nom);
    }), [passerelles]);

    const bilanMoyens = useCallback((p: Fournisseur, g: any) => {
        const nomLc = p.name.toLowerCase();
        const liste = moyens.filter((m) => m.gateway?.toLowerCase() === nomLc || m.gatewayId === g?.id ||
            (Array.isArray(m.providers) && m.providers.some((x: any) => x.gatewayId === g?.id || x.provider?.toLowerCase() === nomLc)));
        const actifs = liste.filter((m) => {
            const propre = Array.isArray(m.providers) ? m.providers.find((x: any) => x.gatewayId === g?.id || x.provider?.toLowerCase() === nomLc) : null;
            return propre ? (propre.isActive ?? true) : m.isActive !== false;
        });
        return { total: liste.length, actifs: actifs.length, logos: actifs.slice(0, 5).map((m) => m.logo || getMethodLogo(m.name) || p.logo) };
    }, [moyens]);

    const connectes = useMemo(() => ALL_PROVIDERS.filter((p) => passerelleDe(p)), [passerelleDe]);
    const catalogue = useMemo(() => {
        const q = recherche.trim().toLowerCase();
        return ALL_PROVIDERS.filter((p) =>
            (!q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.methods.some((m) => m.toLowerCase().includes(q))) &&
            (!pays || p.countries.includes(pays)));
    }, [recherche, pays]);

    const stats = useMemo(() => {
        const actives = passerelles.filter((g) => g.status === "active");
        return {
            connectees: passerelles.length,
            actives: actives.length,
            test: actives.filter((g) => g.config?.mode === "test").length,
            moyensActifs: connectes.reduce((n, p) => n + bilanMoyens(p, passerelleDe(p)).actifs, 0),
        };
    }, [passerelles, connectes, bilanMoyens, passerelleDe]);

    const basculerStatut = async (g: any, actif: boolean) => {
        setEnBascule(g.id);
        try {
            await updateGatewayStatus(g.id, actif ? "active" : "inactive");
            goeyToast.success(actif ? `${g.name} réactivée` : `${g.name} en pause : elle n'encaisse plus`);
            window.dispatchEvent(new Event("afriflow-env-mode-change"));
            await charger(true);
        } catch { goeyToast.error("Changement impossible"); }
        finally { setEnBascule(null); }
    };

    const ouvrir = (fournisseur: Fournisseur, onglet: Onglet = "cles") => setTiroir({ fournisseur, onglet });
    const versCatalogue = () => {
        document.getElementById("catalogue")?.scrollIntoView({ behavior: "smooth", block: "start" });
        setTimeout(() => document.getElementById("recherche-catalogue")?.focus(), 400);
    };

    const tuile = (label: string, valeur: string, detail: string, Icone: typeof Globe) => (
        <div className="flex items-center gap-3 rounded-xl p-4" style={carte}>
            <span className="grid h-10 w-10 shrink-0 place-content-center rounded-lg" style={{ background: "var(--dt-item-hover)", color: "var(--dt-text-secondary)" }}><Icone className="h-[18px] w-[18px]" /></span>
            <div className="min-w-0">
                <p className="text-xs" style={{ color: "var(--dt-text-muted)" }}>{label}</p>
                <p className="text-lg font-semibold leading-tight" style={{ color: "var(--dt-text-primary)" }}>{valeur}</p>
                <p className="truncate text-[11px]" style={{ color: "var(--dt-text-muted)" }}>{detail}</p>
            </div>
        </div>
    );

    return (
        <Page large titre="Passerelles"
            sousTitre="Une passerelle, c'est votre compte chez un agrégateur (PayDunya, CinetPay, PawaPay, Stripe…) : c'est lui qui encaisse vos clients et vous verse l'argent. Connectez la vôtre, choisissez ses moyens de paiement, Cartflox s'occupe du reste."
            action={<Bouton icone={Plus} onClick={versCatalogue}>Connecter une passerelle</Bouton>}>

            {/* Etat en un coup d'oeil */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {tuile("Passerelles connectées", chargement ? "…" : String(stats.connectees), stats.connectees === 0 ? "Aucune pour l'instant" : `${stats.actives} active${stats.actives > 1 ? "s" : ""}${stats.connectees - stats.actives > 0 ? `, ${stats.connectees - stats.actives} en pause` : ""}`, Globe)}
                {tuile("Moyens proposés à vos clients", chargement ? "…" : String(stats.moyensActifs), "Orange Money, Wave, MTN, carte…", Smartphone)}
                {tuile("Environnement", chargement ? "…" : stats.test > 0 ? "Test" : "Live", stats.test > 0 ? `${stats.test} passerelle${stats.test > 1 ? "s" : ""} avec des clés de test` : stats.actives > 0 ? "Argent réel, clés de production" : "Se règle passerelle par passerelle", Zap)}
            </div>

            {/* Passerelles connectees */}
            <Bloc titre="Vos passerelles" sousTitre="Cliquez sur une ligne pour modifier ses clés ou ses moyens de paiement. L'interrupteur la met en pause sans rien effacer.">
                {chargement ? <Squelette lignes={3} /> : connectes.length === 0 ? (
                    <Vide icone={KeyRound} titre="Aucune passerelle connectée"
                        texte="Choisissez votre agrégateur dans le catalogue ci-dessous, collez ses clés API, activez ses moyens de paiement : vos clients peuvent payer dans les cinq minutes."
                        action={<Bouton icone={Plus} onClick={versCatalogue}>Choisir une passerelle</Bouton>} />
                ) : (
                    <div className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--dt-border)" }}>
                        {connectes.map((p, i) => {
                            const g = passerelleDe(p);
                            const actif = g.status === "active";
                            const enTest = g.config?.mode === "test";
                            const b = bilanMoyens(p, g);
                            return (
                                <div key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-white/[0.02]" style={{ borderTop: i === 0 ? "none" : "1px solid var(--dt-divider)" }}>
                                    <button type="button" onClick={() => ouvrir(p)} className="flex min-w-[220px] flex-1 items-center gap-3 text-left">
                                        <img src={p.logo} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" style={{ border: "1px solid var(--dt-border)" }} />
                                        <span className="min-w-0">
                                            <span className="flex flex-wrap items-center gap-2">
                                                <span className="text-sm font-semibold" style={{ color: "var(--dt-text-primary)" }}>{p.name}</span>
                                                <Pastille label={actif ? "Active" : "En pause"} couleur={actif ? "#12a594" : "#f59e0b"} />
                                                {enTest && <Pastille label="Test" couleur="#f59e0b" />}
                                            </span>
                                            <span className="mt-0.5 block truncate text-xs" style={{ color: "var(--dt-text-muted)" }}>
                                                {p.countries.slice(0, 6).map((c) => <Drapeau key={c} code={c} nom={nomPays(c)} taille={10} style={{ marginRight: 3 }} />)}{p.countries.length > 6 ? ` +${p.countries.length - 6}` : ""}
                                                {g.successRate && g.successRate !== "0%" ? ` : ${g.successRate} de paiements réussis` : " : aucun paiement pour l'instant"}
                                            </span>
                                        </span>
                                    </button>

                                    <button type="button" onClick={() => ouvrir(p, "moyens")} className="flex items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-white/5" title="Choisir les moyens de paiement">
                                        <span className="flex -space-x-1.5">
                                            {b.logos.map((src, k) => <img key={k} src={src} alt="" className="h-6 w-6 rounded-full object-cover" style={{ background: "#fff", border: "2px solid var(--dt-card-bg)" }} />)}
                                            {b.actifs === 0 && <span className="grid h-6 w-6 place-content-center rounded-full text-[10px]" style={{ background: "var(--dt-item-hover)", color: "var(--dt-text-muted)" }}>0</span>}
                                        </span>
                                        <span className="text-xs" style={{ color: b.actifs === 0 ? "#f59e0b" : "var(--dt-text-secondary)" }}>
                                            {b.actifs === 0 ? "Aucun moyen proposé" : `${b.actifs} moyen${b.actifs > 1 ? "s" : ""} proposé${b.actifs > 1 ? "s" : ""}`}
                                        </span>
                                    </button>

                                    <div className="flex items-center gap-2">
                                        <Bouton variante="secondaire" icone={Settings2} onClick={() => ouvrir(p)} className="h-8 px-3 text-xs">Configurer</Bouton>
                                        <Interrupteur actif={actif} disabled={enBascule === g.id} onChange={(v) => basculerStatut(g, v)} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Bloc>

            {/* Routage */}
            <Link href="/methods?tab=routing" className="flex flex-wrap items-center gap-3 rounded-xl px-5 py-4 transition-colors hover:bg-white/[0.02]" style={{ ...carte, textDecoration: "none" }}>
                <span className="grid h-10 w-10 shrink-0 place-content-center rounded-lg" style={{ background: "rgba(31,147,255,0.12)", color: "var(--dt-brand)" }}><Route className="h-[18px] w-[18px]" /></span>
                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold" style={{ color: "var(--dt-text-primary)" }}>Routage intelligent</span>
                    <span className="block text-xs" style={{ color: "var(--dt-text-muted)" }}>Avec plusieurs passerelles connectées, Cartflox envoie chaque paiement vers la moins chère et la plus fiable pour le pays du client, et bascule automatiquement en cas de panne.</span>
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: "var(--dt-brand)" }}>Régler <ArrowRight className="h-3.5 w-3.5" /></span>
            </Link>

            {/* Catalogue */}
            <Bloc id="catalogue" titre="Catalogue des passerelles" sousTitre={`${new Set(ALL_PROVIDERS.map((p) => p.famille?.id || p.id)).size} agrégateurs pris en charge. Filtrez par pays pour trouver ceux qui couvrent vos clients.`}
                action={
                    <div className="relative w-full sm:w-72">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--dt-text-muted)" }} />
                        <input id="recherche-catalogue" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="PayDunya, Wave, Cameroun…" className="h-9 w-full rounded-lg pl-9 pr-3 text-sm outline-none" style={champStyle} />
                    </div>
                }>
                <div className="mb-4 flex flex-wrap gap-1.5">
                    {["", ...PAYS_FILTRES].map((c) => (
                        <button key={c || "tous"} type="button" onClick={() => setPays(c)} className="h-7 rounded-full px-3 text-xs font-medium transition-colors"
                            style={pays === c ? { background: "var(--dt-brand)", color: "#fff", border: "1px solid transparent" } : { background: "transparent", color: "var(--dt-text-secondary)", border: "1px solid var(--dt-border)" }}>
                            {c ? <><Drapeau code={c} taille={11} style={{ marginRight: 5 }} />{nomPays(c)}</> : "Toutes les passerelles"}
                        </button>
                    ))}
                </div>

                {catalogue.length === 0 ? (
                    <Vide icone={Search} titre="Aucune passerelle ne correspond" texte="Essayez un autre pays ou un autre nom d'opérateur." />
                ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {catalogue.map((p) => {
                            const g = passerelleDe(p);
                            return (
                                <div key={p.id} className="flex flex-col gap-3 rounded-xl p-4 transition-colors hover:bg-white/[0.02]" style={{ border: `1px solid ${g ? "rgba(18,165,148,0.35)" : "var(--dt-border)"}` }}>
                                    <div className="flex items-start gap-3">
                                        <img src={p.logo} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" style={{ border: "1px solid var(--dt-border)" }} />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <p className="truncate text-sm font-semibold" style={{ color: "var(--dt-text-primary)" }}>{p.name}</p>
                                                {g && <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "#12a594" }} />}
                                            </div>
                                            <p className="text-xs leading-snug" style={{ color: "var(--dt-text-muted)" }}>{p.description}</p>
                                        </div>
                                    </div>
                                    <p className="text-xs" style={{ color: "var(--dt-text-secondary)" }} title={p.countries.map(nomPays).join(", ")}>
                                        <span className="mr-1 inline-flex items-center gap-1 align-middle">{p.countries.slice(0, 7).map((c) => <Drapeau key={c} code={c} nom={nomPays(c)} taille={11} />)}</span>
                                        {p.countries.length > 7 && <span style={{ color: "var(--dt-text-muted)" }}>+{p.countries.length - 7}</span>}
                                    </p>
                                    <div className="mt-auto flex items-center justify-between gap-2">
                                        <span className="text-xs" style={{ color: "var(--dt-text-muted)" }}>{p.methods.length} moyens de paiement</span>
                                        {g
                                            ? <Bouton variante="secondaire" onClick={() => ouvrir(p)} className="h-8 px-3 text-xs">Configurer</Bouton>
                                            : <Bouton onClick={() => ouvrir(p)} className="h-8 px-3 text-xs">Connecter</Bouton>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Bloc>

            {/* Passerelle absente du catalogue : c'est le marchand qui dit laquelle brancher ensuite. */}

            {/* Panneau lateral de configuration */}
            {tiroir && (
                <div className="fixed inset-0 z-[120]" role="dialog" aria-modal="true" aria-label={`Configuration ${tiroir.fournisseur.name}`}>
                    <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.55)" }} onClick={() => setTiroir(null)} />
                    <div className="absolute inset-y-0 right-0 flex w-full max-w-[640px] flex-col shadow-2xl" style={{ background: "var(--dt-card-bg)", borderLeft: "1px solid var(--dt-border)" }}>
                        <ConfigurationPasserelle key={tiroir.fournisseur.id} fournisseur={tiroir.fournisseur} passerelle={passerelleDe(tiroir.fournisseur) || null}
                            ongletInitial={tiroir.onglet} onUpdate={() => charger(true)} onClose={() => setTiroir(null)} />
                    </div>
                </div>
            )}
        </Page>
    );
}
