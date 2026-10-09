import prisma from "@/lib/db";
import { identifierMoyen } from "@/lib/catalogue-moyens";
import { issueNeutre, type Categorie } from "./categorie-echec";
import {
    MIN_COMPTE, MIN_OBSERVATIONS, ajouterIssue, classerMesures, ecartee, fenetre, lireBlocs, niveauSeau, scoreLisse,
    type Approche, type Fenetre, type ScoreMesure,
} from "./mesure-fenetre";

/**
 * Routage sur ce qui s'est réellement passé, et non sur ce qu'on avait supposé.
 *
 * Le routeur statique classait les passerelles avec des taux de réussite écrits
 * à la main, tous entre 87 % et 98 %. Mesurés sur le trafic réel, certains
 * tournaient à 45 %, voire 22 %. Le routeur envoyait donc les paiements vers
 * des passerelles qu'il croyait excellentes.
 *
 * Depuis le 08/10/2026 (modèle Hyperswitch), la mesure a deux PORTÉES et une
 * FENÊTRE GLISSANTE (`mesure-fenetre.ts`) :
 *  - `plateforme` : le fournisseur, tous marchands confondus. C'est lui qui
 *    dit si PawaPay encaisse bien Orange CI en ce moment.
 *  - `gw:<id>` : ce compte marchand chez ce fournisseur. C'est lui qui dit
 *    qu'une clé mal saisie fait tout échouer CHEZ CE MARCHAND, sans reléguer
 *    le fournisseur pour tous les autres (c'était le cas avec un seul cumul).
 * Le compte parle pour lui-même dès cinq issues ; avant, le fournisseur.
 *
 * La CLÉ du contexte est canonique : pays, OPÉRATEUR (et non le code du
 * moyen, propre à chaque fournisseur), devise. Avant, « orange-money-ci »
 * chez PayDunya et « ORANGE_CIV » chez PawaPay étaient deux contextes, et
 * les deux passerelles n'étaient jamais comparées sur le même terrain.
 */

export type { Approche, ScoreMesure } from "./mesure-fenetre";

/** Ce que la base sait d'une passerelle dans un contexte, avant notation. */
export type MesureBrute = {
    gatewayId: string;
    passerelle: string;
    /** La fenêtre retenue (compte si assez d'issues, sinon fournisseur). */
    fenetre: Fenetre;
    /** Depuis toujours, pour l'a priori et l'affichage. */
    totaux: Fenetre;
    ecarte: boolean;
    portee: "compte" | "plateforme" | "aucune";
};

const n = (v: unknown) => String(v || "").trim().toUpperCase() || "?";

/**
 * La clé sous laquelle un taux a un sens : une passerelle bonne en CI peut
 * être mauvaise au Bénin. L'opérateur vient du catalogue (« orange-money »),
 * pour que deux fournisseurs qui nomment le même moyen différemment se
 * comparent ; un code hors catalogue est gardé tel quel.
 */
export function contexteRoutage(x: { country?: string | null; methodCode?: string | null; currency?: string | null }): string {
    const vise = identifierMoyen(String(x.methodCode || ""));
    return `${n(x.country)}|${n(vise?.operateur || x.methodCode)}|${n(x.currency)}`;
}

/** L'ancienne clé (code brut du moyen), pour relire les cumuls d'avant le 08/10/2026. */
export function contexteRoutageAncien(x: { country?: string | null; methodCode?: string | null; currency?: string | null }): string {
    return `${n(x.country)}|${n(x.methodCode)}|${n(x.currency)}`;
}

const porteeCompte = (gatewayId: string) => `gw:${gatewayId}`;

/**
 * Lit, pour chaque passerelle candidate, sa fenêtre et son seau dans ce
 * contexte. Ne lève jamais : sans base, une carte vide et tout le monde garde
 * son estimation.
 */
