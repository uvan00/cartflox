/**
 * Combien de decimales porte une devise a l'ecran.
 *
 * Les francs CFA et une poignee d'autres n'ont pas de subdivision : leur
 * montant s'ecrit en unites entieres. Toutes les autres ont des centimes, et
 * les masquer ne fait pas qu'arrondir, ca efface : une commission de 5 % sur
 * 2 USD vaut 0,10 USD et s'affichait « 0 USD », donc « pas de commission ».
 *
 * « FCFA » n'est pas un code ISO mais circule comme tel dans nos ecrans, d'ou
 * sa presence ici avec « CFA ».
 */
export const DEVISES_SANS_CENTIMES = new Set([
    "XOF", "XAF", "FCFA", "CFA", "XPF", "JPY", "KRW", "VND", "CLP", "ISK",
    "PYG", "UGX", "RWF", "GNF", "MGA", "KMF", "DJF", "BIF", "VUV",
    // Le franc congolais se manie en unites entieres chez les operateurs :
    // PawaPay refuse un montant a decimales pour le Congo (« only supports up
    // to 0 decimal places »), constate sur un paiement client le 18/09/2026.
    "CDF",
]);

export const decimalesDevise = (devise?: string | null) =>
    DEVISES_SANS_CENTIMES.has((devise || "XOF").toUpperCase()) ? 0 : 2;

/**
 * Arrondit a la precision de la devise. A l'unite pour les francs CFA (les
 * agregateurs y refusent les decimales), au centime ailleurs. Arrondir un
 * montant en dollars a l'unite fait disparaitre les frais de 0,06 USD.
 */
export const arrondirMontant = (n: number, devise?: string | null) =>
    decimalesDevise(devise) === 0 ? Math.round(n) : Math.round(n * 100) / 100;

/** Le nombre seul : « 40 », « 0,10 ». Pour les ecrans qui stylent la devise a part. */
export function chiffreMontant(n: number, devise?: string | null): string {
    const d = decimalesDevise(devise);
    return (Number.isFinite(n) ? n : 0).toLocaleString("fr-FR", {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
    });
}

/** Montant lisible : « 40 XOF », « 0,10 USD », « 6,10 EUR ». */
export const formaterMontant = (n: number, devise = "XOF") => `${chiffreMontant(n, devise)} ${devise}`;

/**
 * Un montant dans UNE devise. Deux entrees d'une meme liste ne s'additionnent
 * jamais : 40 XOF et 2 USD ne font pas 42.
 */
export type MontantDevise = { devise: string; montant: number; nombre: number };

/**
 * Regroupe des lignes par devise, la plus frequente en premier, chaque total
 * arrondi a la precision de SA devise.
 *
 * C'est la seule maniere correcte de totaliser chez Cartflox : un espace
 * encaisse en XOF, USD, XAF ou CDF, et un `_sum` global donne un nombre qui ne
 * veut rien dire. Ecrit ici plutot que dans chaque module pour qu'il n'y ait
 * qu'une regle.
 */
export function parDevise(lignes: { currency?: string | null; amount: number }[]): MontantDevise[] {
    const m = new Map<string, MontantDevise>();
    for (const l of lignes) {
        const devise = String(l.currency || "XOF").toUpperCase();
        const e = m.get(devise) || { devise, montant: 0, nombre: 0 };
        e.montant += Number(l.amount) || 0;
        e.nombre += 1;
        m.set(devise, e);
    }
    return [...m.values()]
        .map((e) => ({ ...e, montant: arrondirMontant(e.montant, e.devise) }))
        .filter((v) => v.montant !== 0)
        .sort((a, b) => b.nombre - a.nombre || b.montant - a.montant);
}

/**
 * La meme regle pour un `groupBy` Prisma par devise : une entree par devise
 * (en majuscules, « xof » et « XOF » fusionnent), la plus frequente en premier,
 * chaque total arrondi a la precision de sa devise.
 */
export function parDeviseGroupe(lignes: { currency?: string | null; _sum?: { amount?: number | null } | null; _count?: { _all?: number } | null }[]): MontantDevise[] {
    const m = new Map<string, MontantDevise>();
    for (const l of lignes) {
        const devise = String(l.currency || "XOF").toUpperCase();
        const e = m.get(devise) || { devise, montant: 0, nombre: 0 };
        e.montant += Number(l._sum?.amount) || 0;
        e.nombre += Number(l._count?._all) || 0;
        m.set(devise, e);
    }
    return [...m.values()]
        .map((e) => ({ ...e, montant: arrondirMontant(e.montant, e.devise) }))
        .filter((v) => v.montant !== 0)
        .sort((a, b) => b.nombre - a.nombre || b.montant - a.montant);
}

/** « 40 000 XOF et 2,00 USD » : une liste lisible, jamais une somme. */
export function listeMontants(lot?: { devise: string; montant: number }[] | null): string {
    const l = (lot || []).filter((v) => v && v.montant !== 0).map((v) => formaterMontant(v.montant, v.devise));
    if (l.length === 0) return formaterMontant(0, "XOF");
    return l.length === 1 ? l[0] : `${l.slice(0, -1).join(", ")} et ${l[l.length - 1]}`;
}

/** La devise principale d'un lot (la plus frequente). XOF si le lot est vide. */
export const devisePrincipale = (lot?: MontantDevise[] | null) => lot?.[0]?.devise || "XOF";

/** Le montant d'UNE devise dans un lot ; 0 si cette devise n'y figure pas. */
export const montantDevise = (lot: MontantDevise[] | null | undefined, devise: string) =>
    lot?.find((v) => v.devise === String(devise || "").toUpperCase())?.montant || 0;

/**
 * Retranche un lot d'un autre, devise par devise (solde moins en attente).
 * Une devise absente du second lot passe telle quelle ; un resultat negatif
 * est ramene a zero, un solde disponible ne se montre pas en dessous de rien.
 */
export function soustraireParDevise(lot: MontantDevise[], aRetirer: MontantDevise[]): MontantDevise[] {
    return lot
        .map((v) => ({
            ...v,
            montant: arrondirMontant(Math.max(0, v.montant - montantDevise(aRetirer, v.devise)), v.devise),
        }))
        .filter((v) => v.montant > 0);
}
