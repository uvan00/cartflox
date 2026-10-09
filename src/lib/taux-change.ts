import { DEVISES_SANS_CENTIMES } from "@/lib/devises";
import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * Taux de change de l'instance.
 *
 * Regle : un paiement demande en dollars (ou dans toute devise etrangere au
 * payeur) est encaisse et compte DANS LA MONNAIE DU PAYS OU IL A ETE PAYE. Le
 * montant local est pose sur la transaction (`metadata.conversion`) et affiche
 * partout ; la page de paiement le calcule avec les memes cours que le serveur.
 *
 * Cours : open.er-api.com (sans cle), rafraichi au plus une fois par jour,
 * borne a 20 % de la table de repli (un cours aberrant est ignore). Zone
 * franc : parite FIXE avec l'euro (1 EUR = 655,957 XOF), jamais un cours.
 */

/** Devise de chaque pays pour l'encaissement (ce que l'operateur debite). */
export const DEVISE_PAYS_CHECKOUT: Record<string, string> = {
    // UEMOA (XOF)
    CI: "XOF", SN: "XOF", BJ: "XOF", ML: "XOF", BF: "XOF", TG: "XOF", NE: "XOF", GW: "XOF",
    // CEMAC (XAF)
    CM: "XAF", GA: "XAF", CG: "XAF", TD: "XAF", CF: "XAF",
    // Le reste de l'Afrique
    GN: "GNF", CD: "CDF", GH: "GHS", NG: "NGN", KE: "KES", TZ: "TZS",
    UG: "UGX", RW: "RWF", ZA: "ZAR", ZM: "ZMW", MW: "MWK", MZ: "MZN",
    AO: "AOA", ET: "ETB", MG: "MGA", SL: "SLE", MR: "MRU",
    // Hors d'Afrique
    US: "USD", GB: "GBP", FR: "EUR", DE: "EUR",
};

/** Suffixe pays a trois lettres des codes de moyens (MTN_MOMO_CMR) vers le code a deux lettres. */
const SUFFIXE_PAYS: Record<string, string> = {
    CIV: "CI", SEN: "SN", BEN: "BJ", MLI: "ML", BFA: "BF", TGO: "TG",
    GIN: "GN", NER: "NE", CMR: "CM", GAB: "GA", COG: "CG", COD: "CD",
    TCD: "TD", CAF: "CF", GHA: "GH", NGA: "NG", KEN: "KE", TZA: "TZ",
    RWA: "RW", UGA: "UG", ZAF: "ZA", MDG: "MG", SLE: "SL", GNB: "GW",
    MRT: "MR", ZMB: "ZM", MWI: "MW", MOZ: "MZ", AGO: "AO", ETH: "ET",
};

/** La devise d'un moyen de paiement d'apres le suffixe pays de son code (MTN_MOMO_CMR -> XAF). */
export function deviseDuMoyen(code?: string | null): string | null {
    const parties = String(code || "").toUpperCase().split("_");
    for (let i = parties.length - 1; i >= 0; i--) {
        const p = parties[i];
        if (p.length === 3 && SUFFIXE_PAYS[p]) return DEVISE_PAYS_CHECKOUT[SUFFIXE_PAYS[p]] || null;
    }
    return null;
}

/** 1 XOF -> devise. Table de REPLI quand le cours vivant est indisponible. Ancre : 1 USD ≈ 615 XOF (2026-06). */
export const TAUX_XOF_REPLI: Record<string, number> = {
    XOF: 1, XAF: 1,
    GNF: 14, CDF: 4.7, GHS: 0.019, NGN: 2.5, KES: 0.21, TZS: 4.3,
    UGX: 5.9, RWF: 2.3, ZAR: 0.029, ZMW: 0.042, MWK: 2.8, MZN: 0.104,
    AOA: 1.5, ETB: 0.23, MGA: 7.3, MAD: 0.016, DZD: 0.21, TND: 0.0048,
    EGP: 0.079, SLE: 0.037, MRU: 0.065,
    USD: 0.00163, EUR: 0.001524, GBP: 0.00127,
    // Ajoutees le 29/09/2026 pour la devise d'affichage (cours du jour, open.er-api.com)
    CAD: 0.00246, CHF: 0.00144, BRL: 0.00903, MXN: 0.031, HTG: 0.227, SEK: 0.0173, NOK: 0.0165,
    DKK: 0.0114, PLN: 0.00666, CZK: 0.0372, HUF: 0.56, RON: 0.00805, TRY: 0.085, AED: 0.00637,
    SAR: 0.0065, QAR: 0.00631, KWD: 0.000534, LBP: 155, INR: 0.166, CNY: 0.0116, JPY: 0.273,
    KRW: 2.36, HKD: 0.0136, SGD: 0.00221, MYR: 0.00708, THB: 0.0582, IDR: 31.1, PHP: 0.108,
    AUD: 0.00247, NZD: 0.00306, BIF: 5.19, BWP: 0.0245, CVE: 0.168, DJF: 0.308, ERN: 0.026,
    GMD: 0.129, KMF: 0.75, LRD: 0.298, LSL: 0.0284, LYD: 0.0111, MUR: 0.0822, NAD: 0.0284,
    SCR: 0.0254, SDG: 0.776, SOS: 0.993, SSP: 10.5, STN: 0.0374, SZL: 0.0284,
};

let vivants: Record<string, number> | null = null;
let lusLe = 0;
const DUREE = 24 * 60 * 60 * 1000;

