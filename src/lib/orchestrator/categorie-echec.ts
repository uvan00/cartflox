import prisma from "@/lib/db";
import { motifEchec, type MotifEchec } from "@/lib/motif-echec";

/**
 * De quoi est mort un paiement, et ce que le ROUTEUR doit en conclure.
 *
 * `motif-echec.ts` répond déjà à « que dire au client ». Il manquait l'autre
 * moitié : est-ce la faute du fournisseur, auquel cas il faut l'écarter et
 * tenter ailleurs, ou celle du client, auquel cas changer de passerelle ne
 * changera rien et insister ne fait que doubler les frais.
 *
 * C'est le « Gateway Status Map » d'Hyperswitch. La table de correspondance
 * vit en base (`CodeFournisseur`) et non dans le code : corriger la lecture
 * d'un code FeexPay ne doit pas demander un déploiement. Le tableau ci-dessous
 * n'est que le filet de départ, utilisé quand la base ne dit rien.
 *
 * Depuis le 08/10/2026, trois distinctions de plus, reprises d'Hyperswitch :
 *  - IDENTIFIANTS : la clé de CE compte est refusée. Ce n'est pas le
 *    fournisseur qui est en panne, c'est le marchand qui a mal saisi sa clé :
 *    on écarte ce compte, pas le fournisseur pour tous les marchands.
 *  - INCERTAIN : délai dépassé, connexion coupée en route. La demande a pu
 *    partir chez le fournisseur ; renvoyer la même ailleurs ferait deux
 *    demandes sur le téléphone du client. On VÉRIFIE avant tout nouvel essai.
 *  - Les codes lus sous toutes leurs formes (`code`, `response_code`,
 *    `errors[0].code`, HTTP 401/403/5xx...), et les phrases reconnues au
 *    fragment pour TOUT code inconnu, pas seulement quand il n'y a pas de code.
 */

/** Seule PANNE_FOURNISSEUR remplit le seau d'élimination du fournisseur ; IDENTIFIANTS remplit celui du compte. */
export type Categorie =
    | "PANNE_FOURNISSEUR"   // 5xx, injoignable, moyen non activé chez lui : sa faute
    | "IDENTIFIANTS"        // clé refusée, compte non activé : la faute du compte marchand
    | "REFUS_CLIENT"        // solde insuffisant, banque qui refuse : son compte
    | "MOYEN_INVALIDE"      // mauvais numéro, carte expirée, CVC faux
    | "ABANDON_CLIENT"      // code jamais saisi, délai dépassé
    | "TEMPORAIRE"          // paiement déjà en cours : réessayer plus tard, pas ailleurs
    | "INCERTAIN"           // délai dépassé : la demande a pu partir, vérifier avant d'insister
    | "INCONNU";

/**
 * REESSAYER : tenter la passerelle suivante. ARRETER : inutile d'insister, le
 * client doit lire le motif. VERIFIER : ne rien renvoyer, relire l'état auprès
 * du fournisseur d'abord (la demande a pu partir).
 */
export type Decision = "REESSAYER" | "ARRETER" | "VERIFIER";

export type Verdict = {
    code: string;
    categorie: Categorie;
    decision: Decision;
    /** Message destiné à l'acheteur, quand la base en impose un. */
    message?: string;
};

type Regle = { categorie: Categorie; decision: Decision };

