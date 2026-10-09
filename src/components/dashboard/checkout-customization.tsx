"use client";

import { useEffect, useState } from "react";
import { MARQUE } from "@/lib/marque";
import { Loader2, RotateCcw, Save, Check } from "lucide-react";
import { goeyToast } from "goey-toast";
import { CHECKOUT_THEMES } from "@/lib/checkout-themes";
import { CHECKOUT_STYLES, DEFAULT_STYLE, type CheckoutStyleId } from "@/lib/checkout-styles";
import { getCheckoutCustomization, updateCheckoutTheme, updateCheckoutCustomTheme, updateCheckoutStyle } from "@/lib/actions/settings";
import { chiffreMontant, formaterMontant } from "@/lib/devises";
import { montantExemple } from "@/lib/taux-change";

/**
 * Personnalisation de la page de paiement hebergee : un theme pret a l'emploi,
 * ou ses propres couleurs. L'apercu de droite est la carte que verra le client.
 */

type Perso = { accent: string; accentText: string; pageBg: string; cardBg: string; textPrimary: string; textMuted: string; radius: number };
const DEFAUT: Perso = { accent: "#1a1a1c", accentText: "#ffffff", pageBg: "#F4F4F7", cardBg: "#FFFFFF", textPrimary: "#1a1a1c", textMuted: "#8a8a93", radius: 20 };

const CHAMPS: { cle: keyof Perso; label: string; aide: string }[] = [
    { cle: "accent", label: "Couleur du bouton", aide: "Le bouton Payer et la sélection" },
    { cle: "accentText", label: "Texte du bouton", aide: "Blanc sur un bouton foncé, noir sur un bouton clair" },
    { cle: "pageBg", label: "Fond de la page", aide: "Derrière la carte de paiement" },
    { cle: "cardBg", label: "Fond de la carte", aide: "La carte qui contient le formulaire" },
    { cle: "textPrimary", label: "Texte principal", aide: "Montant, noms des moyens de paiement" },
    { cle: "textMuted", label: "Texte secondaire", aide: "Libellés et aides" },
];

/**
 * Miniature d'un style : la disposition en gris, sans couleur de marque, pour
 * comparer d'un coup d'oeil. Les memes proportions que la vraie page.
 */
function Miniature({ id }: { id: CheckoutStyleId }) {
    const fond = "rgba(127,127,127,0.12)";
    const trait = "rgba(127,127,127,0.35)";
    const encre = "var(--dt-text-primary)";
    const carte = { background: "var(--dt-card-bg)", border: `1px solid ${trait}`, borderRadius: 6 } as const;
    const ligne = (w: string, h = 3) => <div style={{ width: w, height: h, borderRadius: 2, background: trait }} />;
    const bouton = <div style={{ height: 6, borderRadius: 3, background: encre, opacity: 0.85 }} />;
    const etapes = <div className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "#12a594" }} /><div style={{ flex: 1, height: 1, background: trait }} /><span className="h-2 w-2 rounded-full" style={{ background: encre }} /><div style={{ flex: 1, height: 1, background: trait }} /><span className="h-2 w-2 rounded-full" style={{ background: trait }} /></div>;
    if (id === "classique") return (
        <div className="flex h-16 gap-2 rounded-lg p-2" style={{ background: fond }}>
            <div className="flex w-2/5 flex-col justify-center gap-1.5">{ligne("50%")}{ligne("80%", 5)}{ligne("60%")}</div>
            <div className="flex flex-1 flex-col justify-center gap-1.5 p-2" style={carte}>{ligne("70%")}{ligne("100%", 4)}{bouton}</div>
        </div>
    );
    if (id === "cartes") return (
        <div className="flex h-16 flex-col gap-1.5 rounded-lg p-2" style={{ background: fond }}>
            <div className="flex items-center gap-1.5 px-2 py-1" style={carte}>{ligne("40%")}</div>
            <div className="flex flex-1 flex-col gap-1 p-1.5" style={carte}>
                <div className="flex items-center gap-1 rounded px-1.5 py-1" style={{ border: `1.5px solid ${encre}` }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: encre }} />{ligne("40%")}</div>
                {bouton}
            </div>
        </div>
    );
    const boutonsExpress = <div className="flex gap-1"><div className="h-2 flex-1 rounded-sm" style={{ background: "#1DC3E0" }} /><div className="h-2 flex-1 rounded-sm" style={{ background: "#FF6600" }} /><div className="h-2 flex-1 rounded-sm" style={{ background: "#FFCC00" }} /></div>;
    return (
        <div className="flex h-16 gap-2 rounded-lg p-2" style={{ background: fond }}>
            <div className="flex w-2/5 flex-col justify-center gap-1.5 p-2" style={carte}>{ligne("60%")}{ligne("40%", 5)}</div>
            <div className="flex flex-1 flex-col gap-1.5 p-2" style={carte}>{etapes}{id === "express" ? boutonsExpress : ligne("100%", 5)}{bouton}</div>
        </div>
    );
}

