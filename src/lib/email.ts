import { envoyerEmail, EXPEDITEUR_EMAIL, EXPEDITEUR_NOM, REPONDRE_A, VOIE_ENVOI } from "@/lib/mailer";
import { gabarit, montant, echapper, SITE, ACCENT, type Gabarit } from "@/lib/mail-gabarit";

/**
 * Tous les e-mails transactionnels de Cartflox, sur le meme gabarit clair.
 * Chaque fonction renvoie le resultat de l'envoi et ne leve jamais : un
 * e-mail rate ne doit bloquer ni un paiement ni une inscription.
 */
type Resultat = { ok: boolean; id?: string; erreur?: string };

function envoyer(to: string | string[], subject: string, g: Gabarit, nom = "Cartflox", replyTo?: string): Promise<Resultat> {
    const { html, text } = gabarit(g);
    return envoyerEmail({ from: `"${nom}" <${EXPEDITEUR_EMAIL}>`, to, subject, html, text, ...(replyTo ? { replyTo } : {}) });
}
const prenomDe = (nom?: string | null) => (nom || "").trim().split(/\s+/)[0] || "";
const bonjour = (prenom?: string) => `Bonjour${prenom ? ` ${prenom}` : ""},`;
const dateFr = (d = new Date()) => d.toLocaleString("fr-FR", { timeZone: "Africa/Abidjan", dateStyle: "long", timeStyle: "short" });

/** Envoi libre (HTML deja construit). Prefere les fonctions dediees ci-dessous. */
export async function sendEmail({ to, subject, html, text }: { to: string | string[]; subject: string; html: string; text?: string }): Promise<Resultat> {
    return envoyerEmail({ from: `"${EXPEDITEUR_NOM}" <${EXPEDITEUR_EMAIL}>`, to, subject, html, text });
}

// ── Compte ───────────────────────────────────────────────────────────────────

export async function sendWelcomeEmail({ to, prenom, lienVerification }: { to: string; prenom?: string; lienVerification?: string }) {
    return envoyer(to, "Bienvenue sur Cartflox", {
        titre: "Bienvenue sur Cartflox",
        apercu: "Votre espace est prêt : branchez votre agrégateur et encaissez.",
        salutation: bonjour(prenom),
        paragraphes: [
            "Votre compte est créé. Cartflox vous permet d'encaisser par Mobile Money et par carte partout en Afrique, avec vos propres comptes chez les agrégateurs : l'argent arrive directement chez vous, sans commission Cartflox.",
            "Pour encaisser votre premier paiement :",
            "1. <strong>Branchez votre agrégateur</strong> (PayDunya, CinetPay, PawaPay, Stripe...) en collant ses clés API.<br>2. <strong>Créez un lien de paiement</strong>, ou intégrez Cartflox à votre site (widget, SoftPay, WooCommerce, API).<br>3. <strong>Vérifiez votre identité</strong> : une pièce d'identité, réponse sous 24 à 48 h.",
            ...(lienVerification ? [`Pensez aussi à <a href="${echapper(lienVerification)}" style="color:${ACCENT};font-weight:600;">confirmer votre adresse e-mail</a> : c'est là que nous vous préviendrons de chaque paiement.`] : []),
        ],
        bouton: { label: "Ouvrir mon espace", url: `${SITE}/dashboard` },
        note: `Besoin d'aide pour démarrer ? La <a href="${SITE}/docs" style="color:#6b7280;">documentation</a> explique chaque étape, et vous pouvez répondre directement à cet e-mail.`,
    });
}

export async function sendPasswordResetEmail({ to, prenom, lien, validiteMin }: { to: string; prenom?: string; lien: string; validiteMin: number }) {
    return envoyer(to, "Réinitialisation de votre mot de passe Cartflox", {
        titre: "Choisir un nouveau mot de passe",
        apercu: `Lien valable ${validiteMin} minutes.`,
        salutation: bonjour(prenom),
        paragraphes: [`Vous avez demandé à réinitialiser le mot de passe de votre compte Cartflox. Le lien ci-dessous est valable <strong>${validiteMin} minutes</strong> et ne sert qu'une fois.`],
        bouton: { label: "Choisir un nouveau mot de passe", url: lien },
        note: `Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br><span style="word-break:break-all;">${echapper(lien)}</span><br><br>Vous n'êtes pas à l'origine de cette demande ? Ignorez cet e-mail, votre mot de passe reste inchangé.`,
    });
}

