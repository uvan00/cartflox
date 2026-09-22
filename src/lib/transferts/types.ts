import { parsePhoneNumberFromString } from "libphonenumber-js";
import type { PayoutRequest, PayoutResponse } from "@/lib/orchestrator/types";

export type { PayoutRequest, PayoutResponse };

/**
 * Un fournisseur capable d'envoyer de l'argent. Chaque module de
 * `fournisseurs/` en decrit un : comment reconnaitre sa passerelle, quel code
 * il donne a un operateur dans un pays, comment lui confier un envoi et
 * comment lui en demander l'etat. Le service ne connait que cette forme.
 */
export interface Fournisseur {
    /** Cle du registre de l'orchestrateur (fabrique et `buildAdapterConfig`). */
    cle: string;
    nom: string;
    /** Reconnait `Gateway.name`. */
    motif: RegExp;
    /**
     * Verifie-t-il un envoi par NOTRE reference ? Sinon, un envoi parti sans
     * reponse reste indetermine : on ne saura pas l'interroger, et surtout on
     * ne le renverra pas.
     */
    verifieParNotreReference: boolean;
    /** Mise en garde affichee au marchand (integration non verifiee, prerequis...). */
    avertissement?: string;
    /** Les champs de configuration sans lesquels l'envoi est impossible (pour dire au marchand ce qui manque). */
    cles: { champ: string; libelle: string }[];
    /** Le code de l'operateur chez ce fournisseur pour ce pays, ou null s'il ne le dessert pas. */
    correspondant(pays: string, operateur: string): string | null;
    /**
     * Confie l'envoi. Un refus se renvoie en FAILED ; une panne reseau APRES
     * que l'ordre a pu partir se LANCE (throw), pour que l'appelant n'envoie
     * pas deux fois.
     */
    initier(config: any, demande: PayoutRequest): Promise<PayoutResponse>;
    /** Etat d'un envoi par la reference renvoyee dans `providerReference`. */
    verifier?(config: any, reference: string): Promise<PayoutResponse>;
}

export const URL_RAPPEL = (cle: string) => `${(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "")}/api/webhooks/transferts/${cle}`;
export const DELAI_MS = 20_000;

export async function lireJson(res: Response): Promise<any> {
    try { return await res.json(); } catch { return {}; }
}

export const injoignable = (nom: string, e: any) => new Error(`${nom} injoignable : ${e?.message || e}`);

export function refus(demande: PayoutRequest, code: string, message: string, rawData?: unknown, providerCode?: string): PayoutResponse {
    return { providerReference: demande.reference, status: "FAILED", failureCode: code, failureMessage: message, providerCode, rawData };
}

/** « 22507xxxxxxx » -> « 07xxxxxxx » : le numero tel qu'on le compose dans le pays. */
export function numeroLocal(phone: string): string {
    const p = parsePhoneNumberFromString(`+${String(phone).replace(/\D/g, "")}`);
    return p ? p.formatNational().replace(/\D/g, "") : String(phone).replace(/\D/g, "");
}

/** « 22507xxxxxxx » -> « 7xxxxxxx » : sans indicatif ni zero de composition. */
export function numeroNational(phone: string): string {
    const p = parsePhoneNumberFromString(`+${String(phone).replace(/\D/g, "")}`);
    return p ? String(p.nationalNumber) : String(phone).replace(/\D/g, "");
}

export function prenomNom(nom?: string): { prenom: string; nom: string } {
    const morceaux = String(nom || "").trim().split(/\s+/).filter(Boolean);
    if (morceaux.length === 0) return { prenom: "Bénéficiaire", nom: "Cartflox" };
    if (morceaux.length === 1) return { prenom: morceaux[0], nom: morceaux[0] };
    return { prenom: morceaux[0], nom: morceaux.slice(1).join(" ") };
}
