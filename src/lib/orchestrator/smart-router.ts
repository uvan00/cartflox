/**
 * Cartflox Smart Router
 * Automatically selects the best payment gateway based on:
 * - Country / operator
 * - Amount & currency
 * - Available credentials (merchant config)
 * - Priority & success-rate weights
 */

export type PaymentMethod =
    | 'card'
    | 'orange-money'
    | 'wave'
    | 'djamo'
    | 'mtn'
    | 'moov'
    | 'airtel'
    | 'free-money'
    | 'expresso'
    | 'wizall'
    | 't-money'
    | 'mpesa'
    | 'mobile-money'
    | 'crypto';

export interface RoutingContext {
    country: string;           // ISO 2-letter country code: SN, CI, BJ, etc.
    currency?: string;         // XOF, XAF, NGN, KES, USD, EUR, etc.
    amount: number;
    paymentMethod?: PaymentMethod;
    preferredProvider?: string; // override: force a specific provider
    availableProviders: string[]; // providers the merchant has configured
}

export interface RoutingDecision {
    provider: string;
    reason: string;
    alternates: string[];       // fallback providers in order
    confidence: number;         // 0-1
}

interface ProviderRule {
    provider: string;
    countries: string[];
    currencies: string[];
    methods: PaymentMethod[];
    minAmount?: number;
    maxAmount?: number;
    priority: number;           // higher = preferred
    successRateEstimate: number; // 0-1 based on known reliability
}

/**
 * Routing rules table: each row represents a (provider, country, method) capability.
 * Priority: higher number = preferred when multiple providers match.
 * Success rate: rough estimate based on known provider reliability in region.
 */
