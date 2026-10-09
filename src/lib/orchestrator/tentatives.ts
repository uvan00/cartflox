import { createHash } from "node:crypto";
import type { IPaymentProvider, PaymentRequest, PaymentResponse } from "./types";
import { issueNeutre, type Categorie, type Verdict } from "./categorie-echec";
import type { Candidat } from "./routeur";

/**
 * LES TENTATIVES : jouer la liste ordonnée du routeur, une passerelle après
 * l'autre, en gardant une trace de CHAQUE essai (modèle PaymentAttempt
 * d'Hyperswitch : une ligne par connecteur essayé, avec sa référence posée
 * AVANT l'appel).
 *
 * Ce que ça change par rapport à la boucle d'avant :
 *  - chaque essai a sa propre référence, écrite avant l'appel. Un webhook qui
 *    arrive sur une tentative remplacée retrouve quand même la transaction,
 *    et un paiement accepté à la première tentative n'est plus perdu quand
 *    la seconde a écrasé `providerRef`.
 *  - un délai dépassé n'est plus un refus : la demande a pu partir. On
 *    s'arrête (tentative INCERTAINE), on vérifie, on ne renvoie pas la même
 *    demande ailleurs sur le téléphone du client.
 *  - une passerelle sautée ne consomme pas un essai, une exception est
 *    classée comme un refus (clé refusée, injoignable...), et la mesure
 *    compte les refus immédiats mais jamais ce qui ne dit rien d'elle.
 *
 * Pur vis-à-vis de la base : adaptateurs, dépôt, classification, mesure et
 * journal sont injectés. Testable avec de faux adaptateurs.
 */

export type StatutTentative = "INITIEE" | "ACCEPTEE" | "REFUSEE" | "INCERTAINE" | "REUSSIE" | "ECHOUEE" | "REMPLACEE" | "ABANDONNEE";

export type NouvelleTentative = {
    transactionId: string;
    rang: number;
    gatewayId: string;
    fournisseur: string;
    contexte: string;
    reference: string;
    statut: "INITIEE";
    approche?: string | null;
};

export type ClotureTentative = {
    statut: StatutTentative;
    providerRef?: string | null;
    code?: string | null;
    categorie?: string | null;
    decision?: string | null;
    message?: string | null;
    dureeMs?: number | null;
};

export interface DepotTentatives {
    prochainRang(transactionId: string): Promise<number>;
    creer(t: NouvelleTentative): Promise<{ id: string }>;
    terminer(id: string, patch: ClotureTentative): Promise<void>;
    /** Une tentative vient d'être acceptée : les acceptées précédentes sont remplacées. */
    remplacerAcceptees(transactionId: string, saufId: string): Promise<void>;
}

export type EntreeTentatives = {
    transactionId: string;
    contexte: string;
    ordre: Candidat[];
    maxTentatives: number;
    approche: string;
    /** La passerelle choisie par la page : les autres sont des secours. */
    choisie: string;
    adaptateur: (c: Candidat) => IPaymentProvider;
    /** La demande à envoyer, avec NOTRE référence (identifiant de dépôt PawaPay...). */
    requete: (c: Candidat, reference: string, estSecours: boolean) => PaymentRequest;
    depot: DepotTentatives;
    categoriser: (cle: string, rawData: unknown) => Promise<Verdict>;
    categoriserException: (cle: string, err: unknown) => Promise<Verdict>;
    mesurer: (x: { passerelle: string; gatewayId: string; reussi: boolean; categorie?: Categorie }) => Promise<void>;
    /** La phrase lisible par l'acheteur pour un refus (montant refusé, message du fournisseur...). */
    motif: (rawData: unknown, c: Candidat) => string;
    /** Le code de refus dit « opérateur fermé chez l'agrégateur » : le signaler. Renvoie vrai si c'en était un. */
    operateurFerme?: (c: Candidat, code: string) => Promise<boolean>;
    journal: (type: string, payload: Record<string, unknown>) => Promise<void>;
    /** Garde-fou au-dessus des délais propres à chaque adaptateur. */
    delaiMs?: number;
    maintenant?: () => number;
    log?: (ligne: string) => void;
};