export async function sendPasswordChangedEmail({ to, prenom, quand }: { to: string; prenom?: string; quand?: Date }) {
    return envoyer(to, "Votre mot de passe Cartflox a été modifié", {
        titre: "Mot de passe modifié",
        apercu: "Si ce n'est pas vous, réagissez tout de suite.",
        salutation: bonjour(prenom),
        paragraphes: [
            `Le mot de passe de votre compte Cartflox a été modifié le ${dateFr(quand)} (heure d'Abidjan).`,
            "Si c'est bien vous, tout est en ordre. Sinon, réinitialisez votre mot de passe immédiatement et activez la double authentification dans Sécurité.",
        ],
        bouton: { label: "Sécuriser mon compte", url: `${SITE}/security` },
        pied: "Vous recevez cet e-mail parce qu'une action sensible a eu lieu sur votre compte Cartflox.",
    });
}

export async function sendTeamInviteEmail({ to, toName, inviterName, appName, role, permission, inviteUrl }: { to: string; toName: string; inviterName: string; appName: string; role: string; permission: string; inviteUrl: string }) {
    return envoyer(to, `${inviterName} vous invite à rejoindre ${appName} sur Cartflox`, {
        titre: `Rejoignez ${appName} sur Cartflox`,
        apercu: `${inviterName} vous a ajouté à l'équipe.`,
        salutation: bonjour(prenomDe(toName)),
        paragraphes: [`<strong>${echapper(inviterName)}</strong> vous a ajouté à l'espace <strong>${echapper(appName)}</strong> sur Cartflox, la plateforme qui gère ses encaissements.`],
        lignes: [["Espace", appName], ["Votre poste", role], ["Vos droits", permission]],
        bouton: { label: "Accéder à l'espace", url: inviteUrl },
        note: `Connectez-vous avec cette adresse (${echapper(to)}). Si vous n'avez pas encore de compte Cartflox, créez-le avec la même adresse. Si vous n'attendiez pas cette invitation, ignorez cet e-mail.`,
    });
}

// ── Paiements ────────────────────────────────────────────────────────────────

export async function sendPaymentConfirmationEmail({ to, merchantName, customerName, customerEmail, amount, currency, method, provider, orderId, transactionId, completedAt }: {
    to: string; merchantName: string; customerName: string; customerEmail: string; amount: number; currency: string; method: string; provider: string; orderId: string; transactionId: string; completedAt: string;
}) {
    const somme = montant(amount, currency);
    return envoyer(to, `Paiement reçu : ${somme} de ${customerName}`, {
        titre: "Vous venez de recevoir un paiement",
        apercu: `${somme} de ${customerName}, via ${provider}.`,
        salutation: "Bonjour,",
        montant: { valeur: somme, legende: `encaissé sur votre compte ${provider}` },
        lignes: [["Client", customerName], ["E-mail du client", customerEmail || "non renseigné"], ["Moyen de paiement", method], ["Passerelle", provider], ["Référence", orderId], ["Date", completedAt]],
        bouton: { label: "Voir le paiement", url: `${SITE}/transactions/${transactionId}` },
        pied: `Vous recevez cet e-mail parce que les notifications de paiement sont activées pour ${echapper(merchantName)}. Réglez-les dans Paramètres, onglet Notifications.`,
    });
}