export function PersonnalisationCheckout({ devise = "XOF" }: { devise?: string } = {}) {
    const exemple = montantExemple(devise);
    const [charge, setCharge] = useState(false);
    const [occupe, setOccupe] = useState(false);
    const [mode, setMode] = useState<"preset" | "custom">("preset");
    const [preset, setPreset] = useState("cartflox");
    const [style, setStyle] = useState<CheckoutStyleId>(DEFAULT_STYLE);
    const [perso, setPerso] = useState<Perso>(DEFAUT);
    const [marchand, setMarchand] = useState<{ name: string; image: string | null }>({ name: "Votre boutique", image: null });

    useEffect(() => {
        getCheckoutCustomization().then((d: any) => {
            if (d?.checkoutThemeCustom) { setMode("custom"); setPerso({ ...DEFAUT, ...d.checkoutThemeCustom }); }
            if (d?.checkoutTheme) setPreset(d.checkoutTheme);
            if (d?.checkoutStyle) setStyle(d.checkoutStyle);
            if (d?.name) setMarchand({ name: d.name, image: d.image || null });
            setCharge(true);
        }).catch(() => setCharge(true));
    }, []);

    const themeApercu = mode === "custom"
        ? perso
        : (() => { const t = CHECKOUT_THEMES.find((x) => x.id === preset) || CHECKOUT_THEMES[0]; return { accent: t.accent, accentText: t.accentText, pageBg: t.pageBg, cardBg: t.cardBg, textPrimary: t.textPrimary, textMuted: t.textMuted, radius: 20 }; })();

    async function enregistrer() {
        setOccupe(true);
        const s = await updateCheckoutStyle(style);
        const r = !s?.success ? s : mode === "custom" ? await updateCheckoutCustomTheme(perso) : await updateCheckoutCustomTheme(null).then(() => updateCheckoutTheme(preset));
        setOccupe(false);
        if (r?.success) goeyToast.success("Page de paiement mise à jour");
        else goeyToast.error(r?.error || "Enregistrement impossible");
    }

    if (!charge) return <div className="p-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" style={{ color: "var(--dt-text-muted)" }} /></div>;

    const carte = { background: "var(--dt-card-bg)", border: "1px solid var(--dt-border)" } as const;

    return (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
            <div className="space-y-5">
                <div>
                    <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--dt-text-primary)" }}>Votre page de paiement</h3>
                    <p className="text-xs" style={{ color: "var(--dt-text-muted)" }}>
                        C&apos;est l&apos;écran que voient vos clients au moment de payer (liens de paiement, widget, WooCommerce, API).
                        Votre logo et le nom affichés viennent de l&apos;onglet Entreprise.
                    </p>
                </div>

                <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--dt-text-muted)" }}>Disposition de la page</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Disposition de la page">
                        {CHECKOUT_STYLES.map((st) => (
                            <button key={st.id} type="button" role="radio" aria-checked={style === st.id} onClick={() => setStyle(st.id)} className="rounded-xl p-3 text-left transition-all"
                                style={{ border: style === st.id ? "1.5px solid rgba(18,165,148,0.6)" : "1px solid var(--dt-border)", background: "var(--dt-card-bg)" }}>
                                <Miniature id={st.id} />
                                <div className="mt-2 flex items-center justify-between">
                                    <span className="text-xs font-medium" style={{ color: "var(--dt-text-primary)" }}>{st.nom}</span>
                                    {style === st.id && <Check className="h-3.5 w-3.5 text-teal-400" />}
                                </div>
                                <p className="mt-1 text-[11px] leading-snug" style={{ color: "var(--dt-text-muted)" }}>{st.description}</p>
                            </button>
                        ))}
                    </div>
                </div>

                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--dt-text-muted)" }}>Couleurs</p>
                <div className="flex gap-2">
                    {([["preset", "Un thème prêt"], ["custom", "Mes couleurs"]] as const).map(([v, l]) => (
                        <button key={v} type="button" onClick={() => setMode(v)} className="rounded-lg px-3.5 py-2 text-sm font-medium"
                            style={{ background: mode === v ? "rgba(18,165,148,0.12)" : "var(--dt-item-hover)", color: mode === v ? "#12a594" : "var(--dt-text-muted)", border: `1px solid ${mode === v ? "rgba(18,165,148,0.4)" : "var(--dt-border)"}` }}>
                            {l}
                        </button>
                    ))}
                </div>

                {mode === "preset" ? (
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                        {CHECKOUT_THEMES.map((t) => (
                            <button key={t.id} type="button" onClick={() => setPreset(t.id)} className="rounded-xl p-3 text-left transition-all"
                                style={{ border: preset === t.id ? "1.5px solid rgba(18,165,148,0.6)" : "1px solid var(--dt-border)", background: "var(--dt-card-bg)" }}>
                                <div className="mb-2 h-14 rounded-lg p-2" style={{ background: t.pageBg }}>
                                    <div className="h-full rounded-md p-1.5" style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}` }}>
                                        <div className="h-2 w-1/2 rounded" style={{ background: t.textPrimary, opacity: .8 }} />
                                        <div className="mt-2 h-3 w-full rounded-full" style={{ background: t.accent }} />
                                    </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium" style={{ color: "var(--dt-text-primary)" }}>{t.name}</span>
                                    {preset === t.id && <Check className="h-3.5 w-3.5 text-teal-400" />}
                                </div>
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="rounded-xl p-4 space-y-3" style={carte}>
                        {CHAMPS.map((c) => (
                            <div key={c.cle} className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-sm" style={{ color: "var(--dt-text-primary)" }}>{c.label}</p>
                                    <p className="text-[11px]" style={{ color: "var(--dt-text-muted)" }}>{c.aide}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input type="color" value={String(perso[c.cle])} onChange={(e) => setPerso({ ...perso, [c.cle]: e.target.value })} className="h-9 w-12 cursor-pointer rounded-md border-0 bg-transparent p-0" />
                                    <input value={String(perso[c.cle])} onChange={(e) => setPerso({ ...perso, [c.cle]: e.target.value })} className="h-9 w-24 rounded-md px-2 font-mono text-xs outline-none"
                                        style={{ background: "var(--dt-input-bg)", border: "1px solid var(--dt-input-border)", color: "var(--dt-text-primary)" }} />
                                </div>
                            </div>
                        ))}
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-sm" style={{ color: "var(--dt-text-primary)" }}>Arrondi de la carte</p>
                                <p className="text-[11px]" style={{ color: "var(--dt-text-muted)" }}>0 = angles droits, 32 = très arrondi</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <input type="range" min={0} max={32} value={perso.radius} onChange={(e) => setPerso({ ...perso, radius: Number(e.target.value) })} />
                                <span className="w-8 text-right text-xs tabular-nums" style={{ color: "var(--dt-text-muted)" }}>{perso.radius}</span>
                            </div>
                        </div>
                        <button type="button" onClick={() => setPerso(DEFAUT)} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--dt-text-muted)" }}>
                            <RotateCcw className="h-3 w-3" /> Revenir aux couleurs {MARQUE}
                        </button>
                    </div>
                )}

                <button type="button" onClick={enregistrer} disabled={occupe} className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50" style={{ background: "var(--dt-brand)", color: "#ffffff" }}>
                    {occupe ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Enregistrer
                </button>
                <p className="text-[11px]" style={{ color: "var(--dt-text-muted)" }}>
                    Pour aller plus loin, l&apos;intégration native SoftPay vous laisse dessiner tout le formulaire de paiement dans votre site, avec votre propre CSS : voir Intégrations.
                </p>
            </div>

            {/* Apercu */}
            <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--dt-text-muted)" }}>Aperçu</p>
                <div className="rounded-2xl p-5" style={{ background: themeApercu.pageBg }}>
                    <div className="mx-auto max-w-[300px]">
                        <div className="mb-[-22px] flex justify-center relative z-10">
                            <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-white shadow" style={{ border: "2px solid #fff" }}>
                                {marchand.image ? <img src={marchand.image} alt="" className="h-full w-full object-cover" /> : <span className="text-lg" style={{ color: "#000" }}>⚡</span>}
                            </div>
                        </div>
                        <div className="overflow-hidden pt-8 pb-4 text-center" style={{ background: themeApercu.cardBg, borderRadius: themeApercu.radius, border: "1px solid rgba(0,0,0,0.06)" }}>
                            <p className="text-[11px]" style={{ color: themeApercu.textMuted }}>{marchand.name}</p>
                            <p className="mt-1 text-[26px] leading-none" style={{ color: themeApercu.textPrimary, fontFamily: "Georgia, serif" }}>{chiffreMontant(exemple, devise)} <span className="text-[11px]" style={{ color: themeApercu.textMuted }}>{devise}</span></p>
                            <div className="mx-4 mt-4 space-y-1.5 text-left">
                                <p className="text-[9px]" style={{ color: themeApercu.textMuted }}>Moyen de paiement</p>
                                {["Orange Money", "Wave", "MTN MoMo"].map((m, i) => (
                                    <div key={m} className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[11px]" style={{ background: i === 0 ? `${themeApercu.accent}14` : "rgba(0,0,0,0.03)", color: themeApercu.textPrimary, border: `1px solid ${i === 0 ? themeApercu.accent : "transparent"}` }}>
                                        <span className="h-4 w-4 rounded-full" style={{ background: "rgba(0,0,0,0.08)" }} />{m}
                                    </div>
                                ))}
                            </div>
                            <div className="mx-4 mt-4 flex h-9 items-center justify-center rounded-full text-[12px] font-semibold" style={{ background: themeApercu.accent, color: themeApercu.accentText }}>Payer {formaterMontant(exemple, devise)}</div>
                            <p className="mt-3 text-[8px]" style={{ color: themeApercu.textMuted }}>Sécurisé par {MARQUE}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
