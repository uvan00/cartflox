/**
 * Formats de numeros par pays, partages par la page de paiement (/checkout) et
 * les pages de lien (/pay) : exemple a afficher et longueur du numero national.
 */
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

// Zones ou les numeros circulent d'un pays a l'autre : un marchand de la zone y
// recoit des clients de toute la zone (UEMOA, puis CEMAC).
const ZONES_NUMEROS: string[][] = [
    ['BJ', 'BF', 'CI', 'GW', 'ML', 'NE', 'SN', 'TG'],
    ['CM', 'CF', 'CG', 'GA', 'GQ', 'TD'],
];
const zoneDe = (code: string | null) => (code ? ZONES_NUMEROS.find((z) => z.includes(code)) ?? [] : []);

const valideEn = (chiffres: string, code: string) => {
    const n = parsePhoneNumberFromString(chiffres, code as CountryCode);
    return !!n && n.isValid() && n.country === code;
};

/**
 * Pays du numero recu avec la transaction (customer_phone de la session), lu
 * avec son contexte.
 *
 * Un site marchand colle souvent SON indicatif devant le numero que le client a
 * tape : « +229 » devant 07 12 34 56 78, numero ivoirien (vu le 04/10/2026), et
 * meme devant un 01 ivoirien, que le Benin accepte aussi. Et les memes chiffres
 * sont souvent valides dans plusieurs pays (07 12 34 56 78 : Cote d'Ivoire,
 * France, Maroc, Kenya). L'indicatif seul ne suffit donc pas. Dans l'ordre :
 * 1. le pays ou se trouve le client, si le numero y est valide et que le
 *    marchand y encaisse en local ;
 * 2. le pays de l'indicatif recu, si le numero y est valide ;
 * 3. un pays ou le numero est valide et ou le marchand encaisse en local : la
 *    zone de l'indicatif recu d'abord, puis celle du client, puis le pays du
 *    marchand, puis les autres.
 * Sinon null : la page garde ses autres reperes. Le mobile money passe par le
 * pays du numero : c'est lui qui decide des moyens proposes et de la devise.
 */
export function paysDuNumeroRecu(o: {
    /** Numero national recu, sans indicatif. */
    chiffres: string;
    /** Pays de l'indicatif recu, s'il y en avait un. */
    declare: string | null;
    /** Pays de l'adresse IP du client. */
    client: string | null;
    /** Pays ou le marchand a un moyen de paiement local (hors carte mondiale). */
    locaux: string[];
    /** Pays du marchand. */
    marchand: string | null;
}): string | null {
    const chiffres = o.chiffres.replace(/\D/g, '');
    if (chiffres.length < 6) return null;
    if (o.client && o.locaux.includes(o.client) && valideEn(chiffres, o.client)) return o.client;
    if (o.declare && valideEn(chiffres, o.declare)) return o.declare;
    const ordre = [...zoneDe(o.declare), ...zoneDe(o.client), ...(o.marchand ? [o.marchand] : []), ...o.locaux];
    return ordre.find((c) => o.locaux.includes(c) && valideEn(chiffres, c)) ?? null;
}

// Bénin : depuis le 30 novembre 2024, tous les numéros ont 10 chiffres, l'ancien
// numéro à 8 précédé de 01. Un client qui tape encore ses 8 chiffres par habitude
// obtient le 01 tout seul, plutôt qu'un refus.
export const completerBenin = (chiffres: string, pays: string) =>
    pays === 'BJ' && chiffres.length === 8 ? `01${chiffres}` : chiffres;

