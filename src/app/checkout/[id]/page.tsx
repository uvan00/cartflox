"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { MARQUE } from "@/lib/marque";
import { motion, AnimatePresence } from "framer-motion";
import { preconnect } from "react-dom";
import { DEVISE_PAYS_CHECKOUT, TAUX_XOF_REPLI, convertirAvecTaux, deviseDuMoyen } from "@/lib/taux-change";
import {
    Zap, Loader2, Check, Search, ChevronDown, Lock, Globe,
    Smartphone as Phone, CheckCircle2, X, Star, Copy, ArrowRight, ShieldCheck,
} from "lucide-react";
import { FlaskConical as IconeFiole } from "lucide-react";
import { getCountries, getCountryCallingCode } from 'react-phone-number-input/input';
import fr from 'react-phone-number-input/locale/fr';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { getPublicTransaction } from "@/lib/actions/transactions";
import { journaliserEchecCarte } from "@/lib/actions/echec-carte";
import { qrDuPaiement } from "@/lib/actions/qr-paiement";
import { getPaymentMethodsByAppId } from "@/lib/actions/methods";
import { paysDuVisiteur } from "@/lib/actions/pays-visiteur";
import { lookupPayer, updatePayerAfterPayment } from "@/lib/actions/payer-identity";
import { useParams, useRouter } from "next/navigation";
import { goeyToast } from "goey-toast";
import { getThemeById, DEFAULT_THEME, type CheckoutTheme } from "@/lib/checkout-themes";
import { DEFAULT_STYLE, styleCheckout, type CheckoutStyleId } from "@/lib/checkout-styles";
import {
    Coque, PanneauMarchand, PiedCarte, BoutonPrincipal, BoutonSecondaire, Etiquette, Alerte, LogosOperateurs, champStyle, whatsappMarchand,
} from "@/components/checkout/coque";
import { Drapeau } from "@/components/ui/drapeau";
import { completerBenin, getPhoneFormat, paysDuNumeroRecu } from "@/lib/formats-telephone";
import { getOperatorKey } from "@/lib/catalogue-moyens";
import { useLangue, t, nomPays, localeNombre, type Langue, type Cle } from "@/lib/i18n-checkout";

/**
 * Page de paiement hebergee. La logique (methodes, telephone, OTP, redirection,
 * suivi du statut, identite Cartflox, paiement express) est inchangee ; la
 * presentation suit la coque commune a deux colonnes.
 */

// SECURITY (open redirect): only follow http(s) absolute URLs. Blocks javascript:
// and other dangerous schemes from merchant-supplied success_url/cancel_url.
/** Ce que l'acheteur peut lire : un message anglais ou technique devient une phrase generique. */
function messageAcheteur(brut: unknown, langue: Langue, defaut: string): string {
    const m = typeof brut === "string" ? brut.trim() : "";
    if (!m) return defaut;
    if (/too many requests|rate limit|trop de (requêtes|tentatives)/i.test(m)) return t(langue, "trop_de_tentatives");
    if (/pas encore activé chez ce marchand/i.test(m)) return t(langue, "moyen_non_active");
    if (/^[A-Za-z0-9 _.,'":()/-]{0,200}$/.test(m) && /\b(the|please|invalid|error|failed|not|request)\b/i.test(m)) return defaut;
    return m;
}

function safeRedirect(raw: unknown) {
    if (typeof raw !== "string" || !raw) return;
    try {
        const u = new URL(raw, window.location.origin);
        if (u.protocol === "http:" || u.protocol === "https:") {
            window.location.href = u.href;
        }
    } catch { /* ignore malformed URL */ }
}

/** Adresse http(s) sure pour un lien affiche, sinon null. */
function urlSure(raw: unknown): string | null {
    if (typeof raw !== "string" || !raw) return null;
    try {
        const u = new URL(raw);
        return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
    } catch { return null; }
}

// Redirection provider (Wave, pages hebergees...) quand le checkout est embarque
// dans une bottom-sheet (Ma Boutique / widget) : les pages providers refusent
// souvent l'iframe (X-Frame-Options), on demande donc au PARENT de naviguer.
// Repli : si le parent n'ecoute pas (widget tiers), l'iframe navigue elle-meme
// comme avant.
function redirectViaParent(raw: unknown) {
    if (typeof raw !== "string" || !raw) return;
    try {
        const u = new URL(raw, window.location.origin);
        if (u.protocol !== "http:" && u.protocol !== "https:") return;
        if (window.self !== window.top) {
            try { window.parent.postMessage({ type: "afriflow:redirect", url: u.href }, "*"); } catch { /* ignore */ }
            setTimeout(() => { window.location.href = u.href; }, 450);
        } else {
            window.location.href = u.href;
        }
    } catch { /* ignore malformed URL */ }
}

// Bac a sable sans passerelle configuree : un moyen fictif pour derouler le parcours.
const METHODE_TEST = { id: 'sandbox', gatewayId: 'sandbox', gateway: 'sandbox', code: 'sandbox', name: 'Mobile Money (test)', country: 'Test', flag: 'CI', type: 'MOBILE_MONEY', logo: '/icons/methods/momo.svg' };

// Use API route instead of server action - works on any browser without auth session
async function initiateSoftPayment(data: {
    transactionId: string;
    gatewayId: string;
    methodCode: string;
    customerDetails: { name: string; email: string; phone: string; country: string; otp?: string; };
    /** Carte : demander un formulaire a monter ici plutot qu'une redirection. */
    inline?: boolean;
}): Promise<any> {
    const res = await fetch('/api/checkout/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return res.json();
}


/**
 * Le refus d'une carte, dit simplement. Stripe repond en anglais et par code
 * (`do_not_honor`, `transaction_not_allowed`...) : l'acheteur y lit « ça n'a pas
 * marché » sans savoir quoi faire, et le marchand non plus. Chaque cas dit ici
 * QUI refuse et QUOI faire ensuite.
 */
const REFUS_CARTE: Record<string, { fr: string; en: string }> = {
    insufficient_funds: { fr: "Fonds insuffisants sur la carte. Essayez une autre carte ou payez par Mobile Money.", en: "Insufficient funds on the card. Try another card or pay with Mobile Money." },
    transaction_not_allowed: { fr: "Votre banque n'autorise pas ce type d'achat sur cette carte. Demandez-lui d'ouvrir les paiements en ligne à l'étranger, ou payez par Mobile Money.", en: "Your bank does not allow this type of purchase on this card. Ask them to enable online and international payments, or pay with Mobile Money." },
    do_not_honor: { fr: "Votre banque a refusé le paiement sans motif précis. Appelez-la, ou essayez une autre carte.", en: "Your bank declined the payment without a specific reason. Call them, or try another card." },
    try_again_later: { fr: "Votre banque a refusé le paiement pour le moment. Réessayez dans quelques minutes.", en: "Your bank declined the payment for now. Try again in a few minutes." },
    expired_card: { fr: "Cette carte est expirée.", en: "This card has expired." },
    incorrect_cvc: { fr: "Le code de sécurité (CVC) ne correspond pas à cette carte.", en: "The security code (CVC) does not match this card." },
    incorrect_number: { fr: "Le numéro de carte est incorrect.", en: "The card number is incorrect." },
    card_velocity_exceeded: { fr: "Votre banque a bloqué la carte après trop de tentatives. Attendez un moment avant de réessayer.", en: "Your bank blocked the card after too many attempts. Wait a while before trying again." },
    authentication_required: { fr: "Votre banque demande une confirmation (3-D Secure) qui n'a pas abouti. Recommencez et validez la demande de votre banque.", en: "Your bank asks for a confirmation (3-D Secure) that did not complete. Start again and approve your bank's request." },
    processing_error: { fr: "La banque n'a pas pu traiter le paiement. Réessayez dans quelques minutes.", en: "The bank could not process the payment. Try again in a few minutes." },
};
function messageCarte(erreur: any, langue: Langue): string | null {
    const cle = String(erreur?.decline_code || erreur?.code || "");
    const connu = REFUS_CARTE[cle];
    if (connu) return langue === "en" ? connu.en : connu.fr;
    if (erreur?.type === "validation_error") return langue === "en" ? "Some card details are missing or incorrect." : "Il manque une information sur la carte, ou elle est incorrecte.";
    if (cle === "card_declined") return langue === "en" ? "Your bank declined this card. Try another card or pay with Mobile Money." : "Votre banque a refusé cette carte. Essayez une autre carte, ou payez par Mobile Money.";
    return null;
}

const WORLD_COUNTRIES = getCountries().map(code => ({
    code, name: fr[code] || code, dial_code: `+${getCountryCallingCode(code)}`,
}));

/**
 * Le pays d'un moyen de paiement est stocke EN CLAIR dans la base (« Congo »,
 * « Guinée », « RD Congo »), alors que le selecteur tire ses noms de
 * react-phone-number-input, qui dit « Congo (République) », « Guinée
 * (République) », « République Démocratique du Congo ». L'egalite stricte
 * d'origine ne rapprochait donc RIEN pour ces pays : la carte de paiement
 * s'affichait VIDE, sans moyen ni bouton, et le client ne pouvait pas payer.
 * 7 libelles sur 37 tombaient dans ce trou, dont le Congo et la RD Congo,
 * presents chacun dans 23 espaces marchands.
 */
const ALIAS_PAYS: Record<string, string> = {
    "congo": "CG",
    "congo brazzaville": "CG",
    "republique du congo": "CG",
    "rd congo": "CD",
    "rdc": "CD",
    "congo kinshasa": "CD",
    "republique democratique du congo": "CD",
    "guinee": "GN",
    "guinee conakry": "GN",
    "chine": "CN",
    "royaume-uni": "GB",
    "royaume uni": "GB",
    "etats-unis": "US",
    "etats unis": "US",
};

/**
 * Etiquettes qui ne designent pas un pays mais « partout ». « europe » n'y est
 * PAS : les moyens ainsi etiquetes (SEPA, Sofort) ne doivent pas apparaitre a
 * un acheteur africain, et les montrer serait un changement de comportement,
 * pas une correction.
 */
const ZONES_MONDIALES = ["uemoa", "cemac", "international", "global"];

const sansAccent = (s: string) =>
    (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Ramene un libelle de pays a son code ISO, ou null si on ne sait pas. */
function codePays(libelle: string): string | null {
    const d = sansAccent(libelle);
    if (ALIAS_PAYS[d]) return ALIAS_PAYS[d];
    const trouve = WORLD_COUNTRIES.find(
        (c) => sansAccent(c.name) === d || c.code.toLowerCase() === d
    );
    return trouve ? trouve.code : null;
}

/**
 * Pays et numero suggeres par l'adresse : ?country=CI&phone=0102030405
 *
 * Le marchand peut ainsi ouvrir la page deja remplie, un champ de moins pour
 * son client. Les valeurs viennent de l'exterieur : on les nettoie et on ne
 * garde que ce qui a la bonne forme. Lu au moment de l'appel et non pendant le
 * rendu : pendant le rendu serveur, `window` n'existe pas et tout serait vide.
 */
function suggestionsDeLAdresse(): { pays: string | null; tel: string } {
    if (typeof window === 'undefined') return { pays: null, tel: '' };
    const p = new URLSearchParams(window.location.search);
    const pays = (p.get('country') || '').trim().toUpperCase();
    const tel = (p.get('phone') || '').replace(/\D/g, '');
    return {
        pays: /^[A-Z]{2}$/.test(pays) && WORLD_COUNTRIES.some(c => c.code === pays) ? pays : null,
        tel: tel.length >= 6 && tel.length <= 15 ? tel : '',
    };
}

// Formats de numeros par pays et regle du Benin : src/lib/formats-telephone.ts

// --- Express Pay: localStorage profile ---
const EXPRESS_KEY = 'afriflow_express';
interface ExpressProfile { phone: string; countryCode: string; methodId: string; methodName: string; lastUsed: number; }
const saveExpressProfile = (profile: ExpressProfile) => { try { localStorage.setItem(EXPRESS_KEY, JSON.stringify(profile)); } catch {} };
const loadExpressProfile = (): ExpressProfile | null => { try { const d = localStorage.getItem(EXPRESS_KEY); return d ? JSON.parse(d) : null; } catch { return null; } };

const getMethodMeta = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('orange')) return { color: '#FF6600', abbr: 'OM' };
    if (n.includes('wave')) return { color: '#1DC3E0', abbr: 'WV' };
    if (n.includes('mtn')) return { color: '#FFCC00', abbr: 'MTN' };
    if (n.includes('moov')) return { color: '#0066FF', abbr: 'MV' };
    if (n.includes('free')) return { color: '#E30613', abbr: 'FM' };
    if (n.includes('t-money') || n.includes('tmoney')) return { color: '#00A651', abbr: 'TM' };
    if (n.includes('visa') || n.includes('mastercard') || n.includes('card')) return { color: '#1A1F71', abbr: 'CB' };
    if (n.includes('bitcoin') || n.includes('btc')) return { color: '#F7931A', abbr: 'BTC' };
    if (n.includes('ethereum') || n.includes('eth')) return { color: '#627EEA', abbr: 'ETH' };
    if (n.includes('usdt') || n.includes('usdc')) return { color: '#26A17B', abbr: 'USD' };
    return { color: '#6B7280', abbr: name.slice(0, 2).toUpperCase() };
};

// Detect if a payment method requires a phone number (Mobile Money)
// or is a redirect provider (Card, Crypto, hosted checkout)
const isMobileMoneyMethod = (method: any): boolean => {
    if (!method) return true; // default: show phone
    const type = (method.type || '').toUpperCase();
    if (type === 'CARD') return false;
    const name = (method.name || '').toLowerCase();
    const code = (method.code || '').toLowerCase();
    // Crypto providers
    if (name.includes('bitcoin') || name.includes('ethereum') || name.includes('usdt') || name.includes('usdc') || name.includes('litecoin') || name.includes('btc') || name.includes('eth') || name.includes('ltc')) return false;
    // Card / hosted checkout codes
    if (code.startsWith('card') || code.includes('visa') || code.includes('mastercard')) return false;
    // Crypto codes
    if (code.includes('crypto') || code.includes('btc') || code.includes('eth') || code.includes('usdt') || code.includes('usdc') || code.includes('ltc')) return false;
    return true;
};

// Providers that have their own hosted checkout (redirect to their page)
// These do NOT need a phone number on our checkout
const REDIRECT_PROVIDERS = [
    // Stripe N'Y EST PLUS : sa carte se remplit sur notre page (Payment Element).
    // `isMobileMoneyMethod` renvoie deja false pour un moyen de type CARD, donc
    // aucun numero de telephone n'est demande pour autant.
    'flutterwave',  // Flutterwave Standard
    'cinetpay',     // CinetPay Checkout
    'coinbase',     // Coinbase Commerce
    'cryptomus',    // Cryptomus Checkout
    'kkiapay',      // Kkiapay Widget
    'lengopay',     // LengoPay (returns paymentUrl)
    'payplus',      // PayPlus Africa (returns payment_url)
    'paypal',       // PayPal : commande approuvee sur sa page, capturee au retour
    // PayTech, Magma OnePay, Paystack (GH/KE), MonetBill et FeexPay demandent le
    // numero ICI : la demande part sur le telephone depuis notre page.
    'djamo',        // Djamo Business : lien d'application affiche ICI (bouton + QR), pas de numero
    'wave',         // Wave Business : idem
];
// Providers on YOUR checkout with phone number (USSD push, no redirect):
// - paydunya (SoftPay/OTP)
// - qosic     (direct debit API)
// - pawapay   (USSD push)
// - hub2      (direct USSD push via payment-intents API)
// - notchpay  (direct USSD push via channel/phone)
// - fedapay   (direct USSD push via token trigger)
// - ipay      (poussee directe iPay Money sur le numero saisi)
const isRedirectOnlyProvider = (method: any): boolean => {
    if (!method) return false;
    const gateway = (method.gateway || '').toLowerCase();
    return REDIRECT_PROVIDERS.some(p => gateway.includes(p));
};

/** Nom d'affichage d'un moyen, sans le suffixe pays. */
const nomCourt = (name: string) => (name || '').replace(/ (CI|SN|BJ|ML|BF|TG|International|XOF|XAF|USD|EUR|GHS|NGN|KES|ZAR)$/i, '');

/** Ce que le client doit faire sur son telephone, par operateur, dans la langue de la page. */
const etapesConfirmation = (method: any, langue: Langue): string[] => {
    const n = (method?.name || '').toLowerCase();
    const maj = t(langue, "etape_page_maj");
    if (n.includes('mtn')) return [t(langue, "etape_mtn_1"), t(langue, "etape_mtn_2"), maj];
    if (n.includes('moov')) return [t(langue, "etape_moov_1"), t(langue, "etape_moov_2"), maj];
    if (n.includes('free')) return [t(langue, "etape_free_1"), t(langue, "etape_free_2"), maj];
    if (n.includes('orange')) return [t(langue, "etape_orange_1"), t(langue, "etape_orange_2"), maj];
    return [t(langue, "etape_defaut_1"), t(langue, "etape_defaut_2"), maj];
};

/** Etapes affichees quand le paiement se confirme dans une application (Wave, Djamo). */
const etapesApplication = (nom: string, langue: Langue): string[] => [
    t(langue, "etape_app_1", { nom }),
    t(langue, "etape_app_2"),
    t(langue, "etape_app_3"),
];

/**
 * Les animations d'attente du parcours (25/09/2026), a la place du rouet a
 * eclair et du halo qui battait autour d'une icone wifi. Un anneau de progres
 * tourne autour du logo de l'operateur pendant la connexion et la
 * verification ; un telephone vibre, avec sa pastille de notification, tant
 * que le client doit confirmer ; trois points respirent a la place d'un
 * rouet. Un seul mouvement par ecran, et rien pour qui a demande moins
 * d'animations (motion-safe).
 */
function AnneauAttente({ theme, children }: { theme: CheckoutTheme; children: React.ReactNode }) {
    return (
        <div className="relative grid h-16 w-16 place-content-center" aria-hidden="true">
            <svg className="absolute inset-0 h-16 w-16 motion-safe:animate-spin" style={{ animationDuration: "1.8s" }} viewBox="0 0 64 64" fill="none">
                <circle cx="32" cy="32" r="29.5" stroke={theme.divider} strokeWidth="2.5" />
                <motion.circle cx="32" cy="32" r="29.5" stroke={theme.accent} strokeWidth="2.5" strokeLinecap="round"
                    initial={{ pathLength: 0.12 }} animate={{ pathLength: [0.12, 0.72, 0.12] }} transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }} />
            </svg>
            <span className="grid h-11 w-11 place-content-center overflow-hidden rounded-full" style={{ background: theme.methodHoverBg }}>{children}</span>
        </div>
    );
}