/** Ce qu'on sait sans la base. La base peut tout corriger, rien n'est figé ici. */
const FILET: Record<string, Regle> = {
    // ── Mobile Money, codes communs PawaPay / FeexPay / Hub2 ────────────────
    insufficient_balance: { categorie: "REFUS_CLIENT", decision: "ARRETER" },
    payer_limit_reached: { categorie: "REFUS_CLIENT", decision: "ARRETER" },
    payer_not_found: { categorie: "MOYEN_INVALIDE", decision: "ARRETER" },
    payment_not_approved: { categorie: "ABANDON_CLIENT", decision: "ARRETER" },
    timeout: { categorie: "ABANDON_CLIENT", decision: "ARRETER" },
    transaction_already_in_process: { categorie: "TEMPORAIRE", decision: "ARRETER" },
    // Le moyen n'est pas activé sur le compte marchand chez Hub2 : la passerelle
    // ne sait pas faire, une autre le saura peut-être. C'est bien sa faute.
    forbidden_by_hub2: { categorie: "PANNE_FOURNISSEUR", decision: "REESSAYER" },
    unspecified_failure: { categorie: "INCONNU", decision: "REESSAYER" },
    other_error: { categorie: "INCONNU", decision: "REESSAYER" },

    // ── Carte bancaire (Stripe) ─────────────────────────────────────────────
    insufficient_funds: { categorie: "REFUS_CLIENT", decision: "ARRETER" },
    card_declined: { categorie: "REFUS_CLIENT", decision: "ARRETER" },
    do_not_honor: { categorie: "REFUS_CLIENT", decision: "ARRETER" },
    transaction_not_allowed: { categorie: "REFUS_CLIENT", decision: "ARRETER" },
    try_again_later: { categorie: "REFUS_CLIENT", decision: "ARRETER" },
    card_velocity_exceeded: { categorie: "REFUS_CLIENT", decision: "ARRETER" },
    authentication_required: { categorie: "ABANDON_CLIENT", decision: "ARRETER" },
    expired_card: { categorie: "MOYEN_INVALIDE", decision: "ARRETER" },
    incorrect_cvc: { categorie: "MOYEN_INVALIDE", decision: "ARRETER" },
    incorrect_number: { categorie: "MOYEN_INVALIDE", decision: "ARRETER" },
    processing_error: { categorie: "PANNE_FOURNISSEUR", decision: "REESSAYER" },

    // ── Transport : pas un code fournisseur, un mur ─────────────────────────
    _injoignable: { categorie: "PANNE_FOURNISSEUR", decision: "REESSAYER" },
    _http_5xx: { categorie: "PANNE_FOURNISSEUR", decision: "REESSAYER" },
    // Délai dépassé, connexion coupée pendant l'appel, 504 : la demande a pu
    // arriver chez le fournisseur. On vérifie avant de renvoyer quoi que ce soit.
    _delai: { categorie: "INCERTAIN", decision: "VERIFIER" },
    // Clé refusée : ce compte, pas ce fournisseur. Une autre passerelle peut servir.
    _identifiants: { categorie: "IDENTIFIANTS", decision: "REESSAYER" },
    // Operateur ferme chez l'agregateur (PawaPay v1 et v2) : une autre passerelle peut le servir.
    correspondent_temporarily_unavailable: { categorie: "PANNE_FOURNISSEUR", decision: "REESSAYER" },
    provider_temporarily_unavailable: { categorie: "PANNE_FOURNISSEUR", decision: "REESSAYER" },
};

const DEFAUT: Regle = { categorie: "INCONNU", decision: "REESSAYER" };

/** Sans accents, sans casse : les fournisseurs écrivent « deja » aussi bien que « déjà ». */
const aplati = (v: unknown) =>
    String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/**
 * Une clé refusée par l'agrégateur, telle que les fournisseurs l'écrivent. Même
 * liste que l'alerte au marchand (« Vos identifiants ... sont refusés »).
 */
