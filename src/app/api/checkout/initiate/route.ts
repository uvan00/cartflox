import { devisePourPayPal } from '@/lib/orchestrator/adapters/paypal.adapter';
import { detectProviderKey } from "@/lib/cle-fournisseur";
import { cleFournisseurDuNom } from "@/lib/catalogue-moyens";
import { CODES_OPERATEUR_FERME, choisirPasserelleSaine, etatDuMoyen, lireSante, moyenDuCode, signalerIndisponible } from "@/lib/orchestrator/sante-moyens";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { messageBacASable } from "@/lib/mode-espace";
import { buildAdapterConfig as construireConfigAdaptateur } from "@/lib/orchestrator/executor";
import { contexteRoutage, contexteRoutageAncien, enregistrerIssue, lireMesures } from "@/lib/orchestrator/routage-mesure";
import { IDENTIFIANTS_REFUSES, categoriserEchec, categoriserException } from "@/lib/orchestrator/categorie-echec";
import { router } from "@/lib/orchestrator/routeur";
import { jouerTentatives } from "@/lib/orchestrator/tentatives";
import { VERIFIABLES_PAR_NOTRE_REFERENCE, depotPrisma } from "@/lib/orchestrator/tentatives-depot";
import { leverVerrou, poserVerrou } from "@/lib/orchestrator/verrou-initiation";
import { completerDecision } from "@/lib/routing-audit";
import { qrCartflox } from "@/lib/qr";
import { PaymentOrchestratorFactory } from "@/lib/orchestrator/factory";
import { PaymentRequest } from "@/lib/orchestrator/types";
import { PayDunyaAdapter } from "@/lib/orchestrator/adapters/paydunya.adapter";
import { Hub2Adapter } from "@/lib/orchestrator/adapters/hub2.adapter";
import type { RoutingConfig as EngineConfig, PaymentContext } from "@/lib/orchestrator/routing-engine";
import { sendPaymentConfirmationEmail, sendPaymentReceiptEmail, sendCredentialsRefusedEmail } from "@/lib/email";
import { applyVerificationResult } from "@/lib/transaction-finalize";
import { masquerSecrets } from "@/lib/secret";
import { clePubliqueStripe } from "@/lib/stripe-cle-publique";
import { DEVISES_SANS_CENTIMES } from "@/lib/devises";
import { DEVISE_PAYS_CHECKOUT, ZONES_FRANC, convertir, deviseDuMoyen, rafraichirTaux } from "@/lib/taux-change";
import { dernierEnvoi, relanceRetenue } from "@/lib/relance-paiement";

// ── Conversion de devise : le taux de change de l'instance (lib/taux-change.ts),
// partage avec les tableaux de bord. Noms d'origine gardes ici.
const COUNTRY_CURRENCY_MAP = DEVISE_PAYS_CHECKOUT;
const detectCurrencyFromMethodCode = (code: string) => deviseDuMoyen(code);
const refreshXofRatesIfStale = rafraichirTaux;
const convertCurrency = convertir;

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

/**
 * Motif d'un refus de PayDunya, lisible par l'acheteur. Le refus de montant arrive
 * en anglais (« Invalid Total Amount. Mimimum checkout amount is 200 FCFA. », code
 * 4003, faute comprise) : vu le 04/10/2026 sur des paiements Wave de 50 et 100 F.
 */
function motifPaydunyaLisible(message: string): string {
    const minimum = /mi[nm]imum checkout amount is\s*([\d\s.,]+?)\s*FCFA/i.exec(message || '');
    if (minimum) return `Ce moyen de paiement demande au moins ${minimum[1].trim()} F CFA. Choisissez un autre moyen de paiement.`;
    return message;
}

/**
 * Refus de montant de PawaPay, lisible par l'acheteur : il arrive en anglais (« The amount
 * needs to be more than '10' and less than '6250000' for the country 'COD'. », « Transaction
 * amount 6406389 exceeds the maximum limit of 1000000 »). Vu le 05/10/2026 sur 6 406 389 CDF
 * par Orange RDC. Null si le refus ne porte pas sur le montant.
 */