const ROUTING_RULES: ProviderRule[] = [
    // ─── WAVE ────────────────────────────────────────────────────────────────
    {
        provider: 'paydunya',
        countries: ['SN', 'CI'],
        currencies: ['XOF'],
        methods: ['wave'],
        priority: 10,
        successRateEstimate: 0.97,
    },
    {
        provider: 'cinetpay',
        countries: ['SN', 'CI'],
        currencies: ['XOF'],
        methods: ['wave'],
        priority: 8,
        successRateEstimate: 0.93,
    },
    // ─── ORANGE MONEY ────────────────────────────────────────────────────────
    {
        provider: 'paydunya',
        countries: ['SN', 'CI', 'ML', 'BF'],
        currencies: ['XOF'],
        methods: ['orange-money'],
        priority: 9,
        successRateEstimate: 0.95,
    },
    {
        provider: 'cinetpay',
        countries: ['SN', 'CI', 'ML', 'BF', 'TG', 'BJ', 'CM'],
        currencies: ['XOF', 'XAF'],
        methods: ['orange-money'],
        priority: 8,
        successRateEstimate: 0.92,
    },
    {
        provider: 'flutterwave',
        countries: ['CI', 'SN', 'CM'],
        currencies: ['XOF', 'XAF'],
        methods: ['orange-money', 'mobile-money'],
        priority: 7,
        successRateEstimate: 0.90,
    },
    // ─── MTN ─────────────────────────────────────────────────────────────────
    {
        provider: 'paydunya',
        countries: ['BJ', 'CI'],
        currencies: ['XOF'],
        methods: ['mtn'],
        priority: 9,
        successRateEstimate: 0.94,
    },
    {
        provider: 'paydunya',
        countries: ['CM'],
        currencies: ['XAF'],
        methods: ['mtn'],
        priority: 9,
        successRateEstimate: 0.93,
    },
    {
        provider: 'cinetpay',
        countries: ['CI', 'BJ', 'CM'],
        currencies: ['XOF', 'XAF'],
        methods: ['mtn'],
        priority: 8,
        successRateEstimate: 0.91,
    },
    {
        provider: 'flutterwave',
        countries: ['NG', 'GH', 'UG', 'RW', 'ZM', 'CI', 'CM'],
        currencies: ['NGN', 'GHS', 'UGX', 'RWF', 'ZMW', 'XOF', 'XAF'],
        methods: ['mtn', 'mobile-money'],
        priority: 9,
        successRateEstimate: 0.93,
    },
    {
        provider: 'pawapay',
        countries: ['GH', 'UG', 'TZ', 'RW', 'ZM', 'CI', 'SN', 'CM'],
        currencies: ['GHS', 'UGX', 'TZS', 'RWF', 'ZMW', 'XOF', 'XAF'],
        methods: ['mtn', 'mobile-money'],
        priority: 8,
        successRateEstimate: 0.92,
    },
    // ─── MOOV ────────────────────────────────────────────────────────────────
    {
        provider: 'paydunya',
        countries: ['BJ', 'CI', 'TG', 'ML', 'BF'],
        currencies: ['XOF'],
        methods: ['moov'],
        priority: 9,
        successRateEstimate: 0.93,
    },
    {
        provider: 'fedapay',
        countries: ['BJ', 'TG', 'CI', 'SN', 'ML', 'BF'],
        currencies: ['XOF'],
        methods: ['moov', 'mobile-money'],
        priority: 8,
        successRateEstimate: 0.91,
    },
    {
        provider: 'feexpay',
        countries: ['BJ', 'TG', 'CI', 'SN', 'CG'],
        currencies: ['XOF'],
        methods: ['moov', 'mtn', 'mobile-money'],
        priority: 7,
        successRateEstimate: 0.89,
    },
    // ─── T-MONEY (TOGO) ──────────────────────────────────────────────────────
    {
        provider: 'paydunya',
        countries: ['TG'],
        currencies: ['XOF'],
        methods: ['t-money'],
        priority: 10,
        successRateEstimate: 0.94,
    },
    {
        provider: 'fedapay',
        countries: ['TG'],
        currencies: ['XOF'],
        methods: ['t-money', 'mobile-money'],
        priority: 8,
        successRateEstimate: 0.90,
    },
    // ─── FREE MONEY / EXPRESSO / WIZALL (SN) ─────────────────────────────────
    {
        provider: 'paydunya',
        countries: ['SN'],
        currencies: ['XOF'],
        methods: ['free-money', 'expresso', 'wizall'],
        priority: 10,
        successRateEstimate: 0.92,
    },
    // ─── KKIAPAY (BJ, TG, CI) ────────────────────────────────────────────────
    {
        provider: 'kkiapay',
        countries: ['BJ', 'TG', 'CI'],
        currencies: ['XOF'],
        methods: ['mtn', 'moov', 'mobile-money', 'card'],
        priority: 8,
        successRateEstimate: 0.90,
    },
    // ─── M-PESA (KE, TZ, UG) ─────────────────────────────────────────────────
    {
        provider: 'flutterwave',
        countries: ['KE', 'TZ', 'UG'],
        currencies: ['KES', 'TZS', 'UGX'],
        methods: ['mpesa', 'mobile-money'],
        priority: 9,
        successRateEstimate: 0.95,
    },
    {
        provider: 'pawapay',
        countries: ['KE', 'TZ'],
        currencies: ['KES', 'TZS'],
        methods: ['mpesa', 'mobile-money'],
        priority: 8,
        successRateEstimate: 0.93,
    },
    // ─── AIRTEL ───────────────────────────────────────────────────────────────
    {
        provider: 'flutterwave',
        countries: ['UG', 'TZ', 'RW', 'ZM'],
        currencies: ['UGX', 'TZS', 'RWF', 'ZMW'],
        methods: ['airtel', 'mobile-money'],
        priority: 8,
        successRateEstimate: 0.91,
    },
    {
        provider: 'pawapay',
        countries: ['UG', 'TZ', 'RW', 'ZM'],
        currencies: ['UGX', 'TZS', 'RWF', 'ZMW'],
        methods: ['airtel', 'mobile-money'],
        priority: 9,
        successRateEstimate: 0.93,
    },
    // ─── PAYSTACK (NG, GH, ZA, KE) ───────────────────────────────────────────
    {
        provider: 'paystack',
        countries: ['NG', 'GH', 'ZA', 'KE'],
        currencies: ['NGN', 'GHS', 'ZAR', 'KES'],
        methods: ['card', 'mobile-money', 'mtn', 'airtel'],
        priority: 10,
        successRateEstimate: 0.96,
    },
    // ─── CARD (global) ────────────────────────────────────────────────────────
    {
        provider: 'stripe',
        countries: ['*'],
        currencies: ['USD', 'EUR', 'GBP'],
        methods: ['card'],
        priority: 10,
        successRateEstimate: 0.98,
    },
    {
        provider: 'flutterwave',
        countries: ['*'],
        currencies: ['*'],
        methods: ['card'],
        priority: 7,
        successRateEstimate: 0.91,
    },
    {
        provider: 'cinetpay',
        countries: ['CI', 'SN', 'ML', 'BF', 'TG', 'BJ', 'CM', 'CD', 'GN'],
        currencies: ['XOF', 'XAF', 'CDF', 'GNF'],
        methods: ['card'],
        priority: 8,
        successRateEstimate: 0.89,
    },
    {
        provider: 'paydunya',
        countries: ['SN', 'CI', 'BJ', 'TG', 'ML', 'BF'],
        currencies: ['XOF'],
        methods: ['card'],
        priority: 8,
        successRateEstimate: 0.90,
    },
    {
        provider: 'paystack',
        countries: ['NG', 'GH', 'ZA', 'KE'],
        currencies: ['NGN', 'GHS', 'ZAR', 'KES'],
        methods: ['card'],
        priority: 9,
        successRateEstimate: 0.95,
    },
    // ─── CRYPTO ───────────────────────────────────────────────────────────────
    {
        provider: 'coinbase',
        countries: ['*'],
        currencies: ['USD', 'EUR', '*'],
        methods: ['crypto'],
        priority: 10,
        successRateEstimate: 0.97,
    },
    {
        provider: 'cryptomus',
        countries: ['*'],
        currencies: ['USD', 'EUR', '*'],
        methods: ['crypto'],
        priority: 9,
        successRateEstimate: 0.95,
    },
    // ─── NOTCHPAY (CM, CI, SN, NG) ─────────────────────────────────────────
    {
        provider: 'notchpay',
        countries: ['CM'],
        currencies: ['XAF'],
        methods: ['mtn', 'orange-money', 'mobile-money', 'card'],
        priority: 9,
        successRateEstimate: 0.93,
    },
    {
        provider: 'notchpay',
        countries: ['CI', 'SN'],
        currencies: ['XOF'],
        methods: ['orange-money', 'mtn', 'wave', 'moov', 'mobile-money', 'card'],
        priority: 7,
        successRateEstimate: 0.90,
    },
    // ─── QOSIC (BJ, TG, CI) ────────────────────────────────────────────────
    {
        provider: 'qosic',
        countries: ['BJ'],
        currencies: ['XOF'],
        methods: ['mtn', 'moov', 'mobile-money', 'card'],
        priority: 8,
        successRateEstimate: 0.91,
    },
    {
        provider: 'qosic',
        countries: ['TG'],
        currencies: ['XOF'],
        methods: ['t-money', 'moov', 'mobile-money', 'card'],
        priority: 8,
        successRateEstimate: 0.90,
    },
    {
        provider: 'qosic',
        countries: ['CI'],
        currencies: ['XOF'],
        methods: ['orange-money', 'mtn', 'moov', 'wave', 'mobile-money'],
        priority: 7,
        successRateEstimate: 0.89,
    },
    // ─── MONETBILL (CM) ─────────────────────────────────────────────────────
    {
        provider: 'monetbill',
        countries: ['CM'],
        currencies: ['XAF'],
        methods: ['mtn', 'orange-money', 'mobile-money'],
        priority: 8,
        successRateEstimate: 0.90,
    },
    // ─── PAYPLUS (CI, SN, ML, BJ) ──────────────────────────────────────────
    {
        provider: 'payplus',
        countries: ['CI', 'SN', 'ML', 'BJ'],
        currencies: ['XOF'],
        methods: ['orange-money', 'mtn', 'moov', 'wave', 'mobile-money', 'card'],
        priority: 7,
        successRateEstimate: 0.88,
    },
    // ─── HUB2 (West & Central Africa) ───────────────────────────────────────
    {
        provider: 'hub2',
        countries: ['CI', 'SN', 'BJ', 'TG', 'ML', 'BF'],
        currencies: ['XOF'],
        methods: ['orange-money', 'mtn', 'moov', 'wave', 'free-money', 't-money', 'mobile-money'],
        priority: 7,
        successRateEstimate: 0.89,
    },
    {
        provider: 'hub2',
        countries: ['CM'],
        currencies: ['XAF'],
        methods: ['mtn', 'orange-money', 'mobile-money'],
        priority: 7,
        successRateEstimate: 0.88,
    },
    {
        provider: 'hub2',
        countries: ['GH'],
        currencies: ['GHS'],
        methods: ['mtn', 'mobile-money'],
        priority: 7,
        successRateEstimate: 0.87,
    },
    // ─── LENGOPAY (GN, MA) ──────────────────────────────────────────────────
    {
        provider: 'lengopay',
        countries: ['GN'],
        currencies: ['GNF'],
        methods: ['orange-money', 'mtn', 'mobile-money', 'card'],
        priority: 9,
        successRateEstimate: 0.90,
    },
    // ─── WAVE BUSINESS (CI, SN, ML, BF) ─────────────────────────────────────
    {
        provider: 'wave',
        countries: ['CI', 'SN', 'ML', 'BF'],
        currencies: ['XOF'],
        methods: ['wave', 'mobile-money'],
        priority: 8,
        successRateEstimate: 0.93,
    },
    // ─── PAYTECH (SN, CI, ML, BJ) ───────────────────────────────────────────
    {
        provider: 'paytech',
        countries: ['SN', 'CI', 'ML', 'BJ'],
        currencies: ['XOF', 'EUR', 'USD'],
        methods: ['orange-money', 'wave', 'free-money', 'mtn', 'moov', 'card', 'mobile-money'],
        priority: 7,
        successRateEstimate: 0.88,
    },
    // ─── MAGMA ONEPAY (CI, SN, BJ, TG, ML, BF, CM) ──────────────────────────
    {
        provider: 'onepay',
        countries: ['CI', 'SN', 'BJ', 'TG', 'ML', 'BF', 'CM'],
        currencies: ['XOF', 'XAF'],
        methods: ['orange-money', 'mtn', 'moov', 'wave', 'card', 'mobile-money'],
        priority: 6,
        successRateEstimate: 0.87,
    },
    // ─── DJAMO BUSINESS (CI, SN) ────────────────────────────────────────────
    {
        provider: 'djamo',
        countries: ['CI', 'SN'],
        currencies: ['XOF'],
        methods: ['djamo', 'mobile-money'],
        priority: 6,
        successRateEstimate: 0.90,
    },
    // ─── IPAY MONEY (NE, BJ) ────────────────────────────────────────────────
    {
        provider: 'ipay',
        countries: ['NE', 'BJ'],
        currencies: ['XOF'],
        methods: ['airtel', 'moov', 'mtn', 'card', 'mobile-money'],
        priority: 7,
        successRateEstimate: 0.88,
    },
];

