import { detectProviderKey } from "@/lib/cle-fournisseur";
import { passerelleSertLeMoyen } from "@/lib/catalogue-moyens";
import { evaluateRule, weightedRandom, type PaymentContext, type RoutingConfig } from "./routing-engine";
import { classerMesures, type ScoreMesure } from "./mesure-fenetre";
import { noter, type MesureBrute } from "./routage-mesure";

/**
 * LE ROUTEUR du checkout : de « toutes les passerelles de l'espace » à « la
 * liste ordonnée des passerelles à essayer, et combien d'essais au plus ».
 * Pur : tout ce qui vient de la base (passerelles, santé, mesures) est reçu
 * en entrée, ce qui le rend testable sans base et lisible d'un bloc.
 *
 * Calqué sur la décision de routage d'Hyperswitch, en trois temps :
 *
 *  1. ÉLIGIBILITÉ (le « constraint graph ») : active, de cet espace (ou de la
 *     plateforme en mode géré), sert ce moyen (catalogue), moyen pas en panne
 *     chez elle (santé), carte seulement pour Stripe, pas déjà tentée. La
 *     passerelle choisie par la page est toujours gardée : la liste des
 *     moyens l'a déjà validée, et la santé l'a déjà remplacée au besoin.
 *
 *  2. L'ORDRE DU MARCHAND (routage statique) : affectation d'un moyen à une
 *     passerelle, puis l'algorithme choisi (unique, priorité, répartition par
 *     volume, règles, dynamique), puis la liste de secours ; sans liste de
 *     secours, ses autres passerelles actives en secours implicite. Avant,
 *     la répartition par volume et les règles étaient ensuite écrasées par
 *     le reclassement mesuré et par la remise en tête de la passerelle de la
 *     page : le marchand configurait, le routeur ignorait.
 *
 *  3. LA MESURE (routage dynamique) : en priorité, la passerelle choisie
 *     reste en tête tant qu'elle n'est pas écartée (seau plein), la mesure
 *     ne classe que les secours ; en dynamique, la mesure classe tout, avec
 *     une part d'exploration. Répartition et règles : la mesure ne fait que
 *     reléguer les écartées. Une écartée n'est jamais retirée.
 */

export type EtatMoyen = "DISPONIBLE" | "DEGRADE" | "INDISPONIBLE";

export type PasserelleCandidate = {
    id: string;
    name: string;
    status: string;
    applicationId: string | null;
    isPlatform?: boolean | null;
    countries?: string[] | null;
    createdAt?: Date | string | null;
    config?: unknown;
};

export type Candidat = PasserelleCandidate & { cle: string };

export type EntreeRouteur = {
    /** La passerelle envoyée par la page (déjà remplacée par une saine au besoin). */
    choisie: string;
    config: RoutingConfig;
    contexte: PaymentContext;
    /** Toutes les passerelles visibles de l'espace, actives ou non, plus celles de la plateforme en mode géré. */
    candidats: PasserelleCandidate[];
    managed: boolean;
    plateformeIds: Set<string>;
    applicationId: string | null;
    /** La règle d'appartenance (lib/managed-payments.ts), injectée. */
    autorisee: (g: PasserelleCandidate) => boolean;
    /** La santé du moyen chez cette passerelle (lib/orchestrator/sante-moyens.ts), injectée. */
    etatMoyen: (g: PasserelleCandidate) => EtatMoyen;
    /** Les mesures déjà lues, par identifiant de passerelle. */
    mesures: Map<string, MesureBrute>;
    /** Un code de paiement a déjà été saisi par l'acheteur (PayDunya Orange CI/BF). */
    otp?: boolean;
    /** Passerelles déjà jouées par un chemin spécial (PayDunya SoftPay). */
    dejaTentees?: Set<string>;
    /** Pour les tests. */
    alea?: () => number;
};

export type Exclusion = { id: string; nom: string; motif: string };

export type SortieRouteur = {
    ordre: Candidat[];
    maxTentatives: number;
    /** Comment l'ordre a été obtenu, pour la décision de routage enregistrée. */
    approche: string;
    exclues: Exclusion[];
    details: ScoreMesure[];
};

const CARTE = /card|visa|master|carte|amex|apple|google|klarna|ideal|sofort|giropay|bancontact|sepa|stripe/i;
const dateDe = (v: Date | string | null | undefined) => (v ? new Date(v).getTime() : 0);

