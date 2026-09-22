import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth } from "better-auth/plugins";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db";
import { sendWelcomeEmail, sendPasswordResetEmail, sendPasswordChangedEmail } from "@/lib/email";
import { verifierAdresseInscription } from "@/lib/email-jetable";
import { MARQUE } from "@/lib/marque";

/**
 * Authentification (Better Auth).
 *
 * Une seule session, gardee en base et posee en cookie. Par defaut le cookie
 * vaut pour l'hote qui sert l'application ; `SESSION_COOKIE_DOMAIN` (ex.
 * `.mondomaine.com`) l'etend a tous les sous-domaines si le tableau de bord
 * et la page de paiement vivent sur des hotes differents.
 *
 * Connexion par adresse e-mail et mot de passe (bcrypt). Un fournisseur
 * OpenID Connect externe peut s'ajouter en renseignant OIDC_ISSUER,
 * OIDC_CLIENT_ID et OIDC_CLIENT_SECRET : il apparait alors comme bouton
 * « Continuer avec ... » sur la page de connexion.
 */
const SITE = (process.env.NEXTAUTH_URL || process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
const PROD = process.env.NODE_ENV === "production";
const DOMAINE_COOKIE = process.env.SESSION_COOKIE_DOMAIN || "";
const ORIGINES_SURES = (process.env.TRUSTED_ORIGINS || "").split(",").map((o) => o.trim()).filter(Boolean);
/** Secret Better Auth (cookies signes). */
export const secretAuth = process.env.BETTER_AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";
const prenomDe = (nom?: string | null) => (nom || "").trim().split(/\s+/)[0] || undefined;
/** Fournisseur OpenID Connect facultatif. */
const OIDC_ISSUER = (process.env.OIDC_ISSUER || "").replace(/\/+$/, "");
const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID || "";
const OIDC_CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET || "";
const OIDC_ACTIF = Boolean(OIDC_ISSUER && OIDC_CLIENT_ID && OIDC_CLIENT_SECRET);

export const auth = betterAuth({
    appName: MARQUE,
    baseURL: SITE,
    basePath: "/api/auth",
    secret: secretAuth,
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    trustedOrigins: [SITE, ...ORIGINES_SURES],
    user: {
        // La colonne historique emailVerified est une date ; Better Auth veut un booleen.
        fields: { emailVerified: "emailVerifie" },
    },
    session: {
        modelName: "authSession",
        // Huit heures sans activite et la session tombe.
        expiresIn: 8 * 3600,
        updateAge: 3600,
        cookieCache: { enabled: true, maxAge: 60 },
    },
    account: {
        modelName: "authAccount",
        accountLinking: { enabled: true },
    },
    verification: { modelName: "authVerification" },
    emailAndPassword: {
        enabled: true,
        minPasswordLength: 8,
        autoSignIn: true,
        password: {
            hash: (mdp: string) => bcrypt.hash(mdp, 12),
            verify: ({ hash, password }: { hash: string; password: string }) => bcrypt.compare(password, hash),
        },
        resetPasswordTokenExpiresIn: 3600,
        revokeSessionsOnPasswordReset: true,
        sendResetPassword: async ({ user, url }) => {
            await sendPasswordResetEmail({ to: user.email, prenom: prenomDe(user.name), lien: url, validiteMin: 60 });
        },
        onPasswordReset: async ({ user }) => {
            await sendPasswordChangedEmail({ to: user.email, prenom: prenomDe(user.name) }).catch(() => { });
        },
    },
    emailVerification: {
        // Inscription par mot de passe : la bienvenue porte le lien de confirmation d'adresse (7 jours).
        sendOnSignUp: true,
        autoSignInAfterVerification: true,
        expiresIn: 7 * 24 * 3600,
        sendVerificationEmail: async ({ user, url }) => {
            await sendWelcomeEmail({ to: user.email, prenom: prenomDe(user.name), lienVerification: url });
        },
    },
    databaseHooks: {
        user: {
            create: {
                // Adresse jetable ou domaine sans courrier : pas de compte, par quelque chemin que ce soit.
                before: async (user) => {
                    await verifierAdresseInscription(user.email);
                    return { data: user };
                },
                after: async (user) => {
                    // Compte cree par le fournisseur OIDC (adresse deja verifiee) : bienvenue sans lien.
                    if (user.emailVerified) await sendWelcomeEmail({ to: user.email, prenom: prenomDe(user.name) }).catch(() => { });
                },
            },
        },
    },
    rateLimit: {
        enabled: PROD,
        window: 60,
        max: 100,
        customRules: {
            "/sign-in/email": { window: 900, max: 10 },
            "/sign-up/email": { window: 3600, max: 10 },
            "/request-password-reset": { window: 900, max: 5 },
        },
    },
    advanced: {
        cookiePrefix: "cartflox",
        useSecureCookies: PROD,
        ...(DOMAINE_COOKIE ? { crossSubDomainCookies: { enabled: PROD, domain: DOMAINE_COOKIE } } : {}),
        ipAddress: { ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for", "x-real-ip"] },
    },
    plugins: [
        ...(OIDC_ACTIF
            ? [genericOAuth({
                config: [{
                    providerId: "oidc",
                    discoveryUrl: `${OIDC_ISSUER}/.well-known/openid-configuration`,
                    clientId: OIDC_CLIENT_ID,
                    clientSecret: OIDC_CLIENT_SECRET,
                    scopes: ["openid", "profile", "email"],
                    pkce: true,
                    // Le compte de meme adresse n'est relie que si le fournisseur atteste l'adresse verifiee.
                    mapProfileToUser: (profil: Record<string, unknown>) => ({
                        name: typeof profil.name === "string" ? profil.name : undefined,
                        email: typeof profil.email === "string" ? profil.email : undefined,
                        image: typeof profil.picture === "string" ? profil.picture : undefined,
                        emailVerified: profil.email_verified === true,
                    }),
                }],
            })]
            : []),
        nextCookies(),
    ],
});

export type SessionAuth = typeof auth.$Infer.Session;
