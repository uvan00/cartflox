import prisma from "@/lib/db";
import type { Categorie } from "./categorie-echec";

/**
 * Routage sur ce qui s'est réellement passé, et non sur ce qu'on avait supposé.
 *
 * Le routeur statique classait les passerelles avec des taux de réussite écrits
 * à la main, tous entre 87 % et 98 %. Mesurés sur le trafic réel, certains
 * tournaient à 45 %, voire 22 %. Le routeur envoyait donc les paiements vers
 * des passerelles qu'il croyait excellentes.
 *
 * Deux mécanismes, repris d'Hyperswitch :
 *
 *  1. Le TAUX MESURÉ. Chaque issue définitive est comptée par contexte
 *     (pays, méthode, devise) et par passerelle. Le score est lissé vers
 *     l'estimation statique, qui pèse comme huit paiements fictifs : une
 *     passerelle neuve garde son estimation, trois échecs ne la condamnent
 *     pas, et quinze échecs sur seize la relèguent sans discussion.
 *
 *  2. Le SEAU PERCÉ. Une panne imputable au fournisseur fait monter son seau
 *     de 1 ; le seau fuit avec le temps. Au-delà du seuil la passerelle passe
 *     en dernier, puis revient d'elle-même une fois le seau vidé. Seule la
 *     catégorie PANNE_FOURNISSEUR remplit le seau : une carte refusée par la
 *     banque du client ne dit rien de la qualité de la passerelle.
 *
 * Une part du trafic explore volontairement les passerelles les moins connues,
 * sans quoi la première mesurée resterait la seule jamais choisie.
 */

/**
 * Poids de l'estimation statique dans le calcul, exprimé en observations
 * fictives. Une passerelle jamais mesurée garde exactement son estimation ;
 * chaque paiement réel la déplace un peu. À huit, une passerelle qui échoue
 * douze fois de suite est déjà reléguée, mais trois échecs ne la condamnent pas.
 * C'est plus sûr qu'un seuil sec : il n'y a pas de marche à franchir.
 */
const POIDS_ESTIMATION = 8;
/** À partir d'ici, on considère que le trafic a parlé. Sert à l'affichage et à l'exploration. */
const MIN_OBSERVATIONS = 10;
/** Part du trafic qui va délibérément vers la passerelle la moins observée. */
const PART_EXPLORATION = 0.1;
/** Nombre de pannes rapprochées qui écartent une passerelle. */
const SEAU_TAILLE = 5;
/** Le seau perd un point toutes les dix minutes : une panne passagère s'oublie. */
const FUITE_MS = 10 * 60_000;

export type Approche = "mesure" | "exploration" | "insuffisant";

export type ScoreMesure = {
    passerelle: string;
    /** Taux retenu, entre 0 et 1. Mesuré si assez d'observations, sinon estimé. */
    score: number;
    observations: number;
    mesure: boolean;
    ecarte: boolean;
};

/** La clé sous laquelle un taux a un sens. Une passerelle bonne en CI peut être mauvaise au Bénin. */
export function contexteRoutage(x: { country?: string | null; methodCode?: string | null; currency?: string | null }): string {
    const n = (v: unknown) => String(v || "").trim().toUpperCase() || "?";
    return `${n(x.country)}|${n(x.methodCode)}|${n(x.currency)}`;
}

/** Niveau réel du seau : ce qui restait, moins ce qui a fui depuis. */
function niveauSeau(seau: number, seauMaj: Date | string): number {
    const depuis = Date.now() - new Date(seauMaj).getTime();
    return Math.max(0, (Number(seau) || 0) - depuis / FUITE_MS);
}

/**
 * Écartée tant que le seau retient encore plus que SEAU_TAILLE - 1 points.
 *
 * La comparaison ne peut pas être `>= SEAU_TAILLE` : le seau fuit dès la
 * milliseconde qui suit l'écriture, donc un niveau posé à 5 vaut déjà 4,9999 à
 * la lecture suivante et la passerelle n'était jamais écartée. Avec ce seuil,
 * cinq pannes rapprochées valent dix minutes de mise à l'écart, et chaque
 * panne supplémentaire en ajoute dix. La passerelle revient d'elle-même.
 */
function ecartee(seau: number, seauMaj: Date | string): boolean {
    return niveauSeau(seau, seauMaj) > SEAU_TAILLE - 1;
}

/**
 * Ordonne les passerelles candidates. `estimations` porte les taux statiques du
 * routeur, utilisés tant que la mesure manque. Ne lève jamais : en cas de
 * souci la liste d'entrée est renvoyée telle quelle, donc le comportement
 * d'avant.
 */
