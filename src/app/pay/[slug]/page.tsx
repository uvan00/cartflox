"use client";

import React, { useState, useEffect } from "react";
import { User, Mail, Smartphone, ArrowRight, Loader2, X, Minus, Plus } from "lucide-react";
import { getPaymentLinkBySlug, initializePaymentLinkTransaction } from "@/lib/actions/payment-links";
import { goeyToast } from "goey-toast";
import { useParams } from "next/navigation";
import { getThemeById, DEFAULT_THEME, type CheckoutTheme } from "@/lib/checkout-themes";
import { Coque, PiedCarte, BoutonPrincipal, Etiquette, champStyle } from "@/components/checkout/coque";
import { PanneauProduit, type LigneResume } from "@/components/checkout/panneau-produit";
import { arrondirMontant, decimalesDevise } from "@/lib/devises";
import { MARQUE } from "@/lib/marque";
import { useLangue, t, localeNombre, type Langue, type Cle } from "@/lib/i18n-checkout";

/**
 * Page publique d'un lien de paiement : une vraie fiche produit a gauche
 * (images, titre, prix, description), les coordonnees du client a droite, puis
 * direction le checkout pour payer. Meme coque et meme theme que le checkout.
 *
 * Trois cas a tenir :
 *  - montant FIXE, fixe par le marchand ;
 *  - montant LIBRE, saisi par le client entre les bornes du lien ;
 *  - frais de service a la charge du client, qui s'ajoutent au prix.
 * Les bornes et le total sont recalcules cote serveur : ici, c'est pour que le
 * client voie ce qu'il paie avant de s'engager.
 */
const LOGOS = [
    "/icons/methods/orange_money.svg", "/icons/methods/wave.svg", "/icons/methods/momo.svg", "/icons/methods/moov_money.svg", "/icons/methods/credit_card.svg",
];

type Lien = Awaited<ReturnType<typeof getPaymentLinkBySlug>>;

/**
 * Pixel Meta du marchand. Un <script> ecrit par React apres le montage n'est
 * jamais execute (balise « inseree par l'analyseur ») : le pixel ne comptait
 * rien. On l'ajoute donc au document par un effet. Chiffres seulement.
 */
function PixelFacebook({ id }: { id: string }) {
    useEffect(() => {
        const pixel = id.replace(/[^0-9]/g, "");
        if (!pixel || document.getElementById("cf-pixel-meta")) return;
        const w = window as any;
        if (!w.fbq) {
            const n: any = (w.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); });
            if (!w._fbq) w._fbq = n;
            n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
            const s = document.createElement("script");
            s.id = "cf-pixel-meta"; s.async = true; s.src = "https://connect.facebook.net/en_US/fbevents.js";
            document.head.appendChild(s);
        }
        w.fbq("init", pixel);
        w.fbq("track", "PageView");
    }, [id]);
    return null;
}

