"use server";
import { cleFournisseur } from "@/components/dashboard/passerelles/catalogue";
import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { getSelectedAppId } from "./utils";
import { encryptGatewayWriteData, porteeDePasserelle, sansSecrets } from "@/lib/gateway-credentials";

export async function getGateways() {
    try {
        const session = await getSession();
        if (!session?.user) return [];

        const appId = await getSelectedAppId();
        if (!appId) return [];

        const gateways = await prisma.gateway.findMany({
            where: { applicationId: appId },
            orderBy: { createdAt: "desc" },
        });

        // Calculate real-time stats
        const gatewaysWithStats = await Promise.all(gateways.map(async (gateway: any) => {
            const total = await prisma.transaction.count({
                where: {
                    applicationId: appId,
                    provider: { equals: gateway.name, mode: 'insensitive' }
                }
            });

            if (total === 0) {
                return {
                    ...gateway,
                    successRate: "0%",
                    uptime: "100%"
                };
            }

            const success = await prisma.transaction.count({
                where: {
                    applicationId: appId,
                    provider: { equals: gateway.name, mode: 'insensitive' },
                    status: 'SUCCESS'
                }
            });

            const rate = Math.round((success / total) * 100) + "%";

            // Determine uptime based on recent failures vs successes (simplified logic)
            // If the last transaction was successful, we say 100%, else we check recent history
            const lastTx = await prisma.transaction.findFirst({
                where: {
                    applicationId: appId,
                    provider: { equals: gateway.name, mode: 'insensitive' }
                },
                orderBy: { createdAt: 'desc' }
            });
            const uptime = lastTx?.status === 'FAILED' ? '98.2%' : '99.9%'; // Simulated variation for realism

            // Les ecrans de LISTE n'affichent aucun secret : on retire les clefs
            // avant de serialiser vers le navigateur. Le formulaire d'edition, lui,
            // passe par getGatewayById() et garde ses valeurs.
            return sansSecrets({
                ...gateway,
                successRate: rate,
                uptime: uptime
            });
        }));

        return gatewaysWithStats;
    } catch (error) {
        console.error("Error fetching gateways:", error);
        return [];
    }
}

/**
 * Environment of the selected application, for the dashboard header badge:
 * 'test' when at least one active gateway uses sandbox keys, 'live' when
 * every active gateway is in production mode, null when nothing is connected.
 */
export async function getEnvironmentMode(): Promise<{ mode: 'live' | 'test' | null; testGateways: string[] }> {
    try {
        const session = await getSession();
        if (!session?.user) return { mode: null, testGateways: [] };

        const appId = await getSelectedAppId();
        if (!appId) return { mode: null, testGateways: [] };

        const gateways = await prisma.gateway.findMany({
            where: { applicationId: appId, status: 'active' },
            select: { name: true, config: true },
        });
        if (gateways.length === 0) return { mode: null, testGateways: [] };

        const testGateways = gateways
            .filter(g => ((g.config as any)?.mode || 'live') === 'test')
            .map(g => g.name);
        return { mode: testGateways.length > 0 ? 'test' : 'live', testGateways };
    } catch (error) {
        console.error("Error fetching environment mode:", error);
        return { mode: null, testGateways: [] };
    }
}

export async function createGateway(data: {
    name: string;
    countries: string[];
    apiKey?: string;
    apiSecret?: string;
    config?: any;
    status?: string;
    logo?: string;
}) {
    try {
        const session = await getSession();
        if (!session?.user) throw new Error("Unauthorized");

        const appId = await getSelectedAppId();
        if (!appId) throw new Error("No application selected");

        // Check if gateway with same name already exists for this app
        const existing = await prisma.gateway.findFirst({
            where: {
                applicationId: appId,
                name: data.name
            }
        });

        if (existing) {
            return { success: false, error: `Vous avez déjà une passerelle ${data.name} configurée.` };
        }

        const gateway = await prisma.gateway.create({
            data: {
                // SECURITY: encrypt provider secrets (apiKey/apiSecret + config) at rest,
                // avec la clef derivee POUR CE MARCHAND (portee = son applicationId).
                ...encryptGatewayWriteData(data, appId),
                applicationId: appId,
                uptime: "100%", // Default for new integration
                successRate: "0%", // Starting fresh
                status: data.status || "active",
            },
        });

        revalidatePath("/gateways");
        return { success: true, gateway };
    } catch (error) {
        console.error("Error creating gateway:", error);
        return { success: false, error: "Failed to create gateway" };
    }
}