export async function sendPaymentReceiptEmail({ to, customerName, merchantName, amount, currency, method, orderId, completedAt }: {
    to: string; customerName: string; merchantName: string; amount: number; currency: string; method: string; orderId: string; completedAt: string;
}) {
    const somme = montant(amount, currency);
    return envoyer(to, `Reçu de paiement : ${somme} à ${merchantName}`, {
        titre: "Votre paiement est confirmé",
        apercu: `${somme} à ${merchantName}. Conservez ce reçu.`,
        salutation: bonjour(prenomDe(customerName)),
        paragraphes: [`Votre paiement à <strong>${echapper(merchantName)}</strong> a bien été enregistré. Conservez cet e-mail comme preuve de paiement.`],
        montant: { valeur: somme, legende: "paiement confirmé" },
        lignes: [["Marchand", merchantName], ["Moyen de paiement", method], ["Référence", orderId], ["Date", completedAt]],
        note: "Pour toute question sur votre achat (livraison, contenu, remboursement), adressez-vous directement au marchand : Cartflox ne fait que transporter le paiement.",
        pied: `Vous recevez cet e-mail parce que vous avez payé chez ${echapper(merchantName)}, dont les paiements sont gérés par Cartflox.`,
    });
}

export async function sendFailureRateAlertEmail({ to, merchantName, failureRate, failedCount, totalCount, windowMinutes }: {
    to: string; merchantName: string; failureRate: number; failedCount: number; totalCount: number; windowMinutes: number;
}) {
    return envoyer(to, `Alerte : ${failureRate} % d'échecs sur ${merchantName}`, {
        titre: "Beaucoup de paiements échouent en ce moment",
        apercu: `${failedCount} échecs sur ${totalCount} tentatives en ${windowMinutes} minutes.`,
        salutation: "Bonjour,",
        paragraphes: [
            `Sur <strong>${echapper(merchantName)}</strong>, ${failedCount} paiement${failedCount > 1 ? "s" : ""} sur ${totalCount} ont échoué au cours des ${windowMinutes} dernières minutes.`,
            "Le plus souvent : une passerelle en panne ou restée en mode test, des clés API expirées, ou un opérateur indisponible. Vérifiez l'état de vos passerelles et, si besoin, activez le secours automatique dans Moyens de paiement, onglet Routage.",
        ],
        montant: { valeur: `${failureRate} %`, legende: "taux d'échec", ton: "alerte" },
        bouton: { label: "Voir les transactions", url: `${SITE}/transactions` },
        pied: "Alerte automatique envoyée par Cartflox quand le taux d'échec dépasse le seuil.",
    }, "Cartflox Alertes");
}

// ── Passerelles ──────────────────────────────────────────────────────────────

/** L'agregateur refuse la cle du marchand : ses clients ne peuvent plus payer, il doit le savoir tout de suite. */
export async function sendCredentialsRefusedEmail({ to, prenom, merchantName, gateway, detail }: {
    to: string; prenom?: string; merchantName: string; gateway: string; detail: string;
}) {
    return envoyer(to, `Action requise : ${gateway} refuse vos identifiants sur ${merchantName}`, {
        titre: `${gateway} refuse vos identifiants`,
        apercu: `Les paiements de vos clients via ${gateway} échouent tant que la clé n'est pas corrigée.`,
        salutation: prenom ? `Bonjour ${echapper(prenom)},` : "Bonjour,",
        paragraphes: [
            `Un client vient d'essayer de payer sur <strong>${echapper(merchantName)}</strong> et <strong>${echapper(gateway)}</strong> a refusé vos identifiants. Tant que ce n'est pas corrigé, aucun paiement ne passe par cette passerelle.`,
            `Réponse de ${echapper(gateway)} : ${echapper(detail)}`,
            "Le plus souvent : une clé copiée avec un caractère en trop ou en moins, une clé de test utilisée en production (ou l'inverse), ou une clé régénérée chez l'agrégateur et jamais mise à jour ici. Ouvrez Passerelles, retapez la clé et utilisez « Vérifier » : la réponse est immédiate.",
        ],
        bouton: { label: "Vérifier ma passerelle", url: `${SITE}/gateways` },
        pied: "Message automatique de Cartflox, envoyé au plus une fois par jour tant que le refus persiste.",
    }, "Cartflox Alertes");
}

// ── Abonnement ───────────────────────────────────────────────────────────────