export type IssueTentatives =
    | { issue: "ACCEPTEE"; candidat: Candidat; reponse: PaymentResponse; tentativeId: string; rang: number; reference: string; estSecours: boolean; tentatives: number }
    | { issue: "INCERTAINE"; candidat: Candidat; tentativeId: string; rang: number; reference: string; verdict: Verdict; motif: string; estSecours: boolean; tentatives: number }
    | {
        issue: "ECHEC";
        /** Le motif du moyen CHOISI par l'acheteur : c'est lui qu'il doit lire, pas celui d'un secours. */
        motifPrincipal: string;
        dernierMotif: string;
        operateurFerme: boolean;
        autreEchec: boolean;
        identifiantsRefuses: boolean;
        /** La première passerelle qui a refusé la clé du marchand, pour l'alerter. */
        identifiantsRefusesChez?: Candidat;
        verdict?: Verdict;
        tentatives: number;
        dernierCandidat?: Candidat;
    };

/** Délai au-delà duquel un adaptateur muet vaut un délai dépassé : la demande a pu partir. */
export const DELAI_TENTATIVE_MS = 45_000;

/**
 * Notre référence pour une tentative : un UUID dérivé de la transaction et du
 * rang, donc le même si l'on rejoue exactement la même tentative, et jamais
 * deux fois le même pour deux tentatives (unique en base). PawaPay l'accepte
 * tel quel comme identifiant de dépôt.
 */
export function referenceTentative(transactionId: string, rang: number): string {
    const h = createHash("sha256").update(`cartflox:tentative:${transactionId}:${rang}`).digest("hex");
    const v = (h.slice(12, 16).replace(/^./, "4"));
    const y = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16) + h.slice(17, 20);
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${v}-${y}-${h.slice(20, 32)}`;
}

function avecDelai<T>(p: Promise<T>, ms: number): Promise<T> {
    let minuterie: ReturnType<typeof setTimeout> | undefined;
    const garde = new Promise<never>((_, rejeter) => {
        minuterie = setTimeout(() => {
            const e = new Error(`Le fournisseur n'a pas répondu en ${Math.round(ms / 1000)} s`);
            e.name = "TimeoutError";
            rejeter(e);
        }, ms);
    });
    return Promise.race([p, garde]).finally(() => { if (minuterie) clearTimeout(minuterie); }) as Promise<T>;
}

type Brut = { rejectionReason?: { rejectionCode?: unknown }; failureReason?: { failureCode?: unknown } } | null | undefined;
const codeRefusDe = (rawData: unknown) => {
    const d = (rawData || {}) as Brut;
    return String(d?.rejectionReason?.rejectionCode || d?.failureReason?.failureCode || "").toUpperCase();
};
const messageDe = (err: unknown) => String((err as { message?: unknown } | null)?.message || err || "Exception");