function TelephoneQuiVibre({ theme }: { theme: CheckoutTheme }) {
    return (
        <div className="relative grid h-16 w-16 place-content-center rounded-full" style={{ background: theme.methodSelectedBg, color: theme.methodSelectedBorder }} aria-hidden="true">
            <motion.span className="grid" animate={{ rotate: [0, -9, 9, -7, 7, -3, 3, 0] }} transition={{ repeat: Infinity, duration: 0.8, repeatDelay: 1.6, ease: "easeInOut" }}>
                <Phone size={26} />
            </motion.span>
            <span className="absolute right-3 top-3 grid h-3 w-3 place-content-center">
                <span className="absolute inset-0 rounded-full motion-safe:animate-ping" style={{ background: theme.accent, opacity: 0.45, animationDuration: "2.4s" }} />
                <span className="relative h-2.5 w-2.5 rounded-full" style={{ background: theme.accent, boxShadow: `0 0 0 2px ${theme.cardBg}` }} />
            </span>
        </div>
    );
}

function PointsAttente({ couleur }: { couleur: string }) {
    return (
        <span className="inline-flex items-center gap-1" aria-hidden="true">
            {[0, 1, 2].map((i) => (
                <motion.span key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: couleur }}
                    animate={{ opacity: [0.25, 1, 0.25] }} transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2, ease: "easeInOut" }} />
            ))}
        </span>
    );
}

/**
 * Ecran de verification (25/09/2026), a la place de la loupe qui faisait
 * croire a une page de recherche : le logo de l'operateur dans l'anneau, et
 * ou en est le paiement en trois etapes. L'anneau reste le seul mouvement.
 * Au bout de 30 secondes sans reponse, une ligne rassure et dit de ne pas
 * payer une seconde fois.
 */
function EcranVerification({ theme, tr, logo, repondant, numero, onRetour }: {
    theme: CheckoutTheme;
    tr: (cle: Cle, valeurs?: Record<string, string | number>) => string;
    logo?: string | null;
    repondant: string;
    numero?: string | null;
    onRetour: () => void;
}) {
    const [lente, setLente] = useState(false);
    useEffect(() => {
        const minuteur = setTimeout(() => setLente(true), 30_000);
        return () => clearTimeout(minuteur);
    }, []);
    const etapes: { texte: string; detail?: string | null; etat: "fait" | "en_cours" | "a_venir" }[] = [
        { texte: tr("verif_demande_envoyee"), detail: numero, etat: "fait" },
        { texte: tr("verif_reponse_de", { nom: repondant }), etat: "en_cours" },
        { texte: tr("verif_paiement_confirme"), etat: "a_venir" },
    ];
    return (
        <div className="flex flex-col gap-5 px-6 py-7">
            <div className="flex flex-col items-center gap-3 text-center">
                <AnneauAttente theme={theme}>
                    {logo ? <img src={logo} alt="" className="h-6 w-6 object-contain" /> : <ShieldCheck size={22} style={{ color: theme.accent }} />}
                </AnneauAttente>
                <div>
                    <h2 className="text-[17px] font-semibold tracking-tight" style={{ color: theme.textPrimary }}>{tr("verification_paiement")}</h2>
                    <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: theme.textMuted }}>{tr("verification_texte", { nom: repondant })}</p>
                </div>
            </div>
            <ol className="flex flex-col rounded-xl p-4" style={{ background: theme.methodHoverBg }}>
                {etapes.map((e, i) => (
                    <li key={i} aria-current={e.etat === "en_cours" ? "step" : undefined} className="relative flex items-start gap-3 pb-4 last:pb-0">
                        {i < etapes.length - 1 && (
                            <span className="absolute bottom-0.5 left-[9.5px] top-[23px] w-px" style={{ background: e.etat === "fait" ? theme.accent : theme.methodBorder }} aria-hidden="true" />
                        )}
                        {e.etat === "fait" ? (
                            <span className="grid h-5 w-5 shrink-0 place-content-center rounded-full" style={{ background: theme.accent, color: theme.accentText }}><Check size={11} strokeWidth={3} /></span>
                        ) : (
                            <span className="grid h-5 w-5 shrink-0 place-content-center rounded-full" style={{ background: theme.cardBg, border: `1.5px solid ${e.etat === "en_cours" ? theme.accent : theme.methodBorder}` }}>
                                {e.etat === "en_cours" && <span className="h-2 w-2 rounded-full" style={{ background: theme.accent }} />}
                            </span>
                        )}
                        <span className="flex min-w-0 flex-1 items-center justify-between gap-3 text-[13px] leading-5">
                            <span className={e.etat === "en_cours" ? "font-semibold" : "font-medium"} style={{ color: e.etat === "a_venir" ? theme.textMuted : theme.textPrimary }}>{e.texte}</span>
                            {e.detail && <span className="truncate text-[12px] tabular-nums" style={{ color: theme.textMuted }}>{e.detail}</span>}
                        </span>
                    </li>
                ))}
            </ol>
            <div className="flex flex-col items-center gap-2 text-center">
                <AnimatePresence>
                    {lente && (
                        <motion.p key="lente" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[12px] leading-relaxed" style={{ color: theme.textSecondary }} role="status">
                            {tr("verif_lente")}
                        </motion.p>
                    )}
                </AnimatePresence>
                <button type="button" onClick={onRetour} className="text-[12px] underline underline-offset-2" style={{ color: theme.textMuted }}>{tr("retour")}</button>
            </div>
        </div>
    );
}