/**
 * Detect likely payment method from phone prefix (best-effort heuristic).
 * Returns null if detection is not possible.
 */
export function detectOperatorFromPhone(phone: string, country: string): PaymentMethod | null {
    if (!phone) return null;
    const clean = phone.replace(/\s+/g, '').replace(/^\+/, '');

    const prefixMap: Record<string, Record<string, PaymentMethod>> = {
        SN: {
            '77': 'orange-money',
            '78': 'free-money',
            '70': 'wave',
            '76': 'wave',
            '33': 'expresso',
            '75': 'wizall',
        },
        CI: {
            '07': 'orange-money',
            '08': 'orange-money',
            '57': 'mtn',
            '55': 'wave',
            '01': 'moov',
        },
        BJ: {
            '96': 'mtn',
            '97': 'mtn',
            '61': 'moov',
            '62': 'moov',
            '66': 'moov',
        },
        TG: {
            '90': 't-money',
            '91': 't-money',
            '70': 'moov',
            '71': 'moov',
        },
        ML: {
            '76': 'orange-money',
            '77': 'orange-money',
            '66': 'moov',
        },
        BF: {
            '70': 'orange-money',
            '76': 'orange-money',
            '65': 'moov',
        },
        CM: {
            '670': 'mtn',
            '671': 'mtn',
            '672': 'mtn',
            '673': 'mtn',
            '674': 'mtn',
            '675': 'mtn',
            '676': 'mtn',
            '677': 'mtn',
            '678': 'mtn',
            '679': 'mtn',
            '680': 'mtn',
            '681': 'mtn',
            '682': 'mtn',
            '683': 'mtn',
            '684': 'mtn',
            '685': 'mtn',
            '690': 'orange-money',
            '691': 'orange-money',
            '692': 'orange-money',
            '693': 'orange-money',
            '694': 'orange-money',
            '695': 'orange-money',
            '696': 'orange-money',
            '697': 'orange-money',
            '698': 'orange-money',
            '699': 'orange-money',
        },
        NG: {
            '080': 'mtn',
            '081': 'mtn',
            '090': 'airtel',
            '091': 'airtel',
        },
        KE: {
            '070': 'mpesa',
            '071': 'mpesa',
            '072': 'mpesa',
        },
    };

    const countryPrefixes = prefixMap[country.toUpperCase()];
    if (!countryPrefixes) return null;

    // Strip country dial code if present
    const local = stripCountryCode(clean, country);

    for (const [prefix, method] of Object.entries(countryPrefixes)) {
        if (local.startsWith(prefix)) return method;
    }

    return null;
}

