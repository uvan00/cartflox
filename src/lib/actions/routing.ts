"use server";

import prisma from "@/lib/db";
import { getSession } from "@/lib/session";
import { getSelectedAppId } from "./utils";
import { mapDbToData } from "@/lib/routing-audit";

export type RoutingAlgorithmKind = 'SINGLE' | 'PRIORITY' | 'VOLUME_SPLIT' | 'ADVANCED' | 'DYNAMIC';

export interface VolumeSplitEntry {
    gatewayId: string;
    split: number;
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
    conditions: RuleCondition[];
    gatewayIds: string[];
}

export interface MethodAssignments {
    [key: string]: string; // "methodCode||country" → gatewayId
}

export interface RoutingConfigData {
    algorithmKind: RoutingAlgorithmKind;
    methodAssignments: MethodAssignments;
    fallbackOrder: string[];
    volumeSplits: VolumeSplitEntry[];
    routingRules: RoutingRule[];
    successScores: Record<string, number>;
    allowedProviders: string[];
    maxRetries: number;
}

const DEFAULT_CONFIG: RoutingConfigData = {
    algorithmKind: 'PRIORITY',
    methodAssignments: {},
    fallbackOrder: [],
    volumeSplits: [],
    routingRules: [],
    successScores: {},
    allowedProviders: [],
    maxRetries: 3,
};


/**
 * Get the routing config for the current application
 */
export async function getRoutingConfig(): Promise<RoutingConfigData | null> {
    try {
        const session = await getSession();
        if (!session?.user) throw new Error("Unauthorized");

        const appId = await getSelectedAppId();
        if (!appId) return null;

        const config = await (prisma as any).routingConfig.findUnique({
            where: { applicationId: appId },
        });

        return config ? mapDbToData(config) : { ...DEFAULT_CONFIG };
    } catch (error) {
        console.error("[getRoutingConfig] error:", error);
        return null;
    }
}


/**
 * Save the full routing config for the current application
 */
