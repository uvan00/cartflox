import nodemailer from "nodemailer";

/** Adresse abregee pour les journaux : la premiere lettre et le domaine. */
const masquer = (e: string) => e.replace(/^(.).*(@.*)$/, "$1***$2");

/**
 * Envoi des e-mails du produit.
 *
 * Le courrier part par SMTP (MAIL_TRANSPORT=smtp, le defaut) ou par l'API
 * Brevo (MAIL_TRANSPORT=brevo). Alignez SPF et DKIM sur le domaine de
 * MAIL_FROM, sinon vos recus finiront en courrier indesirable.
 *
 * MAIL_INTERNAL, la boite qui recoit les alertes, doit rester une adresse
 * DIFFERENTE de l'expediteur : un outil de support (Chatwoot, par exemple)
 * jette sinon le message au titre de sa protection anti-boucle.
 */

const CLE_BREVO = process.env.BREVO_API_KEY || "";

/**
 * Par ou part le courrier : « smtp » ou « brevo ». La cle Brevo
 * reste configuree pour les statistiques de l'admin, elle ne decide donc plus
 * a elle seule du transport. Bascule par variable, sans reconstruire.
 */
const TRANSPORT = (process.env.MAIL_TRANSPORT || (CLE_BREVO ? "brevo" : "smtp")).toLowerCase();
export const EXPEDITEUR_EMAIL = process.env.MAIL_FROM || "";
export const EXPEDITEUR_NOM = process.env.MAIL_FROM_NAME || "Cartflox";

/** Voie reellement empruntee, pour que l'e-mail de test de l'admin dise vrai. */
export const VOIE_ENVOI =
    TRANSPORT === "brevo" ? "API Brevo" : `SMTP ${process.env.SMTP_HOST || "non configure"}`;

/** Boite qui recoit les messages de contact, inscriptions et alertes. */
export const BOITE_INTERNE =
    process.env.MAIL_INTERNAL || "";

/** Adresse a laquelle un destinataire peut repondre. */
export const REPONDRE_A = process.env.MAIL_REPLY_TO || BOITE_INTERNE;

export type OptionsEmail = {
    /** Accepte la forme nodemailer `"Nom" <adresse>` : seul le NOM est repris. */
    from?: string;
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
    replyTo?: string;
};

/** Extrait le nom affiche d'un `"Nom" <adresse@exemple.com>`. */
function nomExpediteur(brut?: string): string {
    const m = (brut || "").match(/^\s*"?([^"<]+?)"?\s*</);
    return m ? m[1].trim() : EXPEDITEUR_NOM;
}

function listeDestinataires(to: string | string[]): { email: string }[] {
    return (Array.isArray(to) ? to : String(to).split(","))
        .map((a) => a.trim())
        .filter(Boolean)
        .map((email) => ({ email }));
}

/**
 * Domaines qui n'existent pas et n'existeront jamais : ceux que les normes
 * reservent aux exemples et aux essais (RFC 2606 et 6761), plus `.local`.
 *
 * ⚠️ Pourquoi : les comptes d'essai que je cree portent ce genre d'adresse, et
 * le cron « avis-sandbox » leur ecrivait toutes les douze heures. Chaque envoi
 * revenait en « Undelivered Mail Returned to Sender », et comme l'expediteur
 * est celle du support, chaque rejet ouvrait une conversation dans le
 * support. Treize des vingt-six rejets de la boite venaient de la.
 */
const DOMAINES_MORTS = /(^|\.)(test|example|invalid|localhost|local)$|(^|@)(example\.(com|net|org))$/i;

/** Adresses definitivement injoignables, gardees en base et relues par intervalles. */
let suppression: { liste: Set<string>; a: number } = { liste: new Set(), a: 0 };
const SUPPRESSION_TTL_MS = 60_000;

async function adressesMortes(): Promise<Set<string>> {
    if (Date.now() - suppression.a < SUPPRESSION_TTL_MS) return suppression.liste;
    try {
        const { default: prisma } = await import("@/lib/db");
        const lignes = await (prisma as any).adresseMorte.findMany({ select: { email: true } });
        suppression = { liste: new Set(lignes.map((l: any) => String(l.email).toLowerCase())), a: Date.now() };
    } catch {
        // Base injoignable : on n'empeche pas d'ecrire pour autant.
        suppression = { liste: suppression.liste, a: Date.now() };
    }
    return suppression.liste;
}

