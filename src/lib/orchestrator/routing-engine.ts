/**
 * Smart Routing Engine
 *
 * Ports Hyperswitch's 5 routing algorithm types to TypeScript:
 *  1. SINGLE       — straight-through to one gateway
 *  2. PRIORITY     — ordered list, try first available / fallback on failure
 *  3. VOLUME_SPLIT — probabilistic weighted split (like A/B testing)
 *  4. ADVANCED     — rule-based DSL (if amount > X && country == Y → gateway)
 *  5. DYNAMIC      — success-rate based (auto-rank by historical performance)
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type RoutingAlgorithmKind =
    | 'SINGLE'
    | 'PRIORITY'
    | 'VOLUME_SPLIT'
    | 'ADVANCED'
    | 'DYNAMIC';

export interface VolumeSplitEntry {
    gatewayId: string;
    split: number; // 0–100, must sum to 100 across all entries
}

export type RuleOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in';
export type RuleField = 'amount' | 'currency' | 'country' | 'methodCode' | 'methodType';

export interface RuleCondition {
    field: RuleField;
    operator: RuleOperator;
    value: string | number | string[];
}

export interface RoutingRule {
    name: string;
    conditions: RuleCondition[];  // AND logic between conditions
    gatewayIds: string[];         // priority-ordered list if rule matches
}

/** Payment context passed to the engine for rule evaluation */
export interface PaymentContext {
    amount: number;
    currency: string;
    country: string;
    methodCode: string;
    methodType?: string; // MOBILE_MONEY | CARD | BANK_TRANSFER
}

export interface RoutingConfig {
    algorithmKind: RoutingAlgorithmKind;
    fallbackOrder: string[];              // PRIORITY / fallback list
    volumeSplits: VolumeSplitEntry[] | null;
    routingRules: RoutingRule[] | null;
    successScores: Record<string, number> | null; // DYNAMIC: { gatewayId: 0–100 }
    allowedProviders: string[];
    maxRetries: number;
    methodAssignments: Record<string, string>; // { "methodCode||country": gatewayId }
}

// ─── Engine ──────────────────────────────────────────────────────────────────

/**
 * Returns an ordered list of gateway IDs to try, from most to least preferred.
 * The caller should try them in order, stopping at first success.
 */
export function resolveGatewayOrder(
    config: RoutingConfig,
    context: PaymentContext,
    primaryGatewayId: string,
): string[] {
    // 1. Check method assignment override first (always takes precedence)
    const assignmentKey = `${context.methodCode}||${context.country}`;
    const assignedGateway = config.methodAssignments?.[assignmentKey];
    if (assignedGateway) {
        // Put assigned gateway first, then fallback order
        const rest = buildFallbackList(config, context, assignedGateway);
        return dedupe([assignedGateway, ...rest]);
    }

    // 2. Apply the configured algorithm
    switch (config.algorithmKind) {
        case 'SINGLE':
            return resolveSingle(config, primaryGatewayId);

        case 'PRIORITY':
            return resolvePriority(config, primaryGatewayId);

        case 'VOLUME_SPLIT':
            return resolveVolumeSplit(config, primaryGatewayId);

        case 'ADVANCED':
            return resolveAdvanced(config, context, primaryGatewayId);

        case 'DYNAMIC':
            return resolveDynamic(config, primaryGatewayId);

        default:
            return resolvePriority(config, primaryGatewayId);
    }
}

// ─── Algorithm implementations ───────────────────────────────────────────────

/** SINGLE: straight-through, no fallback */
function resolveSingle(config: RoutingConfig, primaryGatewayId: string): string[] {
    const gateway = config.fallbackOrder[0] ?? primaryGatewayId;
    return filterAllowed([gateway], config.allowedProviders);
}

/** PRIORITY: try gateways in fallbackOrder, primary first if not already listed */
function resolvePriority(config: RoutingConfig, primaryGatewayId: string): string[] {
    const ordered = config.fallbackOrder.length > 0
        ? config.fallbackOrder
        : [primaryGatewayId];

    return filterAllowed(
        dedupe([primaryGatewayId, ...ordered]),
        config.allowedProviders,
    );
}

/**
 * VOLUME_SPLIT: probabilistic weighted selection.
 * The winning gateway goes first, then remaining by their order.
 * Mirrors Hyperswitch's perform_volume_split using WeightedIndex.
 */
function resolveVolumeSplit(config: RoutingConfig, primaryGatewayId: string): string[] {
    const splits = config.volumeSplits;
    if (!splits || splits.length === 0) {
        return resolvePriority(config, primaryGatewayId);
    }

    const allowed = filterAllowed(
        splits.map(s => s.gatewayId),
        config.allowedProviders,
    );
    const filteredSplits = splits.filter(s => allowed.includes(s.gatewayId));

    if (filteredSplits.length === 0) return resolvePriority(config, primaryGatewayId);

    const winner = weightedRandom(filteredSplits);
    const rest = filteredSplits
        .filter(s => s.gatewayId !== winner)
        .sort((a, b) => b.split - a.split)
        .map(s => s.gatewayId);

    return [winner, ...rest];
}

