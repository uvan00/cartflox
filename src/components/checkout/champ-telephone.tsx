"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import fr from "react-phone-number-input/locale/fr";
import { Drapeau } from "@/components/ui/drapeau";
import { champStyle } from "@/components/checkout/coque";
import type { CheckoutTheme } from "@/lib/checkout-themes";
import { completerBenin, PHONE_FORMAT } from "@/lib/formats-telephone";
import { nomPays, t, type Langue } from "@/lib/i18n-checkout";
import { paysDuVisiteur } from "@/lib/actions/pays-visiteur";

/**
 * Champ telephone avec drapeau et indicatif (page d'un lien de paiement).
 *
 * Le pays se choisit tout seul, la ou se trouve le client : d'abord le fuseau
 * horaire du telephone (immediat), puis le pays de son adresse IP (reponse du
 * serveur, quelques dixiemes de seconde plus tard), le pays du marchand faute
 * de mieux. Des que le client choisit un pays ou tape son numero, plus rien ne
 * le change a sa place. Un numero colle au format international (+237...)
 * choisit lui-meme son pays.
 */

const NOMS_FR = fr as unknown as Record<string, string>;

const PAYS = getCountries().map((code) => ({ code: code as string, nom: NOMS_FR[code] || code, indicatif: String(getCountryCallingCode(code)) }));
const CODES = new Set(PAYS.map((p) => p.code));

/** Pays servis par les passerelles : en tete de liste, comme sur la page de paiement. */
const PRIORITE = new Set(["CI", "SN", "BJ", "ML", "BF", "TG", "GN", "NE", "CM", "GA", "CG", "CD", "TD", "CF", "GH", "NG", "KE", "TZ", "RW", "UG", "ZA", "MG", "SL", "GW", "MR", "ZM", "MW", "MZ", "ET", "LS", "BI", "EG", "MA", "LR", "GM"]);

/** Fuseau horaire du telephone vers son pays (identifiants IANA, en minuscules). */
const FUSEAUX: Record<string, string> = {
    "africa/abidjan": "CI", "africa/accra": "GH", "africa/addis_ababa": "ET", "africa/algiers": "DZ", "africa/asmara": "ER",
    "africa/bamako": "ML", "africa/bangui": "CF", "africa/banjul": "GM", "africa/bissau": "GW", "africa/blantyre": "MW",
    "africa/brazzaville": "CG", "africa/bujumbura": "BI", "africa/cairo": "EG", "africa/casablanca": "MA", "africa/conakry": "GN",
    "africa/dakar": "SN", "africa/dar_es_salaam": "TZ", "africa/djibouti": "DJ", "africa/douala": "CM", "africa/el_aaiun": "EH",
    "africa/freetown": "SL", "africa/gaborone": "BW", "africa/harare": "ZW", "africa/johannesburg": "ZA", "africa/juba": "SS",
    "africa/kampala": "UG", "africa/khartoum": "SD", "africa/kigali": "RW", "africa/kinshasa": "CD", "africa/lagos": "NG",
    "africa/libreville": "GA", "africa/lome": "TG", "africa/luanda": "AO", "africa/lubumbashi": "CD", "africa/lusaka": "ZM",
    "africa/malabo": "GQ", "africa/maputo": "MZ", "africa/maseru": "LS", "africa/mbabane": "SZ", "africa/mogadishu": "SO",
    "africa/monrovia": "LR", "africa/nairobi": "KE", "africa/ndjamena": "TD", "africa/niamey": "NE", "africa/nouakchott": "MR",
    "africa/ouagadougou": "BF", "africa/porto-novo": "BJ", "africa/sao_tome": "ST", "africa/tripoli": "LY", "africa/tunis": "TN",
    "africa/windhoek": "NA", "atlantic/cape_verde": "CV", "indian/antananarivo": "MG", "indian/comoro": "KM", "indian/mauritius": "MU",
    "indian/mahe": "SC", "indian/reunion": "RE", "indian/mayotte": "YT",
    "europe/paris": "FR", "europe/brussels": "BE", "europe/luxembourg": "LU", "europe/zurich": "CH", "europe/london": "GB",
    "europe/berlin": "DE", "europe/madrid": "ES", "europe/rome": "IT", "europe/lisbon": "PT", "europe/amsterdam": "NL",
    "america/toronto": "CA", "america/montreal": "CA", "america/new_york": "US", "america/chicago": "US", "america/denver": "US",
    "america/los_angeles": "US", "asia/dubai": "AE", "asia/shanghai": "CN", "europe/istanbul": "TR",
};