export async function lireMesures(
    cles: { contexte: string; ancien?: string },
    candidats: Array<{ gatewayId: string; passerelle: string }>,
): Promise<Map<string, MesureBrute>> {
    const resultat = new Map<string, MesureBrute>();
    if (candidats.length === 0) return resultat;
    try {
        const fournisseurs = [...new Set(candidats.map((c) => c.passerelle))];
        const comptes = candidats.map((c) => porteeCompte(c.gatewayId));
        const lignes = await prisma.routageMesure.findMany({
            where: {
                contexte: cles.contexte,
                OR: [
                    { portee: "plateforme", passerelle: { in: fournisseurs } },
                    { portee: { in: comptes } },
                ],
            },
        });
        const anciens = cles.ancien
            ? await prisma.routageScore.findMany({ where: { contexte: cles.ancien, passerelle: { in: fournisseurs } } }).catch(() => [])
            : [];
        const ligne = (portee: string, passerelle: string) => lignes.find((l) => l.portee === portee && l.passerelle === passerelle);
        const totauxDe = (l: { reussis?: number; echoues?: number } | null | undefined): Fenetre => ({ reussis: Number(l?.reussis || 0), echoues: Number(l?.echoues || 0), observations: Number(l?.reussis || 0) + Number(l?.echoues || 0) });

        for (const c of candidats) {
            const compte = ligne(porteeCompte(c.gatewayId), c.passerelle);
            const plat = ligne("plateforme", c.passerelle);
            const fCompte = fenetre(lireBlocs(compte?.blocs));
            const fPlat = fenetre(lireBlocs(plat?.blocs));
            const parCompte = fCompte.observations >= MIN_COMPTE;
            let totaux = totauxDe(plat);
            if (totaux.observations === 0) {
                const ancien = anciens.find((a) => a.passerelle === c.passerelle);
                if (ancien) totaux = totauxDe(ancien);
            }
            resultat.set(c.gatewayId, {
                gatewayId: c.gatewayId,
                passerelle: c.passerelle,
                fenetre: parCompte ? fCompte : fPlat,
                totaux,
                ecarte: (compte ? ecartee(compte.seau, compte.seauMaj) : false) || (plat ? ecartee(plat.seau, plat.seauMaj) : false),
                portee: parCompte ? "compte" : fPlat.observations > 0 ? "plateforme" : "aucune",
            });
        }
    } catch {
        // La mesure est un confort : sans elle, l'ordre du marchand suffit.
    }
    return resultat;
}

/**
 * Note une passerelle : fenêtre lissée vers l'estimation, elle-même lissée
 * vers les cumuls depuis toujours quand ils existent. Sans rien, pile
 * l'estimation.
 */
export function noter(m: MesureBrute | undefined, estimation: number, passerelle: string, gatewayId: string): ScoreMesure {
    if (!m) return { passerelle, gatewayId, score: estimation, observations: 0, mesure: false, ecarte: false, portee: "aucune" };
    const apriori = m.totaux.observations >= MIN_OBSERVATIONS ? scoreLisse(m.totaux, estimation) : estimation;
    return {
        passerelle, gatewayId,
        score: scoreLisse(m.fenetre, apriori),
        observations: m.fenetre.observations,
        mesure: m.fenetre.observations >= MIN_OBSERVATIONS || m.totaux.observations >= MIN_OBSERVATIONS,
        ecarte: m.ecarte,
        portee: m.portee,
    };
}

/**
 * Ordonne des FOURNISSEURS (clés) sur la portée plateforme seule. Gardé pour
 * l'exécuteur ; le routeur du checkout passe par `lireMesures` et `noter`,
 * passerelle par passerelle.
 */
export async function ordonnerParMesure(
    contexte: string,
    candidats: string[],
    estimations: Record<string, number> = {},
): Promise<{ ordre: string[]; approche: Approche; details: ScoreMesure[] }> {
    if (candidats.length <= 1) return { ordre: candidats, approche: "insuffisant", details: [] };
    const mesures = await lireMesures({ contexte }, candidats.map((p) => ({ gatewayId: p, passerelle: p })));
    const details = candidats.map((p) => noter(mesures.get(p), estimations[p] ?? 0.9, p, p));
    const { ordre, approche } = classerMesures(details);
    return { ordre: ordre.map((d) => d.passerelle), approche, details };
}

