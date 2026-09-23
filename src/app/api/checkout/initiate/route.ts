import { detectProviderKey } from "@/lib/cle-fournisseur";
import { passerelleSertLeMoyen } from "@/lib/catalogue-moyens";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { messageBacASable } from "@/lib/mode-espace";
import { buildAdapterConfig as construireConfigAdaptateur } from "@/lib/orchestrator/executor";
import { contexteRoutage, ordonnerParMesure, enregistrerIssue } from "@/lib/orchestrator/routage-mesure";
import { categoriserEchec } from "@/lib/orchestrator/categorie-echec";
import { qrCartflox } from "@/lib/qr";
import { PaymentOrchestratorFactory } from "@/lib/orchestrator/factory";
import { PaymentRequest } from "@/lib/orchestrator/types";
import { PayDunyaAdapter } from "@/lib/orchestrator/adapters/paydunya.adapter";
import { Hub2Adapter } from "@/lib/orchestrator/adapters/hub2.adapter";
import {
    resolveGatewayOrder,
    updateSuccessScore,
    RoutingConfig as EngineConfig,
    PaymentContext,
} from "@/lib/orchestrator/routing-engine";
import { sendPaymentConfirmationEmail, sendPaymentReceiptEmail, sendCredentialsRefusedEmail } from "@/lib/email";
import { applyVerificationResult } from "@/lib/transaction-finalize";
import { masquerSecrets } from "@/lib/secret";
import { clePubliqueStripe } from "@/lib/stripe-cle-publique";
import { DEVISES_SANS_CENTIMES } from "@/lib/devises";

// ── Currency conversion for cross-country payments ──
const COUNTRY_CURRENCY_MAP: Record<string, string> = {
    // UEMOA (XOF)
    CI: 'XOF', SN: 'XOF', BJ: 'XOF', ML: 'XOF', BF: 'XOF', TG: 'XOF', NE: 'XOF', GW: 'XOF',
    // CEMAC (XAF)
    CM: 'XAF', GA: 'XAF', CG: 'XAF', TD: 'XAF', CF: 'XAF',
    // Other African
    GN: 'GNF', CD: 'CDF', GH: 'GHS', NG: 'NGN', KE: 'KES', TZ: 'TZS',
    UG: 'UGX', RW: 'RWF', ZA: 'ZAR', ZM: 'ZMW', MW: 'MWK', MZ: 'MZN',
    AO: 'AOA', ET: 'ETB', MG: 'MGA', SL: 'SLE', MR: 'MRU',
    // Global
    US: 'USD', GB: 'GBP', FR: 'EUR', DE: 'EUR',
};

// PawaPay 3-letter country suffix → ISO alpha-2 → currency
const METHOD_SUFFIX_TO_COUNTRY: Record<string, string> = {
    CIV: 'CI', SEN: 'SN', BEN: 'BJ', MLI: 'ML', BFA: 'BF', TGO: 'TG',
    GIN: 'GN', NER: 'NE', CMR: 'CM', GAB: 'GA', COG: 'CG', COD: 'CD',
    TCD: 'TD', CAF: 'CF', GHA: 'GH', NGA: 'NG', KEN: 'KE', TZA: 'TZ',
    RWA: 'RW', UGA: 'UG', ZAF: 'ZA', MDG: 'MG', SLE: 'SL', GNB: 'GW',
    MRT: 'MR', ZMB: 'ZM', MWI: 'MW', MOZ: 'MZ', AGO: 'AO', ETH: 'ET',
};

/**
 * Detect the required currency from a payment method code.
 * Method codes like MTN_MOMO_CMR, ORANGE_CIV contain a 3-letter country suffix.
 */
function detectCurrencyFromMethodCode(methodCode: string): string | null {
    const upper = (methodCode || '').toUpperCase();
    const parts = upper.split('_');
    // Try last segment as 3-letter country suffix
    for (let i = parts.length - 1; i >= 0; i--) {
        const seg = parts[i];
        if (seg.length === 3 && METHOD_SUFFIX_TO_COUNTRY[seg]) {
            const alpha2 = METHOD_SUFFIX_TO_COUNTRY[seg];
            return COUNTRY_CURRENCY_MAP[alpha2] || null;
        }
    }
    return null;
}

// Rates: 1 XOF → target currency. STATIC FALLBACK used when the live rate API
// is unavailable. Anchor: 1 USD ≈ 615 XOF. Updated 2026-06.
const XOF_RATES_FALLBACK: Record<string, number> = {
    XOF: 1, XAF: 1,       // Fixed parity UEMOA/CEMAC
    GNF: 14, CDF: 4.7, GHS: 0.019, NGN: 2.5, KES: 0.21, TZS: 4.3,
    UGX: 5.9, RWF: 2.3, ZAR: 0.029, ZMW: 0.042, MWK: 2.8, MZN: 0.104,
    AOA: 1.5, ETB: 0.23, MGA: 7.3, MAD: 0.016, DZD: 0.21, TND: 0.0048,
    EGP: 0.079, SLE: 0.037, MRU: 0.065,
    USD: 0.00163, EUR: 0.001524, GBP: 0.00127,
};

// Live rates cache (1 XOF → target). Refreshed at most once per 24h from a free
// no-key API; falls back to the static table on any failure.
let liveXofRates: Record<string, number> | null = null;
let liveXofRatesFetchedAt = 0;
const FX_TTL_MS = 24 * 60 * 60 * 1000;

async function refreshXofRatesIfStale(): Promise<void> {
    if (liveXofRates && Date.now() - liveXofRatesFetchedAt < FX_TTL_MS) return;
    try {
        const res = await fetch("https://open.er-api.com/v6/latest/XOF", {
            signal: AbortSignal.timeout(5000),
            cache: "no-store",
        });
        const data = await res.json();
        if (data?.result === "success" && data.rates && typeof data.rates === "object") {
            // Un cours vivant qui s'ecarte de plus de 20 % de la table de repli est
            // suspect (API compromise ou en panne) : on garde la table pour lui.
            const taux: Record<string, number> = { ...data.rates, XOF: 1 };
            for (const [dev, ref] of Object.entries(XOF_RATES_FALLBACK)) {
                const v = taux[dev];
                if (typeof v !== "number" || !(v > 0) || !(ref > 0) || Math.abs(v / ref - 1) > 0.2) taux[dev] = ref;
            }
            liveXofRates = taux;
            liveXofRatesFetchedAt = Date.now();
        }
    } catch {
        // keep last good / fall back to static table
    }
}

/** Zone franc : 1 EUR = 655,957 XOF, parite FIXE par traite, pas un cours. */
const PARITE_EUR = 1 / 655.957;
const ZONES_FRANC = new Set(['XOF', 'XAF']);

/**
 * Devises sans subdivision : le montant s'y exprime en unites entieres. Les
 * autres ont des centimes, et arrondir a l'unite y ferait payer jusqu'a 99
 * centimes de trop. 3 000 XOF valent 4,57 EUR, pas 5 EUR.
 */


