/**
 * Masquage des secrets avant qu'une donnee ne quitte le processus.
 *
 * POURQUOI. Les adaptateurs envoient la clef du marchand au fournisseur dans un
 * en-tete ou un corps de requete. Certains fournisseurs renvoient la requete EN
 * ECHO dans leur reponse d'erreur. Cette reponse est journalisee telle quelle
 * dans `ProviderLog`, donc une clef peut se retrouver en base sans qu'une seule
 * ligne de code ne l'ait voulu.
 *
 * ETAT CONSTATE au moment d'ecrire ceci : aucune clef marchand n'a fuite. Les
 * seules valeurs sensibles presentes dans `ProviderLog` sont `client_secret`
 * (Stripe, destine au navigateur), `shared_payment_granted_token` et `token`,
 * tous des jetons PAR TRANSACTION. Ce module est donc une prevention, pas une
 * reparation : il ferme la porte avant qu'un fournisseur ne la pousse.
 *
 * CHOIX ASSUME. On masque les noms qui designent un IDENTIFIANT DURABLE, pas
 * ceux qui designent un jeton de transaction. `token` et `client_secret` restent
 * lisibles : les masquer rendrait tout diagnostic de paiement impossible, et
 * leur portee est une seule transaction deja terminee.
 */

/** Noms de champ consideres comme des identifiants durables. */
const NOM_SECRET = /(api[_-]?key|api[_-]?secret|secret[_-]?key|private[_-]?key|master[_-]?key|shared[_-]?secret|service[_-]?secret|webhook[_-]?secret|licen[cs]e[_-]?key|password|passphrase|authorization|auth[_-]?token)/i;

const REMPLACEMENT = "***";
const PROFONDEUR_MAX = 12;

/**
 * Copie profonde d'une valeur JSON dont tout champ au nom secret est remplace
 * par `***`. Ne modifie jamais l'entree. Les valeurs non textuelles portant un
 * nom secret sont remplacees aussi : un objet `{ authorization: { ... } }` ne
 * doit pas passer parce qu'il n'est pas une chaine.
 */
export function masquerSecrets<T>(valeur: T, profondeur = 0): T {
    if (profondeur > PROFONDEUR_MAX) return valeur;
    if (!valeur || typeof valeur !== "object") return valeur;

    if (Array.isArray(valeur)) {
        return valeur.map((v) => masquerSecrets(v, profondeur + 1)) as unknown as T;
    }

    const out: Record<string, unknown> = {};
    for (const [cle, v] of Object.entries(valeur as Record<string, unknown>)) {
        if (NOM_SECRET.test(cle)) out[cle] = REMPLACEMENT;
        else out[cle] = masquerSecrets(v, profondeur + 1);
    }
    return out as unknown as T;
}

/**
 * Enveloppe une valeur sensible que l'on garde volontairement en memoire.
 *
 * Un `Secret` ne s'imprime jamais : `console.log`, un `JSON.stringify`, une
 * interpolation de chaine ou un rapport d'erreur affichent `***`. Pour obtenir
 * la valeur il faut ecrire `.exposer()`, ce qui rend l'intention visible a la
 * relecture. Meme idee que le `Secret<T>` d'Hyperswitch et son `.expose()`,
 * sans la garantie du compilateur que TypeScript ne sait pas donner.
 */
export class Secret<T = string> {
    readonly #valeur: T;

    constructor(valeur: T) {
        this.#valeur = valeur;
    }

    /** Seule sortie possible. A ecrire explicitement, au plus pres de l'usage. */
    exposer(): T {
        return this.#valeur;
    }

    toString(): string {
        return REMPLACEMENT;
    }

    toJSON(): string {
        return REMPLACEMENT;
    }

    /** `console.log` et `util.inspect` passent par la. */
    [Symbol.for("nodejs.util.inspect.custom")](): string {
        return REMPLACEMENT;
    }
}