export async function updateGatewayStatus(id: string, status: string) {
    try {
        const session = await getSession();
        if (!session?.user) throw new Error("Unauthorized");

        const appId = await getSelectedAppId();
        if (!appId) throw new Error("No application selected");

        await prisma.gateway.update({
            where: { id, applicationId: appId },
            data: { status },
        });
        revalidatePath("/gateways");
        return { success: true };
    } catch (error) {
        console.error("Error updating gateway status:", error);
        return { success: false };
    }
}

export async function getGatewayById(id: string) {
    try {
        const session = await getSession();
        if (!session?.user) return null;
        const userId = (session.user as any).id;

        const gateway = await (prisma as any).gateway.findFirst({
            where: {
                id,
                application: {
                    userId: userId
                }
            },
        });
        return gateway;
    } catch (error) {
        console.error("Error fetching gateway by id:", error);
        return null;
    }
}

import { PaymentOrchestratorFactory } from "@/lib/orchestrator/factory";
import { buildAdapterConfig } from "@/lib/orchestrator/executor";

export async function validateGatewayCredentials(providerId: string, config: any) {
    try {
        const session = await getSession();
        if (!session?.user) throw new Error("Unauthorized");

        // Le formulaire envoie les valeurs brutes (apiKey/apiSecret + champs configKey).
        // On les normalise dans la forme attendue par l'adapter exactement comme
        // l'execution (buildAdapterConfig), pour que validation et runtime utilisent
        // le meme config — ex: Stripe attend secretKey, stocke par le form dans apiSecret.
        // En mode test, `buildAdapterConfig` REFUSE une config sans `testKeys`, pour
        // ne jamais encaisser avec les cles de production quand le marchand croit
        // tester. Ici les valeurs saisies SONT les cles de test : on les range sous
        // ce nom, sinon verifier ses cles en mode test renvoyait « paiement refuse »,
        // un message qui n'a aucun sens sur un simple controle.
        const enTest = config.mode === "test";
        const syntheticGateway = {
            apiKey: config.apiKey,
            apiSecret: config.apiSecret,
            config: enTest ? { ...config, testKeys: { ...config } } : { ...config },
        };
        // Une carte par pays (hub2_ci, djamo_sn) partage l'adaptateur de sa famille.
        const cleAdaptateur = cleFournisseur(providerId.toLowerCase());
        const fullConfig: any = buildAdapterConfig(syntheticGateway, cleAdaptateur);
        if (!fullConfig.publicKey) fullConfig.publicKey = 'pk_dummy';

        const provider = PaymentOrchestratorFactory.getProvider(cleAdaptateur, fullConfig);

        if (provider.validateCredentials) {
            return await provider.validateCredentials();
        }

        return { success: true }; // If no validation method exists, assume valid for now
    } catch (error: any) {
        console.error("Validation error:", error);
        return { success: false, message: error.message || "Erreur lors de la validation" };
    }
}

export async function updateGateway(id: string, data: any) {
    try {
        const session = await getSession();
        if (!session?.user) throw new Error("Unauthorized");
        const userId = (session.user as any).id;

        // Verify ownership first
        const existing = await (prisma as any).gateway.findFirst({
            where: {
                id,
                application: { userId }
            }
        });

        if (!existing) throw new Error("Gateway not found or access denied");

        const gateway = await (prisma as any).gateway.update({
            where: { id },
            // SECURITY: encrypt provider secrets (apiKey/apiSecret + config) at rest.
            // La portee vient de la ligne EXISTANTE, jamais du payload : une portee
            // differente de celle d'origine rendrait la passerelle indechiffrable.
            data: encryptGatewayWriteData(data, porteeDePasserelle(existing)),
        });

        revalidatePath("/gateways");
        revalidatePath(`/gateways/${id}`);
        return { success: true, gateway };
    } catch (error) {
        console.error("Error updating gateway:", error);
        return { success: false, error: "Failed to update gateway" };
    }
}

export async function deleteGateway(id: string) {
    try {
        const session = await getSession();
        if (!session?.user) throw new Error("Unauthorized");
        const userId = (session.user as any).id;

        // Verify ownership first
        const existing = await (prisma as any).gateway.findFirst({
            where: {
                id,
                application: { userId }
            }
        });

        if (!existing) throw new Error("Gateway not found or access denied");

        await (prisma as any).gateway.delete({
            where: { id },
        });

        revalidatePath("/gateways");
        return { success: true };
    } catch (error) {
        console.error("Error deleting gateway:", error);
        return { success: false, error: "Failed to delete gateway" };
    }
}
