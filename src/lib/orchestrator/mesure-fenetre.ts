/**
 * La mesure du routage, côté calcul (sans base). Repris du routage dynamique
 * d'Hyperswitch (success-rate based routing) :
 *
 *  - une FENÊTRE GLISSANTE plutôt qu'un cumul depuis toujours : les issues
 *    sont rangées par blocs de cinq, on garde les huit derniers blocs (au
 *    plus quarante issues). Une passerelle réparée remonte en quelques
 *    dizaines de paiements ; avec le cumul, six mois d'histoire la clouaient.
 *  - un LISSAGE vers l'estimation : l'a priori pèse comme huit paiements
 *    fictifs, une passerelle neuve garde son estimation, trois échecs ne la
 *    condamnent pas, quinze échecs sur seize la relèguent sans discussion.
 *  - un SEAU PERCÉ : une panne du fournisseur fait monter le seau de 1, il
 *    fuit d'un point toutes les dix minutes ; au-delà de cinq pannes
 *    rapprochées la passerelle passe derrière (jamais supprimée : si toutes
 *    sont en panne, mieux vaut essayer que refuser), puis revient seule.
 *  - une part d'EXPLORATION : un paiement sur dix va délibérément vers la
 *    passerelle la moins observée, sinon la première mesurée reste la seule
 *    jamais choisie.
 */

/** Issues par bloc (Hyperswitch : current_block_threshold.max_total_count). */
export const BLOC_TAILLE = 5;
/** Blocs gardés (Hyperswitch : max_aggregates_size). */
export const MAX_BLOCS = 8;
/** Poids de l'estimation statique, en observations fictives. */
export const POIDS_ESTIMATION = 8;
/** À partir d'ici, on considère que le trafic a parlé. Sert à l'affichage et à l'exploration. */
export const MIN_OBSERVATIONS = 10;
/** Un compte marchand parle pour lui-même à partir d'ici ; en dessous, le fournisseur tout entier. */
export const MIN_COMPTE = 5;
/** Part du trafic qui va délibérément vers la passerelle la moins observée. */
export const PART_EXPLORATION = 0.1;
/** Nombre de pannes rapprochées qui écartent une passerelle. */
export const SEAU_TAILLE = 5;
/** Le seau perd un point toutes les dix minutes : une panne passagère s'oublie. */
export const FUITE_MS = 10 * 60_000;

export type Bloc = { r: number; e: number; le: string };
export type Fenetre = { reussis: number; echoues: number; observations: number };
export type Approche = "mesure" | "exploration" | "insuffisant";

export type ScoreMesure = {
    passerelle: string;
    gatewayId?: string;
    /** Taux retenu, entre 0 et 1. Mesuré si assez d'observations, sinon estimé. */
    score: number;
    observations: number;
    mesure: boolean;
    ecarte: boolean;
    /** D'où vient le taux : ce compte, le fournisseur pour tous les marchands, ou rien. */
    portee?: "compte" | "plateforme" | "aucune";
};

const entier = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));

/** Les blocs tels qu'ils sont en base (JSON), sans jamais lever. */
export function lireBlocs(v: unknown): Bloc[] {
    if (!Array.isArray(v)) return [];
    return v
        .filter((b): b is Record<string, unknown> => !!b && typeof b === "object")
        .map((b) => ({ r: entier(b.r), e: entier(b.e), le: typeof b.le === "string" ? b.le : "" }))
        .slice(-MAX_BLOCS);
}

/** Une issue de plus : dans le bloc courant s'il a de la place, sinon un bloc neuf ; les plus vieux tombent. */
export function ajouterIssue(blocs: Bloc[], reussi: boolean, maintenant = new Date()): Bloc[] {
    const copie = lireBlocs(blocs).map((b) => ({ ...b }));
    const dernier = copie[copie.length - 1];
    const le = maintenant.toISOString();
    if (dernier && dernier.r + dernier.e < BLOC_TAILLE) {
        if (reussi) dernier.r += 1; else dernier.e += 1;
        dernier.le = le;
    } else {
        copie.push({ r: reussi ? 1 : 0, e: reussi ? 0 : 1, le });
    }
    return copie.slice(-MAX_BLOCS);
}

export function fenetre(blocs: Bloc[]): Fenetre {
    let reussis = 0, echoues = 0;
    for (const b of lireBlocs(blocs)) { reussis += b.r; echoues += b.e; }
    return { reussis, echoues, observations: reussis + echoues };
}

/**
 * Lissage vers l'estimation : le taux mesuré prend le dessus à mesure que les
 * observations s'accumulent, sans jamais basculer d'un coup. Sans observation,
 * on retombe pile sur l'estimation.
 */
export function scoreLisse(f: Fenetre, estimation: number, poids = POIDS_ESTIMATION): number {
    const est = Number.isFinite(estimation) ? Math.min(1, Math.max(0, estimation)) : 0.9;
    return (f.reussis + poids * est) / (f.observations + poids);
}

/** Niveau réel du seau : ce qui restait, moins ce qui a fui depuis. */
export function niveauSeau(seau: number, seauMaj: Date | string | null | undefined, maintenant = Date.now()): number {
    const depuis = maintenant - new Date(seauMaj || 0).getTime();
    return Math.max(0, (Number(seau) || 0) - Math.max(0, depuis) / FUITE_MS);
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
export function ecartee(seau: number, seauMaj: Date | string | null | undefined, maintenant = Date.now()): boolean {
    return niveauSeau(seau, seauMaj, maintenant) > SEAU_TAILLE - 1;
}

/**
 * Classe des passerelles déjà notées. Les écartées passent derrière, quoi
 * qu'il arrive. Une part du trafic explore la moins observée des candidates
 * encore saines et pas encore mesurées. `alea` s'injecte pour les tests.
 */
export function classerMesures(details: ScoreMesure[], alea: () => number = Math.random): { ordre: ScoreMesure[]; approche: Approche } {
    if (details.length <= 1) return { ordre: [...details], approche: "insuffisant" };
    const trier = (a: ScoreMesure, b: ScoreMesure) => Number(a.ecarte) - Number(b.ecarte) || b.score - a.score;
    const classe = [...details].sort(trier);

    const saines = classe.filter((d) => !d.ecarte);
    const explorable = saines.filter((d) => !d.mesure).sort((a, b) => a.observations - b.observations)[0];
    if (explorable && saines.length > 1 && alea() < PART_EXPLORATION) {
        return { ordre: [explorable, ...classe.filter((d) => d !== explorable)], approche: "exploration" };
    }
    const mesurees = details.filter((d) => d.mesure).length;
    return { ordre: classe, approche: mesurees > 0 ? "mesure" : "insuffisant" };
}
