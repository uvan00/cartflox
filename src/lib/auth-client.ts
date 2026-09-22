"use client";

import { useMemo } from "react";
import { createAuthClient } from "better-auth/react";
import { avatarParDefaut } from "@/lib/avatar";

/** Client Better Auth (navigateur) : meme origine que la page, cookie de domaine partage entre les hotes. */
export const authClient = createAuthClient();

/** Fournisseur OpenID Connect facultatif (voir OIDC_* dans .env.example). */
export const OIDC_ACTIF = process.env.NEXT_PUBLIC_OIDC_ACTIF === "1";
export const OIDC_NOM = process.env.NEXT_PUBLIC_OIDC_NOM || "votre compte unique";

/**
 * Connexion par le fournisseur OpenID Connect. Le greffon serveur genericOAuth
 * (Better Auth 1.7) l'enregistre comme fournisseur social : le depart passe
 * par /sign-in/social et le retour par /api/auth/callback/oidc.
 * L'identifiant n'etant pas dans la liste typee des fournisseurs, on appelle
 * le point d'entree directement.
 */
export async function connexionOIDC(opts: {
    callbackURL: string;
    newUserCallbackURL?: string;
    errorCallbackURL?: string;
    inscription?: boolean;
    silencieux?: boolean;
    prerempli?: { prenom?: string; nom?: string; email?: string };
}) {
    const { inscription, silencieux, prerempli, ...corps } = opts;
    const r = await authClient.$fetch<{ url?: string; redirect?: boolean }>("/sign-in/social", {
        method: "POST",
        body: { provider: "oidc", ...corps },
    });
    if (r.error || !r.data?.url) throw new Error(r.error?.message || "Fournisseur de connexion indisponible");
    const url = new URL(r.data.url);
    // `prompt=none` : si la personne a deja une session chez le fournisseur, elle entre
    // sans rien faire ; sinon il renvoie login_required et on affiche le formulaire.
    if (silencieux) url.searchParams.set("prompt", "none");
    // Adresse deja saisie chez nous : le fournisseur la reprend telle quelle (login_hint).
    if (prerempli?.email) url.searchParams.set("login_hint", prerempli.email);
    if (inscription) {
        // `prompt=create` mene a la page d'inscription ; les champs deja saisis
        // voyagent avec la requete signee et y sont pre-remplis.
        url.searchParams.set("prompt", "create");
        if (prerempli?.email) url.searchParams.set("login_hint", prerempli.email);
        if (prerempli?.prenom) url.searchParams.set("prenom", prerempli.prenom);
        if (prerempli?.nom) url.searchParams.set("nom", prerempli.nom);
    }
    window.location.href = url.toString();
}

/** Cle de session du navigateur : ne pas retenter la connexion automatique. */
export const SANS_CONNEXION_AUTO = "cartflox.sans-connexion-auto";

export type StatutSession = "loading" | "authenticated" | "unauthenticated";

/**
 * Meme contrat que l'ancien useSession de NextAuth ({ data, status, update }),
 * pour que les composants n'aient rien a changer.
 */
export function useSession() {
    const { data, isPending, refetch } = authClient.useSession();
    const u = data?.user;
    const status: StatutSession = isPending ? "loading" : u ? "authenticated" : "unauthenticated";
    const id = u?.id, name = u?.name, email = u?.email, image = u?.image;
    const session = useMemo(
        () => (id && email ? { user: { id, name: name || "", email, image: image || avatarParDefaut(name || email) } } : null),
        [id, name, email, image],
    );
    return {
        data: session,
        status,
        // Relit la base (le cache cookie dure une minute) puis rafraichit le magasin partage.
        update: async (_donnees?: unknown) => {
            await authClient.getSession({ query: { disableCookieCache: true } }).catch(() => null);
            refetch();
        },
    };
}

/** Deconnexion puis retour a l'adresse demandee (comme signOut({ callbackUrl }) de NextAuth). */
export async function signOut(options?: { callbackUrl?: string }) {
    // Deconnexion voulue : on ne rouvre pas la session toute seule au prochain passage.
    try { sessionStorage.setItem(SANS_CONNEXION_AUTO, "1"); } catch { }
    await authClient.signOut().catch(() => null);
    window.location.href = options?.callbackUrl || "/";
}
