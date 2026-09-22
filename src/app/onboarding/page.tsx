"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { CoqueAuth, Titre, PiedCarteAuth, themeAuth } from "@/components/auth/coque-auth";
import { BoutonPrincipal, Etiquette, champStyle, Alerte } from "@/components/checkout/coque";
import { Liste } from "@/components/auth/liste";
import { optionsPays, SECTEURS } from "@/components/auth/pays";
import { Drapeau } from "@/components/ui/drapeau";

/**
 * Ouverture du premier espace, en deux temps : ce que fait le commerce, puis
 * ce qui va se passer. Le formulaire part vers /api/onboarding, qui crée
 * l'espace et renvoie sur le tableau de bord.
 */
export default function PageOnboarding() {
    const t = themeAuth;
    const pays = useMemo(() => optionsPays(), []);
    const [etape, setEtape] = useState(1);
    const [nom, setNom] = useState("");
    const [secteur, setSecteur] = useState("");
    const [paysChoisi, setPaysChoisi] = useState("");
    const [site, setSite] = useState("");
    const [erreurs, setErreurs] = useState<Record<string, boolean>>({});
    const [envoi, setEnvoi] = useState(false);

    function continuer() {
        const e: Record<string, boolean> = {
            nom: nom.trim().length < 2,
            secteur: !secteur,
            pays: !paysChoisi,
            site: site.trim().length < 4,
        };
        setErreurs(e);
        if (Object.values(e).some(Boolean)) return;
        setEtape(2);
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    const manque = Object.values(erreurs).some(Boolean);
    const codePaysChoisi = pays.find((p) => p.valeur === paysChoisi)?.codePays;

    return (
        <CoqueAuth largeur={520}>
            <div>
                {/* Progression */}
                <div className="mb-5 flex items-center gap-2">
                    {[1, 2].map((n) => (
                        <span key={n} className="h-1 flex-1 rounded-full transition-colors"
                            style={{ background: n <= etape ? t.accent : t.divider }} />
                    ))}
                    <span className="ml-1 text-[12px]" style={{ color: t.textMuted }}>{etape} sur 2</span>
                </div>

                <form method="post" action="/api/onboarding" onSubmit={() => setEnvoi(true)}>
                    <input type="hidden" name="name" value={nom.trim()} />
                    <input type="hidden" name="category" value={secteur} />
                    <input type="hidden" name="country" value={paysChoisi} />
                    <input type="hidden" name="website" value={site.trim()} />
                    <input type="hidden" name="mode" value="own_keys" />

                    {etape === 1 ? (
                        <>
                            <Titre titre="Parlez-nous de votre activité" sousTitre="Ces informations apparaissent sur la page de paiement que verront vos clients." />

                            {manque && <div className="mb-4"><Alerte theme={t} titre="Il manque quelque chose" texte="Complétez les champs signalés pour continuer." /></div>}

                            <div className="grid gap-4">
                                <div>
                                    <Etiquette theme={t}>Nom de votre commerce</Etiquette>
                                    <input value={nom} onChange={(e) => { setNom(e.target.value); setErreurs((x) => ({ ...x, nom: false })); }}
                                        autoComplete="organization" placeholder="Boutique Awa"
                                        className="h-12 w-full rounded-xl px-4 outline-none" style={champStyle(t, erreurs.nom)} />
                                </div>

                                <div>
                                    <Etiquette theme={t}>Secteur d&apos;activité</Etiquette>
                                    <Liste theme={t} options={SECTEURS} valeur={secteur} vide="Choisir un secteur" erreur={erreurs.secteur}
                                        onChange={(v) => { setSecteur(v); setErreurs((x) => ({ ...x, secteur: false })); }} />
                                </div>

                                <div>
                                    <Etiquette theme={t}>Pays principal</Etiquette>
                                    <Liste theme={t} options={pays} valeur={paysChoisi} vide="Choisir un pays" recherche="Rechercher un pays" erreur={erreurs.pays}
                                        onChange={(v) => { setPaysChoisi(v); setErreurs((x) => ({ ...x, pays: false })); }} />
                                </div>

                                <div>
                                    <Etiquette theme={t}>Site web ou page</Etiquette>
                                    <input value={site} onChange={(e) => { setSite(e.target.value); setErreurs((x) => ({ ...x, site: false })); }}
                                        autoComplete="url" placeholder="maboutique.com ou instagram.com/maboutique"
                                        className="h-12 w-full rounded-xl px-4 outline-none" style={champStyle(t, erreurs.site)} />
                                    <p className="mt-1.5 text-[12px]" style={{ color: t.textMuted }}>Votre site, ou votre page Instagram, Facebook ou WhatsApp Business.</p>
                                </div>

                                <BoutonPrincipal theme={t} type="button" onClick={continuer}>Continuer <ArrowRight size={16} /></BoutonPrincipal>
                            </div>
                        </>
                    ) : (
                        <>
                            <Titre titre="Comment vous allez encaisser" sousTitre="Voici ce qui se passe une fois votre espace créé." />

                            <div className="mb-5 flex flex-wrap gap-2">
                                {[nom.trim(), secteur].filter(Boolean).map((x) => (
                                    <span key={x} className="rounded-full px-3 py-1.5 text-[12.5px]" style={{ background: t.methodHoverBg, color: t.textSecondary }}>{x}</span>
                                ))}
                                {paysChoisi && (
                                    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px]" style={{ background: t.methodHoverBg, color: t.textSecondary }}>
                                        {codePaysChoisi && <Drapeau code={codePaysChoisi} taille={12} />}{paysChoisi}
                                    </span>
                                )}
                            </div>

                            <ol className="grid gap-4 rounded-xl p-5" style={{ border: `1px solid ${t.methodBorder}` }}>
                                {[
                                    ["Vous branchez votre agrégateur", "PayDunya, CinetPay, PawaPay, Stripe : vous collez les clés de votre compte dans Cartflox. Pas encore de compte ? Il s'ouvre en ligne en quelques minutes."],
                                    ["Vos clients paient", "Sur votre page Cartflox : Orange Money, Wave, MTN MoMo, Moov ou carte. Par un lien, sur votre site ou avec WooCommerce."],
                                    ["L'argent arrive chez vous", "Directement sur votre compte agrégateur. Cartflox ne le touche jamais et ne prend aucune commission. Vous êtes prévenu ici et par e-mail."],
                                ].map(([titre, texte], i) => (
                                    <li key={titre} className="flex gap-3">
                                        <span className="grid h-6 w-6 shrink-0 place-content-center rounded-full text-[12px] font-semibold" style={{ background: t.accent, color: t.accentText }}>{i + 1}</span>
                                        <div>
                                            <p className="text-[14px] font-semibold" style={{ color: t.textPrimary }}>{titre}</p>
                                            <p className="mt-0.5 text-[13px] leading-relaxed" style={{ color: t.textSecondary }}>{texte}</p>
                                        </div>
                                    </li>
                                ))}
                            </ol>

                            <div className="mt-5 flex gap-2.5">
                                <button type="button" onClick={() => setEtape(1)}
                                    className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl px-4 text-[14px] font-medium"
                                    style={{ background: t.methodHoverBg, color: t.textSecondary }}>
                                    <ArrowLeft size={15} /> Retour
                                </button>
                                <BoutonPrincipal theme={t} type="submit" disabled={envoi}>
                                    {envoi ? <><Loader2 size={17} className="animate-spin" /> Création</> : <><Check size={16} /> Créer mon espace</>}
                                </BoutonPrincipal>
                            </div>
                        </>
                    )}
                </form>

                {etape === 1 && (
                    <p className="mt-5 text-center text-[13px]" style={{ color: t.textMuted }}>
                        <a href="/dashboard" className="no-underline hover:underline" style={{ color: t.textMuted }}>Passer pour l&apos;instant</a>
                    </p>
                )}
            </div>
            <PiedCarteAuth texte="Vous pourrez tout modifier ensuite" />
        </CoqueAuth>
    );
}
