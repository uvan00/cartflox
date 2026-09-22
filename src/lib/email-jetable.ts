import { promises as dns } from "node:dns";
import { APIError } from "better-auth/api";
import domaines from "./domaines-jetables.json";

/**
 * Adresses e-mail jetables : refusees a l'inscription.
 *
 * Une adresse temporaire (Mailinator, YOPmail, temp-mail...) ne permet ni de
 * joindre la personne, ni de verifier son identite, ni de lui reverser quoi
 * que ce soit. Sur une plateforme de paiement c'est la porte d'entree des
 * comptes de fraude et des essais en serie.
 *
 * La liste vient du projet public disposable-email-domains (CC0), copiee dans
 * `domaines-jetables.json`. Pour la rafraichir, remplacez ce fichier par la
 * derniere version publiee du projet (voir CONTRIBUTING.md).
 */

const JETABLES: Set<string> = new Set(domaines as string[]);

/** Nos ajouts, pour ce que la liste amont n'a pas encore. */
const AJOUTS = new Set<string>([]);

export function domaineDe(email: string): string {
    return String(email || "").trim().toLowerCase().split("@")[1] || "";
}

/**
 * Le domaine, ou l'un de ses parents, est-il un fournisseur d'adresses
 * jetables ? On remonte les sous-domaines : `x.mailinator.com` est jetable
 * parce que `mailinator.com` l'est.
 */
export function estJetable(email: string): boolean {
    const d = domaineDe(email);
    if (!d) return false;
    const morceaux = d.split(".");
    for (let i = 0; i < morceaux.length - 1; i++) {
        const candidat = morceaux.slice(i).join(".");
        if (JETABLES.has(candidat) || AJOUTS.has(candidat)) return true;
    }
    return false;
}

/**
 * Le domaine peut-il recevoir du courrier ? Vrai des qu'il a un MX, ou a
 * defaut une adresse A (le repli prevu par la norme). Un domaine qui n'existe
 * pas (`gamil.co`, `example.test`) rend faux. Sans reponse DNS en deux
 * secondes, ou sur toute autre erreur, on laisse passer : un DNS lent ne doit
 * jamais empecher une inscription.
 */
export async function domaineRecoitDuCourrier(email: string): Promise<boolean> {
    const d = domaineDe(email);
    if (!d) return false;
    const delai = <T,>(p: Promise<T>) => Promise.race([p, new Promise<T>((_, rejeter) => setTimeout(() => rejeter(Object.assign(new Error("delai"), { code: "DELAI" })), 2000))]);
    try {
        const mx = await delai(dns.resolveMx(d));
        if (mx.length > 0) return true;
    } catch (e: any) {
        if (e?.code === "ENOTFOUND") return false;
        if (e?.code !== "ENODATA") return true;
    }
    try {
        return (await delai(dns.resolve4(d))).length > 0;
    } catch (e: any) {
        return !(e?.code === "ENOTFOUND" || e?.code === "ENODATA");
    }
}

/**
 * A appeler avant de creer un compte. Leve une erreur Better Auth (400) avec
 * un message en francais, que la page d'inscription affiche telle quelle.
 */
export async function verifierAdresseInscription(email: string): Promise<void> {
    if (estJetable(email)) {
        throw new APIError("BAD_REQUEST", { message: "Les adresses e-mail temporaires ne sont pas acceptées. Utilisez une adresse que vous gardez." });
    }
    if (!(await domaineRecoitDuCourrier(email))) {
        throw new APIError("BAD_REQUEST", { message: `Le domaine « ${domaineDe(email)} » ne reçoit pas de courrier. Vérifiez l'adresse.` });
    }
}
