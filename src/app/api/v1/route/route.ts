import { NextRequest, NextResponse } from 'next/server';
import { routePayment, getAvailableMethods, rankProvidersForCountry, detectOperatorFromPhone } from '@/lib/orchestrator/smart-router';
import { PaymentOrchestratorFactory } from '@/lib/orchestrator/factory';
import { authenticateApiKey } from '@/lib/api-auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

/**
 * POST /api/v1/route
 * Smart payment routing — returns the best provider for a given context.
 *
 * Body:
 * {
 *   country: "SN",
 *   currency: "XOF",        // optional
 *   amount: 5000,
 *   paymentMethod: "wave",  // optional
 *   phone: "+221701234567", // optional — used to auto-detect operator
 *   availableProviders: ["paydunya", "cinetpay", "fedapay"],
 *   preferredProvider: "paydunya" // optional override
 * }
 */
export async function POST(req: NextRequest) {
    try {
        // Rate limit (per IP) — this is a compute endpoint; cap abuse/DoS.
        const ip = getClientIp(req);
        const rl = await rateLimit(`route:${ip}`, { limit: 120, windowSec: 60 });
        if (!rl.allowed) {
            return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
        }

        // SECURITY: require a valid API key — this endpoint exposes provider
        // routing intelligence and must not be open to the public.
        const authHeader = req.headers.get('authorization');
        const apiKeyHeader = req.headers.get('x-api-key');
        const secretKey = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : (apiKeyHeader || '');
        if (!secretKey || !(await authenticateApiKey(secretKey))) {
            return NextResponse.json({ error: 'Invalid API Key' }, { status: 401 });
        }

        const body = await req.json();
        const {
            country,
            currency,
            amount,
            paymentMethod,
            phone,
            availableProviders,
            preferredProvider,
        } = body;

        if (!country) {
            return NextResponse.json({ error: 'country is required' }, { status: 400 });
        }
        if (!amount || typeof amount !== 'number') {
            return NextResponse.json({ error: 'amount (number) is required' }, { status: 400 });
        }
        if (!availableProviders || !Array.isArray(availableProviders) || availableProviders.length === 0) {
            return NextResponse.json({ error: 'availableProviders (array) is required' }, { status: 400 });
        }

        // Auto-detect operator from phone if no method specified
        let resolvedMethod = paymentMethod;
        let detectedOperator: string | null = null;
        if (!resolvedMethod && phone) {
            detectedOperator = detectOperatorFromPhone(phone, country);
            resolvedMethod = detectedOperator ?? undefined;
        }

        const decision = routePayment({
            country,
            currency,
            amount,
            paymentMethod: resolvedMethod,
            preferredProvider,
            availableProviders,
        });

        // Also return available methods + ranked providers for UI
        const availableMethods = getAvailableMethods(country, availableProviders, currency);
        const rankedProviders = rankProvidersForCountry(availableProviders, country, currency);

        return NextResponse.json({
            routing: decision,
            detectedOperator,
            availableMethods,
            rankedProviders,
        });
    } catch (error: any) {
        console.error("[v1:route]", error?.message);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}

/**
 * GET /api/v1/route?country=SN&providers=paydunya,cinetpay&currency=XOF
 * Quick check: returns available methods + ranked providers for a country.
 */
export async function GET(req: NextRequest) {
    try {
        const limite = await rateLimit(`route-get:${getClientIp(req)}`, { limit: 60, windowSec: 60 });
        if (!limite.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
        const { searchParams } = new URL(req.url);
        const country = searchParams.get('country');
        const currency = searchParams.get('currency') ?? undefined;
        const providersParam = searchParams.get('providers');

        if (!country) {
            return NextResponse.json({ error: 'country query param is required' }, { status: 400 });
        }

        const availableProviders = providersParam
            ? providersParam.split(',').map(p => p.trim())
            : PaymentOrchestratorFactory.listProviders();

        const availableMethods = getAvailableMethods(country, availableProviders, currency);
        const rankedProviders = rankProvidersForCountry(availableProviders, country, currency);

        return NextResponse.json({
            country,
            currency,
            availableMethods,
            rankedProviders,
        });
    } catch (error: any) {
        console.error("[v1:route]", error?.message);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