export const IDENTIFIANTS_REFUSES = /identifiants|authentication|unauthori[sz]ed|invalid (api |secret |private |public )?(key|token|credential)|cl[eé] (api )?(invalide|refus)|forbidden|access denied|activer votre compte|compte (n'est )?(pas |non )activ|account (is )?not (yet )?activ|not activated/i;

/** Délai dépassé ou connexion coupée EN ROUTE : la demande a pu arriver. */
const DELAI_DEPASSE = /timeout|timed? ?out|d[ée]lai d[ée]pass[ée]|aborted|ETIMEDOUT|ECONNRESET|EPIPE|socket hang up|ne r[ée]pond pas|UND_ERR_(HEADERS|BODY)_TIMEOUT/i;

/** La table de base, relue au plus une fois par minute : elle change rarement, elle est lue à chaque paiement. */
let cache: { a: number; regles: Map<string, Verdict>; fragments: Array<{ passerelle: string; fragment: string; verdict: Verdict }> } | null = null;
const DUREE_CACHE_MS = 60_000;

export function oublierCodesFournisseur() { cache = null; }

async function reglesBase() {
    if (cache && Date.now() - cache.a < DUREE_CACHE_MS) return cache;
    const regles = new Map<string, Verdict>();
    const fragments: Array<{ passerelle: string; fragment: string; verdict: Verdict }> = [];
    try {
        const lignes = await prisma.codeFournisseur.findMany();
        for (const l of lignes) {
            const verdict: Verdict = {
                code: l.code || "",
                categorie: l.categorie as Categorie,
                decision: l.decision as Decision,
                message: l.messageUnifie || undefined,
            };
            if (l.code) regles.set(`${aplati(l.passerelle)}|${aplati(l.code)}`, verdict);
            if (l.fragmentMessage) {
                fragments.push({ passerelle: aplati(l.passerelle), fragment: aplati(l.fragmentMessage), verdict });
            }
        }
    } catch {
        // Base indisponible : le filet codé en dur suffit à décider, on ne bloque
        // jamais un paiement pour une table de traduction.
    }
    // Le fragment le plus long d'abord : « numero MTN Benin valide » doit gagner
    // sur « numero valide », sinon la règle large avale la règle précise.
    fragments.sort((a, b) => b.fragment.length - a.fragment.length);
    cache = { a: Date.now(), regles, fragments };
    return cache;
}

const texteDe = (v: unknown) => (typeof v === "string" ? v.trim() : "");
type Objet = Record<string, unknown>;
/** Un objet quel qu'il soit, sinon un objet vide : les réponses des fournisseurs n'ont pas de forme. */
const objet = (v: unknown): Objet => (v && typeof v === "object" && !Array.isArray(v) ? (v as Objet) : {});
/** Un code peut arriver en nombre (`code: 4003`) : on le garde en texte. */
const codeDe = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? String(v) : texteDe(v));

/** Hub2 porte l'échec sur la dernière tentative de l'intention, pas à la racine. */
const echecHub2 = (d: Objet): Objet | null => {
    if (d.failure && typeof d.failure === "object") return objet(d.failure);
    const paiements = Array.isArray(d.payments) ? d.payments : [];
    const p = paiements.length ? objet(paiements[paiements.length - 1]) : null;
    return p?.failure && typeof p.failure === "object" ? objet(p.failure) : null;
};

/** Tout ce qui ressemble à une phrase d'erreur dans une réponse, pour les heuristiques de transport et de clé. */
function phrasesErreur(d: Objet): string {
    const morceaux: unknown[] = [
        d.error, d.message, d.description, d.response_text, d.fail_reason, d.detail, d.error_description,
        objet(d.failureReason).failureMessage, objet(d.rejectionReason).rejectionMessage, objet(d.last_payment_error).message,
        objet(d.error).message,
        Array.isArray(d.errors) ? d.errors.map((e: unknown) => (typeof e === "string" ? e : objet(e).message)).join(" ") : "",
        echecHub2(d)?.message,
    ];
    return morceaux.filter((m): m is string => typeof m === "string" && m.length > 0).join(" ");
}

/**
 * Le code brut, quel que soit le fournisseur. Les murs de transport ont leur
 * propre code.
 *
 * Le code est lu DIRECTEMENT et non repris de `motifEchec` : celui-ci renvoie
 * null dès qu'il ne connaît ni le code ni un message lisible, et le code brut
 * serait alors perdu. Or c'est précisément ce cas que la table `CodeFournisseur`
 * existe pour traiter : un code inconnu du filet mais connu de la base.
 */