export default function CheckoutPage() {
    const params = useParams();
    const router = useRouter();
    const transactionId = params.id as string;
    // Langue de la page (adresse, choix memorise, navigateur) et raccourci de traduction.
    const { langue, changerLangue } = useLangue();
    const tr = (cle: Cle, valeurs?: Record<string, string | number>) => t(langue, cle, valeurs);
    // Un moyen grise dit pourquoi : sous le minimum d'une passerelle, ce minimum
    // (« A partir de 200 XOF ») ; sinon, la panne passagere.
    const etiquetteIndisponible = (m: any) => m?.minimum
        ? tr("a_partir_de", { montant: new Intl.NumberFormat(localeNombre(langue)).format(Number(m.minimum.montant)), devise: String(m.minimum.devise) })
        : tr("indisponible");

    // Code a scanner pour finir le paiement sur telephone. Rendu cote serveur
    // (la fabrication du QR utilise sharp), demande une seule fois.
    const [qrPaiement, setQrPaiement] = useState<string | null>(null);
    useEffect(() => {
        if (!transactionId) return;
        let vivant = true;
        qrDuPaiement(transactionId).then((d) => { if (vivant) setQrPaiement(d); }).catch(() => { });
        return () => { vivant = false; };
    }, [transactionId]);

    const [transaction, setTransaction] = useState<any>(null);
    const [methods, setMethods] = useState<any[]>([]);
    const [checkoutTheme, setCheckoutTheme] = useState<CheckoutTheme>(DEFAULT_THEME);
    // Le style (la disposition) choisi par le marchand dans ses reglages ;
    // `?style=` dans l'adresse l'emporte, pour l'apercu depuis les reglages.
    const [styleMarchand, setStyleMarchand] = useState<CheckoutStyleId>(DEFAULT_STYLE);
    const [styleForce, setStyleForce] = useState<CheckoutStyleId | null>(null);
    useEffect(() => {
        const demande = new URLSearchParams(window.location.search).get("style");
        if (demande) setStyleForce(styleCheckout(demande));
    }, []);
    const style: CheckoutStyleId = styleForce || styleMarchand;
    const [isLoading, setIsLoading] = useState(true);
    const [selectedMethod, setSelectedMethod] = useState<any>(null);
    const [isPaying, setIsPaying] = useState(false);
    const [showCountryPicker, setShowCountryPicker] = useState(false);
    const [expressProfile, setExpressProfile] = useState<ExpressProfile | null>(null);
    const [expressMode, setExpressMode] = useState(false);
    const [routingInfo, setRoutingInfo] = useState<{ recommended: string; reason: string; confidence: number; alternates: string[]; detectedMethod?: string } | null>(null);
    const [useSmartRouting, setUseSmartRouting] = useState(false);
    // Dernier echec de paiement, affiche dans la carte (en plus du toast)
    const [dernierEchec, setDernierEchec] = useState<string | null>(null);
    const [toutesMethodes, setToutesMethodes] = useState(false);

    // Cartflox Identity state
    const [identityProfile, setIdentityProfile] = useState<any>(null);
    const [identityLoading, setIdentityLoading] = useState(false);
    const [identityMode, setIdentityMode] = useState(false); // true = fast checkout for recognized payer

    const [taux, setTaux] = useState<Record<string, number>>(TAUX_XOF_REPLI);
    useEffect(() => {
        fetch("/api/v1/taux").then((r) => r.json()).then((d) => { if (d?.taux) setTaux(d.taux); }).catch(() => { });
    }, []);

    const [selectedCountryCode, setSelectedCountryCode] = useState(() => {
        if (typeof window === 'undefined') return "SN";
        try {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone.toLowerCase();
            if (tz.includes('abidjan')) return "CI";
            if (tz.includes('dakar')) return "SN";
            if (tz.includes('cotonou')) return "BJ";
            if (tz.includes('bamako')) return "ML";
            if (tz.includes('ouagadougou')) return "BF";
            if (tz.includes('lome')) return "TG";
            if (tz.includes('niamey')) return "NE";
            if (tz.includes('douala') || tz.includes('yaounde')) return "CM";
            if (tz.includes('libreville')) return "GA";
            if (tz.includes('brazzaville')) return "CG";
            if (tz.includes('kinshasa')) return "CD";
            if (tz.includes('ndjamena')) return "TD";
            if (tz.includes('bangui')) return "CF";
            if (tz.includes('conakry')) return "GN";
        } catch (e) { }
        return "SN";
    });
    /**
     * Paiement carte SUR NOTRE PAGE. Le serveur renvoie un `clientSecret` et nous
     * montons le formulaire de Stripe ici : l'acheteur ne quitte plus Cartflox.
     * Le 3D Secure s'ouvre en surcouche. Seuls les moyens qui l'exigent vraiment
     * (Alipay, iDEAL...) provoquent encore une redirection, geree par Stripe.
     */
    const [carteStripe, setCarteStripe] = useState<{ clientSecret: string; publishableKey: string } | null>(null);
    /**
     * ⚠️ Emplacement du formulaire de carte, tenu en ETAT et non en `useRef`.
     *
     * Les ecrans du paiement sont enveloppes dans `<AnimatePresence mode="wait">` :
     * l'ecran entrant n'est monte QU'APRES la sortie du precedent. Une `useRef`
     * etait donc encore vide au moment ou l'effet se declenchait, l'effet
     * abandonnait en silence, et rien ne le relancait : pas de formulaire, pas
     * d'erreur, un ecran vide. Une reference de RAPPEL declenche l'effet au
     * moment exact ou le noeud entre dans la page.
     */
    const [montureCarte, setMontureCarte] = useState<HTMLDivElement | null>(null);
    const stripeRef = useRef<any>(null);
    const elementsRef = useRef<any>(null);
    const champRef = useRef<any>(null);
    const [champCree, setChampCree] = useState(0);   // compteur : chaque nouveau champ est remonte
    /** Stripe a dit « ready » : le formulaire accepte la saisie. */
    const [formulairePret, setFormulairePret] = useState(false);
    /** Confirmation en cours chez Stripe : le bouton attend, l'ecran carte reste. */
    const [confirmationEnCours, setConfirmationEnCours] = useState(false);
    /** Double appui sur Payer : une seule demande part. */
    const demandeEnCoursRef = useRef(false);
    /**
     * Stripe.js pese 1,5 s sur une 4G mediocre. Charge au CHOIX de la carte, il
     * est deja la quand l'acheteur clique sur Payer ; charge au clic, ce temps
     * s'ajoute a l'attente. La promesse est gardee par cle : un second appel
     * avec la meme cle ne recharge rien.
     */
    const stripePromesseRef = useRef<{ cle: string; promesse: Promise<any> } | null>(null);
    const chargerStripe = useCallback((cle: string) => {
        if (stripePromesseRef.current?.cle === cle) return stripePromesseRef.current.promesse;
        const promesse = import("@stripe/stripe-js").then(({ loadStripe }) => loadStripe(cle));
        stripePromesseRef.current = { cle, promesse };
        return promesse;
    }, []);
    /** Une reponse du serveur qui arrive apres un Retour ne doit pas ramener l'ecran carte. */
    const demandeCarteRef = useRef(0);
    const [searchCountry, setSearchCountry] = useState("");
    const [phoneNumber, setPhoneNumber] = useState("");
    const [phoneError, setPhoneError] = useState("");

    const selectedCountry = useMemo(() =>
        WORLD_COUNTRIES.find(c => c.code === selectedCountryCode) || WORLD_COUNTRIES[0], [selectedCountryCode]);

    // Validate phone number for selected country
    const validatePhoneNumber = useCallback((phone: string, countryCode: string): { valid: boolean; error: string } => {
        if (!phone || phone.trim() === '') return { valid: false, error: '' };
        const country = WORLD_COUNTRIES.find(c => c.code === countryCode);
        if (!country) return { valid: false, error: t(langue, "pays_invalide") };

        const fmt = getPhoneFormat(countryCode);
        const digits = completerBenin(phone.replace(/\D/g, ''), countryCode);

        // Length check first (fast feedback)
        if (digits.length > 0 && digits.length < fmt.maxLen - 1) {
            return { valid: false, error: t(langue, "numero_trop_court", { pays: nomPays(country.code, langue, country.name), n: digits.length, max: fmt.maxLen }) };
        }

        // libphonenumber validation: pass the raw number with or without leading zero
        // libphonenumber-js handles leading zeros per country internally
        const parsed = parsePhoneNumberFromString(digits, countryCode as any)
            || parsePhoneNumberFromString(`${country.dial_code}${digits.replace(/^0+/, '')}`, countryCode as any);

        if (!parsed || !parsed.isValid()) {
            return { valid: false, error: t(langue, "numero_invalide_pour", { pays: nomPays(country.code, langue, country.name) }) };
        }

        return { valid: true, error: '' };
    }, [langue]);

    // Build E.164 via libphonenumber (handles per-country leading-zero rules
    // e.g. CI: 0712345678 → +2250712345678)
    const buildE164 = useCallback(() => {
        const digits = completerBenin(phoneNumber.replace(/\D/g, ''), selectedCountryCode);
        const parsed = parsePhoneNumberFromString(digits, selectedCountryCode as any)
            || parsePhoneNumberFromString(`${selectedCountry.dial_code}${digits.replace(/^0/, '')}`, selectedCountryCode as any);
        return parsed?.format('E.164') || `${selectedCountry.dial_code}${digits.replace(/^0/, '')}`;
    }, [phoneNumber, selectedCountryCode, selectedCountry.dial_code]);

    const filteredCountries = useMemo(() => {
        const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
        const q = normalize(searchCountry);
        const qDigits = searchCountry.replace(/[\u0300-\u036f]/g, '');

        // African countries with payment method coverage - shown first
        const PRIORITY_CODES = new Set(['CI','SN','BJ','ML','BF','TG','GN','NE','CM','GA','CG','CD','TD','CF','GH','NG','KE','TZ','RW','UG','ZA','MG','SL','GW','MR','ZM','MW','MZ','ET','LS','BI','EG','MA','LR','GM']);

        // Nom affiche dans la langue de la page : la recherche et l'ordre le suivent
        // (en francais c'est le libelle d'origine, rien ne change).
        const nomAffiche = (c: { code: string; name: string }) => nomPays(c.code, langue, c.name);

        let results = WORLD_COUNTRIES;
        if (q) {
            results = WORLD_COUNTRIES.filter(c => {
                const name = normalize(c.name);
                const nomLangue = normalize(nomAffiche(c));
                const code = c.code.toLowerCase();
                const dial = c.dial_code.replace('+', '');
                // Match: name contains query, country code matches, dial code starts with digits
                return name.includes(q) || nomLangue.includes(q) || code.includes(q) || (qDigits && dial.startsWith(qDigits)) || (q.startsWith('+') && c.dial_code.startsWith(q));
            });
        }

        // Sort: selected country first, then priority African countries, then rest alphabetically
        return results.sort((a, b) => {
            if (a.code === selectedCountryCode) return -1;
            if (b.code === selectedCountryCode) return 1;
            const aPri = PRIORITY_CODES.has(a.code) ? 0 : 1;
            const bPri = PRIORITY_CODES.has(b.code) ? 0 : 1;
            if (aPri !== bPri) return aPri - bPri;
            return normalize(nomAffiche(a)).localeCompare(normalize(nomAffiche(b)));
        });
    }, [searchCountry, selectedCountryCode, langue]);

    const filteredMethods = useMemo(() => {
        const filtered = methods.filter(m => {
            if (ZONES_MONDIALES.includes(sansAccent(m.country))) return true;
            if (m.gatewayId === 'sandbox') return true; // moyen fictif du mode test : tout pays
            return codePays(m.country) === selectedCountry.code;
        });
        // Wave d'abord : c'est le moyen le plus utilise par les acheteurs.
        // Le tri est stable, les autres moyens gardent donc leur ordre.
        const estWave = (m: any) => (/wave/i.test(`${m.code || ''} ${m.name || ''}`) ? 0 : 1);
        filtered.sort((a: any, b: any) => estWave(a) - estWave(b));

        // Sort: preferred method first when identity is active
        if (identityProfile?.preferredMethod) {
            const pref = identityProfile.preferredMethod.toLowerCase();
            filtered.sort((a: any, b: any) => {
                const aMatch = a.code?.toLowerCase() === pref || a.name?.toLowerCase().includes(pref) ? -1 : 0;
                const bMatch = b.code?.toLowerCase() === pref || b.name?.toLowerCase().includes(pref) ? -1 : 0;
                return aMatch - bMatch;
            });
        }
        return filtered;
    }, [methods, selectedCountry, identityProfile?.preferredMethod]);

    useEffect(() => {
        if (filteredMethods.length > 0) {
            const currentStillValid = selectedMethod && filteredMethods.find(m => m.id === selectedMethod.id && !m.indisponible);
            // Un moyen grise (indisponible partout pour le moment) n'est jamais choisi d'office.
            if (!currentStillValid) setSelectedMethod(filteredMethods.find((m: any) => !m.indisponible) || null);
        }
    }, [filteredMethods, selectedMethod]);

    useEffect(() => { if (transactionId) loadData(); }, [transactionId]);

    const loadData = async () => {
        setIsLoading(true);
        const minDelay = new Promise(resolve => setTimeout(resolve, 600));
        // Pays du visiteur d'apres son adresse IP, demande en meme temps que la
        // transaction : il est presque toujours la quand on en a besoin.
        const paysIpDemande = paysDuVisiteur().catch(() => null);
        try {
            const [tx] = await Promise.all([getPublicTransaction(transactionId), minDelay]);
            if (tx) {
                setTransaction(tx);
                // Deja payee : on affiche directement l'ecran de succes, jamais le
                // formulaire (evite un second paiement / la confusion).
                if (tx.status === 'SUCCESS') setPaymentStatus('success');
                if (tx.status === 'CANCELLED') setDernierEchec(tr("paiement_annule"));
                if (tx.status === 'REFUNDED') setDernierEchec(tr("paiement_rembourse"));
                // Strip international prefix if already present - store only local digits (keep leading zero for countries that need it e.g. CI, NG, GH)
                const rawPhone = tx.customerPhone || "";
                // Beaucoup de marchands envoient l'international sans le "+"
                // ("2250102030405") : libphonenumber ne reconnait pas cette
                // forme. On retente avec un "+" devant, sinon le numero reste
                // entier a cote de l'indicatif deja affiche par le champ. Un
                // numero LOCAL ("92458641", Togo) deviendrait "+92..." (Pakistan) :
                // cette relecture ne vaut que si elle donne un numero valide, ou
                // si les chiffres sont assez longs pour porter un indicatif.
                const chiffresPhone = rawPhone.replace(/\D/g, '');
                const avecPlus = chiffresPhone ? parsePhoneNumberFromString('+' + chiffresPhone) : null;
                const parsedRaw = rawPhone
                    ? (parsePhoneNumberFromString(rawPhone)
                        || (avecPlus && (avecPlus.isValid() || (chiffresPhone.length >= 11 && !chiffresPhone.startsWith('0'))) ? avecPlus : null))
                    : null;
                const suggere = suggestionsDeLAdresse();
                setPhoneNumber(suggere.tel || (parsedRaw ? parsedRaw.nationalNumber : rawPhone.replace(/^\+\d{1,3}/, '')));
                const meta = (tx as any)?.application?.metadata as Record<string, any> | null;
                // Couleurs choisies par le marchand (Parametres > Page de paiement),
                // sinon un theme pret a l'emploi.
                const perso = meta?.checkoutThemeCustom;
                setCheckoutTheme(perso && typeof perso === 'object'
                    ? { ...getThemeById('cartflox'), ...perso, id: 'custom', name: 'Personnalisé' }
                    : getThemeById(meta?.checkoutTheme || 'cartflox'));
                setStyleMarchand(styleCheckout(meta?.checkoutStyle));
                const methodesDisponibles = await getPaymentMethodsByAppId(tx.applicationId!, tx.currency, tx.amount);
                // Paiement a Cartflox (abonnement) : mobile money seulement, jamais la carte.
                const availableMethods = (tx.metadata as any)?.moyens === "mobile_money"
                    ? methodesDisponibles.filter((m: any) => !/card|carte|visa|master/i.test(`${m.type || ""} ${m.name || ""} ${m.code || ""}`))
                    : methodesDisponibles;
                const txEnTest = (tx as any).test === true || (tx as any).application?.liveMode === false;
                setMethods(availableMethods.length === 0 && txEnTest ? [METHODE_TEST] : availableMethods);
                let paysMarchand: string | null = null;
                if ((tx as any).application?.user?.country) {
                    const hint = (tx as any).application.user.country.toLowerCase();
                    const found = WORLD_COUNTRIES.find(c => c.name.toLowerCase() === hint || c.code.toLowerCase() === hint);
                    if (found) paysMarchand = found.code;
                }
                // Pays ou se trouve le client (adresse IP). La demande est partie avec
                // celle de la transaction ; depuis Stockholm, la reponse
                // d'api.country.is met parfois plus de 400 ms a revenir.
                let paysClient: string | null = null;
                if (!suggere.pays) {
                    const ip = await Promise.race([paysIpDemande, new Promise<null>(r => setTimeout(() => r(null), 1500))]);
                    if (ip && WORLD_COUNTRIES.some(c => c.code === ip)) paysClient = ip;
                }
                // Pays du numero recu, lu avec son contexte (paysDuNumeroRecu) : un
                // site marchand colle souvent SON indicatif (« +229 ») devant le numero
                // de son client (ivoirien, vu le 04/10/2026). Il passe avant tout le
                // reste, car le mobile money suit le numero.
                const locaux = [...new Set(availableMethods
                    .filter((m: any) => !ZONES_MONDIALES.includes(sansAccent(m.country)))
                    .map((m: any) => codePays(m.country))
                    .filter((c: string | null): c is string => !!c))];
                const detectedCode = rawPhone ? paysDuNumeroRecu({
                    chiffres: parsedRaw ? parsedRaw.nationalNumber : chiffresPhone,
                    declare: parsedRaw?.country ?? null,
                    client: paysClient,
                    locaux,
                    marchand: paysMarchand,
                }) : null;
                if (detectedCode) paysDuNumeroRef.current = detectedCode;
                // Sans numero exploitable, le pays ou se trouve le client passe avant
                // celui du marchand, a condition que le marchand y ait un moyen de
                // paiement : sinon la page s'ouvrirait sur une liste vide.
                const payableIci = (code: string) => availableMethods.some((m: any) =>
                    ZONES_MONDIALES.includes(sansAccent(m.country)) || codePays(m.country) === code);
                const paysIp = paysClient && payableIci(paysClient) ? paysClient : null;
                if (suggere.pays) setSelectedCountryCode(suggere.pays);
                else if (detectedCode) setSelectedCountryCode(detectedCode);
                else if (paysIp) setSelectedCountryCode(paysIp);
                else if (paysMarchand) setSelectedCountryCode(paysMarchand);
                else {
                    try {
                        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone.toLowerCase();
                        if (tz.includes('abidjan')) setSelectedCountryCode("CI");
                        else if (tz.includes('dakar')) setSelectedCountryCode("SN");
                        else if (tz.includes('cotonou')) setSelectedCountryCode("BJ");
                        else if (tz.includes('bamako')) setSelectedCountryCode("ML");
                        else if (tz.includes('ouagadougou')) setSelectedCountryCode("BF");
                    } catch (e) { }
                }
            }
        } catch (error) { setErreurChargement(true); }
        setIsLoading(false);

        // Check for Express profile
        const saved = loadExpressProfile();
        if (saved && saved.phone) setExpressProfile(saved);
    };

    // Cartflox Identity: lookup payer when phone number changes
    useEffect(() => {
        if (!phoneNumber || phoneNumber.length < 8) {
            setIdentityProfile(null);
            setIdentityMode(false);
            return;
        }
        // Build E.164 - strip leading zeros only if the number doesn't start with a country-specific operator prefix
        // e.g. CI: 0712345678 → +2250712345678 (libphonenumber handles the leading zero for CI)
        const digitsOnly = completerBenin(phoneNumber.replace(/\D/g, ''), selectedCountryCode);
        const parsed164 = parsePhoneNumberFromString(digitsOnly, selectedCountryCode as any)
            || parsePhoneNumberFromString(`${selectedCountry.dial_code}${digitsOnly.replace(/^0/, '')}`, selectedCountryCode as any);
        const fullPhone = parsed164?.format('E.164') || `${selectedCountry.dial_code}${digitsOnly.replace(/^0/, '')}`;
        const doLookup = async () => {
            setIdentityLoading(true);
            try {
                const result = await lookupPayer(fullPhone);
                if (result.found && result.profile) {
                    setIdentityProfile(result.profile);
                    // Auto-select their preferred method if available
                    if (result.profile.preferredMethod) {
                        const preferred = filteredMethods.find(m =>
                            m.code?.toLowerCase() === result.profile.preferredMethod?.toLowerCase() ||
                            m.name?.toLowerCase().includes(result.profile.preferredMethod?.toLowerCase())
                        );
                        if (preferred) setSelectedMethod(preferred);
                    }
                    // Pays du profil : seulement si la session n'a pas donne de numero.
                    if (result.profile.country && !paysDuNumeroRef.current) {
                        const c = WORLD_COUNTRIES.find(w => w.code === result.profile.country);
                        if (c) setSelectedCountryCode(result.profile.country);
                    }
                    setIdentityMode(true);
                } else {
                    setIdentityProfile(null);
                    setIdentityMode(false);
                }
            } catch { }
            setIdentityLoading(false);
        };
        const timer = setTimeout(doLookup, 600);
        return () => clearTimeout(timer);
    }, [phoneNumber, selectedCountry.dial_code]);

    // Fetch smart routing info when context changes
    useEffect(() => {
        if (!transaction || !selectedCountryCode) return;
        /* const fetchRouting = async () => {
            try {
                const result = await getSmartRoutingInfo({
                    transactionId: transaction.id,
                    country: selectedCountryCode,
                    phone: phoneNumber || undefined,
                    methodCode: selectedMethod?.code || undefined,
                });
                if (result.success && result.routing) setRoutingInfo(result.routing);
            } catch {}
        };
        const timer = setTimeout(fetchRouting, 500); // debounce
        return () => clearTimeout(timer); */
    }, [transaction, selectedCountryCode, phoneNumber, selectedMethod]);

    const [paymentStatus, setPaymentStatus] = useState<null | 'initiating' | 'carte' | 'pending_user' | 'require_otp' | 'verifying' | 'success' | 'error'>(null);

    // Sante des moyens (25/09/2026) : tant que le client choisit, la liste est
    // relue chaque minute. Un moyen tombe en panne se grise, un moyen retabli se
    // degrise, et un moyen repris par une autre passerelle part vers elle.
    useEffect(() => {
        const appId = (transaction as any)?.applicationId;
        if (!appId || paymentStatus) return;
        const t = window.setInterval(async () => {
            if (document.hidden) return;
            const frais: any[] | null = await getPaymentMethodsByAppId(appId, (transaction as any)?.currency, (transaction as any)?.amount).catch(() => null);
            if (!Array.isArray(frais) || frais.length === 0) return;
            const parCle = new Map(frais.filter((n: any) => n?.cle).map((n: any) => [n.cle, n]));
            const maj = (m: any) => {
                const n: any = m?.cle ? parCle.get(m.cle) : null;
                return n ? { ...m, indisponible: !!n.indisponible, minimum: n.minimum, gatewayId: n.gatewayId, code: n.code, gateway: n.gateway } : m;
            };
            setMethods((prev) => prev.map(maj));
            setSelectedMethod((sel: any) => (sel ? maj(sel) : sel));
        }, 60_000);
        return () => window.clearInterval(t);
    }, [transaction, paymentStatus]); // eslint-disable-line react-hooks/exhaustive-deps

    const CHECKOUT_TIMEOUT_SECONDS = 15 * 60; // 15 minutes
    const [sessionSecondsLeft, setSessionSecondsLeft] = useState(CHECKOUT_TIMEOUT_SECONDS);
    const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const sessionStartRef = useRef<number>(Date.now());

    const redirectOnExpiry = useCallback(() => {
        const meta = (transaction?.metadata as any) || {};
        const url = meta.cancel_url || meta.failure_url || meta.cancelUrl || meta.failureUrl || document.referrer || null;
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'afriflow:expired', payload: { transactionId } }, '*');
            }
        } catch {}
        if (url) { redirectViaParent(url); }
    }, [transaction, transactionId]);

    // Session countdown - starts after transaction loads, resets on interaction, pauses during payment
    useEffect(() => {
        if (!transaction || paymentStatus === 'success' || paymentStatus === 'verifying') return;
        if (paymentStatus === 'initiating' || paymentStatus === 'pending_user' || paymentStatus === 'require_otp' || paymentStatus === 'carte') return;
        sessionTimerRef.current = setInterval(() => {
            setSessionSecondsLeft(prev => {
                if (prev <= 1) {
                    clearInterval(sessionTimerRef.current!);
                    redirectOnExpiry();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => { if (sessionTimerRef.current) clearInterval(sessionTimerRef.current); };
    }, [transaction, paymentStatus, redirectOnExpiry]);

    // Reset timer on user interaction
    const resetSessionTimer = useCallback(() => {
        setSessionSecondsLeft(CHECKOUT_TIMEOUT_SECONDS);
    }, []);
    const [paymentInstructions, setPaymentInstructions] = useState<{ title: string; detail: string; icon: any; ussd?: string } | null>(null);
    // Pays deduit du numero transmis avec la session : il prime sur le pays
    // memorise dans le profil du payeur (un acheteur peut payer d'un autre pays).
    const paysDuNumeroRef = useRef<string | null>(null);
    // Lien d'application (Wave, Djamo) : bouton d'ouverture et QR code sur NOTRE page.
    const [lienApplication, setLienApplication] = useState<{ url: string; nom: string; qr?: string | null } | null>(null);
    // Chargement impossible (reseau, action serveur perimee) : ce n'est pas un lien mort.
    const [erreurChargement, setErreurChargement] = useState(false);
    // Mode test : l'ecran qui propose de simuler l'issue du paiement.
    const [modeTestAttente, setModeTestAttente] = useState(false);
    const [simulationEnCours, setSimulationEnCours] = useState(false);
    // Consigne envoyee par le fournisseur avec la demande (OnePay, Paystack, Monetbil).
    const [consigneFournisseur, setConsigneFournisseur] = useState<string | null>(null);
    // Code USSD a composer quand la demande n'arrive pas (*126# chez MTN Cameroun, #120# chez Orange CI).
    const [codeUssd, setCodeUssd] = useState<string | null>(null);
    /**
     * Consigne et code de secours de l'operateur, apres une demande de paiement. Quand
     * une demande attend deja sur ce telephone (`dejaEnvoye`), le serveur n'en a pas
     * envoye d'autre : on le dit, avec la consigne de la demande en cours.
     */
    const appliquerConsigne = (response: any) => {
        const consigne = typeof response?.rawData?._instructions === 'string' && response.rawData._instructions ? response.rawData._instructions : null;
        if (response?.dejaEnvoye) setConsigneFournisseur([tr("demande_deja_envoyee"), consigne].filter(Boolean).join(" "));
        else if (consigne) setConsigneFournisseur(consigne);
        if (typeof response?.rawData?._ussd === 'string' && response.rawData._ussd) setCodeUssd(response.rawData._ussd);
    };
    const [otpCode, setOtpCode] = useState("");

    const sessionMinsLeft = Math.floor(sessionSecondsLeft / 60);
    const sessionSecsDisplay = sessionSecondsLeft % 60;
    const showSessionWarning = sessionSecondsLeft > 0 && sessionSecondsLeft <= 120 && !!transaction && !paymentStatus;

    const getInstructions = (method: any) => {
        const name = method.name.toLowerCase();
        const country = selectedCountry.code.toUpperCase();
        if (name.includes('wave')) return { title: tr("instr_wave_titre"), detail: tr("instr_wave_texte"), icon: Globe };
        if (name.includes('orange')) {
            const codes: Record<string, string> = { CI: '#144*82#', SN: '#144*77#', ML: '#144#', BF: '*144*4*6*#' };
            return { title: tr("instr_orange_titre"), detail: tr("instr_orange_texte", { code: codes[country] || '#144#' }), ussd: codes[country] || '#144#', icon: Phone };
        }
        if (name.includes('mtn')) return { title: tr("instr_mtn_titre"), detail: tr("instr_mtn_texte"), icon: Zap };
        if (name.includes('moov')) return { title: tr("instr_moov_titre"), detail: tr("instr_moov_texte"), icon: Lock };
        if (name.includes('free')) return { title: tr("instr_free_titre"), detail: tr("instr_free_texte"), icon: Lock };
        return { title: tr("instr_defaut_titre"), detail: tr("instr_defaut_texte"), icon: Zap };
    };

    // Computed: does the selected method need a phone number?
    /**
     * Changer de moyen abandonne le formulaire carte. Sans cela, le cadre reste
     * affiche sous un choix Mobile Money : un rectangle blanc VIDE entre le
     * champ telephone et le bouton, que l'acheteur ne comprend pas.
     */
    useEffect(() => {
        setCarteStripe(null);
        stripeRef.current = null;
        elementsRef.current = null;
        champRef.current = null;
        setChampCree(0);
        setFormulairePret(false);
    }, [selectedMethod?.id]);

    /**
     * Identifiants du formulaire carte, gardes pour la duree de la page. Le
     * montant ne bouge pas en cours de route : reprendre le meme secret evite
     * de creer une intention de paiement a chaque fois que l'acheteur hesite
     * entre la carte et le Mobile Money.
     */
    const secretCarteRef = useRef<{ clientSecret: string; publishableKey: string; pays: string } | null>(null);

    /**
     * Le secret est la : on prepare le formulaire SANS attendre le noeud. L'ecran
     * carte entre par une animation (AnimatePresence) et son noeud n'existe que
     * 200 ms plus tard ; Stripe n'a pas a attendre ce delai pour commencer.
     * Le SDK n'est jamais impose a un acheteur Mobile Money.
     */
    useEffect(() => {
        if (!carteStripe) return;
        let annule = false;
        (async () => {
            try {
                const stripe = await chargerStripe(carteStripe.publishableKey);
                if (annule) return;
                // ⚠️ `loadStripe` RESOUT A NULL quand js.stripe.com est bloque
                // (extension, filtrage reseau, navigateur pilote). Sans ce test
                // l'echec etait MUET : ni formulaire, ni message, et une heure
                // perdue a chercher ailleurs.
                if (!stripe) {
                    setDernierEchec(tr("carte_bloquee"));
                    journaliserEchecCarte(transaction?.id || "", { code: "stripe_bloque", type: "chargement", message: "js.stripe.com bloque ou inaccessible" }).catch(() => { });
                    return;
                }
                const elements = stripe.elements({
                    clientSecret: carteStripe.clientSecret,
                    // Notre propre attente reste affichee jusqu'a « ready » :
                    // Stripe ne doit pas en superposer une seconde.
                    loader: "never",
                    appearance: { theme: "stripe", variables: { colorPrimary: "#6D28D9", borderRadius: "10px" } },
                });
                const champ = elements.create("payment", { layout: "tabs" });
                // Stripe ne leve pas d'exception quand il renonce a s'afficher :
                // il previent par cet evenement, et sans l'ecouter on ne voit
                // qu'un cadre gris qui ne se remplit jamais.
                champ.on("loaderror", (e: any) => {
                    if (!annule) setDernierEchec(messageAcheteur(e?.error?.message, langue, tr("carte_chargement_echec")));
                    journaliserEchecCarte(transaction?.id || "", { code: "loaderror", type: "chargement", message: e?.error?.message || "" }).catch(() => { });
                });
                champ.on("ready", () => { if (!annule) setFormulairePret(true); });
                stripeRef.current = stripe;
                elementsRef.current = elements;
                champRef.current = champ;
                setChampCree((n) => n + 1);
            } catch (e: any) {
                if (!annule) setDernierEchec(e?.message || tr("carte_chargement_echec"));
                journaliserEchecCarte(transaction?.id || "", { code: "creation", type: "chargement", message: e?.message || String(e) }).catch(() => { });
            }
        })();
        return () => { annule = true; };
    }, [carteStripe, chargerStripe]);

    /** Le noeud est entre dans la page et le champ existe : on l'y pose. */
    useEffect(() => {
        if (!montureCarte || !champCree || !champRef.current) return;
        const champ = champRef.current;
        champ.mount(montureCarte);
        return () => { try { champ.unmount(); } catch { /* deja retire */ } };
    }, [montureCarte, champCree]);

    /**
     * ⚠️ Quitter l'ecran carte (Retour, autre moyen, succes) demonte le champ :
     * les instances et « pret » tombent avec lui. Sans cela, au retour, le bouton
     * Payer etait actif TOUT DE SUITE sur un champ demonte et confirmPayment
     * levait « IntegrationError: We could not retrieve data from the specified
     * Element » : ecran d'attente sans fin, rien de journalise, Stripe jamais
     * appele. Reproduit le 22/09/2026 ; 9 acheteurs sur 10 echouaient ainsi.
     */
    useEffect(() => {
        if (paymentStatus === 'carte') return;
        try { champRef.current?.unmount(); } catch { /* deja retire */ }
        champRef.current = null;
        elementsRef.current = null;
        setChampCree(0);
        setFormulairePret(false);
        setConfirmationEnCours(false);
        setCarteStripe(null);
    }, [paymentStatus]);

    const needsPhone = isMobileMoneyMethod(selectedMethod) && !isRedirectOnlyProvider(selectedMethod);
    const paiementCarte = !!selectedMethod && /stripe/i.test(selectedMethod.gateway || "");

    /**
     * Des que l'acheteur CHOISIT la carte : la connexion vers Stripe s'ouvre et
     * Stripe.js part en telechargement, pendant qu'il regarde le bouton Payer.
     * La cle publique vient de la liste des moyens (`clePublique`).
     */
    useEffect(() => {
        if (!paiementCarte) return;
        preconnect("https://js.stripe.com");
        preconnect("https://api.stripe.com");
        const cle = (selectedMethod as any)?.clePublique;
        if (cle) chargerStripe(cle).catch(() => { /* l'echec reel est traite au montage */ });
    }, [paiementCarte, selectedMethod, chargerStripe]);

    // La carte se demande en cliquant sur « Payer », comme tous les autres
    // moyens. Le formulaire s'ouvre ensuite sur SON PROPRE ecran : le greffer
    // sous la liste des moyens donnait un bouton « Payer » qui ne payait pas.

    const handleFinalPay = async () => {
        if (!selectedMethod) { goeyToast.error(tr("choisissez_moyen")); return; }
        if (needsPhone && !phoneNumber) { goeyToast.error(tr("entrez_numero")); return; }
        if (needsPhone && phoneNumber) {
            const validation = validatePhoneNumber(phoneNumber, selectedCountryCode);
            if (!validation.valid) {
                setPhoneError(validation.error);
                goeyToast.error(validation.error || tr("numero_invalide"));
                return;
            }
        }
        setDernierEchec(null);
        // Double appui : la premiere demande part, la seconde attend son tour.
        if (demandeEnCoursRef.current) return;
        demandeEnCoursRef.current = true;
        setTimeout(() => { demandeEnCoursRef.current = false; }, 1500);
        // Carte deja demandee sur cette page, meme pays : on reprend la MEME
        // intention chez Stripe. Le formulaire se refait a neuf et attend « pret ».
        // Avant, chaque retour creait une intention de plus, jamais confirmee.
        if (paiementCarte && secretCarteRef.current && secretCarteRef.current.pays === selectedCountry.code) {
            demandeCarteRef.current++;
            setCarteStripe({ ...secretCarteRef.current });
            setPaymentStatus('carte');
            return;
        }
        // Carte : l'ecran carte s'ouvre TOUT DE SUITE, avec son attente, pendant
        // que le serveur cree l'intention de paiement. Un ecran intermediaire
        // n'ajouterait qu'un etat entre le clic et le formulaire.
        const demande = ++demandeCarteRef.current;
        setPaymentStatus(paiementCarte ? 'carte' : 'initiating');
        setLienApplication(null);
        setModeTestAttente(false);
        setConsigneFournisseur(null);
        setCodeUssd(null);
        if (needsPhone) setPaymentInstructions(getInstructions(selectedMethod));
        try {
            const fullPhone = needsPhone
                ? buildE164()
                : (transaction.customerPhone || transaction.customerEmail || 'nophone');

            const response = await initiateSoftPayment({
                transactionId: transaction.id,
                gatewayId: selectedMethod.gatewayId,
                methodCode: selectedMethod.code,
                customerDetails: {
                    name: transaction.customerName,
                    email: transaction.customerEmail,
                    phone: fullPhone,
                    country: selectedCountry.code
                },
                inline: paiementCarte,
            });

            if (response.sandbox) { setModeTestAttente(true); setPaymentStatus('pending_user'); return; }
            if (response.indisponible) {
                // Indisponible partout (sante des moyens) : le moyen se grise ici aussi.
                const cleChoisie = selectedMethod?.cle;
                setMethods((prev) => prev.map((m: any) => ((cleChoisie && m.cle === cleChoisie) || m.id === selectedMethod?.id ? { ...m, indisponible: true } : m)));
                setPaymentStatus(null);
                setDernierEchec(tr("moyen_indisponible", { moyen: nomCourt(selectedMethod?.name || response.moyen || "") }));
                return;
            }
            if (!response.success) { setPaymentStatus(null); setDernierEchec(messageAcheteur(response.message, langue, tr("echec_paiement"))); return; }

            // Carte : on reste ici, le formulaire de Stripe se monte sous le choix.
            if (response.status === 'INLINE_CARD' && response.clientSecret && response.publishableKey) {
                // L'acheteur est revenu en arriere pendant l'attente : on ne le ramene pas.
                if (demande !== demandeCarteRef.current) return;
                secretCarteRef.current = { clientSecret: response.clientSecret, publishableKey: response.publishableKey, pays: selectedCountry.code };
                setCarteStripe(secretCarteRef.current);
                setPaymentStatus('carte');
                return;
            }

            // Lien d'application (Wave, Djamo) : on reste ici, bouton + QR code,
            // et la page surveille le paiement jusqu'a la confirmation.
            if (response.status === 'APP_LINK' && response.redirectUrl) {
                setLienApplication({ url: response.redirectUrl, nom: response.application || tr("l_application"), qr: response.qr || null });
                setPaymentStatus('pending_user');
                return;
            }
            appliquerConsigne(response);

            // Provider returns a hosted checkout URL → redirect immediately
            if ((response.status === 'REDIRECT' || response.redirectUrl) && response.redirectUrl) {
                setPaymentStatus('verifying');
                redirectViaParent(response.redirectUrl);
                return;
            }

            if (response.status === 'SUCCESS') {
                setPaymentStatus('success');
                if (needsPhone) saveExpressProfile({ phone: phoneNumber, countryCode: selectedCountry.code, methodId: selectedMethod.id, methodName: selectedMethod.name, lastUsed: Date.now() });
                updatePayerAfterPayment({
                    phone: fullPhone, method: selectedMethod.code || selectedMethod.name, provider: selectedMethod.gateway || 'unknown',
                    amount: transaction.amount, merchantName: (transaction as any).application?.name || 'Marchand',
                    country: selectedCountry.code, name: transaction.customerName, email: transaction.customerEmail,
                }).catch(() => {});
                notifyParentSuccess();
            }
            else if (response.status === 'REQUIRE_OTP') {
                const consigne = typeof response.rawData?._instructions === 'string' && response.rawData._instructions ? response.rawData._instructions : null;
                setPaymentInstructions((prev) => consigne ? { title: tr("code_confirmation"), detail: consigne, icon: Lock } : (prev || { title: tr("code_confirmation"), detail: tr("code_confirmation_texte"), icon: Lock }));
                setPaymentStatus('require_otp');
            }
            else setPaymentStatus('pending_user');
        } catch (error) { setPaymentStatus(null); setDernierEchec(tr("erreur_technique")); }
    };

    /** Mode test : denoue le paiement comme le ferait l'operateur, sans argent. */
    const simulerIssue = async (issue: 'succes' | 'echec') => {
        if (!transaction || simulationEnCours) return;
        setSimulationEnCours(true);
        try {
            const r = await fetch('/api/checkout/sandbox', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transactionId: transaction.id,
                    issue,
                    customerDetails: { name: transaction.customerName, email: transaction.customerEmail, phone: needsPhone && phoneNumber ? buildE164() : (transaction.customerPhone || '') },
                    methodCode: selectedMethod?.code || null,
                }),
            }).then((x) => x.json());
            if (r?.success && r.status === 'SUCCESS') { setModeTestAttente(false); setPaymentStatus('success'); notifyParentSuccess(); }
            else if (r?.success) { setModeTestAttente(false); setPaymentStatus(null); setDernierEchec(tr("echec_simule")); }
            else goeyToast.error(r?.message || tr("simulation_impossible"));
        } catch { goeyToast.error(tr("simulation_impossible")); }
        setSimulationEnCours(false);
    };

    /**
     * Confirme la carte saisie dans le formulaire monte ci-dessus. `redirect:
     * 'if_required'` garde l'acheteur ici pour une carte ordinaire, et ne
     * l'envoie ailleurs que si le moyen choisi l'impose vraiment.
     */
    const confirmerCarte = async () => {
        if (!transaction || confirmationEnCours) return;
        const stripe = stripeRef.current, elements = elementsRef.current;
        if (!stripe || !elements || !formulairePret) { setDernierEchec(tr("carte_chargement_echec")); return; }
        setDernierEchec(null);
        // On RESTE sur l'ecran carte pendant la confirmation : changer d'ecran
        // demontait le champ sous les pieds de Stripe.
        setConfirmationEnCours(true);
        let error: any = null;
        try {
            ({ error } = await stripe.confirmPayment({
                elements,
                confirmParams: { return_url: `${window.location.origin}/checkout/success?id=${transaction.id}` },
                redirect: 'if_required',
            }));
        } catch (e: any) {
            // ⚠️ Stripe.js LEVE une exception (au lieu de renvoyer une erreur) quand le
            // champ n'est plus monte ou pas encore pret. Sans ce filet, l'ecran
            // d'attente ne finissait jamais et rien n'etait journalise.
            error = { code: "exception", type: "integration_error", message: e?.message || String(e) };
        }
        setConfirmationEnCours(false);
        if (error) {
            // Le motif part au serveur : sans cette trace, l'echec n'existait nulle
            // part (l'intention restait « requires_payment_method » chez Stripe, sans
            // motif) et le marchand ne pouvait rien expliquer a son client.
            journaliserEchecCarte(transaction.id, { code: error.code, decline_code: error.decline_code, type: error.type, message: error.message }).catch(() => { });
            const clair = messageCarte(error, langue) || messageAcheteur(error.message, langue, tr("paiement_refuse"));
            setDernierEchec(clair);
            // L'acheteur reste sur le formulaire, sa carte toujours saisie, pour
            // corriger ou reessayer. Un champ en vrac (exception) est refait a neuf.
            if (error.type === "integration_error" && secretCarteRef.current) {
                try { champRef.current?.unmount(); } catch { /* deja retire */ }
                champRef.current = null; elementsRef.current = null;
                setChampCree(0); setFormulairePret(false);
                setCarteStripe({ ...secretCarteRef.current });
            }
            return;
        }
        // La banque a accepte : c'est le SERVEUR qui fait foi, on lui demande.
        setPaymentStatus('verifying');
        try {
            const r = await fetch('/api/checkout/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transactionId: transaction.id }),
            }).then((x) => x.json());
            if (r?.status === 'SUCCESS' || r?.success === true) { setPaymentStatus('success'); notifyParentSuccess(); }
            else setPaymentStatus('verifying');
        } catch { setPaymentStatus('verifying'); }
    };

    // Notify parent window (widget iframe → parent site)
    const notifyParentSuccess = () => {
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'afriflow:success', payload: { transactionId, orderId: transaction?.orderId, amount: transaction?.amount, currency: transaction?.currency } }, '*');
            }
        } catch {}
        // Also redirect to success_url if present in transaction metadata
        const successUrl = (transaction?.metadata as any)?.success_url;
        if (successUrl) {
            setTimeout(() => { safeRedirect(successUrl); }, 2000);
        }
    };

    const handleExpressPay = async () => {
        if (!expressProfile || !transaction) return;
        const method = methods.find(m => m.id === expressProfile.methodId) || filteredMethods[0];
        if (!method) { goeyToast.error(tr("methode_introuvable")); return; }

        setPhoneNumber(expressProfile.phone);
        setSelectedCountryCode(expressProfile.countryCode);
        setSelectedMethod(method);
        setExpressMode(true);
        setDernierEchec(null);
        setModeTestAttente(false);
        setPaymentStatus('initiating');
        setPaymentInstructions(getInstructions(method));

        try {
            const response = await initiateSoftPayment({
                transactionId: transaction.id, gatewayId: method.gatewayId, methodCode: method.code,
                customerDetails: { name: transaction.customerName, email: transaction.customerEmail, phone: parsePhoneNumberFromString(expressProfile.phone, expressProfile.countryCode as any)?.number || expressProfile.phone, country: expressProfile.countryCode }
            });
            if (response.sandbox) { setModeTestAttente(true); setPaymentStatus('pending_user'); return; }
            if (response.indisponible) {
                // Indisponible partout (sante des moyens) : le moyen se grise ici aussi.
                const cleChoisie = selectedMethod?.cle;
                setMethods((prev) => prev.map((m: any) => ((cleChoisie && m.cle === cleChoisie) || m.id === selectedMethod?.id ? { ...m, indisponible: true } : m)));
                setPaymentStatus(null);
                setDernierEchec(tr("moyen_indisponible", { moyen: nomCourt(selectedMethod?.name || response.moyen || "") }));
                return;
            }
            if (!response.success) { setPaymentStatus(null); setDernierEchec(messageAcheteur(response.message, langue, tr("echec_paiement"))); return; }
            if (response.status === 'APP_LINK' && response.redirectUrl) { setLienApplication({ url: response.redirectUrl, nom: response.application || tr("l_application"), qr: response.qr || null }); setPaymentStatus('pending_user'); return; }
            appliquerConsigne(response);
            if ((response.status === 'REDIRECT' || response.redirectUrl) && response.redirectUrl) { setPaymentStatus('verifying'); redirectViaParent(response.redirectUrl); return; }
            if (response.status === 'SUCCESS') {
                setPaymentStatus('success');
                saveExpressProfile({ ...expressProfile, lastUsed: Date.now() });
                // Cartflox Identity: update after express pay
                const epFullPhone = `${expressProfile.countryCode ? WORLD_COUNTRIES.find(c => c.code === expressProfile.countryCode)?.dial_code || '+221' : '+221'}${expressProfile.phone.replace(/^0+/, '')}`;
                updatePayerAfterPayment({
                    phone: epFullPhone, method: method.code || method.name, provider: method.gateway || 'unknown',
                    amount: transaction.amount, merchantName: (transaction as any).application?.name || 'Marchand',
                    country: expressProfile.countryCode || 'SN', name: transaction.customerName, email: transaction.customerEmail,
                }).catch(() => {});
                notifyParentSuccess();
            }
            else if (response.status === 'REQUIRE_OTP') {
                const consigne = typeof response.rawData?._instructions === 'string' && response.rawData._instructions ? response.rawData._instructions : null;
                setPaymentInstructions((prev) => consigne ? { title: tr("code_confirmation"), detail: consigne, icon: Lock } : (prev || { title: tr("code_confirmation"), detail: tr("code_confirmation_texte"), icon: Lock }));
                setPaymentStatus('require_otp');
            }
            else setPaymentStatus('pending_user');
        } catch (error) { setPaymentStatus(null); setDernierEchec(tr("erreur_technique")); }
    };

    const handleVerifyOtp = async () => {
        if (!otpCode) return;
        setPaymentStatus('verifying');
        try {
            const otpFullPhone = buildE164();
            const response = await initiateSoftPayment({
                transactionId: transaction.id, gatewayId: selectedMethod.gatewayId, methodCode: selectedMethod.code,
                customerDetails: { name: transaction.customerName, email: transaction.customerEmail, phone: otpFullPhone, country: selectedCountry.code, otp: otpCode }
            });
            if (response.success && response.status === 'SUCCESS') {
                setPaymentStatus('success');
                saveExpressProfile({ phone: phoneNumber, countryCode: selectedCountry.code, methodId: selectedMethod.id, methodName: selectedMethod.name, lastUsed: Date.now() });
                // Cartflox Identity: update after OTP success
                updatePayerAfterPayment({
                    phone: otpFullPhone, method: selectedMethod.code || selectedMethod.name, provider: selectedMethod.gateway || 'unknown',
                    amount: transaction.amount, merchantName: (transaction as any).application?.name || 'Marchand',
                    country: selectedCountry.code, name: transaction.customerName, email: transaction.customerEmail,
                }).catch(() => {});
                notifyParentSuccess();
            }
            else if (response.success && response.status === 'REQUIRE_OTP') { setPaymentStatus('require_otp'); goeyToast.error(response.message || tr("code_invalide")); }
            else if (response.success && response.status === 'PENDING') setPaymentStatus('pending_user');
            else { setPaymentStatus('require_otp'); goeyToast.error(response.message || tr("echec_validation")); }
        } catch (error) { setPaymentStatus('require_otp'); goeyToast.error(tr("erreur_verification")); }
    };

    // Poll the transaction while the customer confirms on their phone
    // (USSD push) - the webhook/cron flips the DB status server-side.
    useEffect(() => {
        if (paymentStatus !== 'pending_user' && paymentStatus !== 'verifying') return;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const startedAt = Date.now();
        const POLL_EVERY_MS = 4000;
        const POLL_MAX_MS = 4 * 60 * 1000;

        const tick = async () => {
            if (cancelled) return;
            try {
                const tx: any = await getPublicTransaction(transactionId);
                if (cancelled) return;
                // Le fournisseur precise parfois APRES l'initiation ce qu'il attend :
                // code a saisir (Orange par Hub2), consigne USSD, lien d'application.
                const attente: any = tx?.attente;
                if (tx?.status === 'PENDING' && attente?.type === 'otp') {
                    if (attente.message) setConsigneFournisseur(attente.message);
                    setPaymentStatus('require_otp');
                    return;
                }
                if (tx?.status === 'PENDING' && attente?.type === 'redirection' && attente.url && !lienApplication) {
                    if (attente.application) setLienApplication({ url: attente.url, nom: attente.application, qr: null });
                    else { redirectViaParent(attente.url); return; }
                }
                if (tx?.status === 'PENDING' && attente?.type === 'ussd' && attente.message) setConsigneFournisseur(attente.message);
                if (tx?.status === 'PENDING' && attente?.type === 'ussd' && attente.ussdCode) setCodeUssd(attente.ussdCode);
                if (tx?.status === 'SUCCESS') {
                    setTransaction(tx);
                    setPaymentStatus('success');
                    if (phoneNumber && selectedMethod) {
                        saveExpressProfile({ phone: phoneNumber, countryCode: selectedCountryCode, methodId: selectedMethod.id, methodName: selectedMethod.name, lastUsed: Date.now() });
                        updatePayerAfterPayment({
                            phone: buildE164(), method: selectedMethod.code || selectedMethod.name, provider: selectedMethod.gateway || 'unknown',
                            amount: tx.amount, merchantName: tx.application?.name || 'Marchand',
                            country: selectedCountryCode, name: tx.customerName, email: tx.customerEmail,
                        }).catch(() => {});
                    }
                    notifyParentSuccess();
                    return;
                }
                if (tx?.status === 'FAILED' || tx?.status === 'CANCELLED') {
                    setPaymentStatus(null);
                    // Le fournisseur a souvent dit POURQUOI : on le répète au client,
                    // c'est la différence entre « réessayez » et « rechargez d'abord ».
                    const echec: any = (tx as any)?.metadata?.echec;
                    const precis = echec ? [echec.message, echec.action].filter(Boolean).join(" ") : "";
                    const msg = precis || (tx.status === 'CANCELLED' ? tr("paiement_annule") : tr("paiement_echoue_reessayer"));
                    setDernierEchec(msg);
                    return;
                }
            } catch { /* network hiccup - keep polling */ }
            if (Date.now() - startedAt < POLL_MAX_MS) {
                timer = setTimeout(tick, POLL_EVERY_MS);
            } else {
                // Rien n'est venu de l'operateur : on rend la main a l'acheteur, avec
                // l'explication dans la carte, au lieu d'une attente sans issue.
                setPaymentStatus(null);
                setDernierEchec(tr("confirmation_attente_longue"));
            }
        };

        timer = setTimeout(tick, POLL_EVERY_MS);
        return () => { cancelled = true; if (timer) clearTimeout(timer); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paymentStatus, transactionId]);

    /* ───────────────────────── Rendu ───────────────────────── */

    if (isLoading) {
        const os = (w: string, h = 12) => <div className="animate-pulse rounded-md" style={{ width: w, height: h, background: checkoutTheme.methodHoverBg }} />;
        return (
            <Coque theme={checkoutTheme} langue={langue} style={style} gauche={
                <div className="flex flex-col gap-4 lg:gap-6">
                    <div className="flex items-center gap-3"><div className="h-11 w-11 animate-pulse rounded-full" style={{ background: checkoutTheme.methodHoverBg }} />{os('120px', 14)}</div>
                    {os('90px')}{os('200px', 40)}
                    <div className="h-24 animate-pulse rounded-xl" style={{ background: checkoutTheme.methodHoverBg }} />
                </div>
            }>
                <div className="flex flex-col gap-5 px-6 py-7">
                    {os('140px')}<div className="h-12 animate-pulse rounded-xl" style={{ background: checkoutTheme.methodHoverBg }} />
                    {os('120px')}<div className="grid grid-cols-2 gap-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl" style={{ background: checkoutTheme.methodHoverBg }} />)}</div>
                    <div className="h-12 animate-pulse rounded-xl" style={{ background: checkoutTheme.methodHoverBg }} />
                </div>
            </Coque>
        );
    }

    if (!transaction && erreurChargement) {
        return (
            <Coque theme={checkoutTheme} langue={langue} style={style} gauche={
                <div className="hidden lg:block">
                    <p className="text-[13px]" style={{ color: checkoutTheme.textMuted }}>{MARQUE}</p>
                    <p className="mt-2 text-[28px] leading-tight" style={{ color: checkoutTheme.textPrimary }}>{tr("suivi_paiement")}</p>
                </div>
            }>
                <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                    <p className="max-w-[300px] text-[14px] leading-relaxed" style={{ color: checkoutTheme.textPrimary }}>{tr("chargement_impossible")}</p>
                    <BoutonSecondaire theme={checkoutTheme} onClick={() => { setErreurChargement(false); loadData(); }}>{tr("reessayer")}</BoutonSecondaire>
                </div>
            </Coque>
        );
    }

    if (!transaction) {
        return (
            <Coque theme={checkoutTheme} langue={langue} style={style} gauche={
                <div className="hidden lg:block">
                    <p className="text-[13px]" style={{ color: checkoutTheme.textMuted }}>{MARQUE}</p>
                    <p className="mt-2 text-[28px] leading-tight" style={{ color: checkoutTheme.textPrimary }}>{tr("lien_nulle_part")}</p>
                </div>
            }>
                <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                    <span className="grid h-14 w-14 place-content-center rounded-full" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}><X size={24} /></span>
                    <p className="text-[16px] font-semibold" style={{ color: checkoutTheme.textPrimary }}>{tr("transaction_introuvable")}</p>
                    <p className="max-w-[280px] text-[13px] leading-relaxed" style={{ color: checkoutTheme.textMuted }}>{tr("lien_invalide_expire")}</p>
                </div>
            </Coque>
        );
    }

    const baseCurrency = (transaction.currency || 'XOF').toUpperCase();
    /**
     * La devise montree est celle que le serveur debitera (/api/checkout/initiate) :
     * celle du moyen choisi, sinon celle du pays, sinon celle du paiement. Un pays
     * hors de la table (Canada, Belgique, Maroc...) garde la devise du paiement :
     * avant, il voyait un montant converti en XOF qu'on ne lui prenait pas (04/10/2026).
     */
    const displayCurrency = (deviseDuMoyen(selectedMethod?.code) || DEVISE_PAYS_CHECKOUT[selectedCountryCode] || baseCurrency).toUpperCase();
    const convertedAmount = convertirAvecTaux(Number(transaction.amount), baseCurrency, displayCurrency, taux);
    const isCurrencyConverted = displayCurrency !== baseCurrency;
    const formattedAmount = new Intl.NumberFormat(localeNombre(langue)).format(convertedAmount);
    /**
     * Montant reellement debite quand la carte part en euros (zone franc, ou
     * Stripe n'affiche pas son formulaire). Montre AVANT le paiement :
     * l'acheteur voit un prix en francs, il doit savoir ce qui apparaitra sur
     * son releve bancaire.
     */
    const montantEuro = paiementCarte && (displayCurrency === 'XOF' || displayCurrency === 'XAF')
        ? (Number(convertedAmount) / 655.957).toLocaleString(localeNombre(langue), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : null;
    const formattedOriginalAmount = isCurrencyConverted ? new Intl.NumberFormat(localeNombre(langue)).format(Number(transaction.amount)) : null;

    // Current visual step for the checkout card
    const checkoutStep = !paymentStatus ? 'form' : paymentStatus;
    // Transaction de test (cle af_test_...) ou espace en mode test : rien n'est encaisse.
    const enTest = !!((transaction as any)?.test || (transaction as any)?.application?.liveMode === false);

    const meta = ((transaction as any)?.metadata || {}) as Record<string, any>;
    // Nom et logo affiches : ceux passes a la session (plateformes, marques
    // multiples) priment sur ceux de l'espace.
    const surchargeMarchand = (meta.marchand || {}) as { nom?: string; logo?: string };
    const marchand = {
        nom: surchargeMarchand.nom || (transaction as any).application?.name || tr("marchand"),
        image: surchargeMarchand.logo || (transaction as any).application?.image,
    };
    const retourUrl = urlSure(meta.cancel_url || meta.cancelUrl || meta.failure_url);
    const successUrl = urlSure(meta.success_url);
    const titrePaiement = (transaction as any).description || meta.description || meta.title || tr("paiement_a", { nom: marchand.nom });
    const logosMoyens = Array.from(new Set(methods.map((m: any) => m.logo).filter(Boolean))) as string[];
    // Un meme operateur servi par plusieurs passerelles ne s'affiche qu'une fois. Le logo seul
    // ne suffit pas : un logo generique (momo.svg) ou faux cachait un autre operateur
    // (Flooz derriere T-Money au Togo, Express Union ou Zamtel derriere MTN).
    const cleMoyen = (m: any) => `${m.logo || m.name}|${getOperatorKey(m.name || "")}`;
    const methodesUniques = filteredMethods.filter((m, i, arr) => arr.findIndex((x) => cleMoyen(x) === cleMoyen(m)) === i);
    const methodesVisibles = toutesMethodes || methodesUniques.length <= 6 ? methodesUniques : methodesUniques.slice(0, 6);
    const lignesResume = [
        ...(transaction.customerEmail ? [{ label: tr("recu_envoye_a"), valeur: String(transaction.customerEmail) }] : []),
        ...(transaction.orderId ? [{ label: tr("reference"), valeur: String(transaction.orderId) }] : []),
    ];
    // Bascule FR / EN, discrete, dans l'en-tete de la carte.
    const selecteurLangue = (
        <div className="flex shrink-0 items-center gap-1.5 text-[11.5px] font-semibold" role="group" aria-label={tr("langue")}>
            {(["fr", "en"] as Langue[]).map((l, i) => (
                <React.Fragment key={l}>
                    {i > 0 && <span className="h-3 w-px" style={{ background: checkoutTheme.divider }} />}
                    <button type="button" onClick={() => changerLangue(l)} aria-pressed={langue === l} aria-label={tr(l === "fr" ? "langue_fr" : "langue_en")}
                        className="rounded px-1 py-0.5 tracking-wide transition-opacity hover:opacity-80"
                        style={{ color: langue === l ? checkoutTheme.textPrimary : checkoutTheme.textMuted }}>
                        {l.toUpperCase()}
                    </button>
                </React.Fragment>
            ))}
        </div>
    );

    /**
     * Ce que le moyen choisi demande encore : le numero mobile money (avec
     * son pays), ou le pays seul et l'avis de redirection. Sous la liste des
     * moyens dans les styles classique et boutique, DANS la ligne du moyen
     * choisi dans le style cartes.
     */
    /** La liste des pays, ouverte par le choix du pays en tete du formulaire ou par l'indicatif du champ telephone. */
    const listePays = (
        <>
                            {/* Liste des pays, partagee par le champ telephone et la ligne ci-dessus */}
                            <AnimatePresence>
                                {showCountryPicker && (
                                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                                        className="mt-2 overflow-hidden rounded-xl" style={{ border: `1px solid ${checkoutTheme.divider}`, background: checkoutTheme.cardBg }}>
                                        <div className="p-2">
                                            <div className="relative mb-2">
                                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: checkoutTheme.textMuted }} />
                                                <input placeholder={tr("pays_ou_indicatif")} value={searchCountry} onChange={e => { resetSessionTimer(); setSearchCountry(e.target.value); }} autoFocus
                                                    className="h-9 w-full rounded-lg pl-9 pr-3 outline-none" style={champStyle(checkoutTheme)} />
                                            </div>
                                            <div className="max-h-[200px] overflow-y-auto">
                                                {filteredCountries.map(c => (
                                                    <button key={c.code} type="button" onClick={() => { resetSessionTimer(); setSelectedCountryCode(c.code); setShowCountryPicker(false); }}
                                                        className="flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left transition-colors"
                                                        style={{ background: c.code === selectedCountryCode ? checkoutTheme.methodSelectedBg : 'transparent' }}
                                                        onMouseEnter={e => { if (c.code !== selectedCountryCode) (e.currentTarget as HTMLButtonElement).style.background = checkoutTheme.methodHoverBg; }}
                                                        onMouseLeave={e => { if (c.code !== selectedCountryCode) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}>
                                                        <Drapeau code={c.code} taille={14} />
                                                        <span className="flex-1 text-[13px]" style={{ color: checkoutTheme.textPrimary }}>{nomPays(c.code, langue, c.name)}</span>
                                                        <span className="text-[12px] tabular-nums" style={{ color: checkoutTheme.textMuted }}>{c.dial_code}</span>
                                                        {c.code === selectedCountryCode && <Check size={13} style={{ color: checkoutTheme.methodSelectedBorder }} />}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
        </>
    );
    const blocDetails = (
        <>
                            {/* Telephone Mobile Money */}
                            {needsPhone && (
                                <div>
                                    <Etiquette theme={checkoutTheme}>{tr("numero_moyen", { moyen: selectedMethod ? nomCourt(selectedMethod.name) : tr("mobile_money") })}</Etiquette>
                                    <div className="flex h-12 items-stretch overflow-hidden rounded-xl" style={{ background: checkoutTheme.methodHoverBg, border: `1px solid ${phoneError ? '#ef4444' : checkoutTheme.methodBorder}` }}>
                                        {/* L'indicatif suit le pays choisi en tete du formulaire : un seul endroit pour en changer. */}
                                        <span className="flex shrink-0 items-center gap-1.5 px-3" style={{ borderRight: `1px solid ${checkoutTheme.methodBorder}` }}>
                                            <Drapeau code={selectedCountry.code} taille={14} />
                                            <span className="text-[13px] font-medium" style={{ color: checkoutTheme.textPrimary }}>{selectedCountry.dial_code}</span>
                                        </span>
                                        <div className="relative flex-1">
                                            <input value={phoneNumber} onChange={(e) => {
                                                resetSessionTimer();
                                                // Nettoyage AVANT la limite de longueur : l'autocompletion
                                                // livre le numero complet ("+225 01 02 03 04 05") alors que
                                                // l'indicatif est deja affiche a gauche du champ.
                                                let val = e.target.value.replace(/\D/g, '');
                                                const dialRaw = (selectedCountry.dial_code || '').replace('+', '');
                                                if (dialRaw) {
                                                    // "00225..." ou "225..." : on retire l'indicatif, au besoin
                                                    // deux fois si le navigateur l'a colle sur celui du champ.
                                                    val = val.replace(/^00/, '');
                                                    while (val.startsWith(dialRaw) && val.length > dialRaw.length) {
                                                        val = val.slice(dialRaw.length);
                                                    }
                                                }
                                                val = val.slice(0, getPhoneFormat(selectedCountryCode).maxLen);
                                                setPhoneNumber(val);
                                                setPhoneError('');
                                            }} onBlur={() => { if (phoneNumber) { const complet = completerBenin(phoneNumber.replace(/\D/g, ''), selectedCountryCode); if (complet !== phoneNumber) setPhoneNumber(complet); const validation = validatePhoneNumber(complet, selectedCountryCode); setPhoneError(validation.error); } }} placeholder={getPhoneFormat(selectedCountryCode).placeholder} maxLength={getPhoneFormat(selectedCountryCode).maxLen + 10} type="tel" inputMode="numeric" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                                                className="h-full w-full bg-transparent px-3.5 pr-9 font-medium outline-none" style={{ color: checkoutTheme.textPrimary, fontSize: 16 }} />
                                            {identityLoading && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin" style={{ color: checkoutTheme.textMuted }} />}
                                            {identityProfile && !identityLoading && <CheckCircle2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: checkoutTheme.methodSelectedBorder }} />}
                                        </div>
                                    </div>
                                    {phoneError ? (
                                        <p className="mt-1.5 flex items-center gap-1.5 text-[12px]" style={{ color: '#ef4444' }}><X size={12} />{phoneError}</p>
                                    ) : identityMode && identityProfile ? (
                                        /* Payeur reconnu (identite Cartflox) : une ligne discrete a la
                                           place de l'aide, sous le numero qui l'a fait reconnaitre. */
                                        <motion.p key="bon-retour" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-1.5 truncate text-[11.5px]" style={{ color: checkoutTheme.textMuted }}>
                                            <span className="font-medium" style={{ color: checkoutTheme.textSecondary }}>{tr("bon_retour")}{identityProfile.name ? `, ${identityProfile.name.split(' ')[0]}` : ''}.</span>
                                            {identityProfile.totalPayments > 0 && <> {tr(identityProfile.totalPayments > 1 ? "paiements_reussis_plusieurs" : "paiements_reussis_un", { n: identityProfile.totalPayments })}</>}
                                        </motion.p>
                                    ) : (
                                        <p className="mt-1.5 text-[11.5px]" style={{ color: checkoutTheme.textMuted }}>{tr("numero_recevra")}</p>
                                    )}
                                </div>
                            )}

                            {/* Redirection vers la page de l'agregateur. La carte Stripe
                                en est exclue : elle se remplit ici, promettre une page
                                exterieure serait desormais faux. */}
                            {!needsPhone && !carteStripe && !paiementCarte && selectedMethod && (
                                <div className="flex items-center gap-3 rounded-xl px-3.5 py-3" style={{ background: checkoutTheme.secureBadgeBg }}>
                                    <span className="grid h-8 w-8 shrink-0 place-content-center rounded-full" style={{ background: checkoutTheme.cardBg, color: checkoutTheme.secureBadgeText }}><Globe size={15} /></span>
                                    <p className="text-[12.5px] leading-snug" style={{ color: checkoutTheme.secureBadgeText }}>
                                        {/(wave business|djamo)/i.test(selectedMethod.gateway || "")
                                            ? tr("confirmerez_application", { app: /djamo/i.test(selectedMethod.gateway || "") ? "Djamo" : "Wave" })
                                            : tr("finaliserez_page", { passerelle: selectedMethod.gateway || selectedMethod.name })}
                                    </p>
                                </div>
                            )}

        </>
    );
    /** Le bouton Payer suit le style : plus haut et plus rond dans les cartes. */
    const styleBouton: React.CSSProperties | undefined = style === "cartes" ? { height: 56, borderRadius: 16, fontSize: 16 } : (style === "boutique" || style === "express") ? { height: 52, borderRadius: 12 } : undefined;
    /** Choisir un moyen, sauf s'il est grise (indisponible partout pour le moment). */
    const choisirMoyen = (m: any) => { if (m?.indisponible) return; resetSessionTimer(); setSelectedMethod(m); };
    /** Une ligne de moyen qui s'ouvre sur place (styles cartes et express) : cercle, nom, logo, et le detail dedans. */
    const ligneAccordeon = (m: any, couleurChoix: string) => {
        const metaM = getMethodMeta(m.name);
        const isSelected = selectedMethod?.id === m.id;
        const isPreferred = identityProfile?.preferredMethod && (m.code?.toLowerCase() === identityProfile.preferredMethod.toLowerCase() || m.name?.toLowerCase().includes(identityProfile.preferredMethod.toLowerCase()));
        return (
            <div key={m.id} className="overflow-hidden rounded-2xl transition-colors" style={{ background: checkoutTheme.cardBg, border: `2px solid ${isSelected ? couleurChoix : checkoutTheme.methodBorder}` }}>
                <button type="button" role="radio" aria-checked={isSelected} aria-disabled={m.indisponible ? true : undefined} disabled={!!m.indisponible} title={m.indisponible ? etiquetteIndisponible(m) : undefined} onClick={() => choisirMoyen(m)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
                    <span className="grid h-[22px] w-[22px] shrink-0 place-content-center rounded-full" style={{ border: `2px solid ${isSelected ? couleurChoix : checkoutTheme.methodBorder}` }}>
                        {isSelected && <span className="h-2.5 w-2.5 rounded-full" style={{ background: couleurChoix }} />}
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold leading-tight" style={{ color: checkoutTheme.textPrimary }}>{nomCourt(m.name)}</span>
                        {isPreferred && <span className="block text-[11px]" style={{ color: checkoutTheme.textMuted }}>{tr("prefere")}</span>}
                        {m.indisponible && <span className="block text-[11.5px]" style={{ color: checkoutTheme.textMuted }}>{etiquetteIndisponible(m)}</span>}
                    </span>
                    <span className="grid h-9 w-14 shrink-0 place-content-center rounded-lg" style={{ background: checkoutTheme.methodHoverBg }}>
                        {m.logo ? <img src={m.logo} alt="" className="h-6 w-6 object-contain" /> : <span className="text-[10px] font-bold" style={{ color: metaM.color }}>{metaM.abbr}</span>}
                    </span>
                </button>
                {isSelected && <div className="flex flex-col gap-4 px-4 pb-4">{blocDetails}</div>}
            </div>
        );
    };
    /** Style express : les trois premiers moyens en gros boutons de couleur, les autres en dessous. */
    const expressMoyens = methodesVisibles.slice(0, 3);
    const autresMoyens = methodesVisibles.slice(3);
    const expressIds = new Set(expressMoyens.map((m) => m.id));
    const encreSur = (couleur: string) => {
        const h = couleur.replace('#', '');
        if (h.length !== 6) return '#ffffff';
        const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? '#111114' : '#ffffff';
    };

    return (
        <Coque theme={checkoutTheme} langue={langue} style={style} etape={checkoutStep === 'success' ? 3 : 2} test={meta.testMode === true || enTest} gauche={
            <PanneauMarchand theme={checkoutTheme} marchand={marchand} retourUrl={retourUrl}
                titre={titrePaiement} montant={formattedAmount} devise={displayCurrency} etiquette={tr("montant_a_payer")}
                sousMontant={isCurrencyConverted && formattedOriginalAmount ? tr("soit_environ", { montant: formattedOriginalAmount, devise: baseCurrency }) : null}
                lignes={lignesResume}
                enfants={<>
                    {logosMoyens.length > 0 && (
                        <div className="mt-6">
                            <LogosOperateurs logos={logosMoyens} theme={checkoutTheme} />
                            <p className="mt-2 text-[12px]" style={{ color: checkoutTheme.textMuted }}>{tr("moyens_acceptes")}</p>
                        </div>
                    )}
                    {qrPaiement && (
                        <div className="mt-6 hidden lg:sticky lg:top-6 lg:block">
                            <div className="flex items-center gap-4 rounded-2xl p-4"
                                style={{ background: checkoutTheme.cardBg, border: `1px solid ${checkoutTheme.cardBorder}` }}>
                                <img src={qrPaiement} alt={tr("qr_alt")} width={88} height={88}
                                    className="h-[88px] w-[88px] shrink-0 rounded-lg" />
                                <div className="min-w-0">
                                    <p className="text-[13px] font-semibold" style={{ color: checkoutTheme.textPrimary }}>{tr("qr_titre")}</p>
                                    <p className="mt-1 text-[12px] leading-relaxed" style={{ color: checkoutTheme.textMuted }}>
                                        {tr("qr_texte")}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </>} />
        }>
            <AnimatePresence mode="wait">
                {/* ═══ ETAPE : FORMULAIRE ═══ */}
                {checkoutStep === 'form' && (
                    <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                        {/* Moyens grises (sante des moyens) : un seul style pour les quatre rendus. */}
                        <style>{`button[role="radio"][aria-disabled="true"]{opacity:.45;cursor:not-allowed;filter:grayscale(1)}`}</style>
                        <div className="flex flex-col gap-5 px-6 pt-6 pb-2">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h1 className={style === "cartes" ? "text-[22px] font-bold tracking-tight" : (style === "boutique" || style === "express") ? "text-[22px] font-semibold tracking-tight" : "text-[18px] font-semibold tracking-tight"} style={{ color: checkoutTheme.textPrimary }}>{tr("moyen_de_paiement")}</h1>
                                    <p className="mt-0.5 text-[12.5px]" style={{ color: checkoutTheme.textMuted }}>{tr("choisissez_comment_payer", { montant: formattedAmount, devise: displayCurrency })}</p>
                                </div>
                                {selecteurLangue}
                            </div>

                            {dernierEchec && (
                                <Alerte theme={checkoutTheme} titre={tr("echec_titre")} texte={tr("echec_texte", { message: dernierEchec })}
                                    action={<button type="button" onClick={() => setDernierEchec(null)} className="text-[12px] font-medium underline underline-offset-2" style={{ color: checkoutTheme.textSecondary }}>{tr("fermer")}</button>} />
                            )}

                            {/* Paiement express (profil memorise sur cet appareil) */}
                            {expressProfile && !expressMode && filteredMethods.some(m => m.id === expressProfile.methodId) && (
                                <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl p-3.5" style={{ background: checkoutTheme.methodSelectedBg, border: `1px solid ${checkoutTheme.methodSelectedBorder}` }}>
                                    <div className="flex items-center gap-3">
                                        {/* Le logo du moyen memorise, pas un eclair generique : le
                                            client reconnait d'un coup d'oeil avec quoi il va payer.
                                            Meme pastille que la liste juste en dessous. L'eclair ne
                                            reste que si ce moyen n'a pas de logo. */}
                                        {(() => {
                                            const moyenExpress = filteredMethods.find((m) => m.id === expressProfile.methodId);
                                            return moyenExpress?.logo ? (
                                                <span className="grid h-9 w-9 shrink-0 place-content-center overflow-hidden rounded-full" style={{ background: '#fff', border: `1px solid ${checkoutTheme.divider}` }}>
                                                    <img src={moyenExpress.logo} alt="" className="h-6 w-6 object-contain" />
                                                </span>
                                            ) : (
                                                <span className="grid h-9 w-9 shrink-0 place-content-center rounded-full" style={{ background: checkoutTheme.accent, color: checkoutTheme.accentText }}><Zap size={15} /></span>
                                            );
                                        })()}
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[13px] font-semibold" style={{ color: checkoutTheme.textPrimary }}>{tr("payer_un_clic")}</p>
                                            <p className="truncate text-[12px]" style={{ color: checkoutTheme.textMuted }}>{expressProfile.methodName}, {expressProfile.phone}</p>
                                        </div>
                                        <button type="button" onClick={handleExpressPay} className="h-9 shrink-0 rounded-lg px-3.5 text-[12.5px] font-semibold" style={{ background: checkoutTheme.accent, color: checkoutTheme.accentText }}>{tr("payer")}</button>
                                    </div>
                                    <button type="button" onClick={() => setExpressProfile(null)} className="mt-2 text-[11.5px] underline underline-offset-2" style={{ color: checkoutTheme.textMuted }}>{tr("autre_moyen")}</button>
                                </motion.div>
                            )}

                            {/* Pays du client, en clair : il decide des moyens proposes et de
                                l'indicatif du champ telephone. La liste s'ouvre juste dessous. */}
                            <div>
                                <Etiquette theme={checkoutTheme} droite={<span className="text-[11.5px]" style={{ color: checkoutTheme.textMuted }}>{tr("pays_aide")}</span>}>
                                    {tr("pays")}
                                </Etiquette>
                                <button type="button" onClick={() => { resetSessionTimer(); setShowCountryPicker(!showCountryPicker); }} aria-expanded={showCountryPicker} aria-label={tr("changer_pays")}
                                    className="flex h-12 w-full items-center gap-2.5 rounded-xl px-3.5 text-left transition-colors" style={champStyle(checkoutTheme)}>
                                    <Drapeau code={selectedCountry.code} taille={16} />
                                    <span className="flex-1 truncate text-[14px] font-medium" style={{ color: checkoutTheme.textPrimary }}>{nomPays(selectedCountry.code, langue, selectedCountry.name)}</span>
                                    <span className="text-[12.5px] tabular-nums" style={{ color: checkoutTheme.textMuted }}>{selectedCountry.dial_code}</span>
                                    <ChevronDown size={14} className={`transition-transform ${showCountryPicker ? "rotate-180" : ""}`} style={{ color: checkoutTheme.textMuted }} />
                                </button>
                                {listePays}
                            </div>

                            {/* Moyens de paiement */}
                            <div>
                                <Etiquette theme={checkoutTheme} droite={identityProfile?.preferredMethod ? <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: checkoutTheme.textMuted }}><Star size={10} /> {tr("votre_habitude")}</span> : undefined}>
                                    {tr("payer_avec")}
                                </Etiquette>
                                {methodesUniques.length === 0 ? (
                                    <div className="rounded-xl px-4 py-6 text-center text-[13px]" style={{ background: checkoutTheme.methodHoverBg, color: checkoutTheme.textMuted }}>
                                        {tr("aucun_moyen_pays", { pays: nomPays(selectedCountry.code, langue, selectedCountry.name) })}
                                    </div>
                                ) : style === "express" ? (
                                    <div className="flex flex-col gap-4">
                                        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3" role="radiogroup" aria-label={tr("moyen_de_paiement")}>
                                            {expressMoyens.map((m) => {
                                                const couleur = getMethodMeta(m.name).color;
                                                const isSelected = selectedMethod?.id === m.id;
                                                return (
                                                    <button key={m.id} type="button" role="radio" aria-checked={isSelected} aria-disabled={m.indisponible ? true : undefined} disabled={!!m.indisponible} title={m.indisponible ? etiquetteIndisponible(m) : undefined} onClick={() => choisirMoyen(m)}
                                                        className="flex h-[52px] items-center justify-center gap-2 rounded-xl px-3 text-[14px] font-semibold transition-all"
                                                        style={{ background: couleur, color: encreSur(couleur), boxShadow: isSelected ? `0 0 0 2px ${checkoutTheme.cardBg}, 0 0 0 4px ${checkoutTheme.textPrimary}` : 'none' }}>
                                                        {m.logo && <span className="grid h-6 w-6 shrink-0 place-content-center overflow-hidden rounded-full" style={{ background: '#fff' }}><img src={m.logo} alt="" className="h-4 w-4 object-contain" /></span>}
                                                        <span className="truncate">{nomCourt(m.name)}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {selectedMethod && expressIds.has(selectedMethod.id) && (
                                            <div className="flex flex-col gap-4 rounded-xl p-4" style={{ border: `1px solid ${checkoutTheme.methodBorder}` }}>{blocDetails}</div>
                                        )}
                                        {autresMoyens.length > 0 && (
                                            <>
                                                <div className="flex items-center gap-3 text-[13px]" style={{ color: checkoutTheme.textMuted }}>
                                                    <span className="h-px flex-1" style={{ background: checkoutTheme.divider }} />{tr("ou_autrement")}<span className="h-px flex-1" style={{ background: checkoutTheme.divider }} />
                                                </div>
                                                <div className="flex flex-col gap-2.5" role="radiogroup" aria-label={tr("moyen_de_paiement")}>
                                                    {autresMoyens.map((m) => ligneAccordeon(m, checkoutTheme.methodSelectedBorder))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <div className={style === "cartes" ? "flex flex-col gap-2.5" : style === "boutique" ? "grid grid-cols-2 gap-2 sm:grid-cols-3" : "grid grid-cols-1 gap-2 sm:grid-cols-2"} role="radiogroup" aria-label={tr("moyen_de_paiement")}>
                                        {methodesVisibles.map((m) => {
                                            const metaM = getMethodMeta(m.name);
                                            const isSelected = selectedMethod?.id === m.id;
                                            const isPreferred = identityProfile?.preferredMethod && (m.code?.toLowerCase() === identityProfile.preferredMethod.toLowerCase() || m.name?.toLowerCase().includes(identityProfile.preferredMethod.toLowerCase()));
                                            const choisir = () => choisirMoyen(m);
                                            if (style === "cartes") return ligneAccordeon(m, checkoutTheme.textPrimary);
                                            // Style boutique : une tuile compacte, logo au-dessus du nom, bord sombre sur la choisie.
                                            if (style === "boutique") return (
                                                <button key={m.id} type="button" role="radio" aria-checked={isSelected} aria-disabled={m.indisponible ? true : undefined} disabled={!!m.indisponible} title={m.indisponible ? etiquetteIndisponible(m) : undefined} onClick={choisir}
                                                    className="flex min-w-0 flex-col items-start gap-2 rounded-xl px-3 py-2.5 text-left transition-colors"
                                                    style={{ background: isSelected ? checkoutTheme.methodSelectedBg : 'transparent', border: `1.5px solid ${isSelected ? checkoutTheme.textPrimary : checkoutTheme.methodBorder}` }}>
                                                    <span className="grid h-7 w-7 place-content-center overflow-hidden rounded-md" style={{ background: '#fff', border: `1px solid ${checkoutTheme.divider}` }}>
                                                        {m.logo ? <img src={m.logo} alt="" className="h-[18px] w-[18px] object-contain" /> : <span className="text-[9px] font-bold" style={{ color: metaM.color }}>{metaM.abbr}</span>}
                                                    </span>
                                                    <span className="min-w-0 w-full">
                                                        <span className="block truncate text-[13px] font-medium leading-tight" style={{ color: checkoutTheme.textPrimary }}>{nomCourt(m.name)}</span>
                                                        {isPreferred && <span className="block text-[10.5px]" style={{ color: checkoutTheme.textMuted }}>{tr("prefere")}</span>}{m.indisponible && <span className="block text-[10.5px]" style={{ color: checkoutTheme.textMuted }}>{etiquetteIndisponible(m)}</span>}
                                                    </span>
                                                </button>
                                            );
                                            return (
                                                <button key={m.id} type="button" role="radio" aria-checked={isSelected} aria-disabled={m.indisponible ? true : undefined} disabled={!!m.indisponible} title={m.indisponible ? etiquetteIndisponible(m) : undefined} onClick={() => choisirMoyen(m)}
                                                    className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors"
                                                    style={{ background: isSelected ? checkoutTheme.methodSelectedBg : 'transparent', border: `1.5px solid ${isSelected ? checkoutTheme.methodSelectedBorder : checkoutTheme.methodBorder}` }}>
                                                    <span className="grid h-8 w-8 shrink-0 place-content-center overflow-hidden rounded-full" style={{ background: '#fff', border: `1px solid ${checkoutTheme.divider}` }}>
                                                        {m.logo ? <img src={m.logo} alt="" className="h-5 w-5 object-contain" /> : <span className="text-[9px] font-bold" style={{ color: metaM.color }}>{metaM.abbr}</span>}
                                                    </span>
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate text-[13px] font-medium leading-tight" style={{ color: checkoutTheme.textPrimary }}>{nomCourt(m.name)}</span>
                                                        {isPreferred && <span className="block text-[10.5px]" style={{ color: checkoutTheme.textMuted }}>{tr("prefere")}</span>}{m.indisponible && <span className="block text-[10.5px]" style={{ color: checkoutTheme.textMuted }}>{etiquetteIndisponible(m)}</span>}
                                                    </span>
                                                    <span className="grid h-[18px] w-[18px] shrink-0 place-content-center rounded-full" style={{ border: `1.5px solid ${isSelected ? checkoutTheme.methodSelectedBorder : checkoutTheme.methodBorder}`, background: isSelected ? checkoutTheme.methodSelectedBorder : 'transparent' }}>
                                                        {isSelected && <Check size={11} strokeWidth={3} style={{ color: checkoutTheme.accentText }} />}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                                {methodesUniques.length > 6 && !toutesMethodes && (
                                    <button type="button" onClick={() => setToutesMethodes(true)} className="mt-2 text-[12px] font-medium underline underline-offset-2" style={{ color: checkoutTheme.textSecondary }}>
                                        {tr("voir_autres_moyens", { n: methodesUniques.length - 6 })}
                                    </button>
                                )}
                            </div>

                            {style !== "cartes" && style !== "express" && blocDetails}

                            {routingInfo && useSmartRouting && (
                                <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: checkoutTheme.secureBadgeBg }}>
                                    <Zap size={12} style={{ color: checkoutTheme.secureBadgeText }} />
                                    <p className="flex-1 truncate text-[11px] font-medium" style={{ color: checkoutTheme.secureBadgeText }}>{tr("meilleure_route", { route: routingInfo.recommended })}</p>
                                </div>
                            )}
                        </div>

                        <div className="px-6 pb-6 pt-3">
                            <BoutonPrincipal theme={checkoutTheme} onClick={handleFinalPay} style={styleBouton} disabled={isPaying || !selectedMethod || (needsPhone && !phoneNumber)}>
                                {isPaying ? <Loader2 size={16} className="animate-spin" /> : <><Lock size={14} /> {tr("payer_montant", { montant: formattedAmount, devise: displayCurrency })}</>}
                            </BoutonPrincipal>
                            <p className="mt-3 text-center text-[11px] leading-relaxed" style={{ color: checkoutTheme.textMuted }}>
                                {tr("aucun_frais")}
                            </p>
                        </div>
                    </motion.div>
                )}

                {/* ═══ ETAPE : CONNEXION A L'OPERATEUR ═══ */}
                {checkoutStep === 'initiating' && (
                    <motion.div key="initiating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="px-6 py-12">
                        <div className="flex flex-col items-center gap-4 text-center">
                            <AnneauAttente theme={checkoutTheme}>
                                {selectedMethod?.logo ? <img src={selectedMethod.logo} alt="" className="h-6 w-6 object-contain" /> : <Phone size={22} style={{ color: checkoutTheme.accent }} />}
                            </AnneauAttente>
                            <div>
                                <p className="text-[15px] font-semibold" style={{ color: checkoutTheme.textPrimary }}>{tr("connexion_a", { nom: selectedMethod ? nomCourt(selectedMethod.name) : tr("votre_operateur") })}</p>
                                <p className="mt-1 text-[12.5px]" style={{ color: checkoutTheme.textMuted }}>{tr("quelques_secondes")}</p>
                            </div>
                            {selectedMethod && needsPhone && (
                                <span className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px]" style={{ background: checkoutTheme.methodHoverBg, color: checkoutTheme.textSecondary }}>
                                    {selectedCountry.dial_code} {phoneNumber}
                                </span>
                            )}
                        </div>
                    </motion.div>
                )}

                {/* ═══ ETAPE : CODE DE PAIEMENT (OTP) ═══ */}
                {checkoutStep === 'require_otp' && (
                    <motion.div key="otp" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-5 px-6 py-6">
                        <div>
                            <h2 className="text-[17px] font-semibold tracking-tight" style={{ color: checkoutTheme.textPrimary }}>{paymentInstructions?.title || tr("code_de_paiement")}</h2>
                            <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: checkoutTheme.textMuted }}>{paymentInstructions?.detail}</p>
                        </div>
                        {paymentInstructions?.ussd && (
                            <div className="flex items-center justify-between gap-3 rounded-xl px-4 py-3" style={{ background: checkoutTheme.methodHoverBg, border: `1px solid ${checkoutTheme.methodBorder}` }}>
                                <div>
                                    <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: checkoutTheme.textMuted }}>{tr("a_composer")}</p>
                                    <p className="mt-0.5 text-[22px] font-semibold tracking-wide tabular-nums" style={{ color: checkoutTheme.textPrimary }}>{paymentInstructions.ussd}</p>
                                </div>
                                <BoutonSecondaire theme={checkoutTheme} onClick={() => { navigator.clipboard.writeText(paymentInstructions.ussd!); goeyToast.success(tr("code_copie")); }}><Copy size={14} /> {tr("copier")}</BoutonSecondaire>
                            </div>
                        )}
                        <div>
                            <Etiquette theme={checkoutTheme}>{tr("code_recu")}</Etiquette>
                            <input value={otpCode} onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={8}
                                className="h-14 w-full rounded-xl text-center text-[24px] font-semibold tracking-[0.35em] outline-none" style={champStyle(checkoutTheme)} />
                        </div>
                        <div className="flex gap-2">
                            <BoutonSecondaire theme={checkoutTheme} onClick={() => { setPaymentStatus(null); setOtpCode(''); }}>{tr("retour")}</BoutonSecondaire>
                            <BoutonPrincipal theme={checkoutTheme} onClick={handleVerifyOtp} disabled={otpCode.length < 4} className="flex-1" style={{ height: 40, fontSize: 14 }}><Lock size={13} /> {tr("valider_paiement")}</BoutonPrincipal>
                        </div>
                    </motion.div>
                )}

                {/* ═══ ETAPE : SAISIE DE LA CARTE ═══ */}
                {checkoutStep === 'carte' && (
                    <motion.div key="carte" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-5 px-6 py-6">
                        <div>
                            <h2 className="text-[17px] font-semibold tracking-tight" style={{ color: checkoutTheme.textPrimary }}>{tr("votre_carte")}</h2>
                            <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: checkoutTheme.textMuted }}>
                                {tr("carte_texte")}
                            </p>
                        </div>
                        {/* Sans cela, un formulaire bloque laissait un ecran MUET :
                            un titre, un bouton, et rien entre les deux. */}
                        {dernierEchec && (
                            <Alerte theme={checkoutTheme} titre={tr(formulairePret ? "echec_titre" : "carte_erreur_titre")} texte={tr(formulairePret ? "echec_texte" : "carte_erreur_texte", { message: dernierEchec })}
                                action={<button type="button" onClick={() => { setDernierEchec(null); setPaymentStatus(null); }} className="text-[12px] font-medium underline underline-offset-2" style={{ color: checkoutTheme.textSecondary }}>{tr("choisir_autre_moyen")}</button>} />
                        )}
                        {/* Attente visible tant que Stripe n'a pas dit « ready » : sans
                            elle, l'acheteur voit un titre, un bouton et un vide entre les deux. */}
                        {!formulairePret && !dernierEchec && (
                            <div className="flex flex-col gap-2.5" aria-hidden="true">
                                <div className="animate-pulse rounded-[10px]" style={{ height: 44, background: checkoutTheme.methodHoverBg }} />
                                <div className="flex gap-2.5">
                                    <div className="flex-1 animate-pulse rounded-[10px]" style={{ height: 44, background: checkoutTheme.methodHoverBg }} />
                                    <div className="flex-1 animate-pulse rounded-[10px]" style={{ height: 44, background: checkoutTheme.methodHoverBg }} />
                                </div>
                                <p className="text-[11.5px]" style={{ color: checkoutTheme.textMuted }}>{tr("ouverture_formulaire")}</p>
                            </div>
                        )}
                        <div ref={setMontureCarte} />
                        {montantEuro && (
                            <p className="text-[11.5px] leading-relaxed" style={{ color: checkoutTheme.textMuted }}>
                                {tr("carte_debit_avant")}<strong style={{ color: checkoutTheme.textSecondary }}>{montantEuro} EUR</strong>{tr("carte_debit_apres")}
                            </p>
                        )}
                        <div className="flex gap-2">
                            <BoutonSecondaire theme={checkoutTheme} onClick={() => { demandeCarteRef.current++; setPaymentStatus(null); }}>{tr("retour")}</BoutonSecondaire>
                            <BoutonPrincipal theme={checkoutTheme} onClick={confirmerCarte} disabled={!formulairePret || confirmationEnCours} className="flex-1" style={{ height: 40, fontSize: 14 }}>
                                {confirmationEnCours ? <Loader2 size={14} className="animate-spin" /> : <><Lock size={13} /> {tr("payer_montant", { montant: formattedAmount, devise: displayCurrency })}</>}
                            </BoutonPrincipal>
                        </div>
                    </motion.div>
                )}

                {/* ═══ ETAPE : MODE TEST, ISSUE A CHOISIR ═══ */}
                {checkoutStep === 'pending_user' && modeTestAttente && (
                    <motion.div key="test" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-5 px-6 py-7">
                        <div className="flex flex-col items-center gap-3 text-center">
                            <div className="grid h-14 w-14 place-content-center rounded-full" style={{ background: 'rgba(217,119,6,0.12)', color: '#b45309' }}>
                                <IconeFiole size={24} />
                            </div>
                            <div>
                                <h2 className="text-[17px] font-semibold tracking-tight" style={{ color: checkoutTheme.textPrimary }}>{tr("test_titre")}</h2>
                                <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: checkoutTheme.textMuted }}>{tr("test_texte")}</p>
                            </div>
                        </div>
                        <div className="flex flex-col gap-2.5">
                            <button type="button" disabled={simulationEnCours} onClick={() => simulerIssue('succes')} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-semibold" style={{ background: checkoutTheme.accent, color: '#ffffff', opacity: simulationEnCours ? 0.6 : 1 }}>
                                {tr("simuler_succes")}
                            </button>
                            <button type="button" disabled={simulationEnCours} onClick={() => simulerIssue('echec')} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-semibold" style={{ background: checkoutTheme.methodHoverBg, color: checkoutTheme.textPrimary, border: `1px solid ${checkoutTheme.methodBorder}`, opacity: simulationEnCours ? 0.6 : 1 }}>
                                {tr("simuler_echec")}
                            </button>
                            <button type="button" onClick={() => { setModeTestAttente(false); setPaymentStatus(null); }} className="mt-1 text-[12.5px] underline" style={{ color: checkoutTheme.textMuted }}>
                                {tr("revenir_choix")}
                            </button>
                        </div>
                    </motion.div>
                )}

                {/* ═══ ETAPE : CONFIRMATION SUR LE TELEPHONE ═══ */}
                {checkoutStep === 'pending_user' && !modeTestAttente && (
                    <motion.div key="pending" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-5 px-6 py-7">
                        <div className="flex flex-col items-center gap-3 text-center">
                            <TelephoneQuiVibre theme={checkoutTheme} />
                            <div>
                                <h2 className="text-[17px] font-semibold tracking-tight" style={{ color: checkoutTheme.textPrimary }}>{lienApplication ? tr("confirmez_dans", { nom: lienApplication.nom }) : tr("confirmez_telephone")}</h2>
                                <p className="mt-1 text-[12.5px]" style={{ color: checkoutTheme.textMuted }}>
                                    {lienApplication ? tr("a_confirmer_dans", { montant: formattedAmount, devise: displayCurrency, nom: lienApplication.nom }) : `${selectedMethod ? nomCourt(selectedMethod.name) : ''} ${selectedCountry.dial_code} ${phoneNumber}`}
                                </p>
                            </div>
                        </div>
                        {lienApplication && (
                            <div className="flex flex-col items-center gap-3">
                                <a href={lienApplication.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-semibold" style={{ background: checkoutTheme.accent, color: '#ffffff' }}>
                                    <Phone size={15} /> {tr("ouvrir", { nom: lienApplication.nom })}
                                </a>
                                {lienApplication.qr && (
                                    <div className="hidden flex-col items-center gap-1.5 sm:flex">
                                        <img src={lienApplication.qr} alt={tr("qr_code_de", { nom: lienApplication.nom })} width={168} height={168} className="rounded-xl" style={{ border: `1px solid ${checkoutTheme.methodBorder}` }} />
                                        <p className="text-[11.5px]" style={{ color: checkoutTheme.textMuted }}>{tr("sur_ordinateur")}</p>
                                    </div>
                                )}
                            </div>
                        )}
                        {consigneFournisseur && (
                            <p className="rounded-xl px-4 py-3 text-[12.5px] leading-relaxed" style={{ background: checkoutTheme.methodHoverBg, color: checkoutTheme.textSecondary }}>{consigneFournisseur}</p>
                        )}
                        {/* Le code de secours en grand : sur Android, un bouton ouvre le clavier avec le code
                            (iOS refuse les * et # dans un lien d'appel : le code s'y lit seulement). */}
                        {codeUssd && !lienApplication && (typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent) ? (
                            <a href={`tel:${codeUssd.replace(/#/g, '%23')}`} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-semibold no-underline" style={{ background: checkoutTheme.accent, color: '#ffffff' }}>
                                <Phone size={15} /> {tr("composer_code", { code: codeUssd })}
                            </a>
                        ) : (
                            <p className="rounded-xl px-4 py-2.5 text-center text-[15px] font-semibold tracking-wide" style={{ border: `1px solid ${checkoutTheme.methodBorder}`, color: checkoutTheme.textPrimary }}>{tr("composer_code", { code: codeUssd })}</p>
                        ))}
                        {/* La consigne du fournisseur (PawaPay : composez #120# puis le code PIN...) fait foi ;
                            les etapes generiques par operateur ne s'affichent qu'a defaut. */}
                        {!(consigneFournisseur && !lienApplication) && (
                        <ol className="flex flex-col gap-2.5 rounded-xl p-4" style={{ background: checkoutTheme.methodHoverBg }}>
                            {(lienApplication ? etapesApplication(lienApplication.nom, langue) : etapesConfirmation(selectedMethod, langue)).map((e, i) => (
                                <li key={i} className="flex items-start gap-3 text-[13px] leading-snug" style={{ color: checkoutTheme.textSecondary }}>
                                    <span className="grid h-5 w-5 shrink-0 place-content-center rounded-full text-[11px] font-semibold" style={{ background: checkoutTheme.cardBg, color: checkoutTheme.textPrimary, border: `1px solid ${checkoutTheme.methodBorder}` }}>{i + 1}</span>
                                    {e}
                                </li>
                            ))}
                        </ol>
                        )}
                        <div className="flex flex-col items-center gap-2">
                            <span className="inline-flex items-center gap-2 text-[12.5px] font-medium" style={{ color: checkoutTheme.accent }}><PointsAttente couleur={checkoutTheme.accent} /> {tr("en_attente_confirmation")}</span>
                            <button type="button" onClick={() => setPaymentStatus('verifying')} className="text-[12px] underline underline-offset-2" style={{ color: checkoutTheme.textMuted }}>{tr("deja_valide")}</button>
                            <button type="button" onClick={() => setPaymentStatus(null)} className="text-[12px] underline underline-offset-2" style={{ color: checkoutTheme.textMuted }}>{tr("retour")}</button>
                        </div>
                    </motion.div>
                )}

                {/* ═══ ETAPE : VERIFICATION ═══ */}
                {checkoutStep === 'verifying' && (
                    <motion.div key="verifying" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        {/* Qui doit repondre : la banque pour une carte, l'operateur sinon. */}
                        <EcranVerification theme={checkoutTheme} tr={tr} logo={selectedMethod?.logo}
                            repondant={!selectedMethod ? tr("votre_operateur")
                                : paiementCarte || /card|carte|visa|mastercard/i.test(`${selectedMethod.type} ${selectedMethod.code} ${selectedMethod.name}`) ? tr("votre_banque")
                                : nomCourt(selectedMethod.name)}
                            numero={needsPhone && phoneNumber ? `${selectedCountry.dial_code} ${phoneNumber}` : null}
                            onRetour={() => setPaymentStatus(null)} />
                    </motion.div>
                )}

                {/* ═══ ETAPE : SUCCES ═══ */}
                {checkoutStep === 'success' && (
                    <motion.div key="success" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-4 px-6 py-10 text-center">
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 220, damping: 14, delay: 0.1 }}
                            className="grid h-16 w-16 place-content-center rounded-full" style={{ background: '#12a594', color: '#fff', boxShadow: '0 0 0 8px rgba(18,165,148,0.12)' }}>
                            <Check size={30} strokeWidth={3} />
                        </motion.div>
                        <div>
                            <h2 className="text-[20px] font-semibold tracking-tight" style={{ color: checkoutTheme.textPrimary }}>{tr("paiement_reussi")}</h2>
                            <p className="mt-1 text-[14px]" style={{ color: checkoutTheme.textSecondary }}>{tr("montant_a", { montant: formattedAmount, devise: displayCurrency, nom: marchand.nom })}</p>
                            {transaction.customerEmail && <p className="mt-2 text-[12px]" style={{ color: checkoutTheme.textMuted }}>{tr("recu_envoye", { email: transaction.customerEmail })}</p>}
                            <p className="mt-1 text-[11px] tabular-nums" style={{ color: checkoutTheme.textMuted }}>{tr("reference_valeur", { ref: transaction.providerRef || transaction.orderId || transaction.id })}</p>
                        </div>
                        {successUrl ? (
                            <a href={successUrl} className="inline-flex h-11 items-center gap-2 rounded-xl px-5 text-[14px] font-semibold" style={{ background: checkoutTheme.accent, color: checkoutTheme.accentText, textDecoration: 'none' }}>
                                {tr("retourner_sur", { nom: marchand.nom })} <ArrowRight size={15} />
                            </a>
                        ) : (
                            <BoutonSecondaire theme={checkoutTheme} onClick={() => window.close()}>{tr("fermer_page")}</BoutonSecondaire>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Avertissement d'expiration de session */}
            <AnimatePresence>
                {showSessionWarning && (
                    <motion.div key="session-warn" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
                        className="mx-6 mb-4 flex items-center gap-2 rounded-lg px-3 py-2"
                        style={{ background: sessionSecondsLeft <= 30 ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)', border: `1px solid ${sessionSecondsLeft <= 30 ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)'}` }}>
                        <span className="flex-1 text-[12px] font-medium tabular-nums" style={{ color: sessionSecondsLeft <= 30 ? '#ef4444' : '#d97706' }}>
                            {sessionMinsLeft > 0 ? tr("expire_min_s", { min: sessionMinsLeft, sec: String(sessionSecsDisplay).padStart(2, '0') }) : tr("expire_s", { sec: String(sessionSecsDisplay).padStart(2, '0') })}
                        </span>
                        <button type="button" onClick={resetSessionTimer} className="rounded-md px-2 py-0.5 text-[11px] font-semibold" style={{ background: sessionSecondsLeft <= 30 ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)', color: sessionSecondsLeft <= 30 ? '#ef4444' : '#d97706' }}>
                            {tr("prolonger")}
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            <PiedCarte theme={checkoutTheme} whatsapp={whatsappMarchand((transaction as any)?.application)} />
        </Coque>
    );
}