export default function PublicPaymentPage() {
    const params = useParams();
    const slug = params.slug as string;
    // Langue de la page (adresse, choix memorise, navigateur) et raccourci de traduction.
    const { langue, changerLangue } = useLangue();
    const tr = (cle: Cle, valeurs?: Record<string, string | number>) => t(langue, cle, valeurs);

    const [link, setLink] = useState<Lien>(null);
    const [theme, setTheme] = useState<CheckoutTheme>(DEFAULT_THEME);
    const [isLoading, setIsLoading] = useState(true);
    const [quantity, setQuantity] = useState(1);
    const [isProcessing, setIsProcessing] = useState(false);
    /** Montant tape par le client sur un lien a montant libre. */
    const [montantLibre, setMontantLibre] = useState("");

    // Customer info
    const [customerName, setCustomerName] = useState("");
    const [customerEmail, setCustomerEmail] = useState("");
    const [customerPhone, setCustomerPhone] = useState("");

    useEffect(() => {
        if (!slug) return;
        (async () => {
            setIsLoading(true);
            try {
                const data = await getPaymentLinkBySlug(slug);
                if (data) {
                    setLink(data);
                    const perso = data.theme?.perso;
                    setTheme(perso && typeof perso === "object"
                        ? { ...getThemeById("cartflox"), ...perso, id: "custom", name: "Personnalisé" }
                        : getThemeById(data.theme?.id || "cartflox"));
                    // Montant suggere par le marchand : pre-rempli, modifiable.
                    if (data.amountFree && data.amount > 0) setMontantLibre(String(data.amount));
                }
            } catch {
                // Reseau ou action serveur perimee : l'ecran « lien introuvable » vaut
                // mieux qu'un squelette anime sans fin.
            } finally {
                setIsLoading(false);
            }
        })();
    }, [slug]);

    const devise = link?.currency || "XOF";
    const decimales = decimalesDevise(devise);
    const fmt = (n: number) => new Intl.NumberFormat(localeNombre(langue), { maximumFractionDigits: decimales }).format(n);

    // Ce que le client paie, etape par etape.
    const prixUnitaire = link
        ? (link.amountFree ? arrondirMontant(Number(montantLibre.replace(",", ".")) || 0, devise) : link.amount)
        : 0;
    const quantite = link?.allowQuantity ? quantity : 1;
    const base = arrondirMontant(prixUnitaire * quantite, devise);
    const frais = link?.fraisBps ? arrondirMontant((base * link.fraisBps) / 10000, devise) : 0;
    const total = arrondirMontant(base + frais, devise);

    /** Ce qui empeche de payer, en une phrase, ou rien. */
    const blocage = (() => {
        if (!link) return null;
        if (link.status !== "active") return link.status === "expired" ? tr("lien_expire") : tr("lien_inactif");
        if (link.amountFree) {
            if (prixUnitaire <= 0) return tr("saisissez_montant");
            if (link.amountMin && prixUnitaire < link.amountMin) return tr("montant_trop_bas", { montant: fmt(link.amountMin), devise });
            if (link.amountMax && prixUnitaire > link.amountMax) return tr("montant_trop_haut", { montant: fmt(link.amountMax), devise });
        }
        return null;
    })();

    const handlePayment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (blocage) { goeyToast.error(blocage); return; }
        setIsProcessing(true);
        try {
            const result = await initializePaymentLinkTransaction({
                slug,
                customerName,
                customerEmail,
                customerPhone,
                quantity: quantite,
                ...(link?.amountFree ? { amount: prixUnitaire } : {}),
            });
            if (result.success && result.transactionId) {
                window.location.href = `/checkout/${result.transactionId}`;
            } else {
                goeyToast.error(result.error || tr("erreur_initialisation"));
                setIsProcessing(false);
            }
        } catch {
            goeyToast.error(tr("erreur_imprevue"));
            setIsProcessing(false);
        }
    };

    if (isLoading) {
        const os = (w: string, h = 12) => <div className="animate-pulse rounded-md" style={{ width: w, height: h, background: theme.methodHoverBg }} />;
        return (
            <Coque theme={theme} langue={langue} gauche={
                <div className="flex flex-col gap-4 lg:gap-6">
                    <div className="flex items-center gap-3"><div className="h-11 w-11 animate-pulse rounded-full" style={{ background: theme.methodHoverBg }} />{os('120px', 14)}</div>
                    <div className="animate-pulse rounded-2xl" style={{ background: theme.methodHoverBg, aspectRatio: "4 / 3" }} />
                    {os('90px')}{os('200px', 40)}
                </div>
            }>
                <div className="flex flex-col gap-5 px-6 py-7">
                    {os('140px')}<div className="h-12 animate-pulse rounded-xl" style={{ background: theme.methodHoverBg }} />
                    {os('120px')}<div className="h-12 animate-pulse rounded-xl" style={{ background: theme.methodHoverBg }} />
                    <div className="h-12 animate-pulse rounded-xl" style={{ background: theme.methodHoverBg }} />
                </div>
            </Coque>
        );
    }

    if (!link) {
        return (
            <Coque theme={theme} langue={langue} gauche={<div className="hidden lg:block"><p className="text-[13px]" style={{ color: theme.textMuted }}>{MARQUE}</p><p className="mt-2 text-[28px] leading-tight" style={{ color: theme.textPrimary }}>{tr("lien_nulle_part")}</p></div>}>
                <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                    <span className="grid h-14 w-14 place-content-center rounded-full" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}><X size={24} /></span>
                    <p className="text-[16px] font-semibold" style={{ color: theme.textPrimary }}>{tr("lien_introuvable")}</p>
                    <p className="max-w-[280px] text-[13px] leading-relaxed" style={{ color: theme.textMuted }}>{tr("lien_invalide_inactif")}</p>
                </div>
            </Coque>
        );
    }

    const marchand = { nom: link.marchand.nom || MARQUE, image: link.marchand.image };
    const inactif = link.status !== "active";
    const chiffres = String(link.marchand.whatsapp || "").replace(/\D/g, "");
    const whatsapp = chiffres.length >= 8 ? `https://wa.me/${chiffres}` : undefined;

    // Resume : on ne montre une ligne que si elle apporte quelque chose.
    const lignes: LigneResume[] = [];
    if (link.allowQuantity && quantite > 1) {
        lignes.push({ label: tr("prix_unitaire"), valeur: `${fmt(prixUnitaire)} ${devise}` });
        lignes.push({ label: tr("quantite"), valeur: String(quantite) });
    }
    if (frais > 0) {
        lignes.push({ label: tr("sous_total"), valeur: `${fmt(base)} ${devise}` });
        lignes.push({ label: tr("frais_service"), valeur: `${fmt(frais)} ${devise}` });
    }
    if (lignes.length > 0) lignes.push({ label: tr("total"), valeur: `${fmt(total)} ${devise}`, fort: true });

    // Etiquette au-dessus du prix, et prix affiche (vide tant que rien n'est saisi).
    const etiquette = link.amountFree && total <= 0 ? tr("montant_au_choix") : tr("montant_a_payer");
    const bornes = link.amountMin && link.amountMax
        ? tr("borne_min_max", { min: fmt(link.amountMin), max: fmt(link.amountMax), devise })
        : link.amountMin ? tr("borne_min", { montant: fmt(link.amountMin), devise })
        : link.amountMax ? tr("borne_max", { montant: fmt(link.amountMax), devise })
        : null;

    const selecteurLangue = (
        <div className="flex shrink-0 items-center gap-1.5 text-[11.5px] font-semibold" role="group" aria-label={tr("langue")}>
            {(["fr", "en"] as Langue[]).map((l, i) => (
                <React.Fragment key={l}>
                    {i > 0 && <span className="h-3 w-px" style={{ background: theme.divider }} />}
                    <button type="button" onClick={() => changerLangue(l)} aria-pressed={langue === l} aria-label={tr(l === "fr" ? "langue_fr" : "langue_en")}
                        className="rounded px-1 py-0.5 tracking-wide transition-opacity hover:opacity-80"
                        style={{ color: langue === l ? theme.textPrimary : theme.textMuted }}>
                        {l.toUpperCase()}
                    </button>
                </React.Fragment>
            ))}
        </div>
    );

    return (
        <Coque theme={theme} langue={langue} gauche={
            <PanneauProduit theme={theme} marchand={marchand} titre={link.title} description={link.description} images={link.images}
                montant={total > 0 ? fmt(total) : ""} devise={devise} etiquette={etiquette} lignes={lignes}
                enfants={link.allowQuantity ? (
                    <div className="mt-5 flex items-center justify-between rounded-xl px-4 py-3" style={{ border: `1px solid ${theme.divider}` }}>
                        <span className="text-[13px]" style={{ color: theme.textSecondary }}>{tr("quantite")}</span>
                        <div className="flex items-center gap-0.5 rounded-lg" style={{ border: `1px solid ${theme.methodBorder}` }}>
                            <button type="button" aria-label={tr("moins")} onClick={() => setQuantity(Math.max(1, quantity - 1))} className="grid h-8 w-8 place-content-center rounded-l-md transition-colors hover:opacity-70"><Minus size={14} style={{ color: theme.textSecondary }} /></button>
                            <span className="w-8 text-center text-[14px] font-semibold tabular-nums" style={{ color: theme.textPrimary }}>{quantity}</span>
                            <button type="button" aria-label={tr("plus")} onClick={() => setQuantity(Math.min(99, quantity + 1))} className="grid h-8 w-8 place-content-center rounded-r-md transition-colors hover:opacity-70"><Plus size={14} style={{ color: theme.textSecondary }} /></button>
                        </div>
                    </div>
                ) : null} />
        }>
            <form onSubmit={handlePayment}>
                <div className="flex flex-col gap-4 px-6 pt-6 pb-2">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h1 className="text-[18px] font-semibold tracking-tight" style={{ color: theme.textPrimary }}>{link.amountFree ? tr("combien_payer") : tr("vos_coordonnees")}</h1>
                            <p className="mt-0.5 text-[12.5px]" style={{ color: theme.textMuted }}>
                                {link.amountFree && total <= 0 ? tr("saisissez_montant") : tr("pour_envoyer_recu", { montant: fmt(total), devise })}
                            </p>
                        </div>
                        {selecteurLangue}
                    </div>

                    {inactif && (
                        <div className="rounded-xl px-3.5 py-3 text-[12.5px]" style={{ background: 'rgba(245,158,11,0.1)', color: '#b45309', border: '1px solid rgba(245,158,11,0.3)' }}>
                            {link.status === "expired" ? tr("lien_expire") : tr("lien_inactif")}
                        </div>
                    )}

                    {/* Montant libre : c'est la premiere decision du client, donc le premier champ. */}
                    {link.amountFree && (
                        <div>
                            <Etiquette theme={theme} droite={bornes ? <span className="text-[11.5px]" style={{ color: theme.textMuted }}>{bornes}</span> : undefined}>
                                {tr("montant")}
                            </Etiquette>
                            <div className="relative">
                                <input required inputMode="decimal" value={montantLibre}
                                    onChange={(e) => setMontantLibre(e.target.value.replace(/[^\d.,]/g, ""))}
                                    placeholder={link.amount > 0 ? String(link.amount) : "0"} autoFocus
                                    className="h-14 w-full rounded-xl pl-4 pr-16 text-[22px] font-semibold tabular-nums outline-none"
                                    style={champStyle(theme, !!montantLibre && !!blocage)} />
                                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[13px] font-semibold" style={{ color: theme.textMuted }}>{devise}</span>
                            </div>
                            {montantLibre && blocage
                                ? <p className="mt-1.5 text-[11.5px]" style={{ color: "#ef4444" }}>{blocage}</p>
                                : link.amount > 0 ? <p className="mt-1.5 text-[11.5px]" style={{ color: theme.textMuted }}>{tr("montant_suggere", { montant: fmt(link.amount), devise })}</p> : null}
                        </div>
                    )}

                    <div>
                        <Etiquette theme={theme}>{tr("nom_complet")}</Etiquette>
                        <div className="relative">
                            <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: theme.textMuted }} />
                            <input required placeholder="Kofi Mensah" value={customerName} onChange={(e) => setCustomerName(e.target.value)} autoComplete="name"
                                className="h-12 w-full rounded-xl pl-10 pr-4 outline-none" style={champStyle(theme)} />
                        </div>
                    </div>

                    <div>
                        <Etiquette theme={theme}>{tr("adresse_email")}</Etiquette>
                        <div className="relative">
                            <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: theme.textMuted }} />
                            <input required type="email" placeholder="kofi@email.com" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} autoComplete="email" inputMode="email"
                                className="h-12 w-full rounded-xl pl-10 pr-4 outline-none" style={champStyle(theme)} />
                        </div>
                        <p className="mt-1.5 text-[11.5px]" style={{ color: theme.textMuted }}>{tr("recu_y_sera_envoye")}</p>
                    </div>

                    {link.requestPhone && (
                        <div>
                            <Etiquette theme={theme}>{tr("numero_telephone")}</Etiquette>
                            <div className="relative">
                                <Smartphone size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: theme.textMuted }} />
                                <input required type="tel" placeholder="+225 07 00 00 00 00" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} autoComplete="tel" inputMode="tel"
                                    className="h-12 w-full rounded-xl pl-10 pr-4 outline-none" style={champStyle(theme)} />
                            </div>
                        </div>
                    )}
                </div>

                <div className="px-6 pb-6 pt-3">
                    <BoutonPrincipal theme={theme} type="submit" disabled={isProcessing || !customerName || !customerEmail || !!blocage}>
                        {isProcessing ? <><Loader2 size={16} className="animate-spin" /> {tr("un_instant")}</> : <>{tr("continuer_paiement")} <ArrowRight size={15} /></>}
                    </BoutonPrincipal>
                    <div className="mt-4 flex items-center justify-center gap-1.5">
                        {LOGOS.map((src) => (
                            <span key={src} className="grid h-7 w-7 place-content-center rounded-full" style={{ background: '#fff', border: `1px solid ${theme.divider}` }}>
                                <img src={src} alt="" className="h-4 w-4 object-contain" />
                            </span>
                        ))}
                    </div>
                    <p className="mt-2 text-center text-[11px] leading-relaxed" style={{ color: theme.textMuted }}>
                        {frais > 0 ? `${tr("frais_inclus")}. ${tr("choisirez_moyen_suite")}` : tr("choisirez_moyen_suite")}
                    </p>
                </div>
            </form>
            <PiedCarte theme={theme} whatsapp={whatsapp} />

            {link.facebookPixelId && <PixelFacebook id={String(link.facebookPixelId)} />}
        </Coque>
    );
}
