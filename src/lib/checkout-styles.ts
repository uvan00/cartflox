/**
 * Les STYLES de la page de paiement : la disposition, a ne pas confondre avec
 * le theme (les couleurs, lib/checkout-themes.ts). Le marchand choisit les
 * deux dans Parametres > Page de paiement ; le style est range dans
 * `Application.metadata.checkoutStyle` et vaut pour le lien de paiement
 * (/pay), le checkout (/checkout) et la page de retour.
 */
export type CheckoutStyleId = "classique" | "boutique" | "cartes" | "express";

export interface CheckoutStyle {
    id: CheckoutStyleId;
    nom: string;
    description: string;
}

export const CHECKOUT_STYLES: CheckoutStyle[] = [
    {
        id: "cartes",
        nom: "Cartes (par défaut)",
        description: "Une colonne de cartes empilées : le moyen choisi s'ouvre sur place, un grand bouton en bas. Pensé d'abord pour le téléphone.",
    },
    {
        id: "boutique",
        nom: "Boutique",
        description: "Le récapitulatif de la commande dans une carte à gauche, un grand panneau à droite avec les étapes Informations, Paiement, Terminé.",
    },
    {
        id: "express",
        nom: "Express",
        description: "Comme Boutique, avec vos trois moyens les plus courants en gros boutons de couleur, et les autres en dessous, chacun s'ouvrant sur place.",
    },
    {
        id: "classique",
        nom: "Classique",
        description: "Deux colonnes : le montant et le détail à gauche, la carte de paiement à droite, comme Stripe Checkout.",
    },
];

/** Les deux styles a deux colonnes avec les etapes en haut du panneau. */
export const STYLES_A_ETAPES: CheckoutStyleId[] = ["boutique", "express"];

/** Le style par defaut : les cartes. */
export const DEFAULT_STYLE: CheckoutStyleId = "cartes";

/** Un identifiant sur, quelle que soit la valeur rangee (ancienne, absente, fausse). */
export function styleCheckout(id: unknown): CheckoutStyleId {
    return CHECKOUT_STYLES.some((s) => s.id === id) ? (id as CheckoutStyleId) : DEFAULT_STYLE;
}