/**
 * L'affectation d'un moyen à une passerelle, telle que la page des moyens
 * l'écrit : clé `code||pays`. Le pays y est le LIBELLÉ du catalogue (« Côte
 * d'Ivoire ») alors que le checkout connaît le code ISO (« CI ») : on compare
 * d'abord à l'exact, puis sur le seul code du moyen, qui porte déjà son pays.
 */
export function affectationPour(assignments: Record<string, string> | null | undefined, methodCode: string, pays: string): string | null {
    if (!assignments || !methodCode) return null;
    const code = methodCode.toLowerCase();
    const exact = assignments[`${methodCode}||${pays}`];
    if (exact) return exact;
    for (const [cle, id] of Object.entries(assignments)) {
        const [c] = cle.split("||");
        if (c && c.toLowerCase() === code && id) return id;
    }
    return null;
}

export function router(e: EntreeRouteur): SortieRouteur {
    const alea = e.alea ?? Math.random;
    const methodCode = String(e.contexte.methodCode || "");
    const estCarte = CARTE.test(methodCode);
    const pays = String(e.contexte.country || "").toUpperCase();
    const kind = e.config.algorithmKind || "PRIORITY";
    const candidats: Candidat[] = e.candidats.map((c) => ({ ...c, cle: detectProviderKey(c.name) }));
    const parId = new Map(candidats.map((c) => [c.id, c]));

    // 1. Éligibilité.
    const exclues: Exclusion[] = [];
    const eligibles = new Map<string, Candidat>();
    const motifExclusion = (c: Candidat): string | null => {
        if (c.status !== "active") return "inactive";
        if (!e.autorisee(c)) return "passerelle d'un autre espace";
        if (e.dejaTentees?.has(c.id)) return "déjà tentée";
        // Stripe ne sait encaisser QUE la carte : le tenter en secours pour du
        // mobile money ne peut jamais réussir et fait remonter au client une
        // erreur anglaise hors sujet.
        if (c.cle === "stripe" && !estCarte) return "carte seulement";
        if (c.id === e.choisie) return null;
        if (!passerelleSertLeMoyen(c, methodCode)) return "ne sert pas ce moyen";
        if (e.etatMoyen(c) === "INDISPONIBLE") return "moyen indisponible";
        // PayDunya en secours pour Orange CI et BF : le client doit générer un
        // code avant l'envoi. Sans code saisi, inutile d'essayer.
        if (c.cle === "paydunya" && !estCarte && /orange/i.test(methodCode) && ["CI", "BF"].includes(pays) && !e.otp) return "code à générer par le client";
        return null;
    };
    for (const c of candidats) {
        const motif = motifExclusion(c);
        if (motif) exclues.push({ id: c.id, nom: c.name, motif });
        else eligibles.set(c.id, c);
    }
    const ok = (id: string) => eligibles.has(id);
    const permis = (ids: string[]) => (e.config.allowedProviders?.length ? ids.filter((id) => e.config.allowedProviders.includes(id)) : ids);
    const dedupe = (ids: string[]) => [...new Set(ids)].filter(ok);

    // 2. L'ordre du marchand.
    const secours = permis(e.config.fallbackOrder || []);
    // Sans liste de secours ni liste blanche, les autres passerelles actives de
    // l'espace servent de secours implicite, quel que soit l'algorithme (sauf
    // « unique », qui refuse tout secours). Avant, règles et répartition s'en
    // passaient : un marchand dont aucune règle ne s'appliquait n'avait qu'une
    // passerelle, et une répartition entre deux passerelles ignorait la troisième.
    const implicite = !e.managed && !!e.applicationId && kind !== "SINGLE"
        && secours.length === 0 && (e.config.allowedProviders || []).length === 0
        ? [...eligibles.values()].filter((c) => c.applicationId === e.applicationId).sort((a, b) => dateDe(a.createdAt) - dateDe(b.createdAt)).map((c) => c.id)
        : [];
    const plateforme = e.managed ? candidats.filter((c) => e.plateformeIds.has(c.id)).map((c) => c.id) : [];
    const priorite = () => dedupe([...permis([e.choisie]), ...secours, ...implicite]);

    let ids: string[];
    let approche: string;
    let tete: string | null = null;
    let reclasser: "tout" | "secours" | "ecartees" = "secours";
    const affectation = e.managed ? null : affectationPour(e.config.methodAssignments, methodCode, pays);

    if (e.managed) {
        // Mode géré : le routage du marchand ne connaît pas les passerelles
        // plateforme. Ordre = passerelle choisie, puis les autres de la plateforme.
        ids = dedupe([e.choisie, ...plateforme]);
        approche = "gere";
        tete = ok(e.choisie) ? e.choisie : null;
    } else if (affectation && ok(affectation)) {
        ids = dedupe([affectation, e.choisie, ...secours, ...implicite]);
        approche = "affectation";
        tete = affectation;
    } else if (kind === "SINGLE") {
        ids = dedupe([...permis([secours[0] ?? e.choisie]), e.choisie]).slice(0, 1);
        approche = "unique";
        reclasser = "ecartees";
    } else if (kind === "VOLUME_SPLIT") {
        const parts = (e.config.volumeSplits || []).filter((s) => s && ok(s.gatewayId) && permis([s.gatewayId]).length > 0 && Number(s.split) > 0);
        if (parts.length === 0) {
            ids = priorite();
            approche = "priorite";
            tete = ok(e.choisie) ? e.choisie : null;
        } else {
            const gagnant = weightedRandom(parts, alea);
            const reste = parts.filter((s) => s.gatewayId !== gagnant).sort((a, b) => b.split - a.split).map((s) => s.gatewayId);
            ids = dedupe([gagnant, ...reste, ...secours, ...implicite]);
            approche = "repartition";
            reclasser = "ecartees";
        }
    } else if (kind === "ADVANCED") {
        const regle = (e.config.routingRules || []).find((r) => r && evaluateRule(r, e.contexte) && permis(r.gatewayIds || []).some(ok));
        if (!regle) {
            ids = priorite();
            approche = "priorite";
            tete = ok(e.choisie) ? e.choisie : null;
        } else {
            ids = dedupe([...permis(regle.gatewayIds), ...secours, ...implicite]);
            approche = `regle:${regle.name || "?"}`;
            reclasser = "ecartees";
        }
    } else if (kind === "DYNAMIC") {
        ids = priorite();
        approche = "dynamique";
        reclasser = "tout";
    } else {
        ids = priorite();
        approche = "priorite";
        tete = ok(e.choisie) ? e.choisie : null;
    }

    // Un moyen propre à Stripe (code en « -stripe » : carte, Google Pay, ACH)
    // se paie dans le formulaire intégré de Stripe, que l'acheteur a choisi :
    // Stripe reste en tête, la mesure ne classe que les secours.
    const stripeId = /-stripe$/i.test(methodCode) ? ids.find((id) => parId.get(id)?.cle === "stripe") : undefined;
    if (stripeId) { tete = stripeId; approche += ",stripe en tete"; if (reclasser === "tout") reclasser = "secours"; }

    // 3. La mesure. L'ordre du marchand sert d'a priori : sans observation, rien ne bouge.
    const details: ScoreMesure[] = ids.map((id, i) => {
        const c = parId.get(id)!;
        return noter(e.mesures.get(id), 0.92 - i * 0.01, c.cle, id);
    });
    const parGw = new Map(details.map((d) => [d.gatewayId!, d]));
    const teteEcartee = !!tete && !!parGw.get(tete)?.ecarte;
    if (teteEcartee) { approche += ",tete ecartee"; tete = null; }

    let ordre: string[];
    if (reclasser === "ecartees") {
        // Répartition et règles : l'ordre du marchand est respecté, seules les
        // écartées (seau plein) passent derrière, dans leur ordre.
        ordre = [...ids.filter((id) => !parGw.get(id)?.ecarte), ...ids.filter((id) => parGw.get(id)?.ecarte)];
        if (ordre.length !== ids.length || ordre.some((id, i) => id !== ids[i])) approche += ",ecartees reléguées";
    } else {
        const aClasser = details.filter((d) => d.gatewayId !== tete);
        const { ordre: classe, approche: a } = classerMesures(aClasser, alea);
        ordre = [...(tete ? [tete] : []), ...classe.map((d) => d.gatewayId!)];
        approche += `,${a}`;
    }

    const ordreCandidats = ordre.map((id) => parId.get(id)!);
    const maxTentatives = kind === "SINGLE" && !affectation ? Math.min(1, ordreCandidats.length) : Math.min(ordreCandidats.length, Math.max(1, Number(e.config.maxRetries ?? 3) + 1));
    return { ordre: ordreCandidats, maxTentatives, approche, exclues, details };
}