function convertCurrency(amount: number, fromCurrency: string, toCurrency: string): number {
    if (fromCurrency === toCurrency) return amount;
    const de = (fromCurrency || '').toUpperCase();
    const vers = (toCurrency || '').toUpperCase();

    // La parite franc/euro est fixe : la prendre sur un cours du marche ferait
    // deriver le montant sans raison.
    if (ZONES_FRANC.has(de) && vers === 'EUR') {
        return Math.round(amount * PARITE_EUR * 100) / 100;
    }

    const rates = liveXofRates || XOF_RATES_FALLBACK;
    const toXOFRate = de === 'XOF' ? 1 : (1 / (rates[de] || XOF_RATES_FALLBACK[de] || 1));
    const amountInXOF = amount * toXOFRate;
    const rate = rates[vers] || XOF_RATES_FALLBACK[vers] || 1;
    const brut = amountInXOF * rate;
    return DEVISES_SANS_CENTIMES.has(vers) ? Math.round(brut) : Math.round(brut * 100) / 100;
}

/** Reponse brute d'un fournisseur renvoyee au navigateur : jamais avec une cle en echo. */
const brut = (v: any) => masquerSecrets(JSON.parse(JSON.stringify(v || {})));

function extractProviderErrorMessage(rawData: any): string {
    if (!rawData) return '';
    if (typeof rawData === 'string') return rawData;
    return (
        rawData?.message ||
        rawData?.error ||
        rawData?.description ||
        rawData?.response_text ||
        rawData?.rejectionReason?.rejectionMessage ||
        rawData?.rejectionReason?.rejectionCode ||
        rawData?.failureReason ||
        ''
    );
}

// Public API route — no session required
// Routes payment to the correct provider based on the routing engine
/** Indicatifs servis par Cartflox, les plus longs d'abord. */
const INDICATIFS = ['225','237','221','226','223','229','228','241','242','243','224','227','235','233','234','250','256','255','260','263'];

/**
 * L'autocompletion du navigateur remplit le champ telephone avec le numero
 * complet (+225 07...) alors que le formulaire prefixe deja l'indicatif du
 * pays : on recoit alors 2252250102030405. On retire la repetition.
 */
function nettoyerNumero(brut: string): string {
    const n = String(brut || '').replace(/\D/g, '');
    const ind = INDICATIFS.find((i) => n.startsWith(i));
    if (ind && n.slice(ind.length).startsWith(ind)) return n.slice(ind.length);
    return n;
}