/**
 * Compte une issue, par TENTATIVE : un refus immédiat du fournisseur compte,
 * une réussite ou un échec confirmés comptent. Un abandon du client, un
 * « déjà en cours » ou un délai dépassé ne disent rien de la passerelle et ne
 * comptent pas. Écrit la portée plateforme et, si le compte est connu, la
 * portée compte.
 *
 * Le seau ne monte que pour une panne imputable : du fournisseur (portée
 * plateforme), ou de ce compte (clé refusée : portée compte seulement).
 */
export async function enregistrerIssue(x: {
    contexte: string;
    passerelle: string;
    gatewayId?: string | null;
    reussi: boolean;
    categorie?: Categorie | null;
}): Promise<void> {
    const { contexte, passerelle, reussi, categorie } = x;
    if (!contexte || !passerelle) return;
    if (!reussi && issueNeutre(categorie)) return;

    const portees: Array<{ portee: string; panne: boolean }> = [
        { portee: "plateforme", panne: !reussi && categorie === "PANNE_FOURNISSEUR" },
    ];
    if (x.gatewayId) portees.push({ portee: porteeCompte(x.gatewayId), panne: !reussi && (categorie === "PANNE_FOURNISSEUR" || categorie === "IDENTIFIANTS") });

    for (const { portee, panne } of portees) {
        try {
            const ou = { portee_contexte_passerelle: { portee, contexte, passerelle } };
            const existant = await prisma.routageMesure.findUnique({ where: ou });
            const niveau = existant ? niveauSeau(existant.seau, existant.seauMaj) : 0;
            const seau = panne ? niveau + 1 : niveau;
            const blocs = ajouterIssue(lireBlocs(existant?.blocs), reussi);
            await prisma.routageMesure.upsert({
                where: ou,
                create: { portee, contexte, passerelle, blocs, reussis: reussi ? 1 : 0, echoues: reussi ? 0 : 1, seau, seauMaj: new Date() },
                update: { blocs, reussis: { increment: reussi ? 1 : 0 }, echoues: { increment: reussi ? 0 : 1 }, seau, seauMaj: new Date() },
            });
        } catch {
            // La mesure est un confort : elle ne doit jamais faire échouer une finalisation.
        }
    }
}

/**
 * Sous quel contexte et quelle passerelle une transaction a-t-elle été jouée,
 * pour les transactions d'AVANT les tentatives (sans ligne `Tentative`). Le
 * contexte vient de la décision de routage enregistrée à l'initiation, seule
 * à porter le pays. La clé de passerelle se dérive du NOM de la passerelle et
 * jamais de `tx.provider`, qui porte le libellé de la carte pays.
 */
export async function reperesTransaction(tx: { id: string; metadata?: unknown } | null | undefined): Promise<{ contexte: string; passerelle: string; gatewayId: string } | null> {
    try {
        const { detectProviderKey } = await import("@/lib/cle-fournisseur");
        const gatewayId = (tx?.metadata as { gatewayId?: unknown } | null)?.gatewayId;
        if (!gatewayId) return null;
        const gateway = await prisma.gateway.findUnique({ where: { id: String(gatewayId) }, select: { name: true } });
        if (!gateway) return null;
        const passerelle = detectProviderKey(gateway.name);
        if (!passerelle) return null;

        const decision = await prisma.routingDecision.findFirst({
            where: { transactionId: tx!.id },
            select: { country: true, methodCode: true, currency: true },
            orderBy: { createdAt: "desc" },
        });
        if (!decision) return null;
        return { contexte: contexteRoutage(decision), passerelle, gatewayId: String(gatewayId) };
    } catch {
        return null;
    }
}
