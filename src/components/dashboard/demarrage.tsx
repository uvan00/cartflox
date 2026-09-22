"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { ArrowRight, Check, Clock, Plug, Smartphone, Landmark, Hand, ShieldAlert } from "lucide-react";
import { getDemarrage, type Demarrage as DonneesDemarrage } from "@/lib/actions/demarrage";
import { useDashboardTheme } from "./theme-context";

/**
 * Parcours de demarrage en tete du tableau de bord, en frise verticale comme
 * l'accueil de Chatwoot : un fil pointille, un noeud par etape, une carte a
 * lignes label / valeur, et un seul bouton pour continuer. Sur un fond
 * quadrille attenue aux angles.
 */

const CIRCUIT = [
    { Icone: Plug, titre: "Vous branchez votre agrégateur", texte: "PayDunya, CinetPay, PawaPay, Stripe... vous collez ses clés API dans Cartflox." },
    { Icone: Smartphone, titre: "Vos clients paient", texte: "Sur votre page Cartflox, par Orange Money, Wave, MTN MoMo, Moov ou carte." },
    { Icone: Landmark, titre: "L'argent arrive chez vous", texte: "Directement sur votre compte agrégateur. Cartflox ne le touche pas et ne prend aucune commission." },
];

export function Demarrage() {
    const theme = useDashboardTheme();
    const { data: session } = useSession();
    const [data, setData] = useState<DonneesDemarrage | null>(null);
    const [charge, setCharge] = useState(false);

    useEffect(() => {
        getDemarrage().then((d) => { setData(d); setCharge(true); }).catch(() => setCharge(true));
    }, []);

    if (!charge || !data || data.complet) return null;

    const total = data.etapes.length;
    const restantes = total - data.faites;
    const prochaine = data.etapes.find((e) => !e.fait);
    const prenom = (session?.user?.name || "").split(" ")[0];
    const sombre = theme.id === "dark";

    const Noeud = ({ children, actif }: { children: React.ReactNode; actif?: boolean }) => (
        <div className="z-10 flex shrink-0 flex-col items-center">
            <svg width="6" height="5" viewBox="0 0 6 5" fill="none" style={{ color: theme.border }}><path d="M3 0L6 5H0L3 0Z" fill="currentColor" /></svg>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: theme.cardBg, border: `1px solid ${actif ? theme.brand : theme.border}`, color: actif ? theme.brand : theme.textSecondary }}>{children}</div>
            <svg width="6" height="5" viewBox="0 0 6 5" fill="none" style={{ color: theme.border }}><path d="M3 5L0 0H6L3 5Z" fill="currentColor" /></svg>
        </div>
    );

    return (
        <div className="relative overflow-hidden rounded-xl px-4 py-6 md:px-8 md:py-8" style={{ background: theme.pageBg, border: `1px solid ${theme.border}` }}>
            {/* Grille de carrés attenuee aux angles, comme l'onboarding Chatwoot */}
            <div aria-hidden className="pointer-events-none absolute inset-0 hidden sm:block" style={{
                backgroundImage: `linear-gradient(to right, ${sombre ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"} 1px, transparent 1px), linear-gradient(to bottom, ${sombre ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"} 1px, transparent 1px)`,
                backgroundSize: "96px 96px",
                WebkitMaskImage: "radial-gradient(ellipse 80% 80% at 100% 0%, black 5%, transparent 50%), radial-gradient(ellipse 80% 80% at 0% 100%, black 5%, transparent 50%)",
                maskImage: "radial-gradient(ellipse 80% 80% at 100% 0%, black 5%, transparent 50%), radial-gradient(ellipse 80% 80% at 0% 100%, black 5%, transparent 50%)",
                WebkitMaskComposite: "source-over",
                maskComposite: "add",
            }} />

            <div className="relative mx-auto w-full max-w-[40rem]">
                {/* Un espace non verifie n'encaisse rien : le dire ici, en clair,
                    plutot que de laisser le marchand decouvrir l'echec chez son client. */}
                {data.bacASable && (
                    <div className="mb-6 flex flex-col gap-3 rounded-xl p-4 sm:flex-row sm:items-center sm:gap-4"
                        style={{ background: theme.cardBg, border: `1px solid ${theme.border}` }}>
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                            style={{ background: sombre ? "rgba(217,119,6,0.16)" : "#FFF7ED", color: "#d97706" }}>
                            <ShieldAlert size={18} />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-[14px] font-semibold" style={{ color: theme.textPrimary }}>Votre espace est en mode test</p>
                            <p className="text-[13px] leading-snug" style={{ color: theme.textMuted }}>
                                Tant que votre identité n'est pas vérifiée, aucun paiement n'est envoyé à votre agrégateur : vos clients ne peuvent pas encore payer pour de vrai. Réponse sous 24 à 48 h.
                            </p>
                        </div>
                        <a href={data.lienIdentite} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold no-underline"
                            style={{ background: theme.brand, color: "#fff" }}>
                            Vérifier mon identité <ArrowRight size={14} />
                        </a>
                    </div>
                )}
                <div className="relative ps-12">
                    {/* Fil pointille */}
                    <svg className="absolute start-[16px] top-10 bottom-16 overflow-visible" width="1" height="100%" preserveAspectRatio="none" style={{ color: theme.border }}>
                        <line x1="0" y1="0" x2="0" y2="97%" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" />
                    </svg>

                    {/* Salutation */}
                    <div className="-ms-12 mb-6 flex items-start gap-4">
                        <div className="z-10 flex h-8 w-8 shrink-0 items-center justify-center" style={{ color: theme.textMuted }}><Hand size={16} /></div>
                        <div>
                            <h2 className="text-[18px] font-semibold leading-6" style={{ color: theme.textPrimary }}>Bonjour {prenom || "et bienvenue"} !</h2>
                            <p className="text-[13px]" style={{ color: theme.textMuted }}>
                                {data.faites === 0 ? `${total} étapes pour encaisser votre premier paiement.` : `Encore ${restantes} étape${restantes > 1 ? "s" : ""} avant d'être prêt à encaisser.`}
                            </p>
                        </div>
                    </div>

                    {/* Comment l'argent circule (tant que rien n'est fait) */}
                    {data.faites === 0 && (
                        <div className="mb-5">
                            <div className="-ms-12 mb-3 flex items-center gap-4"><Noeud><Landmark size={16} /></Noeud><span className="text-[14px] font-medium" style={{ color: theme.textPrimary }}>Comment l&apos;argent circule</span></div>
                            <div className="overflow-hidden rounded-xl" style={{ background: theme.cardBg, border: `1px solid ${theme.border}` }}>
                                {CIRCUIT.map((c, i) => (
                                    <div key={c.titre} className="flex items-start gap-3 px-3 py-3" style={{ borderTop: i ? `1px solid ${theme.border}` : "none" }}>
                                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md" style={{ background: theme.itemHoverBg, color: theme.textSecondary }}><c.Icone size={13} /></span>
                                        <div>
                                            <p className="text-[13px] font-medium" style={{ color: theme.textPrimary }}>{i + 1}. {c.titre}</p>
                                            <p className="text-[12.5px] leading-relaxed" style={{ color: theme.textMuted }}>{c.texte}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Les etapes */}
                    {data.etapes.map((e, i) => {
                        const suivante = e === prochaine;
                        return (
                            <div key={e.cle} className="mb-5">
                                <div className="-ms-12 mb-3 flex items-center gap-4">
                                    <Noeud actif={suivante}>
                                        {e.fait ? <Check size={15} strokeWidth={2.5} style={{ color: theme.success }} /> : e.enCours ? <Clock size={15} style={{ color: "#ffc53d" }} /> : <span className="text-[12px] font-semibold">{i + 1}</span>}
                                    </Noeud>
                                    <span className="text-[14px] font-medium" style={{ color: e.fait ? theme.textMuted : theme.textPrimary, textDecoration: e.fait ? "line-through" : "none" }}>{e.titre}</span>
                                </div>
                                <div className="overflow-hidden rounded-xl" style={{ background: theme.cardBg, border: `1px solid ${theme.border}` }}>
                                    <div className="grid grid-cols-2 items-center px-3 py-3">
                                        <span className="text-[13px]" style={{ color: theme.textMuted }}>Statut</span>
                                        <span className="flex items-center justify-end gap-1.5 text-[13px]" style={{ color: e.fait ? theme.success : e.enCours ? "#ffc53d" : theme.textPrimary }}>
                                            {e.fait ? <><Check size={14} /> Terminé</> : e.enCours ? <><Clock size={14} /> En cours</> : "À faire"}
                                        </span>
                                    </div>
                                    {!e.fait && (
                                        <div className="grid grid-cols-1 items-start gap-2.5 px-3 py-3 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-3" style={{ borderTop: `1px solid ${theme.border}` }}>
                                            <span className="text-[12.5px] leading-relaxed" style={{ color: e.enCours ? "#ffc53d" : theme.textMuted }}>{e.enCours || e.detail}</span>
                                            <Link href={e.href} className="inline-flex h-8 w-fit items-center gap-1 rounded-lg px-3 text-[12.5px] font-medium transition-all hover:brightness-110"
                                                style={suivante ? { background: theme.brand, color: "#fff", textDecoration: "none" } : { background: theme.itemHoverBg, color: theme.textPrimary, textDecoration: "none" }}>
                                                {e.action} <ArrowRight size={12} />
                                            </Link>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Bouton continuer, relie par un trait courbe */}
                {prochaine && (
                    <div className="relative overflow-visible ps-12">
                        <svg width="48" height="40" viewBox="0 0 47 40" fill="none" className="absolute start-0 top-0 overflow-visible">
                            <defs><linearGradient id="cf-fil" x1="15" y1="0" x2="48" y2="20" gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor={theme.border} /><stop offset="100%" stopColor={theme.brand} /></linearGradient></defs>
                            <path d="M15.5 0 C15.5 24, 15.5 20, 48 20" stroke="url(#cf-fil)" strokeWidth="1" strokeDasharray="3 3" fill="none" />
                        </svg>
                        <svg width="6" height="6" viewBox="0 0 6 6" fill="none" className="absolute start-[42px] top-1/2 z-10 -translate-y-1/2"><path d="M6 0L0 3L6 6Z" fill={theme.brand} /></svg>
                        <Link href={prochaine.href} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg px-4 text-[13px] font-medium transition-all hover:brightness-110 active:scale-[0.98]" style={{ background: theme.brand, color: "#fff", textDecoration: "none" }}>
                            Continuer : {prochaine.titre.charAt(0).toLowerCase() + prochaine.titre.slice(1)}
                        </Link>
                    </div>
                )}
            </div>
        </div>
    );
}