export async function POST(req: NextRequest) {
    try {
        // --- Rate limiting: 30 initiate/min per IP ---
        const ip = getClientIp(req);
        const rl = await rateLimit(`checkout_initiate:${ip}`, { limit: 30, windowSec: 60 });
        if (!rl.allowed) {
            return NextResponse.json({ success: false, message: 'Too many requests. Please retry later.' }, {
                status: 429,
                headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) }
            });
        }

        const body = await req.json() as any;
        const { transactionId, gatewayId, methodCode, customerDetails } = body;

        if (customerDetails?.phone) {
            const propre = nettoyerNumero(customerDetails.phone);
            if (propre !== String(customerDetails.phone).replace(/\D/g, '')) {
                console.log(`📞 NUMERO CORRIGE: ${customerDetails.phone} → ${propre}`);
            }
            customerDetails.phone = propre;
            // Bénin : 10 chiffres depuis le 30 novembre 2024 (préfixe 01). Une
            // intégration qui envoie encore « 229 + 8 chiffres », ou 8 chiffres
            // nus avec le pays BJ, est complétée ici plutôt que refusée par la
            // passerelle.
            if (/^229\d{8}$/.test(customerDetails.phone)) customerDetails.phone = `22901${customerDetails.phone.slice(3)}`;
            else if (String(customerDetails.country || '').toUpperCase() === 'BJ' && /^\d{8}$/.test(customerDetails.phone)) customerDetails.phone = `01${customerDetails.phone}`;
        }

        if (!transactionId || !gatewayId || !methodCode || !customerDetails) {
            return NextResponse.json({ success: false, message: "Paramètres manquants" }, { status: 400 });
        }

        console.log(`🚀 CHECKOUT_INITIATE: tx=${transactionId} gw=${gatewayId} method=${methodCode} country=${customerDetails.country || '?'}`);

        // 1. Fetch Transaction
        const transaction = await prisma.transaction.findUnique({ where: { id: transactionId } });
        if (!transaction) {
            return NextResponse.json({ success: false, message: "Transaction introuvable" }, { status: 404 });
        }

        // 1b. SECURITE / idempotence : ne JAMAIS relancer un paiement sur une
        // transaction deja finalisee (anti double-paiement). On laisse passer
        // uniquement PENDING (en cours) et FAILED (nouvelle tentative).
        if (transaction.status === 'SUCCESS') {
            return NextResponse.json({ success: true, status: 'SUCCESS', alreadyPaid: true, message: "Transaction deja payee" });
        }
        if (transaction.status === 'REFUNDED' || transaction.status === 'CANCELLED') {
            return NextResponse.json({ success: false, status: transaction.status, message: "Cette transaction n'est plus payable." }, { status: 409 });
        }

        // BAC A SABLE : une transaction de TEST (cle af_test_...) ou un espace en
        // mode test ne touche JAMAIS un agregateur. La page de paiement propose
        // alors de simuler l'issue (POST /api/checkout/sandbox) et le webhook
        // part comme en production, avec livemode: false.
        const espaceTx = transaction.applicationId
            ? await prisma.application.findUnique({ where: { id: transaction.applicationId }, select: { paymentMode: true, liveMode: true } as any }) as any
            : null;
        const enBacASable = (transaction as any).test === true || (!!transaction.applicationId && !!espaceTx && espaceTx.liveMode !== true);
        if (enBacASable || gatewayId === 'sandbox') {
            if (!enBacASable) return NextResponse.json({ success: false, message: "Passerelle introuvable" }, { status: 404 });
            const metaTest = (transaction.metadata as any) || {};
            await prisma.transaction.update({
                where: { id: transactionId },
                data: {
                    customerName: customerDetails.name || transaction.customerName,
                    customerPhone: customerDetails.phone || transaction.customerPhone,
                    customerEmail: customerDetails.email || transaction.customerEmail,
                    metadata: { ...metaTest, sandbox: true, methodCode: methodCode || metaTest.methodCode || null },
                },
            }).catch(() => { });
            console.log(`[sandbox] paiement simulé : tx=${transactionId} ${(transaction as any).test ? "(clé de test)" : `(espace ${transaction.applicationId} en mode test)`}`);
            return NextResponse.json({ success: false, sandbox: true, status: 'SANDBOX', message: messageBacASable() }, { status: 403 });
        }

        // 2. Fetch primary Gateway
        const gateway = await prisma.gateway.findUnique({ where: { id: gatewayId } });
        if (!gateway) {
            return NextResponse.json({ success: false, message: "Passerelle introuvable" }, { status: 404 });
        }
        // SECURITY: the gateway must belong to the transaction's application.
        // Sans cela un appelant pourrait encaisser via la passerelle d'un autre
        // marchand en passant un gatewayId etranger.
        const appRecord = transaction.applicationId
            ? await prisma.application.findUnique({
                where: { id: transaction.applicationId },
                select: { liveMode: true } as any,
            }) as any
            : null;

        // GARDE : un espace en mode test ne touche JAMAIS un agregateur, il
        // denoue ses paiements de test par /api/checkout/sandbox.
        if (transaction.applicationId && appRecord && appRecord.liveMode !== true) {
            console.log(`[sandbox] paiement refuse : espace ${transaction.applicationId} en mode test`);
            return NextResponse.json({
                success: false,
                sandbox: true,
                message: messageBacASable(),
            }, { status: 403 });
        }
        if (!gateway.applicationId || gateway.applicationId !== transaction.applicationId) {
            return NextResponse.json({ success: false, message: "Passerelle invalide pour cette transaction" }, { status: 403 });
        }

        // 3. Update customer details
        const existingMeta = (transaction.metadata as any) || {};
        // Coordonnees : seulement celles fournies, bornees ; un tiers qui connait
        // l'identifiant ne remplace pas l'adresse du recu par la sienne.
        const champ = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
        await prisma.transaction.update({
            where: { id: transactionId },
            data: {
                customerName: champ(customerDetails.name, 120),
                customerPhone: champ(customerDetails.phone, 32),
                customerEmail: champ(customerDetails.email, 160),
                provider: gateway.name,
                metadata: { ...existingMeta, methodCode, gatewayId }
            }
        });

        const rawBaseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3012';
        const baseUrl = (rawBaseUrl === 'undefined' || !rawBaseUrl) ? 'http://localhost:3012' : rawBaseUrl;

        // 4. Build payment context for the routing engine
        const paymentContext: PaymentContext = {
            amount: transaction.amount,
            currency: transaction.currency,
            country: customerDetails.country || '',
            methodCode,
            methodType: undefined,
        };

        // 5. Load routing config and resolve ordered gateway list
        const rawRoutingConfig = await (prisma as any).routingConfig.findUnique({
            where: { applicationId: transaction.applicationId },
        }).catch(() => null);

        const engineConfig: EngineConfig = {
            algorithmKind: rawRoutingConfig?.algorithmKind ?? 'PRIORITY',
            fallbackOrder: rawRoutingConfig?.fallbackOrder ?? [],
            volumeSplits: rawRoutingConfig?.volumeSplits ?? null,
            routingRules: rawRoutingConfig?.routingRules ?? null,
            successScores: rawRoutingConfig?.successScores ?? null,
            allowedProviders: rawRoutingConfig?.allowedProviders ?? [],
            maxRetries: rawRoutingConfig?.maxRetries ?? 3,
            methodAssignments: (rawRoutingConfig?.methodAssignments as Record<string, string>) ?? {},
        };

        let orderedGatewayIds = resolveGatewayOrder(engineConfig, paymentContext, gatewayId);

        // Une passerelle de SECOURS qui ne sert pas ce moyen ne doit pas etre
        // essayee. La passerelle choisie par l'acheteur est toujours gardee :
        // la liste des moyens l'a deja validee.
        //
        // ⚠️ C'est ce controle qui manquait. Le marchand Panga (RD Congo) a vu
        // sept paiements Airtel Money en francs congolais partir chez PayDunya,
        // qui ne couvre que le Senegal, la Cote d'Ivoire, le Benin, le Togo, le
        // Mali et le Burkina : facture creee, AUCUN lien de paiement renvoye,
        // l'acheteur attendait une demande qui n'arrivait jamais, et l'abandon
        // automatique tombait trente minutes plus tard. Le classement par taux
        // mesures mettait meme PayDunya en TETE, PawaPay n'ayant aucune reussite
        // dans ce contexte : d'ou le filtre AVANT la mesure.
        const passerellesEnLice = await prisma.gateway.findMany({
            where: { id: { in: orderedGatewayIds } },
            select: { id: true, name: true, countries: true },
        });
        const passerelleParId = new Map<string, any>(passerellesEnLice.map((g: any) => [g.id, g]));
        const ecartees = orderedGatewayIds.filter(
            (id: string) => id !== gatewayId && !passerelleSertLeMoyen(passerelleParId.get(id), methodCode),
        );
        if (ecartees.length > 0) {
            orderedGatewayIds = orderedGatewayIds.filter((id: string) => !ecartees.includes(id));
            console.log(`🚫 ROUTAGE: ${methodCode} non servi par ${ecartees.join(', ')} -> ecartee(s) du secours`);
        }
        // L'ordre ci-dessus vient des regles du marchand. On le rejoue ensuite
        // sur les taux REELS mesures dans ce contexte (pays, methode, devise),
        // et les passerelles en panne passent derniere. L'ordre des regles sert
        // d'a priori : sans observation, rien ne bouge.
        const contexteMesure = contexteRoutage(paymentContext);
        try {
            const gws = await prisma.gateway.findMany({
                where: { id: { in: orderedGatewayIds } }, select: { id: true, name: true },
            });
            const cleDe = new Map<string, string>(gws.map((g: any) => [g.id, detectProviderKey(g.name)]));
            const cles = [...new Set(orderedGatewayIds.map((id: string) => cleDe.get(id)).filter(Boolean) as string[])];
            if (cles.length > 1) {
                const apriori: Record<string, number> = {};
                cles.forEach((k, i) => { apriori[k] = 0.92 - i * 0.01; });
                const mesure = await ordonnerParMesure(contexteMesure, cles, apriori);
                const { approche } = mesure;
                // Un moyen propre a Stripe (code en « -stripe » : carte, Google Pay,
                // ACH) se paie dans le formulaire integre de Stripe, que l'acheteur a
                // choisi : Stripe reste en tete, la mesure ne classe que les secours
                // (une passerelle jamais mesuree passait sinon devant, sur son a priori).
                const stripeEnTete = /-stripe$/i.test(methodCode) && cles.includes('stripe');
                const ordre = stripeEnTete ? ['stripe', ...mesure.ordre.filter((k) => k !== 'stripe')] : mesure.ordre;
                const rang = new Map(ordre.map((k, i) => [k, i]));
                // Tri stable : a rang egal, l'ordre du marchand est conserve.
                orderedGatewayIds = [...orderedGatewayIds].sort(
                    (x: string, y: string) => (rang.get(cleDe.get(x) || "") ?? 99) - (rang.get(cleDe.get(y) || "") ?? 99));
                console.log(`📊 MESURE [${approche}${stripeEnTete ? ', stripe en tete' : ''}] ${contexteMesure} -> ${ordre.join(' > ')}`);
            }
        } catch { /* la mesure ne doit jamais empecher un paiement */ }

        const maxAttempts = Math.min(orderedGatewayIds.length, engineConfig.maxRetries + 1);

        console.log(`🧠 ROUTING [${engineConfig.algorithmKind}]: order=${orderedGatewayIds.join(' → ')} (max ${maxAttempts} attempts)`);

        // Persist the routing decision for audit / debugging.
        // Fire-and-forget — must never block the payment flow.
        const assignmentKey = `${methodCode}||${customerDetails.country || ''}`;
        const assignedOverride = !!engineConfig.methodAssignments?.[assignmentKey];
        (async () => {
            try {
                const { recordRoutingDecision } = await import('@/lib/routing-audit');
                await recordRoutingDecision({
                    applicationId: transaction.applicationId || '',
                    transactionId: transaction.id,
                    algorithmKind: engineConfig.algorithmKind,
                    methodCode,
                    country: customerDetails.country || '',
                    currency: transaction.currency,
                    amount: transaction.amount,
                    orderedGatewayIds,
                    chosenGatewayId: orderedGatewayIds[0] || null,
                    assignedOverride,
                    reason: assignedOverride
                        ? `Override méthode → ${orderedGatewayIds[0]}`
                        : `${engineConfig.algorithmKind}, ${orderedGatewayIds.length} gateway(s), ${maxAttempts} attempt(s)`,
                });
            } catch { /* swallow — logging must never break checkout */ }
        })();

        // 6. Build base payment request — resolve correct currency for payment provider
        //    Priority: method code suffix (most accurate) > customer country > transaction currency
        const providerKey = detectProviderKey(gateway.name);
        const customerCountry = (customerDetails.country || '').toUpperCase();
        const methodCurrency = detectCurrencyFromMethodCode(methodCode);
        const countryCurrency = COUNTRY_CURRENCY_MAP[customerCountry];
        const deviseLocale = methodCurrency || countryCurrency || transaction.currency;
        /**
         * ⚠️ Stripe N'AFFICHE PAS son formulaire integre en XOF ni en XAF : son
         * Payment Element reste indefiniment en chargement, sans lever la
         * moindre erreur. Verifie en montant le meme formulaire avec trois
         * paiements identiques du meme compte : EUR et USD s'affichent, XOF non.
         * La carte est donc encaissee en EUROS dans ces zones, a la parite fixe.
         * Les autres devises gardent leur comportement.
         */
        const localCurrency = providerKey === 'stripe' && ZONES_FRANC.has((deviseLocale || '').toUpperCase())
            ? 'EUR'
            : deviseLocale;
        const needsCurrencyConversion = localCurrency !== transaction.currency;
        // Refresh live FX rates (cached 24h; falls back to the static table on
        // failure) so the charged amount uses up-to-date rates, not hardcoded ones.
        if (needsCurrencyConversion) await refreshXofRatesIfStale();
        const paymentAmount = needsCurrencyConversion
            ? convertCurrency(transaction.amount, transaction.currency, localCurrency)
            : transaction.amount;
        const paymentCurrency = localCurrency;

        console.log(`💱 CURRENCY: tx=${transaction.currency} method=${methodCode}→${methodCurrency || '?'} country=${customerCountry}→${countryCurrency || '?'} → final=${paymentCurrency} amount=${paymentAmount}`);

        const basePaymentRequest: PaymentRequest = {
            amount: paymentAmount,
            currency: paymentCurrency,
            customerName: customerDetails.name,
            customerEmail: customerDetails.email,
            customerPhone: customerDetails.phone,
            orderId: transaction.orderId,
            callbackUrl: `${baseUrl}/api/webhooks/${providerKey}`,
            returnUrl: `${baseUrl}/checkout/success?id=${transaction.id}`,
            // Echec ou abandon : on ramene l'acheteur sur sa page de paiement,
            // d'ou il peut reessayer sans repartir de zero.
            cancelUrl: `${baseUrl}/checkout/${transaction.id}`,
            // `otp` : code de paiement saisi chez nous, pour les fournisseurs qui l'attendent
            // avec la demande (FeexPay Orange CI/BF).
            metadata: { methodCode, country: customerDetails.country, originalAmount: transaction.amount, originalCurrency: transaction.currency, ...(customerDetails.otp ? { otp: customerDetails.otp } : {}) }
        };

        // ── STRIPE inline (Payment Element) : renvoie un client_secret, AUCUNE redirection ──
        // Déclenché par `inline: true` : l'intégration affiche le formulaire carte
        // DANS sa page. On ne bascule en carte embarquée que si une clé publique
        // utilisable est disponible ET le PaymentIntent est créé ; sinon on laisse
        // le flux standard (redirection Stripe Checkout) prendre le relais.
        if (providerKey === 'stripe' && (body as any)?.inline === true) {
            const stripeConfig = (gateway.config as any) || {};
            // Meme regle que la liste des moyens de paiement : une seule source.
            const publishableKey = clePubliqueStripe(gateway);
            if (publishableKey) {
                const stripeAdapter = PaymentOrchestratorFactory.getProvider(
                    'stripe',
                    buildAdapterConfig(gateway, stripeConfig, 'stripe')
                ) as any;
                const pi = await stripeAdapter.createPaymentIntent(basePaymentRequest);
                if (pi?.clientSecret && pi?.paymentIntentId) {
                    // Référence pour la réconciliation (verify / webhook / cron sync-pending).
                    await prisma.transaction.update({
                        where: { id: transactionId },
                        data: { providerRef: pi.paymentIntentId, provider: gateway.name },
                    }).catch(() => {});
                    return NextResponse.json({
                        success: true,
                        status: 'INLINE_CARD',
                        clientSecret: pi.clientSecret,
                        publishableKey,
                        provider: gateway.name,
                    });
                }
            }
            // Pas de clé publique / PI non créé : le flux standard plus bas produira
            // une redirection Stripe Checkout (aucune régression).
        }

        // ── HUB2: OTP submission for an action_required payment in progress ──
        // The checkout UI re-calls this endpoint with customerDetails.otp after
        // the customer types the code; route it to submitOtp instead of
        // creating a brand-new payment intent.
        if (customerDetails.otp && providerKey === 'hub2' && transaction.providerRef) {
            // L'identifiant du paiement n'est plus necessaire a la validation (Hub2
            // authentifie l'intention) : un code saisi est toujours transmis.
            const hub2PaymentId = String((existingMeta as any)?._hub2_payment_id || '');
            {
                const config = gateway.config as any || {};
                const hub2 = PaymentOrchestratorFactory.getProvider('hub2', buildAdapterConfig(gateway, config, 'hub2')) as Hub2Adapter;
                const otpResponse = await hub2.submitOtp(transaction.providerRef, hub2PaymentId, customerDetails.otp);
                // Meme finalisation que le webhook et le cron : courriels, notification,
                // webhook marchand (ecrire SUCCESS a la main les sautait).
                if (otpResponse.status === 'SUCCESS') await applyVerificationResult(transaction, otpResponse, "initiate:otp").catch(() => {});
                await (prisma as any).providerLog.create({
                    data: { transactionId, type: 'HUB2_OTP_SUBMIT', payload: JSON.parse(JSON.stringify(otpResponse.rawData || { status: otpResponse.status })) }
                }).catch(() => {});
                const codeRefuse = !!(otpResponse.rawData as any)?._hub2_otp_required;
                return NextResponse.json({
                    success: otpResponse.status !== 'FAILED',
                    // Code refuse par Hub2 : on le redemande au lieu de laisser la page attendre.
                    status: codeRefuse ? 'REQUIRE_OTP' : otpResponse.status,
                    message: codeRefuse
                        ? 'Code refusé. Générez un nouveau code de paiement, puis saisissez-le.'
                        : otpResponse.status === 'FAILED' ? String((otpResponse.rawData as any)?.message || (otpResponse.rawData as any)?.error || 'Le paiement a été refusé.') : undefined,
                    providerReference: transaction.providerRef,
                    provider: gateway.name,
                    rawData: brut(otpResponse.rawData)
                });
            }
        }

        // ── Code de confirmation saisi sur notre page (Magma OnePay, Paystack...) ──
        // Meme principe que Hub2 : on transmet le code au fournisseur au lieu de
        // creer une nouvelle demande. La reference fournisseur vient de l'initiation.
        if (customerDetails.otp && providerKey !== 'hub2' && transaction.providerRef) {
            const adaptateur: any = PaymentOrchestratorFactory.getProvider(providerKey, buildAdapterConfig(gateway, (gateway.config as any) || {}, providerKey));
            if (typeof adaptateur.soumettreCode === 'function') {
                const reponseCode = await adaptateur.soumettreCode(transaction.providerRef, customerDetails.otp);
                if (reponseCode.status === 'SUCCESS') await applyVerificationResult(transaction, reponseCode, "initiate:otp").catch(() => {});
                await (prisma as any).providerLog.create({
                    data: { transactionId, type: 'OTP_SUBMIT', payload: JSON.parse(JSON.stringify(reponseCode.rawData || { status: reponseCode.status })) }
                }).catch(() => {});
                const refuse = reponseCode.status === 'FAILED';
                return NextResponse.json({
                    success: !refuse,
                    status: refuse ? 'REQUIRE_OTP' : reponseCode.status,
                    message: refuse ? String(reponseCode.rawData?.error || 'Code refusé, réessayez.') : undefined,
                    providerReference: transaction.providerRef,
                    provider: gateway.name,
                    rawData: brut(reponseCode.rawData)
                });
            }
        }

        // ── PAYDUNYA: special SoftPay flow (USSD push, no redirect) ──
        // On failure, falls through to the general routing engine fallback loop below.
        let paydunyaAttempted = false;
        // Ce que PayDunya a répondu en refusant : c'est le motif du moyen choisi par
        // l'acheteur (sans lui, il lisait « Échec de l'initialisation du paiement »).
        let motifPaydunya = '';

        if (providerKey === 'paydunya') {
            paydunyaAttempted = true;
            try {
                const config = gateway.config as any || {};
                const adapterConfig = buildAdapterConfig(gateway, config, 'paydunya');
                const adapter = PaymentOrchestratorFactory.getProvider('paydunya', adapterConfig) as PayDunyaAdapter;

                let invoiceToken = transaction.providerRef;
                let invoiceCheckoutUrl: string | undefined;

                // PayDunya tokens never contain hyphens (e.g. "test_kIf5TinDpy").
                // If the stored providerRef is a UUID (e.g. left over from a
                // previous attempt via PawaPay/Hub2/etc.), discard it — otherwise
                // we'd build a 404 hosted-checkout URL with a fake token.
                const looksLikePaydunyaToken = (t: string) => !t.includes('-') && t.length <= 32;
                if (invoiceToken && !looksLikePaydunyaToken(invoiceToken)) {
                    invoiceToken = null;
                }

                if (invoiceToken) {
                    const check = await adapter.verifyPayment(invoiceToken).catch(() => null);
                    if (check?.status === 'SUCCESS') {
                        await applyVerificationResult(transaction, check, "initiate:relecture").catch(() => {});
                        return NextResponse.json({ success: true, status: 'SUCCESS', rawData: brut(check.rawData) });
                    }
                    // Re-create the invoice unless PayDunya confirmed it's still PENDING.
                    // Anything else (cancelled, failed, error, network) → fresh start.
                    if (!check || check.status !== 'PENDING') {
                        invoiceToken = null;
                    }
                }

                if (!invoiceToken) {
                    const initResponse = await adapter.initiatePayment(basePaymentRequest);
                    if (initResponse.status === 'FAILED') {
                        // Log the failure and fall through to routing engine fallback
                        console.log(`⚠️ [PAYDUNYA] Invoice creation failed — will try fallback gateways`);
                        console.error(`❌ [PAYDUNYA] Invoice error detail:`, JSON.stringify(initResponse.rawData));
                        motifPaydunya = extractProviderErrorMessage(initResponse.rawData);
                        await (prisma as any).providerLog.create({
                            data: {
                                transactionId,
                                type: 'SOFTPAY_INVOICE_FAILED',
                                payload: { provider: 'paydunya', gatewayId, error: 'Invoice creation failed', rawData: initResponse.rawData }
                            }
                        }).catch(() => {});
                        // Don't return — fall through to fallback loop
                    } else {
                        invoiceToken = initResponse.providerReference;
                        invoiceCheckoutUrl = initResponse.checkoutUrl;
                        await prisma.transaction.update({
                            where: { id: transactionId },
                            data: { providerRef: invoiceToken || null }
                        });
                    }
                }

                if (invoiceToken) {
                    // ── CARD payments via PayDunya use the hosted checkout page ──
                    // SoftPay only supports Mobile Money operators. For cards, redirect.
                    const lowerMethod = methodCode.toLowerCase();
                    const isCardMethod = lowerMethod === 'card' ||
                                         lowerMethod.startsWith('card') ||
                                         lowerMethod.includes('visa') ||
                                         lowerMethod.includes('mastercard') ||
                                         lowerMethod.includes('carte');
                    if (isCardMethod) {
                        const adapterMode = ((gateway.config as any)?.mode || 'live') === 'live' ? 'checkout' : 'sandbox-checkout';
                        const redirectUrl = invoiceCheckoutUrl || `https://paydunya.com/${adapterMode}/invoice/${invoiceToken}`;
                        await (prisma as any).providerLog.create({
                            data: {
                                transactionId,
                                type: 'PAYDUNYA_HOSTED_CHECKOUT',
                                payload: { provider: 'paydunya', gatewayId, redirectUrl }
                            }
                        }).catch(() => {});
                        return NextResponse.json({
                            success: true,
                            status: 'REDIRECT',
                            redirectUrl,
                            provider: gateway.name,
                            algorithm: engineConfig.algorithmKind,
                            rawData: { message: 'Redirection vers la page de paiement PayDunya' }
                        });
                    }

                    const requiresImmediateOtp = (lowerMethod.includes('orange') && ['CI', 'BF'].includes((customerDetails.country || '').toUpperCase()));
                    if (requiresImmediateOtp && !customerDetails.otp) {
                        // Orange CI/BF (SoftPay) : AUCUN SMS automatique — le client genere
                        // lui-meme son code de paiement via USSD. Le message et le code sont
                        // renvoyes au top-level pour que TOUS les fronts (checkout heberge,
                        // Opriel, LinkAfr...) puissent guider le client.
                        const otpUssd = (customerDetails.country || '').toUpperCase() === 'BF' ? '*144*4*6*#' : '#144*82#';
                        return NextResponse.json({
                            success: true,
                            status: 'REQUIRE_OTP',
                            ussdCode: otpUssd,
                            message: `Aucun SMS automatique : composez ${otpUssd} sur votre téléphone pour générer votre code de paiement Orange Money, puis saisissez-le ici.`,
                            rawData: { message: "Invoice created, waiting for user OTP" }
                        });
                    }

                    const softPayResponse = await adapter.processSoftPay(invoiceToken, methodCode, customerDetails);
                    const isAlreadyInitiated = softPayResponse.rawData?.message?.includes("dejà été initié");

                    if (isAlreadyInitiated) {
                        const verification = await adapter.verifyPayment(invoiceToken);
                        if (verification.status === 'SUCCESS') {
                            softPayResponse.status = 'SUCCESS';
                            softPayResponse.rawData = verification.rawData;
                        }
                    }

                    if (softPayResponse.status === 'SUCCESS') await applyVerificationResult(transaction, softPayResponse, "initiate:softpay").catch(() => {});

                    await (prisma as any).providerLog.create({
                        data: {
                            transactionId,
                            type: 'SOFTPAY_RESPONSE',
                            payload: JSON.parse(JSON.stringify(softPayResponse.rawData || { status: softPayResponse.status }))
                        }
                    }).catch(() => {});

                    // On success or pending or redirect — return immediately
                    if (softPayResponse.status !== 'FAILED') {
                        return NextResponse.json({
                            success: true,
                            status: isAlreadyInitiated ? 'REQUIRE_OTP' : softPayResponse.status,
                            redirectUrl: softPayResponse.checkoutUrl,
                            rawData: brut(softPayResponse.rawData)
                        });
                    }

                    // SoftPay FAILED — log and fall through to routing engine fallback
                    console.log(`⚠️ [PAYDUNYA] SoftPay failed for ${methodCode} — will try fallback gateways`);
                    motifPaydunya = extractProviderErrorMessage(softPayResponse.rawData);
                    await prisma.transaction.update({
                        where: { id: transactionId },
                        data: { providerRef: null }
                    }).catch(() => {});
                }
            } catch (err: any) {
                console.log(`⚠️ [PAYDUNYA] Exception: ${err.message} — will try fallback gateways`);
                await (prisma as any).providerLog.create({
                    data: {
                        transactionId,
                        type: 'PROVIDER_EXCEPTION',
                        payload: { provider: 'paydunya', gatewayId, error: err.message }
                    }
                }).catch(() => {});
            }
        }

        // ── ALL OTHER PROVIDERS (or PayDunya fallback): use routing engine ordered list ──

        // Idempotency check on primary provider (skip if PayDunya already cleared providerRef)
        if (transaction.providerRef && !paydunyaAttempted) {
            const config = gateway.config as any || {};
            const adapterConfig = buildAdapterConfig(gateway, config, providerKey);
            const existingAdapter = PaymentOrchestratorFactory.getProvider(providerKey, adapterConfig);
            const check = await existingAdapter.verifyPayment(transaction.providerRef).catch(() => null);
            if (check?.status === 'SUCCESS') {
                await applyVerificationResult(transaction, check, "initiate:relecture").catch(() => {});
                return NextResponse.json({ success: true, status: 'SUCCESS', rawData: brut(check.rawData) });
            }
        }

        let lastError = '';
        // L'acheteur a choisi UN moyen : si celui-la echoue, c'est SON motif qu'il doit
        // lire, pas celui d'une passerelle de secours qu'il n'a jamais demandee (un
        // refus de carte se lisait « Minimum checkout amount is 200 FCFA », message
        // d'un fournisseur Mobile Money essaye ensuite).
        let erreurPrincipale = motifPaydunya;
        let currentSuccessScores: Record<string, number> = (engineConfig.successScores as Record<string, number>) ?? {};
        let attempts = 0;

        for (const trialGwId of orderedGatewayIds) {
            if (attempts >= maxAttempts) break;

            // Skip the PayDunya gateway if it was already attempted in the SoftPay block above
            if (paydunyaAttempted && trialGwId === gatewayId) {
                continue;
            }

            attempts++;

            // Fetch gateway record (already have it for primary)
            let trialGateway: any = trialGwId === gatewayId ? gateway : null;
            if (!trialGateway) {
                trialGateway = await prisma.gateway.findUnique({ where: { id: trialGwId } }).catch(() => null);
                if (!trialGateway || trialGateway.status !== 'active') {
                    console.log(`⏭️ ROUTING: skip ${trialGwId} (not found or inactive)`);
                    continue;
                }
                // Meme regle que la passerelle primaire : seulement une passerelle de
                // l'espace. Les identifiants sont publics (la page de paiement les
                // envoie) : sans ce controle, une configuration de routage faisait
                // encaisser avec les cles d'un autre marchand.
                if (!trialGateway.applicationId || trialGateway.applicationId !== transaction.applicationId) {
                    console.log(`⏭️ ROUTING: skip ${trialGwId} (passerelle d'un autre espace)`);
                    continue;
                }
            }

            const trialProviderKey = detectProviderKey(trialGateway.name);

            // Stripe ne sait encaisser QUE la carte : le tenter en bascule pour
            // du mobile money ne peut jamais reussir et fait remonter au client
            // une erreur anglaise hors sujet. On le saute pour ces methodes.
            const isCardMethodCode = /card|visa|master|carte|amex|apple|google|klarna|ideal|sofort|giropay|bancontact|sepa|stripe/i.test(methodCode || '');
            if (trialProviderKey === 'stripe' && !isCardMethodCode) {
                console.log(`⏭️ ROUTING: skip Stripe pour methode mobile money (${methodCode})`);
                continue;
            }

            const trialConfig = trialGateway.config as any || {};
            const trialAdapterConfig = buildAdapterConfig(trialGateway, trialConfig, trialProviderKey);
            const trialPaymentRequest: PaymentRequest = {
                ...basePaymentRequest,
                callbackUrl: `${baseUrl}/api/webhooks/${trialProviderKey}`,
                metadata: { ...basePaymentRequest.metadata, methodCode }
            };

            const isFallback = trialGwId !== gatewayId;
            if (isFallback) {
                console.log(`🔄 [${engineConfig.algorithmKind}] Fallback attempt ${attempts}/${maxAttempts}: ${trialGateway.name}`);
            }

            try {
                const trialAdapter = PaymentOrchestratorFactory.getProvider(trialProviderKey, trialAdapterConfig);
                const initResponse = await trialAdapter.initiatePayment(trialPaymentRequest);

                if (initResponse.status === 'FAILED') {
                    lastError = extractProviderErrorMessage(initResponse.rawData) || `${trialGateway.name} FAILED`;
                    if (!isFallback && !erreurPrincipale) erreurPrincipale = lastError;
                    console.error(`❌ [${trialProviderKey}] initiate failed: ${lastError}`, initResponse.rawData);

                    // Update dynamic routing score (failure)
                    if (engineConfig.algorithmKind === 'DYNAMIC') {
                        currentSuccessScores = updateSuccessScore(currentSuccessScores, trialGwId, false);
                        await persistSuccessScores(transaction.applicationId!, currentSuccessScores);
                    }

                    await (prisma as any).providerLog.create({
                        data: {
                            transactionId,
                            type: isFallback ? 'FALLBACK_FAILED' : 'INITIATE_FAILED',
                            payload: {
                                provider: trialProviderKey,
                                gatewayId: trialGwId,
                                algorithm: engineConfig.algorithmKind,
                                attempt: attempts,
                                error: lastError
                            }
                        }
                    }).catch(() => {});

                    // Ce que l'echec dit au ROUTEUR. Une panne du fournisseur
                    // remplit son seau et justifie d'essayer ailleurs ; un refus
                    // de la banque du client ou un numero invalide ne se rattrape
                    // nulle part, et insister ne fait que retarder le message
                    // que l'acheteur attend.
                    const verdict = await categoriserEchec(trialProviderKey, initResponse.rawData);
                    enregistrerIssue({
                        contexte: contexteMesure, passerelle: trialProviderKey,
                        reussi: false, categorie: verdict.categorie,
                    }).catch(() => { });
                    if (verdict.decision === "ARRETER") {
                        if (verdict.message) {
                            lastError = verdict.message;
                            if (!isFallback) erreurPrincipale = verdict.message;
                        }
                        console.warn(`⛔ [${trialProviderKey}] ${verdict.categorie} : inutile de tenter une autre passerelle`);
                        break;
                    }
                    continue;
                }

                // ── Success ──

                // Update dynamic routing score (success)
                if (engineConfig.algorithmKind === 'DYNAMIC') {
                    currentSuccessScores = updateSuccessScore(currentSuccessScores, trialGwId, true);
                    await persistSuccessScores(transaction.applicationId!, currentSuccessScores);
                }

                const hub2OtpRequired = !!initResponse.rawData?._hub2_otp_required;
                // Tout fournisseur peut demander un code a saisir chez nous (`_otp_requis`).
                const codeRequis = hub2OtpRequired || !!initResponse.rawData?._otp_requis;
                const hub2PaymentId = initResponse.rawData?._hub2_payment_id;

                await prisma.transaction.update({
                    where: { id: transactionId },
                    data: {
                        // Jamais une chaine vide : l'index unique sur providerRef refusait la
                        // deuxieme transaction « en attente de code » (Orange Money via FeexPay).
                        providerRef: initResponse.providerReference || null,
                        provider: trialGateway.name,
                        metadata: {
                            ...existingMeta,
                            methodCode,
                            // Point at the gateway that actually won (a fallback may differ from the primary)
                            gatewayId: trialGwId,
                            // Sandbox payments are flagged so checkout pages can show a test banner
                            testMode: (trialConfig?.mode || 'live') === 'test',
                            // Keep the Hub2 payment id around for the OTP round-trip
                            ...(hub2OtpRequired && hub2PaymentId ? { _hub2_payment_id: hub2PaymentId } : {}),
                        },
                    }
                });

                await (prisma as any).providerLog.create({
                    data: {
                        transactionId,
                        type: isFallback ? 'FALLBACK_SUCCESS' : 'INITIATE_SUCCESS',
                        payload: {
                            provider: trialProviderKey,
                            gatewayId: trialGwId,
                            algorithm: engineConfig.algorithmKind,
                            attempt: attempts,
                            ref: initResponse.providerReference,
                            hasRedirect: !!initResponse.checkoutUrl
                        }
                    }
                }).catch(() => {});

                // Code de confirmation : l'acheteur le saisit sur notre page
                if (codeRequis) {
                    return NextResponse.json({
                        success: true,
                        status: 'REQUIRE_OTP',
                        // Consigne et code USSD (Orange : #144*82# en CI) affiches par le widget
                        // et la page, au lieu d'un champ de code sans explication.
                        message: (initResponse.rawData as any)?._hub2_otp_message || (initResponse.rawData as any)?._instructions || undefined,
                        ussdCode: (initResponse.rawData as any)?._hub2_otp_ussd || (initResponse.rawData as any)?._otp_ussd || undefined,
                        providerReference: initResponse.providerReference,
                        provider: trialGateway.name,
                        algorithm: engineConfig.algorithmKind,
                        rawData: brut(initResponse.rawData)
                    });
                }

                // Succes immediat (Qosic...) : la finalisation ecrit le statut ET fait
                // partir courriels, notification et webhook marchand. Avant, seuls les
                // courriels partaient et la transaction restait PENDING jusqu'au cron.
                const isDirectSuccess = !initResponse.checkoutUrl && initResponse.status === 'SUCCESS';
                if (isDirectSuccess) {
                    await applyVerificationResult({ ...transaction, provider: trialGateway.name, providerRef: initResponse.providerReference || null }, initResponse, "initiate:direct").catch(() => {});
                }

                // Lien d'application (Wave, Djamo) : l'acheteur reste sur NOTRE page,
                // qui affiche le bouton d'ouverture et un QR code, et surveille l'etat.
                const application = initResponse.rawData?._application;
                if (initResponse.checkoutUrl && application) {
                    const qr = await qrCartflox(initResponse.checkoutUrl, 480).catch(() => null);
                    return NextResponse.json({
                        success: true,
                        status: 'APP_LINK',
                        application,
                        redirectUrl: initResponse.checkoutUrl,
                        qr,
                        providerReference: initResponse.providerReference,
                        provider: trialGateway.name,
                        algorithm: engineConfig.algorithmKind,
                        rawData: brut(initResponse.rawData)
                    });
                }

                // Redirect flow
                if (initResponse.checkoutUrl) {
                    return NextResponse.json({
                        success: true,
                        status: 'REDIRECT',
                        redirectUrl: initResponse.checkoutUrl,
                        providerReference: initResponse.providerReference,
                        provider: trialGateway.name,
                        algorithm: engineConfig.algorithmKind,
                        rawData: brut(initResponse.rawData)
                    });
                }

                // USSD push / direct charge
                return NextResponse.json({
                    success: true,
                    status: initResponse.status,
                    providerReference: initResponse.providerReference,
                    provider: trialGateway.name,
                    algorithm: engineConfig.algorithmKind,
                    rawData: brut(initResponse.rawData)
                });

            } catch (err: any) {
                lastError = err.message || 'Exception';
                if (!isFallback && !erreurPrincipale) erreurPrincipale = lastError;

                if (engineConfig.algorithmKind === 'DYNAMIC') {
                    currentSuccessScores = updateSuccessScore(currentSuccessScores, trialGwId, false);
                    await persistSuccessScores(transaction.applicationId!, currentSuccessScores);
                }

                await (prisma as any).providerLog.create({
                    data: {
                        transactionId,
                        type: 'PROVIDER_EXCEPTION',
                        payload: {
                            provider: trialProviderKey,
                            gatewayId: trialGwId,
                            algorithm: engineConfig.algorithmKind,
                            attempt: attempts,
                            error: lastError
                        }
                    }
                }).catch(() => {});
                continue;
            }
        }

        // All attempts exhausted
        const motifMontre = erreurPrincipale || lastError;
        console.error(`🚨 CHECKOUT_INITIATE FAILED: tx=${transactionId} gw=${gatewayId} method=${methodCode} error=${motifMontre || 'unknown'}${erreurPrincipale && erreurPrincipale !== lastError ? ` (secours: ${lastError})` : ''}`);
        // Une cle refusee par l'agregateur n'est pas un echec du payeur : le marchand
        // doit le savoir tout de suite, dans son tableau de bord, pas dans un journal serveur.
        if (/identifiants|authentication|unauthori[sz]ed|invalid (api |secret |private |public )?(key|token|credential)|cl[eé] (api )?(invalide|refus)|forbidden|access denied|activer votre compte|compte (n'est )?(pas |non )activ|account (is )?not (yet )?activ|not activated/i.test(lastError)) {
            prevenirClesRefusees(transaction.applicationId, gateway.name, lastError).catch(() => {});
        }
        return NextResponse.json({
            success: false,
            message: motifMontre || `Échec de l'initialisation du paiement (${gateway.name})`
        }, { status: 502 });

    } catch (error: any) {
        console.error("🚨 CHECKOUT_INITIATE ERROR", error);
        // Le detail (Prisma, reseau...) va au journal ; l'acheteur lit une phrase, pas une trace.
        return NextResponse.json({
            success: false,
            message: "Une erreur technique est survenue de notre côté. Réessayez dans un instant.",
            code: "internal",
        }, { status: 500 });
    }
}

