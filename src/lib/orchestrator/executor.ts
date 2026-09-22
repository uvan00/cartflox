/**
 * Cartflox Smart Payment Executor
 * 
 * Wraps payment execution with:
 * 1. Smart routing to pick the best provider
 * 2. Automatic fallback to alternate providers on failure
 * 3. Logging of routing decisions and attempts
 */

import prisma from "@/lib/db";
import { overlayTestKeys, decryptSecret, porteeDePasserelle } from "@/lib/gateway-credentials";
import { PaymentOrchestratorFactory } from "./factory";
import { routePayment, detectOperatorFromPhone, RoutingContext, RoutingDecision, estimationsStatiques } from "./smart-router";
import { contexteRoutage, ordonnerParMesure } from "./routage-mesure";
import { PaymentRequest, IPaymentProvider } from "./types";

export interface ExecutionContext {
    transactionId: string;
    amount: number;
    currency: string;
    country: string;
    phone?: string;
    paymentMethod?: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    orderId: string;
    /** Map of providerName → gateway DB record (with config, apiKey, apiSecret) */
    availableGateways: Record<string, any>;
    /** Maximum number of providers to try before giving up */
    maxRetries?: number;
}

export interface ExecutionResult {
    success: boolean;
    provider: string;
    providerReference?: string;
    checkoutUrl?: string;
    status: string;
    message?: string;
    rawData?: any;
    routingDecision: RoutingDecision;
    attempts: AttemptLog[];
}

interface AttemptLog {
    provider: string;
    success: boolean;
    status: string;
    durationMs: number;
    error?: string;
}

/**
 * Build adapter config from a gateway DB record
 */
