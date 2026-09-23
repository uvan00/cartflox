import { NextRequest, NextResponse } from 'next/server';
import prisma from "@/lib/db";
import { arrondirMontant } from "@/lib/devises";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { authenticateApiKey, authenticatePublicKey, estClePublique } from "@/lib/api-auth";
import { getCorsHeaders, corsPreflightResponse } from "@/lib/cors";
import { lienCheckout } from "@/lib/lien-checkout";

// POST /api/v1/checkout/sessions — Create a checkout session (public API for widget)
export async function POST(req: NextRequest) {
    try {
        // --- Rate limiting: 60 sessions/min per IP ---
        const ip = getClientIp(req);
        const rl = await rateLimit(`checkout_session:${ip}`, { limit: 60, windowSec: 60 });
        if (!rl.allowed) {
            return NextResponse.json({ error: 'Too many requests. Please retry later.' }, {
                status: 429,
                headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) }
            });
        }

        // --- Auth ---
        const authHeader = req.headers.get('authorization');
        const apiKeyHeader = req.headers.get('x-api-key');
        let secretKey = '';
        if (authHeader && authHeader.startsWith('Bearer ')) secretKey = authHeader.split(' ')[1];
        else if (apiKeyHeader) secretKey = apiKeyHeader;

        if (!secretKey) {
            return NextResponse.json({ error: 'Missing API key. Use Authorization: Bearer <key> or x-api-key header.' }, { status: 401 });
        }

        // Cle secrete (serveur) ou, pour le widget cartflox.js, cle publique :
        // celle-ci ne permet QUE de creer une session, rien d'autre.
        let auth = await authenticateApiKey(secretKey);
        let viaClePublique = false;
        if (!auth && estClePublique(secretKey)) {
            auth = await authenticatePublicKey(secretKey);
            viaClePublique = !!auth;
        }
        if (!auth) {
            return NextResponse.json({ error: 'Invalid API Key' }, { status: 401 });
        }
        const { config } = auth;

        // --- Idempotency key: return existing session if same key re-submitted ---
        const idempotencyKey = req.headers.get('idempotency-key');
        if (idempotencyKey) {
            const existing = await prisma.transaction.findFirst({
                where: {
                    applicationId: config.applicationId,
                    test: auth.test,
                    metadata: { path: ['idempotencyKey'], equals: idempotencyKey } as any,
                }
            });
            if (existing) {
                const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
                return NextResponse.json({
                    id: existing.id,
                    object: 'checkout.session',
                    url: lienCheckout(existing.id),
                    order_id: existing.orderId,
                    amount: existing.amount,
                    currency: existing.currency,
                    status: existing.status.toLowerCase(),
                    livemode: existing.test !== true,
                    created: existing.createdAt,
                }, {
                    status: 200,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'POST, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, idempotency-key',
                        'Idempotent-Replayed': 'true',
                    }
                });
            }
        }

        // --- Body ---
        const body = await req.json() as any;
        const {
            amount,
            currency = "XOF",
            customer_name,
            customer_email,
            customer_phone,
            description,
            metadata,
            success_url,
            cancel_url,
            merchant_name,
            merchant_logo,
            merchant,
        } = body;

        if (!amount || amount <= 0) {
            return NextResponse.json({ error: 'amount is required and must be > 0' }, { status: 400 });
        }

        // --- Create Transaction ---
        const orderId = `CS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

        // Espace Connect qui a choisi « frais à la charge du client » : le montant
        // demandé au payeur est majoré des frais de la passerelle. Le marchand,
        // lui, reste crédité sur SON prix (la base), commission déduite.
        const espace = await prisma.application.findUnique({
            where: { id: config.applicationId },
            select: { paymentMode: true, fraisClient: true, liveMode: true } as any,
        }) as any;
        const baseMontant = Number(amount);
        const bpsFrais = Math.max(0, Number(process.env.FRAIS_PASSERELLE_BPS) || 300);
        const fraisService =
            espace?.paymentMode === "managed" && espace?.fraisClient === true
                ? arrondirMontant((baseMontant * bpsFrais) / 10000, currency)
                : 0;
        const montantAPayer = baseMontant + fraisService;

        // Identite affichee sur la page de paiement : une plateforme qui encaisse
        // pour plusieurs marques peut la passer par session. Le nom est borne, le
        // logo doit etre une image servie en https (jamais de donnees en ligne).
        const nomAffiche = String(merchant_name ?? merchant?.name ?? "").trim().slice(0, 60);
        const logoBrut = String(merchant_logo ?? merchant?.logo ?? "").trim().slice(0, 500);
        const logoAffiche = /^https:\/\/[^\s"'<>]+$/i.test(logoBrut) ? logoBrut : "";
        const marchandSession = (nomAffiche || logoAffiche)
            ? { marchand: { ...(nomAffiche ? { nom: nomAffiche } : {}), ...(logoAffiche ? { logo: logoAffiche } : {}) } }
            : {};

        // Donnee de TEST : cle af_test_..., ou espace encore en bac a sable. Elle
        // reste a l'ecart des listes et statistiques de production, et la page de
        // paiement propose de simuler l'issue au lieu d'appeler un agregateur.
        // Identite non verifiee (espace « Cartflox simple ») : seules les cles de TEST
        // fonctionnent. Une cle de production repond 403 plutot que de fabriquer un
        // faux paiement que le marchand prendrait pour un vrai.
        if (!auth.test && espace && espace.paymentMode !== "managed" && espace.liveMode !== true) {
            return NextResponse.json({
                error: "Production keys are not usable until your identity is verified: use your test keys (af_test_...) meanwhile.",
                code: "identity_unverified",
            }, { status: 403, headers: getCorsHeaders(req.headers.get('origin'), null) });
        }
        const enTest = auth.test || (espace?.liveMode !== true);

        const transaction = await prisma.transaction.create({
            data: {
                applicationId: config.applicationId,
                test: enTest,
                orderId,
                amount: montantAPayer,
                currency: currency.toUpperCase(),
                status: 'PENDING',
                // customerName/customerEmail are NOT NULL columns — default to ""
                // (passing null throws at runtime). customerPhone is nullable.
                customerName: customer_name || "",
                customerEmail: customer_email || "",
                customerPhone: customer_phone || null,
                paymentType: 'MOBILE_MONEY',
                provider: '',
                metadata: {
                    source: viaClePublique ? 'widget' : 'checkout_session',
                    ...(enTest ? { sandbox: true } : {}),
                    description: description || null,
                    // Ce que le marchand a demandé, et ce qu'on a ajouté pour lui.
                    ...(fraisService > 0 ? { base_marchand: baseMontant, frais_service: fraisService } : {}),
                    success_url: success_url || null,
                    cancel_url: cancel_url || null,
                    ...marchandSession,
                    ...(metadata || {}),
                    // Apres les metadonnees du marchand : la cle d'idempotence de l'en-tete fait foi.
                    ...(idempotencyKey ? { idempotencyKey } : {}),
                } as any
            }
        });

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
        const checkoutUrl = lienCheckout(transaction.id);

        // --- Dynamic CORS: use application's allowedOrigins if configured ---
        const appMeta = (config.application?.metadata as any) || {};
        const allowedOrigins: string[] | null = appMeta.allowedOrigins || null;
        const corsHeaders = getCorsHeaders(req.headers.get('origin'), allowedOrigins);

        return NextResponse.json({
            id: transaction.id,
            object: 'checkout.session',
            url: checkoutUrl,
            order_id: orderId,
            amount: transaction.amount,
            currency: transaction.currency,
            status: 'pending',
            livemode: !enTest,
            created: transaction.createdAt,
        }, {
            status: 201,
            headers: corsHeaders,
        });

    } catch (error: any) {
        console.error("Checkout Session Error:", error);
        return NextResponse.json({ error: error.message || "Failed to create checkout session" }, { status: 500 });
    }
}

// CORS preflight
export async function OPTIONS(req: NextRequest) {
    return corsPreflightResponse(req.headers.get('origin'));
}
