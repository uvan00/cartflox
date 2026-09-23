import { useCallback, useEffect, useState } from "react";
import { MARQUE } from "@/lib/marque";

/**
 * Textes des pages de paiement vues par le CLIENT (checkout heberge, lien de
 * paiement, page de retour), en francais et en anglais.
 *
 * Le francais est la langue par defaut et garde mot pour mot les textes
 * d'origine. Les cles sont courtes, en snake_case ; les valeurs variables
 * s'ecrivent {nom} et sont remplacees par `t`.
 *
 * Regle de la maison : jamais de tiret long, de tiret moyen ni de point
 * median dans un texte visible, dans aucune des deux langues.
 */

export type Langue = "fr" | "en";

const FR = {
    // Chargement, erreurs et textes communs
    erreur_chargement: "Erreur de chargement",
    marchand: "Marchand",
    lien_nulle_part: "Ce lien ne mène nulle part",
    transaction_introuvable: "Transaction introuvable",
    lien_invalide_expire: "Ce lien de paiement est invalide ou a expiré. Demandez un nouveau lien au marchand.",
    paiement_a: "Paiement à {nom}",
    recu_envoye_a: "Reçu envoyé à",
    reference: "Référence",
    soit_environ: "Soit environ {montant} {devise}, taux indicatif",
    moyens_acceptes: "Mobile Money et carte bancaire acceptés",
    qr_alt: "Code à scanner pour payer depuis votre téléphone",
    qr_titre: "Payer depuis votre téléphone",
    qr_texte: "Scannez ce code pour ouvrir cette page sur votre mobile et valider dans votre application.",
    mode_test_bandeau: "Mode test : aucun argent réel n'est débité",
    langue: "Langue",
    langue_fr: "Français",
    langue_en: "English",

    // Formulaire de paiement
    moyen_de_paiement: "Moyen de paiement",
    choisissez_comment_payer: "Choisissez comment payer {montant} {devise}.",
    echec_titre: "Le paiement n'a pas abouti",
    echec_texte: "{message} Aucun montant n'a été débité, vous pouvez réessayer ou choisir un autre moyen.",
    fermer: "Fermer",
    payer_un_clic: "Payer en un clic",
    payer: "Payer",
    autre_moyen: "Utiliser un autre moyen",
    votre_habitude: "Votre habitude",
    payer_avec: "Payer avec",
    aucun_moyen_pays: "Aucun moyen de paiement pour {pays}. Changez de pays ci-dessous.",
    prefere: "Préféré",
    voir_autres_moyens: "Voir les {n} autres moyens",
    numero_moyen: "Numéro {moyen}",
    mobile_money: "Mobile Money",
    changer_pays: "Changer de pays",
    numero_recevra: "Le numéro qui recevra la demande de paiement.",
    confirmerez_application: "Vous confirmerez dans l'application {app}, sans quitter cette page.",
    finaliserez_page: "Vous finaliserez sur la page sécurisée de {passerelle}, puis reviendrez ici.",
    pays_ou_indicatif: "Pays ou indicatif",
    bon_retour: "Bon retour",
    paiements_reussis_un: `{n} paiement réussi sur le réseau ${MARQUE}`,
    paiements_reussis_plusieurs: `{n} paiements réussis sur le réseau ${MARQUE}`,
    reconnu_reseau: `Reconnu sur le réseau ${MARQUE}`,
    trop_de_tentatives: "Trop de tentatives, patientez une minute puis réessayez.",
    paiement_rembourse: "Ce paiement a été remboursé : il n'y a plus rien à régler.",
    chargement_impossible: "Impossible de charger la page de paiement. Vérifiez votre connexion, puis réessayez.",
    reessayer: "Réessayer",
    meilleure_route: "Meilleure route : {route}",
    payer_montant: "Payer {montant} {devise}",
    aucun_frais: "Aucun frais caché. Le montant est débité une seule fois, après votre confirmation.",

    // Connexion a l'operateur
    connexion_a: "Connexion à {nom}",
    votre_operateur: "votre opérateur",
    quelques_secondes: "Quelques secondes, ne fermez pas cette page.",

    // Code de paiement (OTP)
    code_de_paiement: "Code de paiement",
    a_composer: "À composer sur votre téléphone",
    code_copie: "Code copié",
    copier: "Copier",
    code_recu: "Code reçu",
    retour: "Retour",
    valider_paiement: "Valider le paiement",

    // Carte bancaire
    votre_carte: "Votre carte bancaire",
    carte_texte: "Saisissez les informations de votre carte. Tout se passe ici, vous ne quittez pas cette page.",
    carte_erreur_titre: "Le formulaire de carte ne s'affiche pas",
    carte_erreur_texte: "{message} Aucun montant n'a été débité.",
    choisir_autre_moyen: "Choisir un autre moyen",
    ouverture_formulaire: "Ouverture du formulaire sécurisé",
    carte_debit_avant: "Votre carte sera débitée de ",
    carte_debit_apres: ", à la parité fixe de 655,957 francs pour un euro. Votre banque peut appliquer ses propres frais de change.",
    carte_bloquee: "Le formulaire de carte est bloqué par votre navigateur ou votre réseau. Désactivez un éventuel bloqueur, ou payez par Mobile Money.",
    carte_chargement_echec: "Le formulaire de carte n'a pas pu se charger",
    paiement_refuse: "Paiement refusé",

    // Mode test
    test_titre: "Paiement en mode test",
    test_texte: "Aucun argent ne bouge. Choisissez l'issue pour vérifier votre intégration : le webhook part exactement comme en production.",
    simuler_succes: "Simuler un paiement réussi",
    simuler_echec: "Simuler un échec",
    revenir_choix: "Revenir au choix du moyen",
    echec_simule: "Échec simulé : c'est ce que verrait votre client si l'opérateur refusait le paiement.",
    simulation_impossible: "Simulation impossible",

    // Confirmation sur le telephone ou dans une application
    confirmez_dans: "Confirmez dans {nom}",
    confirmez_telephone: "Confirmez sur votre téléphone",
    a_confirmer_dans: "{montant} {devise} à confirmer dans l’application {nom}",
    l_application: "l’application",
    ouvrir: "Ouvrir {nom}",
    qr_code_de: "QR code {nom}",
    sur_ordinateur: "Sur ordinateur : scannez ce code avec votre téléphone",
    en_attente_confirmation: "En attente de votre confirmation",
    deja_valide: "J'ai déjà validé",

    // Verification
    verification_paiement: "Vérification du paiement",
    verification_texte: "Nous confirmons avec votre opérateur, cette page se met à jour toute seule.",

    // Succes
    paiement_reussi: "Paiement réussi",
    montant_a: "{montant} {devise} à {nom}",
    recu_envoye: "Un reçu est envoyé à {email}",
    reference_valeur: "Référence {ref}",
    retourner_sur: "Retourner sur {nom}",
    fermer_page: "Fermer cette page",

    // Expiration de la session
    expire_min_s: "Cette page expire dans {min} min {sec} s",
    expire_s: "Cette page expire dans {sec} s",
    prolonger: "Prolonger",

    // Validation du numero et messages d'erreur composes par la page
    pays_invalide: "Pays invalide",
    numero_trop_court: "Numéro trop court pour {pays} ({n}/{max} chiffres)",
    numero_invalide_pour: "Numéro invalide pour {pays}",
    choisissez_moyen: "Choisissez un moyen de paiement",
    entrez_numero: "Entrez votre numéro de téléphone",
    numero_invalide: "Numéro de téléphone invalide",
    echec_paiement: "Échec du paiement",
    code_confirmation: "Code de confirmation",
    code_confirmation_texte: "Saisissez le code reçu par SMS ou affiché sur votre téléphone.",
    erreur_technique: "Une erreur technique est survenue",
    methode_introuvable: "Méthode de paiement introuvable",
    code_invalide: "Code invalide.",
    echec_validation: "Échec de la validation",
    erreur_verification: "Erreur lors de la vérification",
    paiement_annule: "Paiement annulé.",
    paiement_echoue_reessayer: "Le paiement a échoué. Vous pouvez réessayer.",
    confirmation_attente_longue: "Confirmation toujours en attente. Si vous avez validé, elle sera enregistrée automatiquement.",

    // Consignes par operateur (ecran du code de paiement)
    instr_wave_titre: "Confirmation dans Wave",
    instr_wave_texte: "Ouvrez Wave et confirmez le paiement.",
    instr_orange_titre: "Code de paiement requis",
    instr_orange_texte: "Aucun SMS automatique : composez {code} pour générer votre code de paiement, puis saisissez-le ici.",
    instr_mtn_titre: "Confirmation MTN MoMo",
    instr_mtn_texte: "Saisissez votre code PIN sur le message reçu.",
    instr_moov_titre: "Confirmation Moov Money",
    instr_moov_texte: "Confirmez en saisissant votre code secret.",
    instr_free_titre: "Confirmation Free Money",
    instr_free_texte: "Composez le #150# pour valider.",
    instr_defaut_titre: "Confirmation requise",
    instr_defaut_texte: "Suivez les instructions sur votre téléphone.",

    // Etapes par operateur (ecran d'attente)
    etape_mtn_1: "Une demande de paiement MTN MoMo arrive sur votre téléphone",
    etape_mtn_2: "Saisissez votre code PIN pour l'accepter",
    etape_moov_1: "Une demande Moov Money s'affiche sur votre téléphone",
    etape_moov_2: "Confirmez avec votre code secret",
    etape_free_1: "Composez le #150# sur votre téléphone",
    etape_free_2: "Validez le paiement en attente",
    etape_orange_1: "Une demande Orange Money arrive sur votre téléphone",
    etape_orange_2: "Validez-la avec votre code secret",
    etape_defaut_1: "Une demande de confirmation arrive sur votre téléphone",
    etape_defaut_2: "Validez-la avec votre code secret",
    etape_page_maj: "Cette page se met à jour toute seule",
    etape_app_1: "Ouvrez {nom} sur votre téléphone (le bouton ci-dessus l’ouvre directement)",
    etape_app_2: "Vérifiez le montant et confirmez le paiement",
    etape_app_3: "Revenez ici : cette page se met à jour toute seule",

    // Lien de paiement (coordonnees du client)
    erreur_initialisation: "Erreur lors de l'initialisation",
    erreur_imprevue: "Une erreur imprévue est survenue",
    lien_introuvable: "Lien introuvable",
    lien_invalide_inactif: "Ce lien de paiement est invalide, expiré ou n'est plus actif. Demandez un nouveau lien au marchand.",
    prix_unitaire: "Prix unitaire",
    quantite: "Quantité",
    total: "Total",
    moins: "Moins",
    plus: "Plus",
    vos_coordonnees: "Vos coordonnées",
    pour_envoyer_recu: "Pour vous envoyer le reçu de {montant} {devise}.",
    lien_inactif: "Ce lien n'accepte plus de paiement pour le moment.",
    nom_complet: "Nom complet",
    adresse_email: "Adresse e-mail",
    recu_y_sera_envoye: "Votre reçu de paiement y sera envoyé.",
    numero_telephone: "Numéro de téléphone",
    un_instant: "Un instant",
    continuer_paiement: "Continuer vers le paiement",
    choisirez_moyen_suite: "Vous choisirez votre moyen de paiement à l'étape suivante : Mobile Money ou carte bancaire.",

    // Lien a montant libre, frais de service et page produit
    combien_payer: "Combien souhaitez-vous payer ?",
    montant_au_choix: "Vous choisissez le montant",
    montant_suggere: "Suggéré : {montant} {devise}",
    borne_min: "Minimum {montant} {devise}",
    borne_max: "Maximum {montant} {devise}",
    borne_min_max: "Entre {min} et {max} {devise}",
    saisissez_montant: "Saisissez le montant que vous souhaitez payer.",
    montant_trop_bas: "Le montant minimum est de {montant} {devise}.",
    montant_trop_haut: "Le montant maximum est de {montant} {devise}.",
    sous_total: "Sous-total",
    frais_service: "Frais de service",
    frais_inclus: "Frais de service inclus",
    lien_expire: "Ce lien de paiement a expiré. Demandez-en un nouveau au marchand.",

    // Page de retour apres un paiement heberge
    suivi_paiement: "Suivi de votre paiement",
    montant_paye: "Montant payé",
    montant: "Montant",
    montant_a_payer: "Montant à payer",
    reessayer_paiement: "Réessayer le paiement",
    phase_loading_titre: "Vérification en cours",
    phase_loading_texte: "Nous vérifions le statut de votre paiement.",
    phase_pending_titre: "Paiement en cours de confirmation",
    phase_pending_texte: "Votre opérateur traite le paiement. Cette page se met à jour toute seule.",
    phase_success_texte: "Votre paiement est confirmé. Vous pouvez fermer cette page.",
    phase_failed_titre: "Paiement échoué",
    phase_failed_texte: "Le paiement n'a pas abouti. Aucun montant n'a été débité.",
    phase_cancelled_titre: "Paiement annulé",
    phase_cancelled_texte: "Vous avez annulé le paiement. Vous pouvez réessayer à tout moment.",
    phase_refunded_titre: "Paiement remboursé",
    phase_refunded_texte: "Le montant a été renvoyé sur votre moyen de paiement.",
    phase_notfound_texte: "Ce lien de paiement est invalide ou a expiré.",
};

