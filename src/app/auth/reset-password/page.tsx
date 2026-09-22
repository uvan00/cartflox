"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { CoqueAuth, Titre, ChampAuth, EtiquetteAuth, themeAuth } from "@/components/auth/coque-auth";
import { BoutonPrincipal, Alerte } from "@/components/checkout/coque";

/**
 * Nouveau mot de passe : la page ouverte depuis le lien reçu par e-mail.
 * Better Auth verifie le jeton (usage unique, une heure) et le passe dans
 * l'URL (?token=) ; le marchand choisit son mot de passe, le saisit deux
 * fois, et repart se connecter. Ses autres sessions sont fermees.
 */
function ResetContent() {
    const t = themeAuth;
    const params = useSearchParams();
    const token = params?.get("token") || "";
    const erreurLien = params?.get("error") || "";

    const [mdp, setMdp] = useState("");
    const [mdp2, setMdp2] = useState("");
    const [voir, setVoir] = useState(false);
    const [erreur, setErreur] = useState("");
    const [fait, setFait] = useState(false);
    const [chargement, setChargement] = useState(false);

    const lienInvalide = !token || !!erreurLien;

    async function valider(e: React.FormEvent) {
        e.preventDefault();
        setErreur("");
        if (mdp.length < 8) { setErreur("Le mot de passe doit contenir au moins 8 caractères."); return; }
        if (mdp !== mdp2) { setErreur("Les deux mots de passe ne correspondent pas."); return; }
        setChargement(true);
        try {
            const { error } = await authClient.resetPassword({ newPassword: mdp, token });
            if (error) {
                setErreur(error.code === "INVALID_TOKEN" ? "Ce lien a expiré ou a déjà été utilisé. Refaites une demande."
                    : error.status === 429 ? "Trop de tentatives. Réessayez plus tard."
                        : error.message || "Réinitialisation impossible.");
                return;
            }
            setFait(true);
        } catch {
            setErreur("Connexion impossible. Vérifiez votre réseau.");
        } finally {
            setChargement(false);
        }
    }

    const oeil = (
        <button type="button" onClick={() => setVoir((v) => !v)} className="text-[12.5px] font-medium" style={{ color: t.textMuted }}
            aria-label={voir ? "Masquer le mot de passe" : "Afficher le mot de passe"}>
            <span className="inline-flex items-center gap-1">{voir ? <EyeOff size={14} /> : <Eye size={14} />} {voir ? "Masquer" : "Afficher"}</span>
        </button>
    );

    return (
        <CoqueAuth>
            {fait ? (
                <>
                    <Titre titre="Mot de passe mis à jour" sousTitre="Vous pouvez vous connecter avec votre nouveau mot de passe. Vos autres sessions ont été fermées." />
                    <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-full" style={{ background: t.secureBadgeBg, color: t.secureBadgeText }}>
                        <CheckCircle2 size={22} />
                    </div>
                    <Link href="/auth/login" className="flex h-12 w-full items-center justify-center rounded-xl text-[15px] font-semibold no-underline"
                        style={{ background: t.accent, color: t.accentText }}>Se connecter</Link>
                </>
            ) : lienInvalide ? (
                <>
                    <Titre titre={erreurLien ? "Lien expiré" : "Lien incomplet"}
                        sousTitre={erreurLien
                            ? "Ce lien a expiré ou a déjà servi. Les liens sont valables une heure et ne s'utilisent qu'une fois."
                            : "Ouvrez le lien exactement tel qu'il figure dans l'e-mail, ou refaites une demande."} />
                    <Link href="/auth/forgot-password" className="flex h-12 w-full items-center justify-center rounded-xl text-[15px] font-semibold no-underline"
                        style={{ background: t.accent, color: t.accentText }}>Refaire une demande</Link>
                </>
            ) : (
                <>
                    <Titre titre="Nouveau mot de passe" sousTitre="8 caractères minimum. Choisissez-en un que vous n'utilisez nulle part ailleurs." />

                    {erreur && <div className="mb-5"><Alerte theme={t} titre="Réinitialisation impossible" texte={erreur} /></div>}

                    <form onSubmit={valider} className="grid grid-cols-1 gap-5">
                        <div>
                            <EtiquetteAuth htmlFor="mdp" droite={oeil}>Nouveau mot de passe</EtiquetteAuth>
                            <ChampAuth id="mdp" type={voir ? "text" : "password"} required minLength={8} autoComplete="new-password"
                                value={mdp} onChange={(e) => setMdp(e.target.value)} placeholder="8 caractères minimum" autoFocus />
                        </div>
                        <div>
                            <EtiquetteAuth htmlFor="mdp2">Confirmez-le</EtiquetteAuth>
                            <ChampAuth id="mdp2" type={voir ? "text" : "password"} required minLength={8} autoComplete="new-password"
                                value={mdp2} onChange={(e) => setMdp2(e.target.value)} placeholder="Le même mot de passe" />
                        </div>
                        <BoutonPrincipal theme={t} type="submit" disabled={chargement || !mdp || !mdp2}>
                            {chargement ? <><Loader2 size={17} className="animate-spin" /> Enregistrement</> : "Enregistrer"}
                        </BoutonPrincipal>
                    </form>
                </>
            )}

            {!fait && (
                <p className="mt-8 text-[14px]" style={{ color: t.textSecondary }}>
                    <Link href="/auth/login" className="font-semibold no-underline hover:underline" style={{ color: t.textPrimary }}>Retour à la connexion</Link>
                </p>
            )}
        </CoqueAuth>
    );
}

export default function ResetPasswordPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-white" />}>
            <ResetContent />
        </Suspense>
    );
}