export function buildAdapterConfig(gateway: any, providerName: string): any {
    // In test mode, sandbox keys (config.testKeys) override their live counterparts.
    // overlayTestKeys also decrypts config secrets (encrypted at rest).
    const brut = (gateway?.config as any) || {};
    const enTest = brut.mode === "test";
    // Portee de dechiffrement : la passerelle du marchand porte son applicationId,
    // une passerelle plateforme retombe sur la portee commune.
    const portee = porteeDePasserelle(gateway);
    const config = overlayTestKeys(gateway.config, portee);

    // Mode test sans aucune cle de test : on REFUSE plutot que d'encaisser avec
    // les cles de production. Le marchand croit tester, l'argent serait reel.
    if (enTest && (!brut.testKeys || typeof brut.testKeys !== "object")) {
        throw new Error("Passerelle en mode test sans cles de test : paiement refuse.");
    }

    // Les colonnes apiKey/apiSecret portent les cles de PRODUCTION, et chaque cas
    // ci-dessous s'en sert comme repli (`config.x || gateway.apiKey`). En mode test
    // ce repli est un piege : l'interface range les cles de test sous les noms
    // `apiKey`/`apiSecret`, alors que la plupart des adaptateurs lisent un autre nom
    // (secretKey, publicKey, serviceKey, merchantId, licenseKey...). Sans cette
    // substitution, ces fournisseurs ne trouvaient rien dans la config et
    // retombaient SILENCIEUSEMENT sur la cle de production.
    // Une cle de test absente donne une chaine vide : le fournisseur refuse
    // l'authentification, et aucun argent ne bouge. C'est le bon echec.
    gateway = enTest
        ? { ...gateway, apiKey: config.apiKey ?? "", apiSecret: config.apiSecret ?? "" }
        : { ...gateway, apiKey: decryptSecret(gateway.apiKey, portee), apiSecret: decryptSecret(gateway.apiSecret, portee) };

    switch (providerName) {
        case 'paydunya':
            return {
                masterKey: config.masterKey || gateway.apiKey,
                privateKey: config.privateKey || gateway.apiSecret,
                publicKey: config.publicKey || "",
                token: config.token || "",
                mode: config.mode || 'live'
            };
        case 'pawapay':
            return { apiKey: config.apiKey || gateway.apiKey, mode: config.mode || 'live' };
        case 'flutterwave':
            return { publicKey: config.publicKey || gateway.apiKey, secretKey: config.secretKey || gateway.apiSecret, mode: config.mode || 'live' };
        case 'paystack':
            return { publicKey: config.publicKey || gateway.apiKey, secretKey: config.secretKey || gateway.apiSecret, mode: config.mode || 'live' };
        case 'cinetpay':
            // Le Site ID est saisi dans le second champ, donc la colonne apiSecret :
            // sans ce repli il partait vide a chaque paiement.
            return { apiKey: config.apiKey || gateway.apiKey, siteId: config.siteId || gateway.apiSecret, mode: config.mode || 'live' };
        case 'stripe':
            return { secretKey: config.secretKey || gateway.apiSecret, mode: config.mode || 'live' };
        case 'kkiapay':
            return { publicKey: config.publicKey || gateway.apiKey, privateKey: config.privateKey || gateway.apiSecret, secret: config.secret || "", mode: config.mode || 'live' };
        case 'fedapay':
            return { apiKey: config.apiKey || gateway.apiKey, mode: config.mode || 'live' };
        case 'feexpay':
            // ⚠️ Le formulaire nomme ses deux champs `apiKey` et `apiSecret`, mais
            // ils portent le SHOP ID et le token « fp_ ». Lire `config.apiKey` ici
            // renvoyait donc le Shop ID comme token : la verification echouait sur
            // « doit commencer par fp_ » quelles que soient les cles saisies, et le
            // shopId restait vide. On lit les colonnes, seules porteuses du sens.
            return { shopId: config.shopId || gateway.apiKey, apiKey: gateway.apiSecret, mode: config.mode || 'live' };
        case 'coinbase':
            // Le secret de webhook est saisi dans le second champ : sans ce repli,
            // aucune notification Coinbase n'etait verifiable.
            return { apiKey: config.apiKey || gateway.apiKey, webhookSecret: config.webhookSecret || gateway.apiSecret, mode: config.mode || 'live' };
        case 'notchpay':
            // La cle PRIVEE (X-Grant) ne sert qu'aux transferts sortants : second champ du formulaire.
            return { publicKey: config.publicKey || gateway.apiKey, privateKey: config.privateKey || gateway.apiSecret || '', mode: config.mode || 'live' };
        case 'cryptomus':
            return { apiKey: config.apiKey || gateway.apiSecret, merchantId: config.merchantId || gateway.apiKey, mode: config.mode || 'live' };
        case 'qosic':
            return { apiKey: config.apiKey || gateway.apiSecret, clientId: config.clientId || gateway.apiKey, mode: config.mode || 'live' };
        case 'monetbill':
            return { serviceKey: config.serviceKey || gateway.apiKey, serviceSecret: config.serviceSecret || gateway.apiSecret, mode: config.mode || 'live' };
        case 'payplus':
            return { apiKey: config.apiKey || gateway.apiKey, secretKey: config.secretKey || gateway.apiSecret, mode: config.mode || 'live' };
        case 'hub2':
            // Hub2 est en production pays par pays : chacun a son propre couple
            // (merchantId, cle API). `comptesPays` les porte tous ; les deux champs
            // a plat restent le compte par defaut, pour les marchands d'un seul pays.
            return {
                apiKey: config.apiKey || gateway.apiSecret,
                merchantId: config.merchantId || gateway.apiKey,
                comptesPays: config.comptesPays,
                mode: config.mode || 'live',
            };
        case 'lengopay':
            return { licenseKey: config.licenseKey || gateway.apiKey, websiteId: config.websiteId || gateway.apiSecret, mode: config.mode || 'live' };
        // Les cinq suivants rangent leurs cles dans `config` (configKey) : les
        // colonnes ne servent que de repli, pour une ligne creee autrement.
        case 'wave':
            return { apiKey: config.apiKey || gateway.apiKey, webhookSecret: config.webhookSecret || '', mode: config.mode || 'live' };
        case 'paytech':
            return { apiKey: config.apiKey || gateway.apiKey, apiSecret: config.apiSecret || gateway.apiSecret, mode: config.mode || 'live' };
        case 'onepay':
            return { token: config.token || gateway.apiKey, secret: config.secret || gateway.apiSecret, mode: config.mode || 'live' };
        case 'djamo':
            // Un compte Djamo Business par pays, chacun avec son hote : le pays
            // vient de la passerelle (une carte = un pays), ou du controle des cles.
            return {
                token: config.token || gateway.apiKey,
                companyId: config.companyId || gateway.apiSecret || '',
                pays: config.pays || (Array.isArray(gateway.countries) ? gateway.countries[0] : '') || 'CI',
                webhookSecret: config.webhookSecret || '',
                mode: config.mode || 'live',
            };
        case 'ipay':
            return { secretKey: config.secretKey || gateway.apiKey, webhookSecret: config.webhookSecret || '', mode: config.mode || 'live' };
        default:
            return config;
    }
}