function stripCountryCode(phone: string, country: string): string {
    const dialCodes: Record<string, string> = {
        SN: '221', CI: '225', BJ: '229', TG: '228',
        ML: '223', BF: '226', NG: '234', KE: '254',
        GH: '233', CM: '237', TZ: '255', UG: '256',
        RW: '250', ZA: '27',
    };
    const code = dialCodes[country.toUpperCase()];
    if (code && phone.startsWith(code)) return phone.slice(code.length);
    return phone;
}

/**
 * Score a provider rule against the routing context.
 * Returns null if the rule does not match.
 */
function scoreRule(rule: ProviderRule, ctx: RoutingContext): number | null {
    const country = ctx.country.toUpperCase();
    const currency = ctx.currency?.toUpperCase();

    // Country match
    if (!rule.countries.includes('*') && !rule.countries.includes(country)) return null;

    // Currency match
    if (currency && !rule.currencies.includes('*') && !rule.currencies.includes(currency)) return null;

    // Method match
    if (ctx.paymentMethod && !rule.methods.includes(ctx.paymentMethod) && !rule.methods.includes('mobile-money')) {
        return null;
    }

    // Amount bounds
    if (rule.minAmount !== undefined && ctx.amount < rule.minAmount) return null;
    if (rule.maxAmount !== undefined && ctx.amount > rule.maxAmount) return null;

    // Composite score: priority × success_rate + method exactness bonus
    let score = rule.priority * rule.successRateEstimate;

    // Exact method match bonus
    if (ctx.paymentMethod && rule.methods.includes(ctx.paymentMethod)) {
        score += 2;
    }

    // Country exact match bonus (vs wildcard)
    if (rule.countries.includes(country)) {
        score += 1;
    }

    return score;
}