/** Rafraichit les cours (une fois par jour au plus). Ne leve jamais. */
export async function rafraichirTaux(): Promise<void> {
    if (vivants && Date.now() - lusLe < DUREE) return;
    try {
        const r = await fetch("https://open.er-api.com/v6/latest/XOF", { signal: AbortSignal.timeout(5000), cache: "no-store" });
        const j: any = await r.json();
        if (j?.result === "success" && j.rates && typeof j.rates === "object") {
            // Un cours vivant qui s'ecarte de plus de 20 % de la table de repli est
            // suspect (API compromise ou en panne) : on garde la table pour lui.
            const taux: Record<string, number> = { ...j.rates, XOF: 1 };
            for (const [dev, ref] of Object.entries(TAUX_XOF_REPLI)) {
                const v = taux[dev];
                if (typeof v !== "number" || !(v > 0) || !(ref > 0) || Math.abs(v / ref - 1) > 0.2) taux[dev] = ref;
            }
            vivants = taux;
            lusLe = Date.now();
        }
    } catch {
        // on garde le dernier bon cours, ou la table de repli
    }
}

export const ZONES_FRANC = new Set(["XOF", "XAF"]);
const PARITE_EUR = 1 / 655.957;

/** Convertit un montant d'une devise a une autre, arrondi a la precision de la devise d'arrivee. */
export function convertir(montant: number, de: string, vers: string): number {
    return convertirAvecTaux(montant, de, vers, vivants || TAUX_XOF_REPLI);
}

/**
 * La meme conversion avec une table donnee (1 XOF -> devise). Cote navigateur,
 * la table vient du serveur (tauxActuels) : `vivants` n'y existe pas.
 */
export function convertirAvecTaux(montant: number, de: string, vers: string, taux: Record<string, number>): number {
    const d = String(de || "").toUpperCase();
    const v = String(vers || "").toUpperCase();
    if (d === v) return montant;
    // La parite franc/euro est fixe : un cours du marche ferait deriver le montant sans raison.
    if (ZONES_FRANC.has(d) && v === "EUR") return Math.round(montant * PARITE_EUR * 100) / 100;
    if (d === "EUR" && ZONES_FRANC.has(v)) return Math.round(montant / PARITE_EUR);
    const versXof = d === "XOF" ? 1 : 1 / (taux[d] || TAUX_XOF_REPLI[d] || 1);
    const brut = montant * versXof * (taux[v] || TAUX_XOF_REPLI[v] || 1);
    return DEVISES_SANS_CENTIMES.has(v) ? Math.round(brut) : Math.round(brut * 100) / 100;
}

/**
 * Les cours publies (1 XOF -> devise) : vivants s'ils ont ete lus, la table de
 * repli sinon ; zone franc et euro a parite fixe. Servis par /api/v1/taux au
 * navigateur (page de paiement).
 */
export function tauxActuels(): { taux: Record<string, number>; majLe: string | null } {
    const source = vivants || TAUX_XOF_REPLI;
    const taux: Record<string, number> = {};
    for (const code of Object.keys(TAUX_XOF_REPLI)) taux[code] = source[code] > 0 ? source[code] : TAUX_XOF_REPLI[code];
    taux.XOF = 1;
    taux.XAF = 1;
    taux.EUR = PARITE_EUR;
    return { taux, majLe: vivants ? new Date(lusLe).toISOString() : null };
}

/** La devise connue ? (sans cours, pas de conversion possible) */
export const convertible = (devise: string) => !!(vivants?.[devise] || TAUX_XOF_REPLI[devise] || devise === "XOF");

function paysDuTelephone(tel?: string | null): string | null {
    const brut = String(tel || "").trim();
    if (!brut) return null;
    try { return parsePhoneNumberFromString(brut.startsWith("+") ? brut : `+${brut.replace(/\D/g, "")}`)?.country || null; } catch { return null; }
}

export type Conversion = { devise: string; montant: number; taux: number; le: string; estime?: boolean };

/**
 * Le montant d'une transaction dans la monnaie du pays ou elle a ete payee :
 * celui pose au paiement (`metadata.conversion`), sinon une estimation au
 * cours du jour pour les paiements plus anciens que la regle. Une devise deja
 * locale, ou un pays inconnu, garde son montant d'origine.
 */
export function montantLocal(tx: { amount: number; currency?: string | null; customerPhone?: string | null; metadata?: any }): { montant: number; devise: string; converti: boolean; origine: { montant: number; devise: string } } {
    const devise = String(tx.currency || "XOF").toUpperCase();
    const origine = { montant: Number(tx.amount) || 0, devise };
    const c = tx.metadata?.conversion;
    if (c && c.devise && Number(c.montant) > 0) return { montant: Number(c.montant), devise: String(c.devise).toUpperCase(), converti: true, origine };
    const pays = paysDuTelephone(tx.customerPhone);
    const locale = deviseDuMoyen(tx.metadata?.methodCode) || (pays ? DEVISE_PAYS_CHECKOUT[pays] : null);
    if (!locale || locale === devise || !convertible(locale) || !convertible(devise)) return { montant: origine.montant, devise, converti: false, origine };
    return { montant: convertir(origine.montant, devise, locale), devise: locale, converti: true, origine };
}

/** Un montant d'exemple lisible dans une devise, l'equivalent arrondi de 5 000 XOF (8 USD, 100 GHS, 20 000 CDF...). */
export function montantExemple(devise: string): number {
    const brut = convertir(5000, "XOF", devise);
    if (!(brut > 0)) return 5000;
    const ordre = Math.pow(10, Math.floor(Math.log10(brut)));
    return Math.max(DEVISES_SANS_CENTIMES.has(String(devise).toUpperCase()) ? 1 : 0.01, Math.round(brut / ordre) * ordre);
}