export function codeBrut(rawData: unknown, motif: MotifEchec | null): string {
    const d = objet(rawData);
    const phrases = phrasesErreur(d);

    // 1. Le code que le fournisseur nomme lui-même.
    const code =
        texteDe(objet(d.failureReason).failureCode) ||
        texteDe(objet(d.rejectionReason).rejectionCode) ||
        texteDe(objet(d.last_payment_error).decline_code) ||
        texteDe(objet(d.last_payment_error).code) ||
        texteDe(d.declineCode) ||
        texteDe(d.errorCode) ||
        texteDe(echecHub2(d)?.code) ||
        codeDe(d.error_code) ||
        codeDe(d.reason_code) ||
        codeDe(d.response_code) ||
        codeDe(d.responsecode) ||
        codeDe(objet(d.error).code) ||
        (Array.isArray(d.errors) ? codeDe(objet(d.errors[0]).code) : "") ||
        codeDe(d.code);
    if (code) return code;

    // 2. Un délai dépassé signalé par l'adaptateur lui-même (PawaPay : `_delai`), puis
    // le statut HTTP quand l'adaptateur l'a gardé.
    if (d._delai === true) return "_delai";
    const statut = Number(d.status ?? d.statusCode ?? d.httpStatus ?? d._http ?? 0);
    if (statut === 401 || statut === 403) return "_identifiants";
    if (statut === 504 || statut === 408) return "_delai";
    if (statut >= 500) return "_http_5xx";

    // 3. Ce que motif-echec a reconnu (code connu, ou « AUTRE » avec une phrase).
    if (motif?.code) return motif.code;

    // 4. Un mur, décrit en toutes lettres : délai dépassé, clé refusée, injoignable.
    // Les adaptateurs signalent une panne réseau par `rawData.error` : l'appel
    // n'a jamais abouti, aucun code fournisseur n'existe.
    if (phrases) {
        if (DELAI_DEPASSE.test(phrases)) return "_delai";
        if (IDENTIFIANTS_REFUSES.test(phrases)) return "_identifiants";
        if (d.error) return "_injoignable";
    }
    return "";
}

/**
 * Classe un échec. Ne lève jamais : un verdict manquant vaut mieux qu'un
 * paiement interrompu, donc l'inconnu renvoie INCONNU / REESSAYER.
 */
export async function categoriserEchec(passerelle: string, rawData: unknown): Promise<Verdict> {
    const motif = motifEchec(rawData);
    const code = codeBrut(rawData, motif);
    if (!code) return { code: "", ...DEFAUT };

    const cle = aplati(code);
    const p = aplati(passerelle);
    const { regles, fragments } = await reglesBase();

    // La règle la plus précise gagne : la passerelle d'abord, le joker ensuite,
    // le filet codé en dur en dernier.
    const trouve = regles.get(`${p}|${cle}`) || regles.get(`*|${cle}`);
    if (trouve) return { ...trouve, code };

    // Code inconnu de la base : la phrase du fournisseur peut, elle, être
    // connue. On la reconnaît au fragment, la passerelle d'abord puis le joker.
    // Avant, seule une réponse SANS code (« AUTRE ») passait par ici : un code
    // inconnu accompagné d'une phrase connue restait INCONNU.
    const phrase = aplati([motif?.message, phrasesErreur(objet(rawData))].filter(Boolean).join(" "));
    if (phrase && !FILET[cle]) {
        const f = fragments.find((x) => (x.passerelle === p || x.passerelle === "*") && phrase.includes(x.fragment));
        if (f) return { ...f.verdict, code };
    }

    // Une clé refusée se dit souvent en toutes lettres, avec un code maison à côté.
    if (!FILET[cle] && IDENTIFIANTS_REFUSES.test(phrase)) return { code, ...FILET._identifiants };

    return { code, ...(FILET[cle] || DEFAUT) };
}

/** Version synchrone, sans la base : pour les endroits où l'on ne peut pas attendre. */
export function categoriserEchecRapide(rawData: unknown): Verdict {
    const motif = motifEchec(rawData);
    const code = codeBrut(rawData, motif);
    if (!code) return { code: "", ...DEFAUT };
    return { code, ...(FILET[aplati(code)] || DEFAUT) };
}

/**
 * Une exception levée par un adaptateur (et non une réponse FAILED) : on la
 * classe comme une réponse `{ error }`. Un délai dépassé reste INCERTAIN.
 */
export async function categoriserException(passerelle: string, err: unknown): Promise<Verdict> {
    const e = err as { name?: string; message?: string; cause?: { code?: string; message?: string } } | null;
    const nom = String(e?.name || "");
    const texte = [e?.message, e?.cause?.code, e?.cause?.message].filter(Boolean).join(" ") || "Exception";
    if (nom === "TimeoutError" || nom === "AbortError") return { code: "_delai", ...FILET._delai };
    return categoriserEchec(passerelle, { error: texte, _exception: true });
}

/** Une issue qui ne dit rien de la passerelle : ni réussite ni échec pour la mesure. */
export function issueNeutre(categorie?: Categorie | null): boolean {
    return categorie === "ABANDON_CLIENT" || categorie === "TEMPORAIRE" || categorie === "INCERTAIN";
}