export async function jouerTentatives(e: EntreeTentatives): Promise<IssueTentatives> {
    const maintenant = e.maintenant ?? Date.now;
    const log = e.log ?? ((l: string) => console.log(l));
    const delai = e.delaiMs ?? DELAI_TENTATIVE_MS;

    let rang = await e.depot.prochainRang(e.transactionId);
    let tentatives = 0;
    let motifPrincipal = "";
    let dernierMotif = "";
    let operateurFerme = false;
    let autreEchec = false;
    let identifiantsRefuses = false;
    let identifiantsRefusesChez: Candidat | undefined;
    let dernierVerdict: Verdict | undefined;
    let dernierCandidat: Candidat | undefined;

    for (const c of e.ordre) {
        if (tentatives >= e.maxTentatives) break;
        const estSecours = c.id !== e.choisie;
        const reference = referenceTentative(e.transactionId, rang);
        const t = await e.depot.creer({
            transactionId: e.transactionId, rang, gatewayId: c.id, fournisseur: c.cle, contexte: e.contexte,
            reference, statut: "INITIEE", approche: e.approche,
        });
        tentatives++;
        dernierCandidat = c;
        if (estSecours) log(`🔄 Secours ${tentatives}/${e.maxTentatives} : ${c.name} (tentative ${rang})`);

        const debut = maintenant();
        let reponse: PaymentResponse | null = null;
        let erreur: unknown = null;
        try {
            reponse = await avecDelai(e.adaptateur(c).initiatePayment(e.requete(c, reference, estSecours)), delai);
        } catch (err) {
            erreur = err;
        }
        const dureeMs = maintenant() - debut;

        if (erreur || !reponse || reponse.status === "FAILED") {
            const rawData = erreur ? { error: messageDe(erreur), _exception: true } : reponse?.rawData;
            const verdict = erreur ? await e.categoriserException(c.cle, erreur) : await e.categoriser(c.cle, reponse?.rawData);
            let motif = erreur ? messageDe(erreur) : e.motif(reponse?.rawData, c);
            if (verdict.decision === "ARRETER" && verdict.message) motif = verdict.message;
            if (!motif) motif = `${c.name} : échec`;
            dernierMotif = motif;
            dernierVerdict = verdict;
            if (!estSecours && !motifPrincipal) motifPrincipal = motif;
            if (verdict.categorie === "IDENTIFIANTS") { identifiantsRefuses = true; identifiantsRefusesChez ??= c; }

            // La demande a PU partir : on s'arrête ici, et on vérifie avant tout
            // nouvel essai. Renvoyer la même demande ailleurs ferait deux
            // demandes sur le téléphone du client.
            if (verdict.decision === "VERIFIER") {
                await e.depot.terminer(t.id, { statut: "INCERTAINE", code: verdict.code, categorie: verdict.categorie, decision: verdict.decision, message: motif, dureeMs });
                await e.journal(estSecours ? "FALLBACK_UNCERTAIN" : "INITIATE_UNCERTAIN", { provider: c.cle, gatewayId: c.id, attempt: rang, reference, error: motif, code: verdict.code });
                log(`⏳ [${c.cle}] ${verdict.categorie} : ${motif} ; tentative ${rang} incertaine, vérification avant tout nouvel essai`);
                return { issue: "INCERTAINE", candidat: c, tentativeId: t.id, rang, reference, verdict, motif, estSecours, tentatives };
            }

            await e.depot.terminer(t.id, { statut: "REFUSEE", code: verdict.code, categorie: verdict.categorie, decision: verdict.decision, message: motif, dureeMs });
            await e.journal(erreur ? "PROVIDER_EXCEPTION" : estSecours ? "FALLBACK_FAILED" : "INITIATE_FAILED", {
                provider: c.cle, gatewayId: c.id, attempt: rang, reference, error: motif, code: verdict.code, categorie: verdict.categorie, decision: verdict.decision,
                ...(erreur ? {} : { rawData }),
            });
            log(`❌ [${c.cle}] refus (${verdict.categorie}/${verdict.code || "?"}) : ${motif}`);

            // Opérateur fermé chez ce fournisseur : le moyen passe indisponible
            // chez lui tout de suite (grisé dans les pages, évité par le routeur).
            const codeRefus = codeRefusDe(reponse?.rawData);
            const ferme = !erreur && !!e.operateurFerme && !!codeRefus && (await e.operateurFerme(c, codeRefus).catch(() => false));
            if (ferme) operateurFerme = true; else autreEchec = true;

            if (!issueNeutre(verdict.categorie)) {
                await e.mesurer({ passerelle: c.cle, gatewayId: c.id, reussi: false, categorie: verdict.categorie }).catch(() => { });
            }
            rang++;
            if (verdict.decision === "ARRETER") {
                log(`⛔ [${c.cle}] ${verdict.categorie} : inutile de tenter une autre passerelle`);
                break;
            }
            continue;
        }

        // Un SECOURS qui renvoie le client vers une page sans aucune référence
        // de paiement est refusé : même payé, ce paiement ne pourrait jamais
        // être confirmé (FeexPay, lien FeexLink, 23 fois le 26/09/2026).
        if (estSecours && reponse.checkoutUrl && !String(reponse.providerReference || "").trim()) {
            autreEchec = true;
            await e.depot.terminer(t.id, { statut: "REFUSEE", code: "_sans_reference", categorie: "INCONNU", decision: "REESSAYER", message: "redirection sans référence de paiement", dureeMs });
            await e.journal("FALLBACK_REFUSED", { provider: c.cle, gatewayId: c.id, attempt: rang, reference, error: "redirection sans reference de paiement" });
            log(`⏭️ Secours ${c.name} refusé (redirection sans référence de paiement)`);
            rang++;
            continue;
        }

        // ── Acceptée ──
        await e.depot.terminer(t.id, { statut: "ACCEPTEE", providerRef: String(reponse.providerReference || "").trim() || null, dureeMs });
        await e.depot.remplacerAcceptees(e.transactionId, t.id).catch(() => { });
        await e.journal(estSecours ? "FALLBACK_SUCCESS" : "INITIATE_SUCCESS", {
            provider: c.cle, gatewayId: c.id, attempt: rang, reference, ref: reponse.providerReference, hasRedirect: !!reponse.checkoutUrl,
        });
        return { issue: "ACCEPTEE", candidat: c, reponse, tentativeId: t.id, rang, reference, estSecours, tentatives };
    }

    return { issue: "ECHEC", motifPrincipal, dernierMotif, operateurFerme, autreEchec, identifiantsRefuses, identifiantsRefusesChez, verdict: dernierVerdict, tentatives, dernierCandidat };
}
