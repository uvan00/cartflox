/**
 * Donnees de test (bac a sable unifie).
 *
 * Une transaction creee avec une cle `af_test_...`, ou dans un espace en bac a
 * sable, porte `test = true`. Ces lignes ne se melangent JAMAIS aux donnees de
 * production : la couche base (src/lib/db.ts) ajoute `test: false` a toute
 * lecture de liste qui ne dit pas explicitement ce qu'elle veut.
 *
 * Ce module ne depend pas de la base pour eviter un import circulaire.
 */
export const COOKIE_DONNEES_TEST = "cartflox-donnees-test";

/** A poser dans un `where` pour lire les deux mondes a la fois (crons, purge, rejeu des webhooks). */
// La cle `test` est PRESENTE mais vide : la couche base y voit un choix explicite
// et ne filtre pas, tandis que Prisma ignore une valeur `undefined`. (Un filtre
// `in` n'existe pas pour les booleens.)
export const AVEC_TESTS = { test: undefined } as { test: undefined };

/** Duree de conservation des donnees de test, comme chez les autres prestataires. */
export const CONSERVATION_TESTS_JOURS = 90;

/**
 * Ce que l'utilisateur du tableau de bord veut voir : `true` les donnees de test,
 * `false` la production, `null` s'il n'a rien choisi (ou hors requete HTTP).
 */
export async function lireVueTest(): Promise<boolean | null> {
    try {
        const { cookies } = await import("next/headers");
        const valeur = (await cookies()).get(COOKIE_DONNEES_TEST)?.value;
        return valeur === "1" ? true : valeur === "0" ? false : null;
    } catch {
        // Hors d'une requete (cron en tache de fond, script) : pas de choix.
        return null;
    }
}
