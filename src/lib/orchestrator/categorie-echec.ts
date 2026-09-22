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
 */

/** Seule PANNE_FOURNISSEUR remplit le seau d'élimination : c'est la seule où la passerelle est en cause. */
export type Categorie =
    | "PANNE_FOURNISSEUR"   // 5xx, injoignable, moyen non activé chez lui : sa faute
    | "REFUS_CLIENT"        // solde insuffisant, banque qui refuse : son compte
    | "MOYEN_INVALIDE"      // mauvais numéro, carte expirée, CVC faux
    | "ABANDON_CLIENT"      // code jamais saisi, délai dépassé
    | "TEMPORAIRE"          // paiement déjà en cours : réessayer plus tard, pas ailleurs
    | "INCONNU";

export type Decision = "REESSAYER" | "ARRETER";

export type Verdict = {
    code: string;
    categorie: Categorie;
    decision: Decision;
    /** Message destiné à l'acheteur, quand la base en impose un. */
    message?: string;
};

/** Ce qu'on sait sans la base. La base peut tout corriger, rien n'est figé ici. */
const FILET: Record<string, { categorie: Categorie; decision: Decision }> = {
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
    expired_card: { categorie: "MOYEN_INVALIDE", decision: "ARRETER" },
    incorrect_cvc: { categorie: "MOYEN_INVALIDE", decision: "ARRETER" },
    incorrect_number: { categorie: "MOYEN_INVALIDE", decision: "ARRETER" },
    processing_error: { categorie: "PANNE_FOURNISSEUR", decision: "REESSAYER" },

    // ── Transport : pas un code fournisseur, un mur ─────────────────────────
    _injoignable: { categorie: "PANNE_FOURNISSEUR", decision: "REESSAYER" },
    _http_5xx: { categorie: "PANNE_FOURNISSEUR", decision: "REESSAYER" },
};

const DEFAUT: { categorie: Categorie; decision: Decision } = { categorie: "INCONNU", decision: "REESSAYER" };

/** Sans accents, sans casse : les fournisseurs écrivent « deja » aussi bien que « déjà ». */
const aplati = (v: unknown) =>
    String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** La table de base, relue au plus une fois par minute : elle change rarement, elle est lue à chaque paiement. */
let cache: { a: number; regles: Map<string, Verdict>; fragments: Array<{ passerelle: string; fragment: string; verdict: Verdict }> } | null = null;
const DUREE_CACHE_MS = 60_000;

export function oublierCodesFournisseur() { cache = null; }

async function reglesBase() {
    if (cache && Date.now() - cache.a < DUREE_CACHE_MS) return cache;
    const regles = new Map<string, Verdict>();
    const fragments: Array<{ passerelle: string; fragment: string; verdict: Verdict }> = [];
    try {
        const lignes = await (prisma as any).codeFournisseur.findMany();
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

/** Hub2 porte l'échec sur la dernière tentative de l'intention, pas à la racine. */
const echecHub2 = (d: any) => {
    if (d?.failure && typeof d.failure === "object") return d.failure;
    const p = Array.isArray(d?.payments) && d.payments.length ? d.payments[d.payments.length - 1] : null;
    return p?.failure && typeof p.failure === "object" ? p.failure : null;
};

/**
 * Le code brut, quel que soit le fournisseur. Les murs de transport ont leur
 * propre code.
 *
 * Le code est lu DIRECTEMENT et non repris de `motifEchec` : celui-ci renvoie
 * null dès qu'il ne connaît ni le code ni un message lisible, et le code brut
 * serait alors perdu. Or c'est précisément ce cas que la table `CodeFournisseur`
 * existe pour traiter : un code inconnu du filet mais connu de la base.
 */
function codeBrut(rawData: unknown, motif: MotifEchec | null): string {
    const d = (rawData || {}) as Record<string, any>;
    const statut = Number(d?.status ?? d?.statusCode ?? d?.httpStatus ?? 0);
    if (statut >= 500) return "_http_5xx";

    const code =
        texteDe(d?.failureReason?.failureCode) ||
        texteDe(d?.rejectionReason?.rejectionCode) ||
        texteDe(d?.last_payment_error?.decline_code) ||
        texteDe(d?.last_payment_error?.code) ||
        texteDe(d?.declineCode) ||
        texteDe(d?.errorCode) ||
        texteDe(echecHub2(d)?.code);
    if (code) return code;
    if (motif?.code) return motif.code;
    // Les adaptateurs signalent une panne réseau par `rawData.error` : l'appel
    // n'a jamais abouti, aucun code fournisseur n'existe.
    if (d?.error) return "_injoignable";
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

    // Pas de code exploitable : certains fournisseurs ne renvoient qu'une phrase.
    // On la reconnaît au fragment, la passerelle d'abord puis le joker.
    if (code === "AUTRE" && motif?.message) {
        const phrase = aplati(motif.message);
        const f = fragments.find((x) => (x.passerelle === p || x.passerelle === "*") && phrase.includes(x.fragment));
        if (f) return { ...f.verdict, code: "AUTRE" };
    }

    return { code, ...(FILET[cle] || DEFAUT) };
}

/** Version synchrone, sans la base : pour les endroits où l'on ne peut pas attendre. */
export function categoriserEchecRapide(rawData: unknown): Verdict {
    const motif = motifEchec(rawData);
    const code = codeBrut(rawData, motif);
    if (!code) return { code: "", ...DEFAUT };
    return { code, ...(FILET[code.toLowerCase()] || DEFAUT) };
}
