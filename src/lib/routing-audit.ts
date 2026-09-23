import prisma from "@/lib/db";
import type { RoutingConfigData, RoutingDecisionRecord, MethodAssignments, VolumeSplitEntry, RoutingRule } from "@/lib/actions/routing";

/**
 * Piste d'audit du routage, ecrite par le serveur seulement (initiation,
 * webhooks, finalisation). Ces fonctions vivaient dans un fichier "use server" :
 * elles etaient donc appelables par HTTP sans session, ce qui permettait de
 * lire la configuration de routage de tout espace et de reecrire l'issue de
 * n'importe quelle decision.
 */
export function mapDbToData(config: any): RoutingConfigData {
    return {
        algorithmKind: config.algorithmKind ?? 'PRIORITY',
        methodAssignments: (config.methodAssignments as MethodAssignments) || {},
        fallbackOrder: config.fallbackOrder || [],
        volumeSplits: (config.volumeSplits as VolumeSplitEntry[]) || [],
        routingRules: (config.routingRules as RoutingRule[]) || [],
        successScores: (config.successScores as Record<string, number>) || {},
        allowedProviders: config.allowedProviders || [],
        maxRetries: config.maxRetries ?? 3,
    };
}

/** Enregistre une decision de routage ; ne bloque jamais un paiement. */
export async function recordRoutingDecision(record: RoutingDecisionRecord): Promise<void> {
    try {
        await (prisma as any).routingDecision.create({
            data: {
                applicationId: record.applicationId,
                transactionId: record.transactionId ?? null,
                algorithmKind: record.algorithmKind,
                methodCode: record.methodCode,
                country: record.country,
                currency: record.currency,
                amount: record.amount,
                orderedGatewayIds: record.orderedGatewayIds,
                chosenGatewayId: record.chosenGatewayId ?? null,
                assignedOverride: record.assignedOverride ?? false,
                reason: record.reason ?? null,
                outcome: 'PENDING',
            },
        });
    } catch (e) {
        console.error('[recordRoutingDecision] error:', e);
    }
}

/** Issue d'une decision, une fois le statut final connu. */
export async function updateDecisionOutcome(transactionId: string, outcome: 'SUCCESS' | 'FAILED' | 'CANCELLED'): Promise<void> {
    try {
        await (prisma as any).routingDecision.updateMany({ where: { transactionId }, data: { outcome } });
    } catch (e) {
        console.error('[updateDecisionOutcome] error:', e);
    }
}
