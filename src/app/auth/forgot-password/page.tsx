"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { CoqueAuth, Titre, ChampAuth, EtiquetteAuth, themeAuth } from "@/components/auth/coque-auth";
import { BoutonPrincipal, Alerte } from "@/components/checkout/coque";

/**
 * Mot de passe oublié : le marchand saisit son adresse, un lien de
 * réinitialisation lui est envoyé (valable une heure). Même écran de
 * confirmation que le compte existe ou non, pour ne rien révéler sur les
 * adresses inscrites.
 */
export default function ForgotPasswordPage() {
    const t = themeAuth;
    const [email, setEmail] = useState("");
    const [envoye, setEnvoye] = useState(false);
    const [erreur, setErreur] = useState("");
    const [chargement, setChargement] = useState(false);

    async function envoyer(e: React.FormEvent) {
        e.preventDefault();
        setErreur("");
        setChargement(true);
        try {
            const { error } = await authClient.requestPasswordReset({ email: email.trim().toLowerCase(), redirectTo: "/auth/reset-password" });
            if (error) {
                setErreur(error.status === 429 ? "Trop de demandes. Réessayez dans quelques minutes." : error.code === "INVALID_EMAIL" ? "Adresse e-mail invalide." : error.message || "Impossible d'envoyer l'e-mail.");
                return;
            }
            setEnvoye(true);
        } catch {
            setErreur("Connexion impossible. Vérifiez votre réseau.");
        } finally {
            setChargement(false);
        }
    }

    return (
        <CoqueAuth>
            {envoye ? (
                <>
                    <Titre titre="Vérifiez votre boîte mail" />
                    <div className="rounded-2xl p-5" style={{ background: t.methodHoverBg }}>
                        <span className="grid h-10 w-10 place-items-center rounded-full bg-white" style={{ color: t.secureBadgeText }}><MailCheck size={20} /></span>
                        <p className="mt-4 text-[14.5px] leading-relaxed" style={{ color: t.textPrimary }}>
                            Si un compte existe pour <strong>{email}</strong>, un lien de réinitialisation vient d&apos;y être envoyé. Il est valable une heure.
                        </p>
                        <p className="mt-3 text-[13px]" style={{ color: t.textMuted }}>
                            Rien reçu ? Regardez dans les indésirables, ou{" "}
                            <button type="button" onClick={() => setEnvoye(false)} className="font-medium underline underline-offset-2" style={{ color: t.textPrimary }}>réessayez</button>.
                        </p>
                    </div>
                </>
            ) : (
                <>
                    <Titre titre="Mot de passe oublié" sousTitre="Indiquez l'adresse de votre compte : nous vous envoyons un lien valable une heure." />

                    {erreur && <div className="mb-5"><Alerte theme={t} titre="Envoi impossible" texte={erreur} /></div>}

                    <form onSubmit={envoyer} className="grid grid-cols-1 gap-5">
                        <div>
                            <EtiquetteAuth htmlFor="email">Adresse e-mail</EtiquetteAuth>
                            <ChampAuth id="email" type="email" required autoComplete="email" inputMode="email" value={email}
                                onChange={(e) => setEmail(e.target.value)} placeholder="prenom@email.com" autoFocus />
                        </div>
                        <BoutonPrincipal theme={t} type="submit" disabled={chargement || !email}>
                            {chargement ? <><Loader2 size={17} className="animate-spin" /> Envoi</> : "Envoyer le lien"}
                        </BoutonPrincipal>
                    </form>
                </>
            )}

            <p className="mt-8 text-[14px]" style={{ color: t.textSecondary }}>
                <Link href="/auth/login" className="font-semibold no-underline hover:underline" style={{ color: t.textPrimary }}>Retour à la connexion</Link>
            </p>
        </CoqueAuth>
    );
}
