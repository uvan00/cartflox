"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { authClient, connexionOIDC, OIDC_ACTIF, OIDC_NOM } from "@/lib/auth-client";
import { CoqueAuth, Titre, BoutonOIDC, Separateur, ChampAuth, EtiquetteAuth, themeAuth } from "@/components/auth/coque-auth";
import { BoutonPrincipal, Alerte } from "@/components/checkout/coque";
import { MARQUE } from "@/lib/marque";

/** Erreurs de Better Auth, en clair. */
const ERREURS: Record<string, string> = {
    INVALID_EMAIL_OR_PASSWORD: "Adresse ou mot de passe incorrect.",
    EMAIL_NOT_VERIFIED: "Confirmez votre adresse e-mail (lien reçu à l'inscription), puis reconnectez-vous.",
    USER_NOT_FOUND: "Aucun compte avec cette adresse.",
    TOO_MANY_REQUESTS: "Trop de tentatives, réessayez dans quelques minutes.",
};
const messageErreur = (code?: string | null, defaut = "Connexion impossible. Réessayez.") =>
    (code && (ERREURS[code] || ERREURS[code.toUpperCase()])) || defaut;

/** Destination apres connexion : un chemin de l'application, jamais une adresse externe. */
function destination(brut: string | null): string {
    return brut && brut.startsWith("/") && !brut.startsWith("//") ? brut : "/dashboard";
}

function Formulaire() {
    const params = useSearchParams();
    const t = themeAuth;
    const retour = destination(params.get("callbackUrl"));

    const [email, setEmail] = useState(() => params.get("email") || "");
    const [motDePasse, setMotDePasse] = useState("");
    const [occupe, setOccupe] = useState<"" | "email" | "oidc">("");
    const [erreur, setErreur] = useState<string | null>(null);

    useEffect(() => {
        const e = params.get("error");
        if (e) setErreur(messageErreur(e));
    }, [params]);

    // Deja connecte : direct vers la destination.
    useEffect(() => {
        let annule = false;
        authClient.getSession().then((s) => { if (!annule && s?.data?.session) window.location.href = retour; }).catch(() => null);
        return () => { annule = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function seConnecter(e: React.FormEvent) {
        e.preventDefault();
        const adresse = email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adresse)) { setErreur("Entrez une adresse e-mail valide."); return; }
        if (!motDePasse) { setErreur("Entrez votre mot de passe."); return; }
        setErreur(null);
        setOccupe("email");
        const { error } = await authClient.signIn.email({ email: adresse, password: motDePasse, callbackURL: retour });
        if (error) { setOccupe(""); setErreur(messageErreur(error.code, error.message || undefined)); return; }
        window.location.href = retour;
    }

    function parOIDC() {
        setErreur(null);
        setOccupe("oidc");
        connexionOIDC({ callbackURL: retour, newUserCallbackURL: "/onboarding", errorCallbackURL: `/auth/login?callbackUrl=${encodeURIComponent(retour)}` })
            .catch(() => { setOccupe(""); setErreur(`La connexion avec ${OIDC_NOM} n'a pas abouti. Réessayez.`); });
    }

    return (
        <CoqueAuth marque={MARQUE}>
            <Titre titre="Se connecter" sousTitre={`Accédez à votre tableau de bord ${MARQUE}.`} />

            {erreur && <div className="mb-5"><Alerte theme={t} titre="Connexion impossible" texte={erreur} /></div>}

            <form onSubmit={seConnecter} className="grid grid-cols-1 gap-5">
                <div>
                    <EtiquetteAuth htmlFor="email">Adresse e-mail</EtiquetteAuth>
                    <ChampAuth id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" placeholder="vous@exemple.com" autoFocus />
                </div>
                <div>
                    <EtiquetteAuth htmlFor="mdp" droite={<Link href="/auth/forgot-password" className="text-[12.5px] no-underline underline-offset-2 hover:underline" style={{ color: t.textMuted }}>Mot de passe oublié ?</Link>}>Mot de passe</EtiquetteAuth>
                    <ChampAuth id="mdp" type="password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} autoComplete="current-password" placeholder="Votre mot de passe" />
                </div>
                <BoutonPrincipal theme={t} type="submit" disabled={occupe !== ""}>
                    {occupe === "email" ? <><Loader2 size={17} className="animate-spin" /> Un instant</> : "Se connecter"}
                </BoutonPrincipal>
            </form>

            {OIDC_ACTIF && (
                <>
                    <Separateur />
                    <BoutonOIDC texte={`Continuer avec ${OIDC_NOM}`} occupe={occupe === "oidc"} onClick={parOIDC} />
                </>
            )}

            <p className="mt-6 text-center text-[13px]" style={{ color: t.textMuted }}>
                Pas encore de compte ?{" "}
                <Link href={`/auth/register?callbackUrl=${encodeURIComponent(retour)}`} className="font-medium no-underline underline-offset-2 hover:underline" style={{ color: t.textPrimary }}>Créer un compte</Link>
            </p>
        </CoqueAuth>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={null}>
            <Formulaire />
        </Suspense>
    );
}