/** Cle d'un texte : le dictionnaire francais fait foi, l'anglais doit avoir les memes cles. */
export type Cle = keyof typeof FR;

const EN: Record<Cle, string> = {
    // Loading, errors and shared texts
    erreur_chargement: "Loading error",
    marchand: "Merchant",
    lien_nulle_part: "This link leads nowhere",
    transaction_introuvable: "Transaction not found",
    lien_invalide_expire: "This payment link is invalid or has expired. Ask the merchant for a new link.",
    paiement_a: "Payment to {nom}",
    recu_envoye_a: "Receipt sent to",
    reference: "Reference",
    soit_environ: "About {montant} {devise}, indicative rate",
    moyens_acceptes: "Mobile Money and bank cards accepted",
    qr_alt: "Code to scan to pay from your phone",
    qr_titre: "Pay from your phone",
    qr_texte: "Scan this code to open this page on your phone and confirm in your app.",
    mode_test_bandeau: "Test mode: no real money is charged",
    langue: "Language",
    langue_fr: "Français",
    langue_en: "English",

    // Payment form
    moyen_de_paiement: "Payment method",
    choisissez_comment_payer: "Choose how to pay {montant} {devise}.",
    echec_titre: "The payment did not go through",
    echec_texte: "{message} Nothing has been charged, you can try again or choose another method.",
    fermer: "Close",
    payer_un_clic: "Pay in one click",
    payer: "Pay",
    autre_moyen: "Use another method",
    votre_habitude: "Your usual choice",
    payer_avec: "Pay with",
    aucun_moyen_pays: "No payment method for {pays}. Change the country below.",
    prefere: "Preferred",
    voir_autres_moyens: "Show {n} more methods",
    numero_moyen: "{moyen} number",
    mobile_money: "Mobile Money",
    changer_pays: "Change country",
    numero_recevra: "The number that will receive the payment request.",
    confirmerez_application: "You will confirm in the {app} app, without leaving this page.",
    finaliserez_page: "You will finish on the secure page of {passerelle}, then come back here.",
    pays_ou_indicatif: "Country or dialling code",
    bon_retour: "Welcome back",
    paiements_reussis_un: `{n} successful payment on the ${MARQUE} network`,
    paiements_reussis_plusieurs: `{n} successful payments on the ${MARQUE} network`,
    reconnu_reseau: `Recognised on the ${MARQUE} network`,
    trop_de_tentatives: "Too many attempts, wait a minute and try again.",
    paiement_rembourse: "This payment has been refunded: there is nothing left to pay.",
    chargement_impossible: "The payment page could not be loaded. Check your connection, then try again.",
    reessayer: "Try again",
    meilleure_route: "Best route: {route}",
    payer_montant: "Pay {montant} {devise}",
    aucun_frais: "No hidden fees. The amount is charged once, after your confirmation.",

    // Connecting to the operator
    connexion_a: "Connecting to {nom}",
    votre_operateur: "your operator",
    quelques_secondes: "A few seconds, please keep this page open.",

    // Payment code (OTP)
    code_de_paiement: "Payment code",
    a_composer: "Dial on your phone",
    code_copie: "Code copied",
    copier: "Copy",
    code_recu: "Code received",
    retour: "Back",
    valider_paiement: "Confirm payment",

    // Bank card
    votre_carte: "Your bank card",
    carte_texte: "Enter your card details. Everything happens here, you do not leave this page.",
    carte_erreur_titre: "The card form is not showing",
    carte_erreur_texte: "{message} Nothing has been charged.",
    choisir_autre_moyen: "Choose another method",
    ouverture_formulaire: "Opening the secure form",
    carte_debit_avant: "Your card will be charged ",
    carte_debit_apres: ", at the fixed rate of 655.957 francs to the euro. Your bank may add its own exchange fees.",
    carte_bloquee: "The card form is blocked by your browser or your network. Disable any blocker, or pay with Mobile Money.",
    carte_chargement_echec: "The card form could not load",
    paiement_refuse: "Payment declined",

    // Test mode
    test_titre: "Test mode payment",
    test_texte: "No money moves. Choose the outcome to check your integration: the webhook is sent exactly as in production.",
    simuler_succes: "Simulate a successful payment",
    simuler_echec: "Simulate a failure",
    revenir_choix: "Back to payment methods",
    echec_simule: "Simulated failure: this is what your customer would see if the operator declined the payment.",
    simulation_impossible: "Simulation unavailable",

    // Confirmation on the phone or in an app
    confirmez_dans: "Confirm in {nom}",
    confirmez_telephone: "Confirm on your phone",
    a_confirmer_dans: "{montant} {devise} to confirm in {nom}",
    l_application: "the app",
    ouvrir: "Open {nom}",
    qr_code_de: "QR code for {nom}",
    sur_ordinateur: "On a computer: scan this code with your phone",
    en_attente_confirmation: "Waiting for your confirmation",
    deja_valide: "I have already confirmed",

    // Verification
    verification_paiement: "Checking the payment",
    verification_texte: "We are confirming with your operator, this page updates by itself.",

    // Success
    paiement_reussi: "Payment received",
    montant_a: "{montant} {devise} to {nom}",
    recu_envoye: "A receipt is sent to {email}",
    reference_valeur: "Reference {ref}",
    retourner_sur: "Return to {nom}",
    fermer_page: "Close this page",

    // Session expiry
    expire_min_s: "This page expires in {min} min {sec} s",
    expire_s: "This page expires in {sec} s",
    prolonger: "Extend",

    // Phone validation and error messages composed by the page
    pays_invalide: "Invalid country",
    numero_trop_court: "Number too short for {pays} ({n}/{max} digits)",
    numero_invalide_pour: "Invalid number for {pays}",
    choisissez_moyen: "Choose a payment method",
    entrez_numero: "Enter your phone number",
    numero_invalide: "Invalid phone number",
    echec_paiement: "Payment failed",
    code_confirmation: "Confirmation code",
    code_confirmation_texte: "Enter the code you received by SMS or shown on your phone.",
    erreur_technique: "A technical error occurred",
    methode_introuvable: "Payment method not found",
    code_invalide: "Invalid code.",
    echec_validation: "Verification failed",
    erreur_verification: "Error during verification",
    paiement_annule: "Payment cancelled.",
    paiement_echoue_reessayer: "The payment failed. You can try again.",
    confirmation_attente_longue: "Still waiting for confirmation. If you have confirmed, it will be recorded automatically.",

    // Instructions per operator (payment code screen)
    instr_wave_titre: "Confirm in Wave",
    instr_wave_texte: "Open Wave and confirm the payment.",
    instr_orange_titre: "Payment code required",
    instr_orange_texte: "No automatic SMS: dial {code} to generate your payment code, then enter it here.",
    instr_mtn_titre: "MTN MoMo confirmation",
    instr_mtn_texte: "Enter your PIN on the message you received.",
    instr_moov_titre: "Moov Money confirmation",
    instr_moov_texte: "Confirm by entering your secret code.",
    instr_free_titre: "Free Money confirmation",
    instr_free_texte: "Dial #150# to confirm.",
    instr_defaut_titre: "Confirmation required",
    instr_defaut_texte: "Follow the instructions on your phone.",

    // Steps per operator (waiting screen)
    etape_mtn_1: "An MTN MoMo payment request arrives on your phone",
    etape_mtn_2: "Enter your PIN to accept it",
    etape_moov_1: "A Moov Money request appears on your phone",
    etape_moov_2: "Confirm with your secret code",
    etape_free_1: "Dial #150# on your phone",
    etape_free_2: "Approve the pending payment",
    etape_orange_1: "An Orange Money request arrives on your phone",
    etape_orange_2: "Approve it with your secret code",
    etape_defaut_1: "A confirmation request arrives on your phone",
    etape_defaut_2: "Approve it with your secret code",
    etape_page_maj: "This page updates by itself",
    etape_app_1: "Open {nom} on your phone (the button above opens it directly)",
    etape_app_2: "Check the amount and confirm the payment",
    etape_app_3: "Come back here: this page updates by itself",

    // Payment link (customer details)
    erreur_initialisation: "Could not start the payment",
    erreur_imprevue: "An unexpected error occurred",
    lien_introuvable: "Link not found",
    lien_invalide_inactif: "This payment link is invalid, expired or no longer active. Ask the merchant for a new link.",
    prix_unitaire: "Unit price",
    quantite: "Quantity",
    total: "Total",
    moins: "Less",
    plus: "More",
    vos_coordonnees: "Your details",
    pour_envoyer_recu: "To send you the receipt for {montant} {devise}.",
    lien_inactif: "This link no longer accepts payments for now.",
    nom_complet: "Full name",
    adresse_email: "Email address",
    recu_y_sera_envoye: "Your payment receipt will be sent there.",
    numero_telephone: "Phone number",
    un_instant: "One moment",
    continuer_paiement: "Continue to payment",
    choisirez_moyen_suite: "You will choose your payment method at the next step: Mobile Money or bank card.",

    // Open amount, service fee and product page
    combien_payer: "How much would you like to pay?",
    montant_au_choix: "You choose the amount",
    montant_suggere: "Suggested: {montant} {devise}",
    borne_min: "Minimum {montant} {devise}",
    borne_max: "Maximum {montant} {devise}",
    borne_min_max: "Between {min} and {max} {devise}",
    saisissez_montant: "Enter the amount you want to pay.",
    montant_trop_bas: "The minimum amount is {montant} {devise}.",
    montant_trop_haut: "The maximum amount is {montant} {devise}.",
    sous_total: "Subtotal",
    frais_service: "Service fee",
    frais_inclus: "Service fee included",
    lien_expire: "This payment link has expired. Ask the merchant for a new one.",

    // Return page after a hosted payment
    suivi_paiement: "Your payment status",
    montant_paye: "Amount paid",
    montant: "Amount",
    montant_a_payer: "Amount to pay",
    reessayer_paiement: "Try the payment again",
    phase_loading_titre: "Checking",
    phase_loading_texte: "We are checking the status of your payment.",
    phase_pending_titre: "Payment being confirmed",
    phase_pending_texte: "Your operator is processing the payment. This page updates by itself.",
    phase_success_texte: "Your payment is confirmed. You can close this page.",
    phase_failed_titre: "Payment failed",
    phase_failed_texte: "The payment did not go through. Nothing has been charged.",
    phase_cancelled_titre: "Payment cancelled",
    phase_cancelled_texte: "You cancelled the payment. You can try again at any time.",
    phase_refunded_titre: "Payment refunded",
    phase_refunded_texte: "The amount has been returned to your payment method.",
    phase_notfound_texte: "This payment link is invalid or has expired.",
};