/**
 * Main routing function.
 * Returns the best provider + ordered fallbacks.
 */
export function routePayment(ctx: RoutingContext): RoutingDecision {
    // If merchant explicitly wants a provider and has it configured → use it
    if (ctx.preferredProvider && ctx.availableProviders.includes(ctx.preferredProvider)) {
        return {
            provider: ctx.preferredProvider,
            reason: 'Fournisseur préféré par le marchand',
            alternates: ctx.availableProviders.filter(p => p !== ctx.preferredProvider),
            confidence: 1.0,
        };
    }

    const scores: Array<{ provider: string; score: number; rule: ProviderRule }> = [];

    for (const rule of ROUTING_RULES) {
        if (!ctx.availableProviders.includes(rule.provider)) continue;
        const score = scoreRule(rule, ctx);
        if (score !== null) {
            scores.push({ provider: rule.provider, score, rule });
        }
    }

    if (scores.length === 0) {
        // Fallback: pick the first available provider that supports cards
        const fallback = ctx.availableProviders[0];
        return {
            provider: fallback,
            reason: 'Aucun fournisseur spécifique trouvé — utilisation du premier disponible',
            alternates: ctx.availableProviders.slice(1),
            confidence: 0.3,
        };
    }

    // Sort by score descending, deduplicate by provider (keep highest score per provider)
    const deduped = new Map<string, { score: number; rule: ProviderRule }>();
    for (const entry of scores) {
        const existing = deduped.get(entry.provider);
        if (!existing || existing.score < entry.score) {
            deduped.set(entry.provider, { score: entry.score, rule: entry.rule });
        }
    }

    const sorted = Array.from(deduped.entries())
        .sort(([, a], [, b]) => b.score - a.score);

    const [bestProvider, bestEntry] = sorted[0];
    const alternates = sorted.slice(1).map(([p]) => p);

    const maxPossibleScore = 10 * 1.0 + 3; // max priority * max rate + bonuses
    const confidence = Math.min(bestEntry.score / maxPossibleScore, 1);

    const reason = buildReason(bestProvider, ctx, bestEntry.rule);

    return {
        provider: bestProvider,
        reason,
        alternates,
        confidence: Math.round(confidence * 100) / 100,
    };
}

