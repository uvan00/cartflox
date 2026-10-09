import { COUNTRIES } from "@/lib/countries";

/**
 * Pays, devises et zones monetaires : une seule table pour les portefeuilles,
 * la vue d'ensemble et les incidents. Aucun appel serveur : utilisable des
 * deux cotes.
 */

/** Devise de chaque pays ou l'on encaisse. */
export const DEVISE_DU_PAYS: Record<string, string> = {
    // UEMOA
    CI: "XOF", SN: "XOF", BJ: "XOF", ML: "XOF", BF: "XOF", TG: "XOF", NE: "XOF", GW: "XOF",
    // CEMAC
    CM: "XAF", GA: "XAF", CG: "XAF", TD: "XAF", CF: "XAF", GQ: "XAF",
    // Le reste de l'Afrique
    GN: "GNF", CD: "CDF", GH: "GHS", NG: "NGN", KE: "KES", TZ: "TZS", UG: "UGX", RW: "RWF",
    ZA: "ZAR", ZM: "ZMW", MW: "MWK", MZ: "MZN", AO: "AOA", ET: "ETB", MG: "MGA", SL: "SLE",
    MR: "MRU", LS: "LSL", LR: "LRD", SS: "SSP", BI: "BIF", ZW: "ZWG", MA: "MAD", EG: "EGP",
    TN: "TND", DZ: "DZD", GM: "GMD", CV: "CVE",
};

/** Codes a trois lettres (ceux de PawaPay) vers les codes a deux lettres. */
export const ISO3_VERS_ISO2: Record<string, string> = {
    CIV: "CI", SEN: "SN", BEN: "BJ", MLI: "ML", BFA: "BF", TGO: "TG", NER: "NE", GNB: "GW",
    CMR: "CM", GAB: "GA", COG: "CG", TCD: "TD", CAF: "CF", GNQ: "GQ", GIN: "GN", COD: "CD",
    GHA: "GH", NGA: "NG", KEN: "KE", TZA: "TZ", UGA: "UG", RWA: "RW", ZAF: "ZA", ZMB: "ZM",
    MWI: "MW", MOZ: "MZ", AGO: "AO", ETH: "ET", MDG: "MG", SLE: "SL", MRT: "MR", LSO: "LS",
    LBR: "LR", SSD: "SS", BDI: "BI", ZWE: "ZW", MAR: "MA", EGY: "EG", TUN: "TN", DZA: "DZ",
    GMB: "GM", CPV: "CV",
};

/** Les zones qui partagent une devise : un portefeuille, plusieurs pays. */
const ZONES: Record<string, string> = {
    XOF: "Zone franc UEMOA",
    XAF: "Zone franc CEMAC",
};

const NOMS: Record<string, string> = Object.fromEntries(COUNTRIES.map((c) => [c.code, c.name]));
// Noms courts, lisibles dans une colonne de tableau.
const COURTS: Record<string, string> = { CD: "RD Congo", CG: "Congo", CF: "Centrafrique", GQ: "Guinée équatoriale", GW: "Guinée-Bissau", SS: "Soudan du Sud" };

export function nomPays(code?: string | null): string {
    const c = String(code || "").toUpperCase();
    return COURTS[c] || NOMS[c] || c;
}

/** Les pays d'une devise, parmi une liste (ceux ou l'espace encaisse). */
export function paysDeLaDevise(devise: string, parmi?: string[]): string[] {
    const d = String(devise || "").toUpperCase();
    const tous = Object.entries(DEVISE_DU_PAYS).filter(([, v]) => v === d).map(([k]) => k);
    return parmi ? tous.filter((p) => parmi.includes(p)) : tous;
}

/** Le nom d'un portefeuille : le pays s'il est seul, la zone sinon, la devise a defaut. */
export function nomPortefeuille(devise: string, pays: string[]): string {
    if (pays.length === 1) return nomPays(pays[0]);
    return ZONES[String(devise || "").toUpperCase()] || (pays.length > 1 ? `${pays.length} pays` : String(devise || "").toUpperCase());
}

/**
 * Devises qu'un espace peut choisir comme la sienne (Parametres > Entreprise).
 * Seulement celles que la plateforme sait convertir : la page de paiement
 * ramene le montant a la monnaie du pays du payeur (src/lib/taux-change.ts).
 */
export const DEVISES_ESPACE: { code: string; nom: string }[] = [
    { code: "XOF", nom: "Franc CFA, Afrique de l'Ouest" },
    { code: "XAF", nom: "Franc CFA, Afrique centrale" },
    { code: "GNF", nom: "Franc guinéen" },
    { code: "CDF", nom: "Franc congolais" },
    { code: "RWF", nom: "Franc rwandais" },
    { code: "GHS", nom: "Cedi ghanéen" },
    { code: "NGN", nom: "Naira nigérian" },
    { code: "KES", nom: "Shilling kényan" },
    { code: "TZS", nom: "Shilling tanzanien" },
    { code: "UGX", nom: "Shilling ougandais" },
    { code: "ZMW", nom: "Kwacha zambien" },
    { code: "MWK", nom: "Kwacha malawite" },
    { code: "MZN", nom: "Metical mozambicain" },
    { code: "ZAR", nom: "Rand sud-africain" },
    { code: "AOA", nom: "Kwanza angolais" },
    { code: "ETB", nom: "Birr éthiopien" },
    { code: "MGA", nom: "Ariary malgache" },
    { code: "SLE", nom: "Leone sierra-léonais" },
    { code: "MRU", nom: "Ouguiya mauritanien" },
    { code: "MAD", nom: "Dirham marocain" },
    { code: "DZD", nom: "Dinar algérien" },
    { code: "TND", nom: "Dinar tunisien" },
    { code: "EGP", nom: "Livre égyptienne" },
    { code: "USD", nom: "Dollar américain" },
    { code: "EUR", nom: "Euro" },
    { code: "GBP", nom: "Livre sterling" },
];
const CODES_ESPACE = new Set(DEVISES_ESPACE.map((d) => d.code));
export const estDeviseEspace = (d?: string | null) => CODES_ESPACE.has(String(d || "").trim().toUpperCase());

const normaliser = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[\u2019`]/g, "'").replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
const ALIAS_PAYS: Record<string, string> = {
    rdc: "CD", "rd congo": "CD", "congo kinshasa": "CD", "republique democratique du congo": "CD",
    congo: "CG", "congo brazzaville": "CG", "cote d'ivoire": "CI", "cote divoire": "CI", "ivory coast": "CI",
    guinee: "GN", "guinee conakry": "GN", cameroon: "CM", senegal: "SN",
};
/** Pays d'un libelle saisi a la main dans un profil (« Côte d’Ivoire », « RDC », « Cameroun », « CI »). */
export function paysDuNomLibre(texte?: string | null): string | null {
    const t = normaliser(String(texte || ""));
    if (!t) return null;
    if (/^[a-z]{2}$/.test(t) && NOMS[t.toUpperCase()]) return t.toUpperCase();
    if (ALIAS_PAYS[t]) return ALIAS_PAYS[t];
    return COUNTRIES.find((c) => normaliser(c.name) === t)?.code || null;
}
