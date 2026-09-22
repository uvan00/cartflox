"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { authClient, connexionOIDC, OIDC_ACTIF, OIDC_NOM } from "@/lib/auth-client";
import { CoqueAuth, Titre, BoutonOIDC, Separateur, ChampAuth, EtiquetteAuth, themeAuth } from "@/components/auth/coque-auth";
import { BoutonPrincipal, Alerte } from "@/components/checkout/coque";
import { MARQUE } from "@/lib/marque";

const ERREURS: Record<string, string> = {
    USER_ALREADY_EXISTS: "Un compte existe déjà avec cette adresse. Connectez-vous.",
    PASSWORD_TOO_SHORT: "Le mot de passe doit faire au moins 8 caractères.",
    TOO_MANY_REQUESTS: "Trop de tentatives, réessayez dans quelques minutes.",
};

/**
 * Inscription : nom, adresse, mot de passe. Le compte est cree tout de suite
 * et la personne enchaine sur la creation de son premier espace ; la
 * confirmation de l'adresse arrive par e-mail et n'est pas bloquante.
 */
function Formulaire() {
    const params = useSearchParams();
    const t = themeAuth;
    const retour = (() => { const c = params.get("callbackUrl"); return c && c.startsWith("/") && !c.startsWith("//") ? c : "/onboarding"; })();

    const [prenom, setPrenom] = useState("");
    const [nom, setNom] = useState("");
    const [email, setEmail] = useState(() => params.get("email") || "");
    const [motDePasse, setMotDePasse] = useState("");
    const [occupe, setOccupe] = useState<"" | "email" | "oidc">("");
    const [erreur, setErreur] = useState<string | null>(null);

    useEffect(() => { if (params.get("error")) setErreur("La création du compte n'a pas abouti. Réessayez."); }, [params]);

    async function creer(e: React.FormEvent) {
        e.preventDefault();
        if (prenom.trim().length < 2) { setErreur("Entrez votre prénom."); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErreur("Entrez une adresse e-mail valide."); return; }
        if (motDePasse.length < 8) { setErreur("Le mot de passe doit faire au moins 8 caractères."); return; }
        setErreur(null);
        setOccupe("email");
        const { error } = await authClient.signUp.email({
            name: `${prenom.trim()} ${nom.trim()}`.trim(),
            email: email.trim().toLowerCase(),
            password: motDePasse,
            callbackURL: retour,
        });
        if (error) { setOccupe(""); setErreur((error.code && ERREURS[error.code]) || error.message || "Inscription impossible."); return; }
        window.location.href = retour;
    }

    function parOIDC() {
        setErreur(null);
        setOccupe("oidc");
        connexionOIDC({ callbackURL: retour, newUserCallbackURL: retour, errorCallbackURL: `/auth/register?callbackUrl=${encodeURIComponent(retour)}`, inscription: true, prerempli: { prenom: prenom.trim(), nom: nom.trim(), email: email.trim() } })
            .catch(() => { setOccupe(""); setErreur(`La connexion avec ${OIDC_NOM} n'a pas abouti. Réessayez.`); });
    }

    return (
        <CoqueAuth marque={MARQUE}>
            <Titre titre="Créer un compte" sousTitre={`Quelques secondes, et votre tableau de bord ${MARQUE} est prêt.`} />

            {erreur && <div className="mb-5"><Alerte theme={t} titre="Inscription impossible" texte={erreur} /></div>}

            <form onSubmit={creer} className="grid grid-cols-1 gap-5">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-4">
                    <div>
                        <EtiquetteAuth htmlFor="prenom">Prénom</EtiquetteAuth>
                        <ChampAuth id="prenom" value={prenom} onChange={(e) => setPrenom(e.target.value)} autoComplete="given-name" placeholder="Prénom(s)" autoFocus />
                    </div>
                    <div>
                        <EtiquetteAuth htmlFor="nom">Nom</EtiquetteAuth>
                        <ChampAuth id="nom" value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="family-name" placeholder="Nom" />
                    </div>
                </div>
                <div>
                    <EtiquetteAuth htmlFor="email">Adresse e-mail</EtiquetteAuth>
                    <ChampAuth id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" placeholder="vous@exemple.com" />
                </div>
                <div>
                    <EtiquetteAuth htmlFor="mdp">Mot de passe</EtiquetteAuth>
                    <ChampAuth id="mdp" type="password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} autoComplete="new-password" placeholder="8 caractères au moins" />
                </div>
                <BoutonPrincipal theme={t} type="submit" disabled={occupe !== ""}>
                    {occupe === "email" ? <><Loader2 size={17} className="animate-spin" /> Un instant</> : "Créer mon compte"}
                </BoutonPrincipal>
            </form>

            {OIDC_ACTIF && (
                <>
                    <Separateur />
                    <BoutonOIDC texte={`Continuer avec ${OIDC_NOM}`} occupe={occupe === "oidc"} onClick={parOIDC} />
                </>
            )}

            <p className="mt-6 text-center text-[13px]" style={{ color: t.textMuted }}>
                Déjà un compte ?{" "}
                <Link href="/auth/login" className="font-medium no-underline underline-offset-2 hover:underline" style={{ color: t.textPrimary }}>Se connecter</Link>
            </p>
        </CoqueAuth>
    );
}

export default function RegisterPage() {
    return (
        <Suspense fallback={null}>
            <Formulaire />
        </Suspense>
    );
}
