/**
 * Pourquoi un paiement a échoué, dit au client dans sa langue.
 *
 * Les agrégateurs renvoient un code sec (INSUFFICIENT_BALANCE, PAYER_NOT_FOUND...)
 * que personne ne comprend. Sans traduction, la page affiche « le paiement a
 * échoué » et le client ne sait pas s'il doit recharger son compte, changer de
 * numéro ou simplement recommencer. C'est la première cause d'abandon après un
 * échec : on perd une vente pour un message manquant.
 */
export type MotifEchec = { code: string; message: string; action?: string }

const MOTIFS: Record<string, { message: string; action?: string }> = {
    INSUFFICIENT_BALANCE: {
        message: "Votre compte Mobile Money n'avait pas assez d'argent pour ce paiement.",
        action: "Rechargez votre compte, puis réessayez.",
    },
    PAYER_LIMIT_REACHED: {
        message: "Votre plafond Mobile Money est atteint pour le moment.",
        action: "Réessayez plus tard ou payez avec un autre numéro.",
    },
    PAYER_NOT_FOUND: {
        message: "Ce numéro n'a pas de compte Mobile Money chez cet opérateur.",
        action: "Vérifiez le numéro, ou choisissez l'opérateur qui correspond à votre ligne.",
    },
    PAYMENT_NOT_APPROVED: {
        message: "La demande n'a pas été validée sur votre téléphone à temps.",
        action: "Relancez le paiement et saisissez votre code secret quand la demande s'affiche.",
    },
    TRANSACTION_ALREADY_IN_PROCESS: {
        message: "Un paiement est déjà en cours sur ce numéro.",
        action: "Attendez une minute, puis réessayez.",
    },
    UNSPECIFIED_FAILURE: { message: "L'opérateur a refusé le paiement sans en dire la raison.", action: "Réessayez, ou payez avec un autre moyen." },
    OTHER_ERROR: { message: "L'opérateur a refusé le paiement.", action: "Réessayez, ou payez avec un autre moyen." },
    // Hub2 : le moyen n'est pas active sur le compte marchand (Wave demande une
    // activation par Hub2) ; ou le delai de validation est passe.
    FORBIDDEN_BY_HUB2: { message: "Ce moyen de paiement n'est pas encore activé chez ce marchand.", action: "Choisissez un autre moyen de paiement." },
    TIMEOUT: { message: "Le délai de validation est passé avant votre confirmation.", action: "Relancez le paiement et validez sans attendre." },
}

/** Hub2 : l'echec est porte par la derniere tentative de l'intention (`payments[].failure`). */
const echecHub2 = (d: Record<string, any>) => {
    if (d?.failure && typeof d.failure === "object") return d.failure
    const p = Array.isArray(d?.payments) && d.payments.length ? d.payments[d.payments.length - 1] : null
    return p?.failure && typeof p.failure === "object" ? p.failure : null
}

/** Traduit ce que dit la carte bancaire (Stripe). */
const MOTIFS_CARTE: Record<string, { message: string; action?: string }> = {
    insufficient_funds: { message: "Votre carte n'a pas assez de provision pour ce paiement.", action: "Réessayez avec une autre carte ou par Mobile Money." },
    card_declined: { message: "Votre banque a refusé la carte.", action: "Contactez votre banque, ou payez par Mobile Money." },
    expired_card: { message: "Cette carte est expirée.", action: "Utilisez une autre carte." },
    incorrect_cvc: { message: "Le code de sécurité de la carte est incorrect.", action: "Vérifiez les trois chiffres au dos de la carte." },
    do_not_honor: { message: "Votre banque a refusé l'opération sans en préciser la raison.", action: "Contactez votre banque, ou payez par Mobile Money." },
}

const texte = (v: unknown) => (typeof v === "string" ? v.trim() : "")

/**
 * Cherche le motif dans ce que le fournisseur a renvoyé, quel que soit son
 * format. Renvoie null quand rien d'exploitable n'est présent : mieux vaut le
 * message générique de la page qu'une phrase inventée.
 */
export function motifEchec(rawData: unknown): MotifEchec | null {
    const d = (rawData || {}) as Record<string, any>
    const code =
        texte(d?.failureReason?.failureCode) ||
        texte(d?.rejectionReason?.rejectionCode) ||
        texte(d?.last_payment_error?.decline_code) ||
        texte(d?.last_payment_error?.code) ||
        texte(d?.declineCode) ||
        texte(d?.errorCode) ||
        texte(echecHub2(d)?.code)

    const connu = MOTIFS[code.toUpperCase()] || MOTIFS_CARTE[code.toLowerCase()]
    if (connu) return { code, ...connu }

    // Pas de code connu : on reprend le message du fournisseur s'il est lisible.
    const brut =
        texte(d?.failureReason?.failureMessage) ||
        texte(d?.rejectionReason?.rejectionMessage) ||
        texte(d?.last_payment_error?.message) ||
        texte(d?.fail_reason) ||
        // PayDunya : avec response_code « 00 », response_text (« Transaction Found »)
        // dit seulement que la facture existe, pas pourquoi elle a échoué.
        (d?.response_code === "00" ? "" : texte(d?.response_text)) ||
        texte(echecHub2(d)?.message) ||
        texte(d?.message)
    if (brut && brut.length <= 160 && !/^http/i.test(brut)) {
        return { code: code || "AUTRE", message: brut }
    }
    return null
}

/** Le motif en une phrase, prête pour la page de paiement ou un message WhatsApp. */
export function phraseEchec(motif: MotifEchec | null | undefined): string {
    if (!motif) return ""
    return [motif.message, motif.action].filter(Boolean).join(" ")
}