const sansAccent = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

function paysDuFuseau(): string | null {
    try {
        const pays = FUSEAUX[Intl.DateTimeFormat().resolvedOptions().timeZone.toLowerCase()];
        return pays && CODES.has(pays) ? pays : null;
    } catch {
        return null;
    }
}

/** Pays d'un numero international (celui du marchand, pour le repli). */
export function paysDUnNumero(tel?: string | null): string | null {
    const chiffres = String(tel || "").replace(/\D/g, "");
    if (chiffres.length < 8) return null;
    try {
        const pays = parsePhoneNumberFromString(`+${chiffres}`)?.country;
        return pays && CODES.has(pays) ? pays : null;
    } catch {
        return null;
    }
}

/** Exemple a afficher et longueur maximale du numero national. */
function formatDe(pays: string) {
    const connu = PHONE_FORMAT[pays];
    if (connu) return { ...connu, connu: true };
    // Pays hors de la table : pas de compte de chiffres, la validation de libphonenumber suffit.
    return { placeholder: PHONE_FORMAT.DEFAULT.placeholder, maxLen: 15 - String(getCountryCallingCode(pays as CountryCode)).length, connu: false };
}

export type ValeurTelephone = { e164: string; erreur: string };

function analyser(chiffres: string, pays: string, langue: Langue): ValeurTelephone {
    const indicatif = String(getCountryCallingCode(pays as CountryCode));
    const d = completerBenin(chiffres, pays);
    if (!d) return { e164: "", erreur: "" };
    let numero: ReturnType<typeof parsePhoneNumberFromString> = undefined;
    try {
        numero = parsePhoneNumberFromString(d, pays as CountryCode) || parsePhoneNumberFromString(`+${indicatif}${d.replace(/^0+/, "")}`, pays as CountryCode);
    } catch {
        numero = undefined;
    }
    const e164 = numero?.number ? String(numero.number) : `+${indicatif}${d.replace(/^0+/, "")}`;
    const nom = nomPays(pays, langue, NOMS_FR[pays]);
    const format = formatDe(pays);
    if (format.connu && d.length < format.maxLen - 1) return { e164, erreur: t(langue, "numero_trop_court", { pays: nom, n: d.length, max: format.maxLen }) };
    if (!numero || !numero.isValid()) return { e164, erreur: t(langue, "numero_invalide_pour", { pays: nom }) };
    return { e164, erreur: "" };
}