export const TEXTES: Record<Langue, Record<string, string>> = { fr: FR, en: EN };

/** Texte dans la langue demandee, avec les {valeurs} remplacees. Une cle absente en anglais retombe sur le francais. */
export function t(langue: Langue, cle: Cle, valeurs?: Record<string, string | number>): string {
    const brut = TEXTES[langue][cle] ?? TEXTES.fr[cle] ?? cle;
    if (!valeurs) return brut;
    return brut.replace(/\{(\w+)\}/g, (tout, nom: string) => (nom in valeurs ? String(valeurs[nom]) : tout));
}

/** Locale de formatage des nombres et montants dans la langue de la page. */
export function localeNombre(langue: Langue): string {
    return langue === "en" ? "en-GB" : "fr-FR";
}

const CLE_STOCKAGE = "cartflox-langue";

const estLangue = (v: unknown): v is Langue => v === "fr" || v === "en";

/** Langue voulue par le visiteur : l'adresse (?lang=), puis le choix memorise, puis le navigateur. */
function langueDetectee(): Langue {
    try {
        const url = new URLSearchParams(window.location.search).get("lang");
        if (estLangue(url)) return url;
        const memo = localStorage.getItem(CLE_STOCKAGE);
        if (estLangue(memo)) return memo;
        if ((navigator.language || "").toLowerCase().startsWith("en")) return "en";
    } catch { /* stockage ou navigateur inaccessibles */ }
    return "fr";
}

