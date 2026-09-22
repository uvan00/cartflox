/**
 * La marque portee par CE processus.
 *
 * Tout ce qui est visible par un marchand (nom, icone, logotype, site) passe
 * par ici, au lieu d'etre ecrit en dur dans chaque page : une instance se
 * rebaptise par variables d'environnement.
 *
 * ⚠️ Ces variables sont `NEXT_PUBLIC_*`, donc FIGEES AU BUILD. Changer la marque
 * demande une reconstruction, pas un simple redemarrage. C'est voulu : la marque
 * apparait dans des composants clients, qui ne lisent jamais l'environnement du
 * serveur a l'execution.
 */

/** Adresse publique de l'application, sans barre finale. */
export const URL_APP = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");

/** Nom de l'outil, tel qu'il s'ecrit dans une phrase. */
export const MARQUE = process.env.NEXT_PUBLIC_MARQUE || "Cartflox";

/** Titre de l'onglet du tableau de bord (balise <title> de la racine). */
export const MARQUE_TITRE = process.env.NEXT_PUBLIC_MARQUE_TITRE || "Cartflox - Orchestrateur de Paiements Souverain";

/**
 * Site vitrine, s'il existe : le logo des pages de compte et de paiement y
 * mene, et les liens Confidentialite / Securite s'affichent. Sans site
 * declare, le logo mene a l'application et les liens restent caches.
 */
export const MARQUE_SITE_DEFINI = !!process.env.NEXT_PUBLIC_MARQUE_SITE;
export const MARQUE_SITE = (process.env.NEXT_PUBLIC_MARQUE_SITE || URL_APP).replace(/\/+$/, "");

/** Icone carree de la marque (en-tete du tableau de bord, ecrans de passage). */
export const MARQUE_ICONE = process.env.NEXT_PUBLIC_MARQUE_ICONE || "/cf/brand/cartflox-icon.svg";

/** Logotype horizontal, pour l'en-tete des pages de compte. */
export const MARQUE_MOT = process.env.NEXT_PUBLIC_MARQUE_MOT || "/cf/brand/cartflox-wordmark.svg";

/** Ville de la ligne de copyright des pages de compte. Vide = rien. */
export const MARQUE_VILLE = process.env.NEXT_PUBLIC_MARQUE_VILLE || "";