/**
 * Ecarte les adresses a qui il ne faut plus rien envoyer. Un seul endroit :
 * tous les e-mails du produit passent par `envoyerEmail`.
 */
async function destinatairesJoignables(destinataires: { email: string }[]): Promise<{ gardes: { email: string }[]; ecartes: string[] }> {
    const mortes = await adressesMortes();
    const gardes: { email: string }[] = [];
    const ecartes: string[] = [];
    for (const d of destinataires) {
        const adresse = d.email.toLowerCase();
        const domaine = adresse.split("@")[1] || "";
        if (mortes.has(adresse) || DOMAINES_MORTS.test(domaine)) ecartes.push(d.email);
        else gardes.push(d);
    }
    return { gardes, ecartes };
}

let transportSmtp: ReturnType<typeof nodemailer.createTransport> | null = null;
function smtp() {
    if (!transportSmtp) {
        transportSmtp = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === "true",
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });
    }
    return transportSmtp;
}

/**
 * Envoie un e-mail. Ne leve jamais : un envoi rate ne doit pas faire echouer
 * un paiement ni une inscription. Le resultat dit si le message est parti.
 */
export async function envoyerEmail(o: OptionsEmail): Promise<{ ok: boolean; id?: string; erreur?: string }> {
    const nom = nomExpediteur(o.from);
    if (!EXPEDITEUR_EMAIL) return { ok: false, erreur: "MAIL_FROM manquant" };
    const tous = listeDestinataires(o.to);
    if (tous.length === 0) return { ok: false, erreur: "aucun destinataire" };
    const { gardes: destinataires, ecartes } = await destinatairesJoignables(tous);
    if (ecartes.length > 0) console.log(`[mail] ecarte ${ecartes.join(", ")} (adresse injoignable) : ${o.subject}`);
    if (destinataires.length === 0) return { ok: false, erreur: "adresse injoignable" };

    if (TRANSPORT === "brevo" && CLE_BREVO) {
        try {
            const res = await fetch("https://api.brevo.com/v3/smtp/email", {
                method: "POST",
                headers: { "api-key": CLE_BREVO, "content-type": "application/json", accept: "application/json" },
                body: JSON.stringify({
                    sender: { name: nom, email: EXPEDITEUR_EMAIL },
                    to: destinataires,
                    replyTo: { email: o.replyTo || REPONDRE_A },
                    subject: o.subject,
                    htmlContent: o.html,
                    ...(o.text ? { textContent: o.text } : {}),
                }),
                signal: AbortSignal.timeout(15_000),
            });
            const corps: any = await res.json().catch(() => ({}));
            if (res.ok) {
                console.log(`[mail] envoye a ${destinataires.map((d) => masquer(d.email)).join(", ")} : ${o.subject}`);
                return { ok: true, id: corps?.messageId };
            }
            const erreur = corps?.message || `HTTP ${res.status}`;
            console.error(`[mail] Brevo a refuse l'envoi (${erreur}) : ${o.subject}`);
            return { ok: false, erreur };
        } catch (e: any) {
            console.error("[mail] Brevo injoignable :", e?.message || e);
            return { ok: false, erreur: e?.message || "Brevo injoignable" };
        }
    }

    // Voie normale : SMTP. Repli quand Brevo n'est pas configure.
    try {
        const info = await smtp().sendMail({
            from: `"${nom}" <${EXPEDITEUR_EMAIL}>`,
            to: destinataires.map((d) => d.email).join(", "),
            replyTo: o.replyTo || REPONDRE_A,
            subject: o.subject,
            html: o.html,
            ...(o.text ? { text: o.text } : {}),
        });
        console.log(`[mail] envoye a ${destinataires.map((d) => masquer(d.email)).join(", ")} : ${o.subject}`);
        return { ok: true, id: info.messageId };
    } catch (e: any) {
        console.error("[mail] envoi SMTP impossible :", e?.message || e);
        return { ok: false, erreur: e?.message || "SMTP indisponible" };
    }
}