function motifMontantLisible(rawData: any, devise: string): string | null {
    const texte = [rawData?.failureReason?.failureMessage, rawData?.rejectionReason?.rejectionMessage, rawData?.error, rawData?.message]
        .filter((v) => typeof v === 'string').join(' ');
    const nombre = (v: string) => Number(v).toLocaleString('fr-FR');
    const bornes = /more than '?(\d+(?:\.\d+)?)'? and less than '?(\d+(?:\.\d+)?)'?/i.exec(texte);
    if (bornes) return `Ce moyen de paiement accepte de ${nombre(bornes[1])} à ${nombre(bornes[2])} ${devise} par paiement. Choisissez un autre moyen de paiement.`;
    const plafond = /maximum limit of\s*(\d+(?:\.\d+)?)/i.exec(texte);
    if (plafond) return `Ce moyen de paiement accepte au plus ${nombre(plafond[1])} ${devise} par paiement. Choisissez un autre moyen de paiement.`;
    const plancher = /minimum limit of\s*(\d+(?:\.\d+)?)/i.exec(texte);
    if (plancher) return `Ce moyen de paiement demande au moins ${nombre(plancher[1])} ${devise}. Choisissez un autre moyen de paiement.`;
    return null;
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
    let verrouPose = false;
    let transactionVerrouillee = '';
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
        const { transactionId, methodCode, customerDetails } = body;
        // Peut changer plus bas : depart d'une passerelle saine (sante des moyens).
        let gatewayId: string = body.gatewayId;

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
        let transaction = await prisma.transaction.findUnique({ where: { id: transactionId } });
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

        // 1b bis. VERROU d'initiation (08/10/2026, modele Hyperswitch : un seul chemin a
        // la fois par paiement). Deux clics rapproches ou deux onglets lancaient deux
        // demandes chez le fournisseur avant que la premiere ait ecrit sa reference. Il
        // expire seul apres 90 s et se leve a la fin de cette requete (bloc finally).
        transactionVerrouillee = transactionId;
        verrouPose = await poserVerrou(transactionId);
        if (!verrouPose) {
            console.log(`🔒 VERROU: tx=${transactionId} une initiation est deja en cours`);
            return NextResponse.json({ success: false, enCours: true, message: "Un paiement est déjà en cours de traitement pour cette commande. Patientez quelques secondes, puis réessayez." }, { status: 409 });
        }
        // Relecture sous verrou : les ecritures qui suivent repartent des metadonnees a jour.
        transaction = (await prisma.transaction.findUnique({ where: { id: transactionId } })) ?? transaction;

        // 1c. Une demande attend encore sur CE telephone avec CE moyen (moins de 90 s) :
        // on n'en envoie pas une autre par-dessus (lib/relance-paiement.ts).
        const enAttente = relanceRetenue(transaction, methodCode, String(customerDetails?.phone || ''));
        if (enAttente) {
            console.log(`⏸️ RELANCE_RETENUE: tx=${transactionId} demande en attente depuis ${Math.round((Date.now() - Date.parse(enAttente.le)) / 1000)} s`);
            return NextResponse.json({
                success: true,
                status: 'PENDING',
                dejaEnvoye: true,
                providerReference: transaction.providerRef,
                provider: transaction.provider,
                rawData: {
                    ...(enAttente.consigne ? { _instructions: enAttente.consigne } : {}),
                    ...(enAttente.ussd ? { _ussd: enAttente.ussd } : {}),
                },
            });
        }

        // BAC A SABLE : une transaction de TEST (cle af_test_...) ou un espace en
        // mode test ne touche JAMAIS un agregateur. La page de paiement propose
        // alors de simuler l'issue (POST /api/checkout/sandbox) et le webhook
        // part comme en production, avec livemode: false.
        const espaceTx = transaction.applicationId
            ? await prisma.application.findUnique({ where: { id: transaction.applicationId }, select: { liveMode: true } as any }) as any
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

        // 1c. SANTE DES MOYENS (25/09/2026) : le moyen est en panne chez la
        // passerelle proposee par la page (operateur ferme chez l'agregateur, ou
        // refus recents) ? On part d'une passerelle de l'espace qui le sert et
        // qui marche. Aucune : on le dit tout de suite, sans rien tenter ni
        // renvoyer le client vers une page d'agregateur qui echouerait aussi.
        if (transaction.applicationId) {
            const sain = await choisirPasserelleSaine({
                applicationId: transaction.applicationId, gatewayId, methodCode, pays: customerDetails.country,
            }).catch(() => ({} as Awaited<ReturnType<typeof choisirPasserelleSaine>>));
            if (sain.indisponible) {
                console.log(`🩺 SANTE: ${methodCode} ${customerDetails.country || ''} indisponible partout, aucun essai`);
                return NextResponse.json({ success: false, indisponible: true, status: 'UNAVAILABLE', moyen: sain.libelle, message: sain.message }, { status: 503 });
            }
            if (sain.gatewayId && sain.gatewayId !== gatewayId) {
                console.log(`🩺 SANTE: ${methodCode} indisponible chez ${sain.depuis} -> depart ${sain.nom}`);
                gatewayId = sain.gatewayId;
            }
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
        // Une passerelle de CET espace, et seulement elle (secours compris, plus bas).
        const passerelleDeLEspace = (g: { applicationId?: string | null }) => !!g.applicationId && g.applicationId === transaction.applicationId;
        if (!passerelleDeLEspace(gateway)) {
            return NextResponse.json({ success: false, message: "Passerelle invalide pour cette transaction" }, { status: 403 });
        }

        // 3. Update customer details
        const existingMeta = (transaction.metadata as any) || {};
        const { conversion: _conversionPrecedente, echec: _echecPrecedent, ...metaSansConversion } = existingMeta;
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
                // Une nouvelle tentative (autre moyen, autre pays) efface la conversion et le motif
                // d'echec de la precedente : le refus d'un Moov Benin restait affiche a cote de la
                // carte essayee ensuite, comme si la carte avait ete refusee (05/10/2026).
                metadata: { ...metaSansConversion, methodCode, gatewayId }
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

        // 5b. LE ROUTEUR (lib/orchestrator/routeur.ts, 08/10/2026, modele Hyperswitch).
        // En lice : toutes les passerelles de l'espace (actives ou non : le routeur dit
        // pourquoi il ecarte). Le routeur
        // applique l'eligibilite (appartenance, catalogue, sante, carte seulement pour
        // Stripe), puis l'ordre du marchand (affectation, algorithme, secours, secours
        // implicite), puis la mesure (taux reels par contexte, seau perce, exploration).
        const candidats: any[] = await prisma.gateway.findMany({
            where: transaction.applicationId ? { applicationId: transaction.applicationId } : { id: gatewayId },
        }).catch(() => [] as any[]);
        if (!candidats.some((c) => c.id === gateway.id)) candidats.push(gateway);
        const vise = moyenDuCode(methodCode, customerDetails.country);
        const sante = vise ? await lireSante() : new Map();
        const contexteMesure = contexteRoutage(paymentContext);
        const mesures = await lireMesures(
            { contexte: contexteMesure, ancien: contexteRoutageAncien(paymentContext) },
            candidats.map((c) => ({ gatewayId: c.id, passerelle: detectProviderKey(c.name) })),
        );
        const routage = router({
            choisie: gatewayId,
            config: engineConfig,
            contexte: paymentContext,
            candidats,
            managed: false,
            plateformeIds: new Set<string>(),
            applicationId: transaction.applicationId,
            autorisee: passerelleDeLEspace,
            etatMoyen: (g) => (vise && sante.size > 0 ? etatDuMoyen(g as any, vise, sante).etat : 'DISPONIBLE'),
            mesures,
            otp: !!customerDetails.otp,
        });
        for (const x of routage.exclues) {
            if (x.id !== gatewayId && x.motif !== 'inactive') console.log(`🚫 ROUTAGE: ${x.nom} ecartee (${x.motif})`);
        }
        const orderedGatewayIds = routage.ordre.map((c) => c.id);
        const maxAttempts = routage.maxTentatives;
        const isCardMethodCode = /card|visa|master|carte|amex|apple|google|klarna|ideal|sofort|giropay|bancontact|sepa|stripe/i.test(methodCode || '');

        console.log(`🧠 ROUTAGE [${engineConfig.algorithmKind} > ${routage.approche}] ${contexteMesure} : ${routage.ordre.map((c) => c.name).join(' > ') || 'aucune passerelle'} (${maxAttempts} essai(s) au plus)`);

        // Persist the routing decision for audit / debugging.
        // Fire-and-forget — must never block the payment flow.
        const assignedOverride = routage.approche.startsWith('affectation');
        const decisionEnregistree = (async () => {
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
                    approche: routage.approche,
                    reason: `${engineConfig.algorithmKind} (${routage.approche}), ${orderedGatewayIds.length} passerelle(s), ${maxAttempts} essai(s)${routage.exclues.length ? ` ; ecartees : ${routage.exclues.map((x) => `${x.nom} (${x.motif})`).join(', ')}` : ''}`,
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
            // PayPal ne connait ni le XOF ni le XAF (euro a la parite fixe), ni la
            // plupart des devises africaines (dollar au cours du jour).
            : providerKey === 'paypal'
                ? devisePourPayPal(deviseLocale)
                : deviseLocale;
        const needsCurrencyConversion = localCurrency !== transaction.currency;
        // Refresh live FX rates (cached 24h; falls back to the static table on
        // failure) so the charged amount uses up-to-date rates, not hardcoded ones.
        if (needsCurrencyConversion) await refreshXofRatesIfStale();
        const paymentAmount = needsCurrencyConversion
            ? convertCurrency(transaction.amount, transaction.currency, localCurrency)
            : transaction.amount;
        const paymentCurrency = localCurrency;

        // Taux de change : un paiement demande dans une devise etrangere au payeur
        // (dollars le plus souvent) COMPTE dans la monnaie de son pays. On pose ce
        // montant sur la transaction : c'est lui que montrent les tableaux de bord.
        // Zone franc payee par carte : l'euro n'est qu'une contrainte de Stripe,
        // la monnaie du pays reste le franc (deviseLocale), rien a poser.
        if (deviseLocale && deviseLocale.toUpperCase() !== String(transaction.currency || "").toUpperCase()) {
            await refreshXofRatesIfStale();
            const montantPays = localCurrency === deviseLocale ? paymentAmount : convertCurrency(transaction.amount, transaction.currency, deviseLocale);
            if (montantPays > 0) {
                await prisma.transaction.update({
                    where: { id: transactionId },
                    data: { metadata: { ...metaSansConversion, methodCode, gatewayId, conversion: { devise: deviseLocale.toUpperCase(), montant: montantPays, taux: montantPays / (transaction.amount || 1), le: new Date().toISOString() } } as any },
                }).catch((e: any) => console.error(`[initiate] conversion non posee tx=${transactionId}:`, e?.message));
            }
        }

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
                        motifPaydunya = motifPaydunyaLisible(extractProviderErrorMessage(initResponse.rawData));
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
                    motifPaydunya = motifPaydunyaLisible(extractProviderErrorMessage(softPayResponse.rawData));
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

        // ── LES TENTATIVES (lib/orchestrator/tentatives.ts) : une ligne `Tentative` par
        // essai, notre reference posee AVANT l'appel, delai depasse = incertain (on
        // verifie, on ne renvoie pas la meme demande ailleurs), refus classe et mesure.
        const ordre = paydunyaAttempted ? routage.ordre.filter((c) => c.id !== gatewayId) : routage.ordre;
        const issue = await jouerTentatives({
            transactionId,
            contexte: contexteMesure,
            ordre,
            maxTentatives: maxAttempts,
            approche: routage.approche,
            choisie: gatewayId,
            adaptateur: (c) => PaymentOrchestratorFactory.getProvider(c.cle, buildAdapterConfig(c, (c as any).config || {}, c.cle)),
            requete: (c, reference, estSecours) => {
                // PayDunya en SECOURS pour du mobile money (25/09/2026) : la demande est
                // poussee sur le telephone (SoftPay), le client reste sur la page de
                // paiement au lieu de partir sur celle de PayDunya.
                const metaSecours = estSecours && c.cle === 'paydunya' && !isCardMethodCode
                    ? { softpay: true, pays: String(customerDetails.country || '').toUpperCase() }
                    : {};
                return {
                    ...basePaymentRequest,
                    callbackUrl: `${baseUrl}/api/webhooks/${c.cle}`,
                    // NOTRE reference, posee avant l'appel : PawaPay la prend comme identifiant
                    // de depot, et la relecture marche meme si sa reponse s'est perdue.
                    metadata: { ...basePaymentRequest.metadata, methodCode, ...(c.cle === 'pawapay' ? { depositId: reference } : {}), ...metaSecours },
                };
            },
            depot: depotPrisma,
            categoriser: categoriserEchec,
            categoriserException,
            mesurer: (m) => enregistrerIssue({ contexte: contexteMesure, ...m }),
            motif: (rawData, c) => motifMontantLisible(rawData, paymentCurrency) || extractProviderErrorMessage(rawData) || `${c.name} FAILED`,
            // Operateur ferme chez ce fournisseur : le moyen passe indisponible chez lui
            // tout de suite (grise dans les pages, evite par le routeur), sans attendre
            // le prochain passage du cron de sante.
            operateurFerme: async (c, codeRefus) => {
                if (!CODES_OPERATEUR_FERME.has(codeRefus)) return false;
                const fournisseur = cleFournisseurDuNom(c.name);
                if (vise && fournisseur) await signalerIndisponible({ cle: fournisseur, pays: vise.pays, operateur: vise.operateur, detail: `${c.name} : ${codeRefus}` }).catch(() => { });
                return true;
            },
            journal: async (type, payload) => {
                await (prisma as any).providerLog.create({ data: { transactionId, type, payload: { algorithm: engineConfig.algorithmKind, ...payload } } }).catch(() => { });
            },
        });
        // Une fois la decision ecrite (elle part en tache de fond plus haut) : la gagnante et le nombre d'essais.
        decisionEnregistree.then(() => completerDecision(transaction.id, { chosenGatewayId: issue.issue === 'ECHEC' ? null : issue.candidat.id, tentatives: issue.tentatives })).catch(() => { });

        // Les metadonnees A JOUR, relues apres les tentatives. `existingMeta` date du debut de
        // la requete : l'etaler effacait la conversion posee plus haut pour CE paiement (un
        // paiement en dollars encaisse en francs s'affichait en dollars) et remettait le
        // motif d'echec de la tentative precedente.
        const metaActuelle: Record<string, unknown> = ((await prisma.transaction.findUnique({ where: { id: transactionId }, select: { metadata: true } }).catch(() => null))?.metadata as Record<string, unknown> | null) || existingMeta;

        if (issue.issue === 'ACCEPTEE') {
            const trialGateway = issue.candidat;
            const initResponse = issue.reponse;
            const trialGwId = trialGateway.id;
            const trialConfig = ((trialGateway as any).config as any) || {};

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
                        ...metaActuelle,
                        methodCode,
                        // Point at the gateway that actually won (a fallback may differ from the primary)
                        gatewayId: trialGwId,
                        // Sandbox payments are flagged so checkout pages can show a test banner
                        testMode: (trialConfig?.mode || 'live') === 'test',
                        // Keep the Hub2 payment id around for the OTP round-trip
                        ...(hub2OtpRequired && hub2PaymentId ? { _hub2_payment_id: hub2PaymentId } : {}),
                        // La demande qui vient de partir : sert a ne pas en renvoyer une par-dessus (1c).
                        dernierEnvoi: dernierEnvoi({
                            methode: methodCode,
                            telephone: String(customerDetails?.phone || ''),
                            pousse: !initResponse.checkoutUrl && !codeRequis && initResponse.status !== 'SUCCESS',
                            rawData: initResponse.rawData,
                        }),
                    },
                }
            });

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
        }

        if (issue.issue === 'INCERTAINE') {
            // Le fournisseur n'a pas repondu a temps : la demande a PU partir et attendre
            // sur le telephone. On ne renvoie rien ailleurs. La reference est gardee quand
            // elle permet de relire l'etat (PawaPay : identifiant de depot) ; le cron
            // /api/cron/sync-pending relit les tentatives incertaines apres deux minutes.
            const verifiable = VERIFIABLES_PAR_NOTRE_REFERENCE.has(issue.candidat.cle);
            await prisma.transaction.update({
                where: { id: transactionId },
                data: {
                    provider: issue.candidat.name,
                    ...(verifiable ? { providerRef: issue.reference } : {}),
                    metadata: {
                        ...metaActuelle,
                        methodCode,
                        gatewayId: issue.candidat.id,
                        dernierEnvoi: dernierEnvoi({ methode: methodCode, telephone: String(customerDetails?.phone || ''), pousse: true, incertain: true }),
                    },
                },
            }).catch(() => { });
            console.warn(`⏳ CHECKOUT_INITIATE INCERTAIN: tx=${transactionId} ${issue.candidat.name} : ${issue.motif}`);
            return NextResponse.json({
                success: true,
                status: 'PENDING',
                incertain: true,
                providerReference: verifiable ? issue.reference : null,
                provider: issue.candidat.name,
                algorithm: engineConfig.algorithmKind,
                message: "Le fournisseur n'a pas confirmé la demande à temps. Si une demande s'affiche sur votre téléphone, validez-la ; sinon patientez un instant avant de réessayer.",
                rawData: {},
            });
        }

        // All attempts exhausted
        // L'acheteur a choisi UN moyen : si celui-la echoue, c'est SON motif qu'il doit
        // lire, pas celui d'une passerelle de secours qu'il n'a jamais demandee (un
        // refus de carte se lisait « Minimum checkout amount is 200 FCFA », message
        // d'un fournisseur Mobile Money essaye ensuite).
        const lastError = issue.dernierMotif;
        const erreurPrincipale = motifPaydunya || issue.motifPrincipal;
        const motifMontre = erreurPrincipale || lastError;
        console.error(`🚨 CHECKOUT_INITIATE FAILED: tx=${transactionId} gw=${gatewayId} method=${methodCode} tentatives=${issue.tentatives} error=${motifMontre || 'unknown'}${erreurPrincipale && erreurPrincipale !== lastError ? ` (secours: ${lastError})` : ''}`);
        // Une cle refusee par l'agregateur n'est pas un echec du payeur : le marchand
        // doit le savoir tout de suite, dans son tableau de bord, pas dans un journal serveur.
        if (issue.identifiantsRefuses || IDENTIFIANTS_REFUSES.test(lastError)) {
            prevenirClesRefusees(transaction.applicationId, issue.identifiantsRefusesChez?.name || gateway.name, lastError).catch(() => {});
        }
        // Tous les essais ont bute sur un operateur ferme : le moyen est indisponible,
        // la page le grise au lieu d'afficher un echec.
        if (issue.operateurFerme && !issue.autreEchec && !motifPaydunya) {
            return NextResponse.json({
                success: false, indisponible: true, status: 'UNAVAILABLE', moyen: vise?.libelle,
                message: `${vise?.libelle || 'Ce moyen de paiement'} est momentanément indisponible. Choisissez un autre moyen de paiement ou réessayez dans quelques minutes.`,
            }, { status: 503 });
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
    } finally {
        if (verrouPose && transactionVerrouillee) await leverVerrou(transactionVerrouillee);
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