function buildReason(provider: string, ctx: RoutingContext, rule: ProviderRule): string {
    const parts: string[] = [];

    if (ctx.paymentMethod) {
        parts.push(`méthode ${ctx.paymentMethod}`);
    }
    parts.push(`pays ${ctx.country}`);
    if (ctx.currency) parts.push(`devise ${ctx.currency}`);

    return `${provider} sélectionné pour ${parts.join(', ')} (priorité ${rule.priority}, taux de succès estimé ${Math.round(rule.successRateEstimate * 100)}%)`;
}

/**
 * Suggest available payment methods for a given country + configured providers.
 */
export function getAvailableMethods(
    country: string,
    availableProviders: string[],
    currency?: string
): Array<{ method: PaymentMethod; providers: string[] }> {
    const methodMap = new Map<PaymentMethod, Set<string>>();

    for (const rule of ROUTING_RULES) {
        if (!availableProviders.includes(rule.provider)) continue;
        if (!rule.countries.includes('*') && !rule.countries.includes(country.toUpperCase())) continue;
        if (currency && !rule.currencies.includes('*') && !rule.currencies.includes(currency.toUpperCase())) continue;

        for (const method of rule.methods) {
            if (!methodMap.has(method)) methodMap.set(method, new Set());
            methodMap.get(method)!.add(rule.provider);
        }
    }

    return Array.from(methodMap.entries()).map(([method, providers]) => ({
        method,
        providers: Array.from(providers),
    }));
}

/**
 * Given a list of provider IDs and a country, return providers sorted by
 * estimated reliability for that country.
 */
export function rankProvidersForCountry(
    providers: string[],
    country: string,
    currency?: string
): Array<{ provider: string; score: number }> {
    const scores = new Map<string, number>();

    for (const rule of ROUTING_RULES) {
        if (!providers.includes(rule.provider)) continue;
        const ctx: RoutingContext = {
            country,
            currency,
            amount: 1000,
            availableProviders: providers,
        };
        const score = scoreRule(rule, ctx);
        if (score !== null) {
            const current = scores.get(rule.provider) ?? 0;
            if (score > current) scores.set(rule.provider, score);
        }
    }

    return Array.from(scores.entries())
        .map(([provider, score]) => ({ provider, score }))
        .sort((a, b) => b.score - a.score);
}

/**
 * Les taux de réussite ESTIMÉS du tableau de règles, par fournisseur, pour un
 * contexte donné. Ce sont des suppositions écrites à la main, pas des mesures :
 * elles ne servent que de repli tant que le trafic réel n'a pas parlé
 * (cf. routage-mesure.ts).
 */
export function estimationsStatiques(ctx: RoutingContext): Record<string, number> {
    const out: Record<string, number> = {};
    for (const rule of ROUTING_RULES) {
        if (scoreRule(rule, ctx) === null) continue;
        const actuel = out[rule.provider];
        if (actuel === undefined || rule.successRateEstimate > actuel) {
            out[rule.provider] = rule.successRateEstimate;
        }
    }
    return out;
}