export async function saveRoutingConfig(data: RoutingConfigData): Promise<{ success: boolean; error?: string }> {
    try {
        const session = await getSession();
        if (!session?.user) throw new Error("Unauthorized");

        const appId = await getSelectedAppId();
        if (!appId) throw new Error("No application selected");

        // Seules les passerelles DE CET ESPACE peuvent etre citees : les
        // identifiants de passerelle sont publics (la page de paiement les envoie
        // au navigateur), et l'initiation chargeait les passerelles de secours par
        // id sans controle de propriete, donc avec les cles d'un autre marchand.
        const siennes = new Set((await prisma.gateway.findMany({ where: { applicationId: appId }, select: { id: true } })).map((g) => g.id));
        const sienne = (id: unknown) => typeof id === "string" && siennes.has(id);
        const methodAssignments = Object.fromEntries(Object.entries(data.methodAssignments || {}).filter(([, id]) => sienne(id)));
        const payload = {
            algorithmKind: data.algorithmKind,
            methodAssignments,
            fallbackOrder: (data.fallbackOrder || []).filter(sienne),
            volumeSplits: (data.volumeSplits || []).filter((v) => sienne(v?.gatewayId)),
            routingRules: (data.routingRules || []).map((r) => ({ ...r, gatewayIds: (r.gatewayIds || []).filter(sienne) })),
            allowedProviders: data.allowedProviders,
            maxRetries: Math.min(5, Math.max(0, Math.round(Number(data.maxRetries) || 0))),
        };

        await (prisma as any).routingConfig.upsert({
            where: { applicationId: appId },
            update: payload,
            create: { applicationId: appId, ...payload, successScores: {} },
        });

        return { success: true };
    } catch (error: any) {
        console.error("[saveRoutingConfig] error:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Assign a specific provider to a payment method + country pair
 */
export async function assignMethodProvider(
    methodCode: string,
    country: string,
    gatewayId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const session = await getSession();
        if (!session?.user) throw new Error("Unauthorized");

        const appId = await getSelectedAppId();
        if (!appId) throw new Error("No application selected");

        const existing = await (prisma as any).routingConfig.findUnique({
            where: { applicationId: appId },
        });

        const assignments = (existing?.methodAssignments as MethodAssignments) || {};
        const key = `${methodCode}||${country}`;

        if (gatewayId === '') {
            delete assignments[key];
        } else {
            assignments[key] = gatewayId;
        }

        await (prisma as any).routingConfig.upsert({
            where: { applicationId: appId },
            update: { methodAssignments: assignments },
            create: {
                applicationId: appId,
                methodAssignments: assignments,
                algorithmKind: 'PRIORITY',
                fallbackOrder: [],
                volumeSplits: [],
                routingRules: [],
                successScores: {},
                allowedProviders: [],
                maxRetries: 3,
            },
        });

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export interface SimulationInput {
    amount: number;
    currency: string;
    country: string;
    methodCode: string;
    methodType?: 'MOBILE_MONEY' | 'CARD' | 'BANK_TRANSFER';
}

export interface SimulationStep {
    label: string;
    detail?: string;
}

export interface SimulationResult {
    success: boolean;
    error?: string;
    orderedGateways: Array<{ id: string; name: string; rank: number }>;
    chosen: { id: string; name: string } | null;
    algorithmKind: RoutingAlgorithmKind;
    maxAttempts: number;
    steps: SimulationStep[];
}

/**
 * Simulate routing for a hypothetical payment. Returns the ordered list of
 * gateways the engine would try along with a human-readable decision trace.
 */
export async function simulateRouting(input: SimulationInput): Promise<SimulationResult> {
    const empty: SimulationResult = {
        success: false,
        orderedGateways: [],
        chosen: null,
        algorithmKind: 'PRIORITY',
        maxAttempts: 0,
        steps: [],
    };
    try {
        const session = await getSession();
        if (!session?.user) return { ...empty, error: 'Unauthorized' };

        const appId = await getSelectedAppId();
        if (!appId) return { ...empty, error: 'Aucune application sélectionnée' };

        const [config, gateways] = await Promise.all([
            (prisma as any).routingConfig.findUnique({ where: { applicationId: appId } }),
            (prisma as any).gateway.findMany({ where: { applicationId: appId, status: 'active' } }),
        ]);

        if (!gateways || gateways.length === 0) {
            return { ...empty, error: 'Aucune passerelle active sur cette application' };
        }

        const cfg: RoutingConfigData = config ? mapDbToData(config) : { ...DEFAULT_CONFIG };
        const gwById = new Map(gateways.map((g: any) => [g.id, g]));
        const nameOf = (id: string) => (gwById.get(id) as any)?.name ?? id;

        const { resolveGatewayOrder } = await import('@/lib/orchestrator/routing-engine');

        const primary = cfg.fallbackOrder[0] ?? gateways[0].id;
        const ordered: string[] = resolveGatewayOrder(
            {
                algorithmKind: cfg.algorithmKind,
                fallbackOrder: cfg.fallbackOrder,
                volumeSplits: cfg.volumeSplits,
                routingRules: cfg.routingRules,
                successScores: cfg.successScores,
                allowedProviders: cfg.allowedProviders,
                maxRetries: cfg.maxRetries,
                methodAssignments: cfg.methodAssignments,
            } as any,
            {
                amount: input.amount,
                currency: input.currency,
                country: input.country,
                methodCode: input.methodCode,
                methodType: input.methodType,
            },
            primary,
        );

        const steps: SimulationStep[] = [];
        const assignKey = `${input.methodCode}||${input.country}`;
        const assigned = cfg.methodAssignments?.[assignKey];
        if (assigned) {
            steps.push({
                label: 'Override méthode → passerelle',
                detail: `${input.methodCode} (${input.country}) est assignée à ${nameOf(assigned)} — court-circuite l'algorithme.`,
            });
        }
        steps.push({
            label: `Algorithme : ${cfg.algorithmKind}`,
            detail: algoExplanation(cfg.algorithmKind, cfg, ordered, nameOf),
        });
        if (cfg.allowedProviders?.length && cfg.allowedProviders.length < gateways.length) {
            steps.push({
                label: 'Filtre passerelles autorisées',
                detail: cfg.allowedProviders.map(nameOf).join(' · '),
            });
        }
        const maxAttempts = Math.min(ordered.length, (cfg.maxRetries ?? 3) + 1);
        steps.push({
            label: `Max tentatives : ${maxAttempts}`,
            detail: `Le système essaiera jusqu'à ${maxAttempts} passerelle(s) avant d'abandonner.`,
        });

        return {
            success: true,
            algorithmKind: cfg.algorithmKind,
            maxAttempts,
            orderedGateways: ordered.map((id, i) => ({ id, name: nameOf(id), rank: i + 1 })),
            chosen: ordered[0] ? { id: ordered[0], name: nameOf(ordered[0]) } : null,
            steps,
        };
    } catch (error: any) {
        console.error('[simulateRouting] error:', error);
        return { ...empty, error: error.message };
    }
}

function algoExplanation(
    kind: RoutingAlgorithmKind,
    cfg: RoutingConfigData,
    ordered: string[],
    nameOf: (id: string) => string,
): string {
    switch (kind) {
        case 'SINGLE':
            return `Une seule passerelle utilisée — ${ordered[0] ? nameOf(ordered[0]) : '(aucune)'}.`;
        case 'PRIORITY':
            return `Ordre essayé : ${ordered.map(nameOf).join(' → ')}`;
        case 'VOLUME_SPLIT': {
            const total = (cfg.volumeSplits || []).reduce((s, e) => s + e.split, 0);
            const splits = (cfg.volumeSplits || []).map(e => `${nameOf(e.gatewayId)} ${e.split}%`).join(' · ');
            return total === 100
                ? `Tirage pondéré : ${splits}. Gagnant pour cette simulation : ${ordered[0] ? nameOf(ordered[0]) : '(aucun)'}.`
                : `⚠️ Volume splits ne totalise pas 100% (${total}%).`;
        }
        case 'ADVANCED':
            return `${(cfg.routingRules || []).length} règle(s). Première règle correspondante gagne. Ordre résolu : ${ordered.map(nameOf).join(' → ') || '(aucune)'}.`;
        case 'DYNAMIC':
            return `Classement par taux de succès. Ordre actuel : ${ordered.map(nameOf).join(' → ')}.`;
        default:
            return ordered.map(nameOf).join(' → ');
    }
}

// ─── Routing decision audit log ──────────────────────────────────────────────

export interface RoutingDecisionRecord {
    applicationId: string;
    transactionId?: string | null;
    algorithmKind: RoutingAlgorithmKind;
    methodCode: string;
    country: string;
    currency: string;
    amount: number;
    orderedGatewayIds: string[];
    chosenGatewayId?: string | null;
    assignedOverride?: boolean;
    reason?: string | null;
}


export interface DecisionListItem {
    id: string;
    transactionId: string | null;
    algorithmKind: RoutingAlgorithmKind;
    methodCode: string;
    country: string;
    currency: string;
    amount: number;
    orderedGateways: Array<{ id: string; name: string }>;
    chosen: { id: string; name: string } | null;
    outcome: string;
    reason: string | null;
    assignedOverride: boolean;
    createdAt: string;
}

/**
 * Query recent routing decisions for the current application.
 */
export async function listRoutingDecisions(limit: number = 50): Promise<DecisionListItem[]> {
    try {
        const session = await getSession();
        if (!session?.user) throw new Error('Unauthorized');

        const appId = await getSelectedAppId();
        if (!appId) return [];

        const [decisions, gateways] = await Promise.all([
            (prisma as any).routingDecision.findMany({
                where: { applicationId: appId },
                orderBy: { createdAt: 'desc' },
                take: Math.min(Math.max(limit, 1), 200),
            }),
            (prisma as any).gateway.findMany({
                where: { applicationId: appId },
                select: { id: true, name: true },
            }),
        ]);

        const nameOf = new Map<string, string>(gateways.map((g: any) => [g.id, g.name]));

        return decisions.map((d: any) => ({
            id: d.id,
            transactionId: d.transactionId,
            algorithmKind: d.algorithmKind,
            methodCode: d.methodCode,
            country: d.country,
            currency: d.currency,
            amount: d.amount,
            orderedGateways: (d.orderedGatewayIds as string[] || []).map((id: string) => ({
                id,
                name: nameOf.get(id) ?? id,
            })),
            chosen: d.chosenGatewayId
                ? { id: d.chosenGatewayId, name: nameOf.get(d.chosenGatewayId) ?? d.chosenGatewayId }
                : null,
            outcome: d.outcome,
            reason: d.reason,
            assignedOverride: d.assignedOverride,
            createdAt: d.createdAt.toISOString(),
        }));
    } catch (error: any) {
        console.error('[listRoutingDecisions] error:', error);
        return [];
    }
}

/**
 * Fetch the most recent routing decision for a given transaction (the audit
 * trail entry created at /api/checkout/initiate). Returns null if none exists.
 */
export async function getRoutingDecisionByTransactionId(transactionId: string): Promise<DecisionListItem | null> {
    try {
        const session = await getSession();
        if (!session?.user) throw new Error('Unauthorized');

        const appId = await getSelectedAppId();
        if (!appId) return null;

        const decision = await (prisma as any).routingDecision.findFirst({
            where: { transactionId, applicationId: appId },
            orderBy: { createdAt: 'desc' },
        });
        if (!decision) return null;

        const gateways = await (prisma as any).gateway.findMany({
            where: { applicationId: appId },
            select: { id: true, name: true },
        });
        const nameOf = new Map<string, string>(gateways.map((g: any) => [g.id, g.name]));

        return {
            id: decision.id,
            transactionId: decision.transactionId,
            algorithmKind: decision.algorithmKind,
            methodCode: decision.methodCode,
            country: decision.country,
            currency: decision.currency,
            amount: decision.amount,
            orderedGateways: ((decision.orderedGatewayIds as string[]) || []).map((id: string) => ({
                id,
                name: nameOf.get(id) ?? id,
            })),
            chosen: decision.chosenGatewayId
                ? { id: decision.chosenGatewayId, name: nameOf.get(decision.chosenGatewayId) ?? decision.chosenGatewayId }
                : null,
            outcome: decision.outcome,
            reason: decision.reason,
            assignedOverride: decision.assignedOverride,
            createdAt: decision.createdAt.toISOString(),
        };
    } catch (error: any) {
        console.error('[getRoutingDecisionByTransactionId] error:', error);
        return null;
    }
}

/**
 * Reset success scores (useful when switching to DYNAMIC mode or resetting stats)
 */
export async function resetSuccessScores(): Promise<{ success: boolean; error?: string }> {
    try {
        const session = await getSession();
        if (!session?.user) throw new Error("Unauthorized");

        const appId = await getSelectedAppId();
        if (!appId) throw new Error("No application selected");

        await (prisma as any).routingConfig.update({
            where: { applicationId: appId },
            data: { successScores: {} },
        });

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