/**
 * Langue de la page cote client. Le rendu serveur et la premiere peinture
 * sont en francais : la langue reelle n'est lue qu'apres le montage, pour ne
 * jamais differer du HTML envoye. Un changement par le visiteur est memorise.
 */
export function useLangue(): { langue: Langue; changerLangue: (l: Langue) => void } {
    const [langue, setLangue] = useState<Langue>("fr");
    useEffect(() => {
        const l = langueDetectee();
        setLangue(l);
        document.documentElement.lang = l;
    }, []);
    const changerLangue = useCallback((l: Langue) => {
        setLangue(l);
        document.documentElement.lang = l;
        try { localStorage.setItem(CLE_STOCKAGE, l); } catch { /* stockage refuse */ }
    }, []);
    return { langue, changerLangue };
}

const afficheursNoms: Partial<Record<Langue, Intl.DisplayNames | null>> = {};
const memoNoms = new Map<string, string>();

/**
 * Nom d'un pays dans la langue de la page. En francais on garde le libelle
 * deja affiche (`repli`, celui du selecteur), pour ne rien changer au texte
 * actuel ; en anglais on demande au navigateur (Intl.DisplayNames) et l'on
 * retombe sur le libelle francais, puis sur le code, si le navigateur ne sait pas.
 */
export function nomPays(code: string, langue: Langue, repli?: string): string {
    const iso = String(code || "").trim().toUpperCase();
    if (langue === "fr" && repli) return repli;
    const cle = `${langue}:${iso}`;
    const memo = memoNoms.get(cle);
    if (memo) return memo;
    let nom = "";
    try {
        if (!(langue in afficheursNoms)) {
            afficheursNoms[langue] = typeof Intl !== "undefined" && "DisplayNames" in Intl
                ? new Intl.DisplayNames([langue], { type: "region" })
                : null;
        }
        nom = afficheursNoms[langue]?.of(iso) || "";
    } catch { nom = ""; }
    if (!nom || nom === iso) nom = repli || iso;
    memoNoms.set(cle, nom);
    return nom;
}
