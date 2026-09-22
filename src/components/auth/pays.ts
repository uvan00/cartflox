/**
 * Tous les pays, avec leur drapeau. Les noms français viennent du navigateur
 * (Intl.DisplayNames) : rien à tenir à jour à la main. Les pays où Cartflox
 * encaisse le plus sont proposés en tête.
 */
import type { Option } from "@/components/auth/liste";

const CODES = ("AD AE AF AG AI AL AM AO AR AS AT AU AW AZ BA BB BD BE BF BG BH BI BJ BM BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CK CL CM CN CO CR CU CV CW CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WS YE YT ZA ZM ZW").split(" ");

const PRIORITAIRES = ["CI", "SN", "BJ", "TG", "BF", "ML", "NE", "GN", "CM", "GA", "CG", "CD", "GH", "NG", "MA", "FR"];

const SECOURS: Record<string, string> = {
    CI: "Côte d'Ivoire", SN: "Sénégal", BJ: "Bénin", TG: "Togo", BF: "Burkina Faso", ML: "Mali",
    NE: "Niger", GN: "Guinée", CM: "Cameroun", GA: "Gabon", CG: "Congo", CD: "République démocratique du Congo",
    GH: "Ghana", NG: "Nigéria", MA: "Maroc", FR: "France",
};

function nomDe(code: string): string {
    try {
        const d = new Intl.DisplayNames(["fr"], { type: "region" });
        return d.of(code) || SECOURS[code] || code;
    } catch {
        return SECOURS[code] || code;
    }
}


export function optionsPays(): Option[] {
    const tous = CODES.map((c) => ({ valeur: nomDe(c), libelle: nomDe(c), codePays: c }))
        .sort((a, b) => a.libelle.localeCompare(b.libelle, "fr"));
    return [
        ...PRIORITAIRES.map((c) => ({ valeur: nomDe(c), libelle: nomDe(c), codePays: c, groupe: "Les plus courants" })),
        ...tous.map((p) => ({ ...p, groupe: "Tous les pays" })),
    ];
}

export const SECTEURS: Option[] = [
    "E-commerce ou boutique en ligne", "Boutique physique", "Restauration et alimentation",
    "Services et prestations", "Freelance et créateur", "Éducation et formation",
    "Santé et bien-être", "Mode et beauté", "Transport et livraison", "Immobilier",
    "Événementiel et billetterie", "ONG et association", "Autre",
].map((s) => ({ valeur: s, libelle: s }));