// ── Phone format per country: { placeholder, maxLen (local digits including leading zero if any) }
// Sources: ITU / Wikipedia / operator sites - updated 2024/2025
export const PHONE_FORMAT: Record<string, { placeholder: string; maxLen: number }> = {
    // UEMOA
    CI: { placeholder: '07 XX XX XX XX', maxLen: 10 }, // 10 digits since Jan 2021 (07=Orange, 05=MTN, 01=Moov/Wave)
    SN: { placeholder: '77 XXX XX XX',   maxLen: 9  }, // 9 digits (70/75/76/77/78)
    BJ: { placeholder: '01 97 XX XX XX', maxLen: 10 }, // 10 chiffres depuis le 30 nov. 2024 : le préfixe 01 devant l'ancien numéro à 8
    ML: { placeholder: '76 XX XX XX',    maxLen: 8  }, // 8 digits (70-79)
    BF: { placeholder: '76 XX XX XX',    maxLen: 8  }, // 8 digits (70-77)
    TG: { placeholder: '92 XX XX XX',    maxLen: 8  }, // 8 digits (90-99)
    NE: { placeholder: '93 XX XX XX',    maxLen: 8  }, // 8 digits (90-99)
    GW: { placeholder: '96 XXX XX',      maxLen: 7  }, // 7 digits (96x/95x)
    // CEMAC
    CM: { placeholder: '6XX XXX XXX',    maxLen: 9  }, // 9 digits (starts with 6)
    GA: { placeholder: '07 XX XX XX',    maxLen: 8  }, // 8 digits (07x/06x/04x)
    CG: { placeholder: '06 XXX XX XX',   maxLen: 9  }, // 9 digits
    CD: { placeholder: '81X XXX XXX',    maxLen: 10 }, // 10 chiffres avec le 0 (81x/82x/84x/85x/89x/90x/97x/99x)
    TD: { placeholder: '63 XX XX XX',    maxLen: 8  }, // 8 digits
    CF: { placeholder: '75 XX XX XX',    maxLen: 8  }, // 8 digits
    // Other African
    GN: { placeholder: '628 XX XX XX',   maxLen: 9  }, // 9 digits (62x/63x/64x/65x/66x)
    GH: { placeholder: '054 XXX XXXX',   maxLen: 10 }, // 10 chiffres avec le 0 (020/023/024/026/027/028/050/054/055/057/059)
    NG: { placeholder: '0803 XXX XXXX',  maxLen: 11 }, // 11 chiffres avec le 0 (070/080/081/090/091)
    KE: { placeholder: '712 XXX XXX',    maxLen: 10 }, // 10 chiffres avec le 0 (07xx)
    TZ: { placeholder: '7XX XXX XXX',    maxLen: 10 }, // 10 chiffres avec le 0
    UG: { placeholder: '75X XXX XXX',    maxLen: 10 }, // 10 chiffres avec le 0
    RW: { placeholder: '78X XXX XXX',    maxLen: 10 }, // 10 chiffres avec le 0
    ZA: { placeholder: '71 XXX XXXX',    maxLen: 10 }, // 10 chiffres avec le 0
    MG: { placeholder: '32X XX XXX',     maxLen: 10 }, // 10 chiffres avec le 0 (032/33x/34x/38x)
    SL: { placeholder: '76 XX XXXX',     maxLen: 8  }, // 8 digits
    MR: { placeholder: '36 XX XX XX',    maxLen: 8  }, // 8 digits
    // Afrique de l'Est et australe (couverture PawaPay, Flutterwave, Paystack)
    ZM: { placeholder: '097 XXX XXXX',   maxLen: 10 }, // 10 chiffres avec le 0 (095 Zamtel, 096 MTN, 097 Airtel)
    MW: { placeholder: '099 XXX XXXX',   maxLen: 10 }, // 10 chiffres avec le 0 (088 TNM, 099 Airtel)
    MZ: { placeholder: '84 XXX XXXX',    maxLen: 9  }, // 9 chiffres (82/83 Movitel, 84/85 Vodacom, 86/87 Tmcel)
    ET: { placeholder: '09XX XXX XXX',   maxLen: 10 }, // 10 chiffres avec le 0 (09 Ethio telecom, 07 Safaricom)
    BI: { placeholder: '79 XX XX XX',    maxLen: 8  }, // 8 chiffres
    LS: { placeholder: '5X XXX XXX',     maxLen: 8  }, // 8 chiffres (5x Vodacom, 6x Econet)
    ZW: { placeholder: '077 XXX XXXX',   maxLen: 10 }, // 10 chiffres avec le 0 (071 NetOne, 073 Telecel, 077/078 Econet)
    BW: { placeholder: '71 XXX XXX',     maxLen: 8  }, // 8 chiffres
    NA: { placeholder: '081 XXX XXXX',   maxLen: 10 }, // 10 chiffres avec le 0
    AO: { placeholder: '9XX XXX XXX',    maxLen: 9  }, // 9 chiffres
    // Afrique de l'Ouest anglophone et lusophone
    LR: { placeholder: '077 XXX XXXX',   maxLen: 10 }, // 10 chiffres avec le 0 (077 Lonestar MTN, 088 Orange)
    GM: { placeholder: '3XX XXXX',       maxLen: 7  }, // 7 chiffres
    CV: { placeholder: '9XX XX XX',      maxLen: 7  }, // 7 chiffres
    // Afrique du Nord
    MA: { placeholder: '06 XX XX XX XX', maxLen: 10 }, // 10 chiffres avec le 0 (06/07)
    DZ: { placeholder: '05 XX XX XX XX', maxLen: 10 }, // 10 chiffres avec le 0 (05/06/07)
    TN: { placeholder: '2X XXX XXX',     maxLen: 8  }, // 8 chiffres
    EG: { placeholder: '010 XXXX XXXX',  maxLen: 11 }, // 11 chiffres avec le 0 (010 Vodafone, 011 Etisalat, 012 Orange, 015 WE)
    // Océan Indien
    KM: { placeholder: '3XX XX XX',      maxLen: 7  }, // 7 chiffres
    MU: { placeholder: '5XXX XXXX',      maxLen: 8  }, // 8 chiffres
    SC: { placeholder: '2 XXX XXX',      maxLen: 7  }, // 7 chiffres
    // Default
    DEFAULT: { placeholder: 'XX XX XX XX', maxLen: 10 },
};

export function getPhoneFormat(countryCode: string) {
    return PHONE_FORMAT[countryCode] || PHONE_FORMAT.DEFAULT;
}