/** Send payment confirmation to merchant + receipt to customer, respecting their notification settings */
async function sendPaymentNotifications(
    transaction: any,
    providerName: string,
    customerDetails: { name: string; email: string; phone: string; country: string },
    methodCode: string,
    applicationId: string,
) {
    try {
        const app = await prisma.application.findUnique({
            where: { id: applicationId },
            select: { name: true, metadata: true, user: { select: { email: true, name: true } } }
        });
        if (!app) return;

        const meta = (app.metadata as any) || {};
        const notifyMerchant = meta.notifyMerchantOnPayment !== false; // default: true
        const notifyCustomer = meta.notifyCustomerOnPayment !== false; // default: true

        const completedAt = new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Abidjan', dateStyle: 'long', timeStyle: 'short' });
        const merchantEmail = app.user?.email || '';
        const merchantName = app.name || 'Marchand';

        const promises: Promise<unknown>[] = [];

        if (notifyMerchant && merchantEmail) {
            promises.push(sendPaymentConfirmationEmail({
                to: merchantEmail,
                merchantName,
                customerName: customerDetails.name || transaction.customerName || 'Client',
                customerEmail: customerDetails.email || transaction.customerEmail || '',
                amount: transaction.amount,
                currency: transaction.currency,
                method: methodCode,
                provider: providerName,
                orderId: transaction.orderId,
                transactionId: transaction.id,
                completedAt,
            }));
        }

        const customerEmail = customerDetails.email || transaction.customerEmail;
        if (notifyCustomer && customerEmail) {
            promises.push(sendPaymentReceiptEmail({
                to: customerEmail,
                customerName: customerDetails.name || transaction.customerName || 'Client',
                merchantName,
                amount: transaction.amount,
                currency: transaction.currency,
                method: methodCode,
                orderId: transaction.orderId,
                completedAt,
            }));
        }

        await Promise.allSettled(promises);
    } catch (err) {
        console.error('[sendPaymentNotifications]', err);
    }
}