export async function ordonnerParMesure(
    contexte: string,
    candidats: string[],
    estimations: Record<string, number> = {},
): Promise<{ ordre: string[]; approche: Approche; details: ScoreMesure[] }> {
    if (candidats.length <= 1) {
        return { ordre: candidats, approche: "insuffisant", details: [] };
    }
    try {
        const lignes = await (prisma as any).routageScore.findMany({
            where: { contexte, passerelle: { in: candidats } },
        });
        const parPasserelle = new Map<string, any>(lignes.map((l: any) => [l.passerelle, l]));

        const details: ScoreMesure[] = candidats.map((p) => {
            const l = parPasserelle.get(p);
            const reussis = Number(l?.reussis || 0);
            const echoues = Number(l?.echoues || 0);
            const observations = reussis + echoues;
            const estimation = estimations[p] ?? 0.9;
            // Lissage vers l'estimation : le taux mesuré prend le dessus à
            // mesure que les observations s'accumulent, sans jamais basculer
            // d'un coup. Sans observation, on retombe pile sur l'estimation.
            const score = (reussis + POIDS_ESTIMATION * estimation) / (observations + POIDS_ESTIMATION);
            return {
                passerelle: p,
                score,
                observations,
                mesure: observations >= MIN_OBSERVATIONS,
                ecarte: l ? ecartee(l.seau, l.seauMaj) : false,
            };
        });

        // Les écartées passent derrière, quoi qu'il arrive. On ne les supprime
        // pas : si toutes sont en panne, mieux vaut essayer que refuser.
        const trier = (a: ScoreMesure, b: ScoreMesure) =>
            Number(a.ecarte) - Number(b.ecarte) || b.score - a.score;
        const classe = [...details].sort(trier);

        // Exploration : une part du trafic va vers la moins observée des
        // candidates encore saines, sinon on n'apprend jamais rien d'elles.
        const saines = classe.filter((d) => !d.ecarte);
        const explorable = saines.filter((d) => !d.mesure).sort((a, b) => a.observations - b.observations)[0];
        if (explorable && saines.length > 1 && Math.random() < PART_EXPLORATION) {
            const ordre = [explorable.passerelle, ...classe.map((d) => d.passerelle).filter((p) => p !== explorable.passerelle)];
            return { ordre, approche: "exploration", details };
        }

        const mesurees = details.filter((d) => d.mesure).length;
        return {
            ordre: classe.map((d) => d.passerelle),
            approche: mesurees > 0 ? "mesure" : "insuffisant",
            details,
        };
    } catch {
        return { ordre: candidats, approche: "insuffisant", details: [] };
    }
}

/**
 * Compte une issue DÉFINITIVE. À n'appeler qu'une fois par transaction, depuis
 * la finalisation : compter à l'initiation reviendrait à noter une passerelle
 * sur sa capacité à décrocher le téléphone, pas à encaisser.
 *
 * Un abandon du client ne compte ni en réussite ni en échec : il ne dit rien
 * de la passerelle, et l'inclure enfoncerait les moyens à code de confirmation.
 */
export async function enregistrerIssue(x: {
    contexte: string;
    passerelle: string;
    reussi: boolean;
    categorie?: Categorie;
}): Promise<void> {
    const { contexte, passerelle, reussi, categorie } = x;
    if (!contexte || !passerelle) return;
    if (!reussi && (categorie === "ABANDON_CLIENT" || categorie === "TEMPORAIRE")) return;

    try {
        const existant = await (prisma as any).routageScore.findUnique({
            where: { contexte_passerelle: { contexte, passerelle } },
        });

        // Le seau ne monte que pour une panne du fournisseur, et il a d'abord fui.
        const panne = !reussi && categorie === "PANNE_FOURNISSEUR";
        const niveau = existant ? niveauSeau(existant.seau, existant.seauMaj) : 0;
        const seau = panne ? niveau + 1 : niveau;

        await (prisma as any).routageScore.upsert({
            where: { contexte_passerelle: { contexte, passerelle } },
            create: {
                contexte, passerelle,
                reussis: reussi ? 1 : 0,
                echoues: reussi ? 0 : 1,
                seau, seauMaj: new Date(),
            },
            update: {
                reussis: { increment: reussi ? 1 : 0 },
                echoues: { increment: reussi ? 0 : 1 },
                seau, seauMaj: new Date(),
            },
        });
    } catch {
        // La mesure est un confort : elle ne doit jamais faire échouer une finalisation.
    }
}

/**
 * Sous quel contexte et quelle passerelle une transaction a-t-elle été jouée.
 * Le contexte vient de la décision de routage enregistrée à l'initiation, seule
 * à porter le pays. La clé de passerelle se dérive du NOM de la passerelle et
 * jamais de `tx.provider`, qui porte le libellé de la carte pays.
 */
export async function reperesTransaction(tx: any): Promise<{ contexte: string; passerelle: string } | null> {
    try {
        const { detectProviderKey } = await import("@/lib/cle-fournisseur");
        const gatewayId = (tx?.metadata as any)?.gatewayId;
        if (!gatewayId) return null;
        const gateway = await prisma.gateway.findUnique({ where: { id: String(gatewayId) }, select: { name: true } });
        if (!gateway) return null;
        const passerelle = detectProviderKey(gateway.name);
        if (!passerelle) return null;

        const decision = await (prisma as any).routingDecision.findFirst({
            where: { transactionId: tx.id },
            select: { country: true, methodCode: true, currency: true },
            orderBy: { createdAt: "desc" },
        });
        if (!decision) return null;
        return { contexte: contexteRoutage(decision), passerelle };
    } catch {
        return null;
    }
}