/**
 * ADVANCED: evaluates rules in order (AND between conditions per rule).
 * First matching rule's gatewayIds list is used.
 * Falls back to PRIORITY if no rule matches.
 * Mirrors Hyperswitch's execute_dsl_and_get_connector_v1.
 */
function resolveAdvanced(
    config: RoutingConfig,
    context: PaymentContext,
    primaryGatewayId: string,
): string[] {
    const rules = config.routingRules;
    if (!rules || rules.length === 0) {
        return resolvePriority(config, primaryGatewayId);
    }

    for (const rule of rules) {
        if (evaluateRule(rule, context)) {
            const gateways = filterAllowed(rule.gatewayIds, config.allowedProviders);
            if (gateways.length > 0) {
                // Append remaining fallbacks not already in matched list
                const fallback = config.fallbackOrder.filter(id => !gateways.includes(id));
                return filterAllowed(dedupe([...gateways, ...fallback]), config.allowedProviders);
            }
        }
    }

    // No rule matched → fall back to default priority config
    return resolvePriority(config, primaryGatewayId);
}

/**
 * DYNAMIC: rank gateways by success score descending.
 * Score range 0–100 (100 = perfect). Gateways with no score get 50 (neutral).
 * Mirrors Hyperswitch's success-rate based routing.
 */
function resolveDynamic(config: RoutingConfig, primaryGatewayId: string): string[] {
    const scores = config.successScores ?? {};
    const candidates = config.fallbackOrder.length > 0
        ? dedupe([primaryGatewayId, ...config.fallbackOrder])
        : [primaryGatewayId];

    const filtered = filterAllowed(candidates, config.allowedProviders);

    // Sort by success score descending; neutral score = 50 for unknowns
    const ranked = filtered.sort((a, b) => {
        const scoreA = scores[a] ?? 50;
        const scoreB = scores[b] ?? 50;
        return scoreB - scoreA;
    });

    return ranked;
}

// ─── Rule evaluation ─────────────────────────────────────────────────────────

function evaluateRule(rule: RoutingRule, ctx: PaymentContext): boolean {
    return rule.conditions.every(cond => evaluateCondition(cond, ctx));
}

function evaluateCondition(cond: RuleCondition, ctx: PaymentContext): boolean {
    const raw = getContextValue(cond.field, ctx);
    if (raw === undefined || raw === null) return false;

    switch (cond.operator) {
        case 'eq':
            return String(raw).toLowerCase() === String(cond.value).toLowerCase();
        case 'neq':
            return String(raw).toLowerCase() !== String(cond.value).toLowerCase();
        case 'gt':
            return Number(raw) > Number(cond.value);
        case 'gte':
            return Number(raw) >= Number(cond.value);
        case 'lt':
            return Number(raw) < Number(cond.value);
        case 'lte':
            return Number(raw) <= Number(cond.value);
        case 'in':
            if (!Array.isArray(cond.value)) return false;
            return (cond.value as string[]).some(
                v => v.toLowerCase() === String(raw).toLowerCase()
            );
        default:
            return false;
    }
}

function getContextValue(field: RuleField, ctx: PaymentContext): string | number | undefined {
    switch (field) {
        case 'amount':     return ctx.amount;
        case 'currency':   return ctx.currency;
        case 'country':    return ctx.country;
        case 'methodCode': return ctx.methodCode;
        case 'methodType': return ctx.methodType;
        default:           return undefined;
    }
}

// ─── Dynamic routing: score update ───────────────────────────────────────────

/**
 * Update the success score for a gateway after a payment attempt.
 * Uses exponential moving average (EMA) with alpha=0.2 — same idea as
 * Hyperswitch's success-rate tracker. Result is clamped to [0, 100].
 *
 * Call this from the checkout API after every attempt result.
 */
export function updateSuccessScore(
    scores: Record<string, number>,
    gatewayId: string,
    succeeded: boolean,
): Record<string, number> {
    const ALPHA = 0.2; // EMA smoothing factor (0.2 = ~5-payment window)
    const current = scores[gatewayId] ?? 50;
    const outcome = succeeded ? 100 : 0;
    const updated = Math.round(current * (1 - ALPHA) + outcome * ALPHA);
    return { ...scores, [gatewayId]: Math.max(0, Math.min(100, updated)) };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildFallbackList(
    config: RoutingConfig,
    _context: PaymentContext,
    excludeId: string,
): string[] {
    return filterAllowed(
        config.fallbackOrder.filter(id => id !== excludeId),
        config.allowedProviders,
    );
}

/** Remove duplicates while preserving order */
function dedupe(ids: string[]): string[] {
    return [...new Set(ids)];
}

/** If allowedProviders is non-empty, filter to only those; else return all */
function filterAllowed(ids: string[], allowed: string[]): string[] {
    if (!allowed || allowed.length === 0) return ids;
    return ids.filter(id => allowed.includes(id));
}

/**
 * Weighted random selection using the WeightedIndex approach from Hyperswitch.
 * Returns the winning gatewayId.
 */
function weightedRandom(splits: VolumeSplitEntry[]): string {
    const total = splits.reduce((sum, s) => sum + s.split, 0);
    let rand = Math.random() * total;
    for (const entry of splits) {
        rand -= entry.split;
        if (rand <= 0) return entry.gatewayId;
    }
    return splits[splits.length - 1].gatewayId;
}