export function ChampTelephone({ theme, langue, onChange, paysRepli, requis, id = "cf-telephone", erreurForcee }: {
    theme: CheckoutTheme;
    langue: Langue;
    /** Le numero au format international (+2250102030405) et son erreur, vide si le numero est bon. */
    onChange: (valeur: ValeurTelephone) => void;
    /** Pays a prendre quand ni le fuseau ni l'adresse IP ne disent rien. */
    paysRepli?: string | null;
    requis?: boolean;
    id?: string;
    /** Montrer l'erreur sans attendre que le client quitte le champ (il a voulu continuer). */
    erreurForcee?: boolean;
}) {
    const [pays, setPays] = useState(() => paysDuFuseau() || (paysRepli && CODES.has(paysRepli) ? paysRepli : "CI"));
    const [chiffres, setChiffres] = useState("");
    const [ouvert, setOuvert] = useState(false);
    const [recherche, setRecherche] = useState("");
    const [quitte, setQuitte] = useState(false);
    const choisi = useRef(false);
    const boite = useRef<HTMLDivElement>(null);
    const champ = useRef<HTMLInputElement>(null);

    // Le pays de l'adresse IP l'emporte sur le fuseau, tant que le client n'a rien choisi ni tape.
    useEffect(() => {
        let actif = true;
        paysDuVisiteur()
            .then((code) => { if (actif && code && CODES.has(code) && !choisi.current) setPays(code); })
            .catch(() => { /* on garde le pays devine */ });
        return () => { actif = false; };
    }, []);

    const indicatif = String(getCountryCallingCode(pays as CountryCode));
    const format = formatDe(pays);
    const valeur = useMemo(() => analyser(chiffres, pays, langue), [chiffres, pays, langue]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { onChange(valeur); }, [valeur]);

    // La liste se ferme d'un clic a cote ou avec Echap.
    useEffect(() => {
        if (!ouvert) return;
        const dehors = (e: Event) => { if (boite.current && !boite.current.contains(e.target as Node)) setOuvert(false); };
        const echap = (e: KeyboardEvent) => { if (e.key === "Escape") { setOuvert(false); champ.current?.focus(); } };
        document.addEventListener("mousedown", dehors);
        document.addEventListener("touchstart", dehors);
        document.addEventListener("keydown", echap);
        return () => {
            document.removeEventListener("mousedown", dehors);
            document.removeEventListener("touchstart", dehors);
            document.removeEventListener("keydown", echap);
        };
    }, [ouvert]);

    const liste = useMemo(() => {
        const q = sansAccent(recherche);
        const qChiffres = recherche.replace(/\D/g, "");
        const nomDe = (p: (typeof PAYS)[number]) => nomPays(p.code, langue, p.nom);
        const trouves = q
            ? PAYS.filter((p) => sansAccent(p.nom).includes(q) || sansAccent(nomDe(p)).includes(q) || p.code.toLowerCase() === q || (!!qChiffres && p.indicatif.startsWith(qChiffres)))
            : PAYS;
        return [...trouves].sort((a, b) => {
            if (a.code === pays) return -1;
            if (b.code === pays) return 1;
            const pa = PRIORITE.has(a.code) ? 0 : 1;
            const pb = PRIORITE.has(b.code) ? 0 : 1;
            if (pa !== pb) return pa - pb;
            return sansAccent(nomDe(a)).localeCompare(sansAccent(nomDe(b)));
        });
    }, [recherche, pays, langue]);

    const choisir = (code: string) => {
        choisi.current = true;
        setPays(code);
        setOuvert(false);
        setRecherche("");
        setChiffres((c) => c.slice(0, formatDe(code).maxLen));
        requestAnimationFrame(() => champ.current?.focus());
    };

    const saisir = (brut: string) => {
        choisi.current = true;
        const texte = brut.trim();
        // Numero international, colle ou propose par le navigateur : il dit lui-meme son pays.
        if (/^(\+|00)/.test(texte)) {
            let numero: ReturnType<typeof parsePhoneNumberFromString> = undefined;
            try { numero = parsePhoneNumberFromString(`+${texte.replace(/\D/g, "").replace(/^00/, "")}`); } catch { numero = undefined; }
            if (numero?.country && CODES.has(numero.country) && numero.isPossible()) {
                setPays(numero.country);
                setChiffres(String(numero.nationalNumber).slice(0, formatDe(numero.country).maxLen));
                return;
            }
        }
        let d = texte.replace(/\D/g, "");
        // Indicatif tape devant le numero (225..., 00225...) : retire des que le numero est trop long pour etre national.
        if (d.length > format.maxLen) {
            if (d.startsWith(`00${indicatif}`)) d = d.slice(indicatif.length + 2);
            else if (d.startsWith(indicatif)) d = d.slice(indicatif.length);
        }
        setChiffres(d.slice(0, format.maxLen));
    };

    const montrerErreur = (quitte || !!erreurForcee) && !!valeur.erreur;
    const nomChoisi = nomPays(pays, langue, NOMS_FR[pays]);

    return (
        <div ref={boite}>
            <div className="flex h-12 items-stretch overflow-hidden rounded-xl" style={champStyle(theme, montrerErreur)}>
                <button type="button" onClick={() => setOuvert((o) => !o)} aria-haspopup="listbox" aria-expanded={ouvert}
                    aria-label={`${t(langue, "changer_pays")} : ${nomChoisi} +${indicatif}`} title={nomChoisi}
                    className="flex shrink-0 items-center gap-1.5 pl-3.5 pr-2.5 transition-opacity hover:opacity-80"
                    style={{ borderRight: `1px solid ${theme.methodBorder}` }}>
                    <Drapeau code={pays} taille={14} />
                    <span className="text-[14px] font-medium tabular-nums" style={{ color: theme.textPrimary }}>+{indicatif}</span>
                    <ChevronDown size={13} style={{ color: theme.textMuted, transform: ouvert ? "rotate(180deg)" : undefined, transition: "transform .15s" }} />
                </button>
                <input ref={champ} id={id} required={requis} type="tel" inputMode="tel" autoComplete="tel"
                    placeholder={format.placeholder} value={chiffres}
                    onChange={(e) => saisir(e.target.value)}
                    onBlur={() => { setQuitte(true); if (pays === "BJ") setChiffres((c) => completerBenin(c, "BJ")); }}
                    aria-invalid={montrerErreur || undefined} aria-describedby={montrerErreur ? `${id}-erreur` : undefined}
                    className="h-full min-w-0 flex-1 bg-transparent px-3.5 outline-none" style={{ color: theme.textPrimary, fontSize: 16 }} />
            </div>
            {montrerErreur && <p id={`${id}-erreur`} className="mt-1.5 text-[11.5px]" style={{ color: "#ef4444" }}>{valeur.erreur}</p>}

            {ouvert && (
                <div className="mt-2 overflow-hidden rounded-xl" style={{ border: `1px solid ${theme.divider}`, background: theme.cardBg }}>
                    <div className="p-2">
                        <div className="relative mb-2">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: theme.textMuted }} />
                            <input autoFocus value={recherche} onChange={(e) => setRecherche(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (liste[0]) choisir(liste[0].code); } }}
                                placeholder={t(langue, "pays_ou_indicatif")} aria-label={t(langue, "pays_ou_indicatif")}
                                className="h-9 w-full rounded-lg pl-9 pr-3 outline-none" style={champStyle(theme)} />
                        </div>
                        <div role="listbox" aria-label={t(langue, "pays_ou_indicatif")} className="max-h-[220px] overflow-y-auto">
                            {liste.map((p) => {
                                const actif = p.code === pays;
                                return (
                                    <button key={p.code} type="button" role="option" aria-selected={actif} onClick={() => choisir(p.code)}
                                        className="flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left transition-colors"
                                        style={{ background: actif ? theme.methodSelectedBg : "transparent" }}
                                        onMouseEnter={(e) => { if (!actif) e.currentTarget.style.background = theme.methodHoverBg; }}
                                        onMouseLeave={(e) => { if (!actif) e.currentTarget.style.background = "transparent"; }}>
                                        <Drapeau code={p.code} taille={14} />
                                        <span className="min-w-0 flex-1 truncate text-[13px]" style={{ color: theme.textPrimary }}>{nomPays(p.code, langue, p.nom)}</span>
                                        <span className="shrink-0 text-[12px] tabular-nums" style={{ color: theme.textMuted }}>+{p.indicatif}</span>
                                        {actif && <Check size={13} className="shrink-0" style={{ color: theme.methodSelectedBorder }} />}
                                    </button>
                                );
                            })}
                            {liste.length === 0 && <p className="px-2.5 py-3 text-[12.5px]" style={{ color: theme.textMuted }}>{t(langue, "aucun_pays")}</p>}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