/** Persist updated success scores back to DB (DYNAMIC routing) */
async function persistSuccessScores(applicationId: string, scores: Record<string, number>) {
    try {
        await (prisma as any).routingConfig.update({
            where: { applicationId },
            data: { successScores: scores }
        });
    } catch { }
}

/**
 * Config d'adaptateur, a partir d'une passerelle en base.
 *
 * Il y avait ici une SECONDE implementation, copiee de l'executeur et partie a
 * la derive : elle ne dechiffrait pas les colonnes `apiKey`/`apiSecret` et, en
 * mode test, retombait sur les cles de PRODUCTION pour tous les fournisseurs
 * dont l'adaptateur lit un autre nom de champ. On delegue desormais a
 * l'implementation unique : une seule regle, un seul endroit a corriger.
 */
function buildAdapterConfig(gateway: any, config: any, providerName: string): any {
    return construireConfigAdaptateur({ ...gateway, config }, providerName);
}

// SoftPay : le navigateur du marchand appelle cet endpoint depuis son propre
// domaine ; les en-tetes CORS sont poses par next.config (headers()).
export async function OPTIONS() {
    return new NextResponse(null, { status: 204 });
}

/** Previent le proprietaire de l'espace que l'agregateur refuse ses identifiants, au plus une fois par 24 h. */
async function prevenirClesRefusees(applicationId: string | null | undefined, passerelle: string, detail: string) {
    if (!applicationId) return;
    const app = await prisma.application.findUnique({ where: { id: applicationId }, select: { userId: true, name: true, user: { select: { email: true, name: true } } } });
    if (!app?.userId) return;
    const title = `Vos identifiants ${passerelle} sont refusés`;
    const recent = await (prisma as any).notification.findFirst({
        where: { userId: app.userId, title, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
    if (recent) return;
    await createNotification({
        userId: app.userId,
        type: "security",
        title,
        body: `Les paiements de vos clients via ${passerelle} échouent : ${detail} Ouvrez Passerelles pour vérifier la clé API et son environnement (test ou production).`,
        link: "/gateways",
    });
    // Et par e-mail : un marchand n'a pas forcement son tableau de bord ouvert quand ses clients echouent.
    if (app.user?.email) {
        await sendCredentialsRefusedEmail({
            to: app.user.email,
            prenom: (app.user.name || "").trim().split(/\s+/)[0] || undefined,
            merchantName: app.name,
            gateway: passerelle,
            detail,
        });
    }
}