/**
 * Execute a payment with smart routing + automatic fallback.
 */
export async function executeWithFallback(ctx: ExecutionContext): Promise<ExecutionResult> {
    const maxRetries = ctx.maxRetries ?? 2;
    const availableProviders = Object.keys(ctx.availableGateways);
    const attempts: AttemptLog[] = [];

    // Detect payment method from phone if not provided
    const detectedMethod = ctx.paymentMethod || (ctx.phone ? detectOperatorFromPhone(ctx.phone, ctx.country) : null);

    // Build routing context
    const routingCtx: RoutingContext = {
        country: ctx.country,
        currency: ctx.currency,
        amount: ctx.amount,
        paymentMethod: detectedMethod as any || undefined,
        availableProviders,
    };

    // Get routing decision (best provider + ordered fallbacks)
    const decision = routePayment(routingCtx);

    // Le classement statique n'est qu'un point de depart. On le rejoue sur les
    // taux REELS mesures dans ce contexte (pays, methode, devise) et on repousse
    // les passerelles en panne. Sans assez d'observations, l'ordre d'origine est
    // conserve tel quel : la mesure ne prend jamais le dessus sur rien.
    const contexteMesure = contexteRoutage({
        country: ctx.country, methodCode: detectedMethod, currency: ctx.currency,
    });
    const mesure = await ordonnerParMesure(
        contexteMesure,
        [decision.provider, ...decision.alternates],
        estimationsStatiques(routingCtx),
    );
    const providerOrder = mesure.ordre.slice(0, maxRetries + 1);

    console.log(`🧠 [SMART-ROUTER] Decision: ${providerOrder[0]} (statique: ${decision.provider}, approche: ${mesure.approche}) | Ordre: [${providerOrder.join(', ')}] | Reason: ${decision.reason}`);

    // Log routing decision
    try {
        await (prisma as any).providerLog.create({
            data: {
                transactionId: ctx.transactionId,
                type: 'ROUTING_DECISION',
                payload: {
                    selectedProvider: decision.provider,
                    alternates: decision.alternates,
                    confidence: decision.confidence,
                    reason: decision.reason,
                    detectedMethod: detectedMethod || 'unknown',
                    country: ctx.country,
                    currency: ctx.currency,
                }
            }
        });
    } catch (logErr) {
        console.warn("⚠️ Non-blocking: failed to log routing decision", logErr);
    }

    const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Try each provider in order
    for (let i = 0; i < providerOrder.length; i++) {
        const providerName = providerOrder[i];
        const gateway = ctx.availableGateways[providerName];

        if (!gateway) {
            console.warn(`⚠️ [SMART-ROUTER] Skipping ${providerName}: no gateway config`);
            continue;
        }

        const isFallback = i > 0;
        if (isFallback) {
            console.log(`🔄 [FALLBACK] Attempt ${i + 1}: trying ${providerName}...`);
        }

        const startTime = Date.now();

        try {
            const adapterConfig = buildAdapterConfig(gateway, providerName);
            const adapter = PaymentOrchestratorFactory.getProvider(providerName, adapterConfig);

            const paymentRequest: PaymentRequest = {
                amount: ctx.amount,
                currency: ctx.currency,
                customerName: ctx.customerName,
                customerEmail: ctx.customerEmail,
                customerPhone: ctx.customerPhone,
                orderId: ctx.orderId,
                callbackUrl: `${baseUrl}/api/webhooks/${providerName}`,
                returnUrl: `${baseUrl}/checkout/success?id=${ctx.transactionId}`,
            };

            const response = await adapter.initiatePayment(paymentRequest);
            const duration = Date.now() - startTime;

            if (response.status === 'FAILED') {
                attempts.push({
                    provider: providerName,
                    success: false,
                    status: 'FAILED',
                    durationMs: duration,
                    error: response.rawData?.message || 'Provider returned FAILED'
                });

                console.warn(`❌ [${providerName}] Failed in ${duration}ms: ${response.rawData?.message || 'unknown error'}`);

                // Log the failed attempt
                try {
                    await (prisma as any).providerLog.create({
                        data: {
                            transactionId: ctx.transactionId,
                            type: isFallback ? 'FALLBACK_ATTEMPT_FAILED' : 'PRIMARY_ATTEMPT_FAILED',
                            payload: { provider: providerName, duration, error: response.rawData?.message, attemptNumber: i + 1 }
                        }
                    });
                } catch {}

                continue; // Try next provider
            }

            // Success — update transaction with this provider
            attempts.push({
                provider: providerName,
                success: true,
                status: response.status,
                durationMs: duration,
            });

            // Update transaction with the winning provider
            await prisma.transaction.update({
                where: { id: ctx.transactionId },
                data: {
                    providerRef: response.providerReference || null,
                    provider: providerName,
                }
            });

            console.log(`✅ [${providerName}] Success in ${duration}ms (ref: ${response.providerReference})`);

            // Log success
            try {
                await (prisma as any).providerLog.create({
                    data: {
                        transactionId: ctx.transactionId,
                        type: isFallback ? 'FALLBACK_SUCCESS' : 'PRIMARY_SUCCESS',
                        payload: {
                            provider: providerName,
                            duration,
                            providerRef: response.providerReference || null,
                            attemptNumber: i + 1,
                            totalAttempts: attempts.length,
                        }
                    }
                });
            } catch {}

            return {
                success: true,
                provider: providerName,
                providerReference: response.providerReference,
                checkoutUrl: response.checkoutUrl,
                status: response.status,
                rawData: response.rawData,
                routingDecision: decision,
                attempts,
            };

        } catch (error: any) {
            const duration = Date.now() - startTime;
            attempts.push({
                provider: providerName,
                success: false,
                status: 'ERROR',
                durationMs: duration,
                error: error.message || 'Unknown error'
            });

            console.error(`💥 [${providerName}] Exception in ${duration}ms:`, error.message);

            // Log the exception
            try {
                await (prisma as any).providerLog.create({
                    data: {
                        transactionId: ctx.transactionId,
                        type: 'PROVIDER_EXCEPTION',
                        payload: { provider: providerName, duration, error: error.message, attemptNumber: i + 1 }
                    }
                });
            } catch {}

            continue; // Try next provider
        }
    }

    // All providers failed
    console.error(`🚨 [SMART-ROUTER] ALL providers failed for tx=${ctx.transactionId}. Attempts: ${attempts.length}`);

    return {
        success: false,
        provider: decision.provider,
        status: 'FAILED',
        message: `Tous les fournisseurs ont échoué (${attempts.length} tentatives). Dernier erreur: ${attempts[attempts.length - 1]?.error || 'inconnue'}`,
        routingDecision: decision,
        attempts,
    };
}
