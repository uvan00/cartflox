"use server";

import prisma from "@/lib/db";
import { getSession } from "@/lib/session";
import { getSelectedAppId } from "./utils";
import { clePubliqueStripe } from "@/lib/stripe-cle-publique";
import { PROVIDER_METHODS, moyensDeLaPasserelle, normalizeMethodToken, getOperatorKey, normalizeCountry } from "@/lib/catalogue-moyens";

export async function getPaymentMethods() {
    try {
        const session = await getSession();
        if (!session?.user) throw new Error("Unauthorized");

        const appId = await getSelectedAppId();
        if (!appId) return [];

        // 1. Les passerelles actives de l'espace.
        const gateways = await prisma.gateway.findMany({ where: { applicationId: appId, status: "active" } });

        if (gateways.length === 0) return [];

        // 2. Derive methods from gateways
        let derivedMethods: any[] = [];

        for (const gateway of gateways) {
            const name = gateway.name.toLowerCase();
            const providerKey = Object.keys(PROVIDER_METHODS).find(k => name.includes(k));
            const supported = moyensDeLaPasserelle(gateway, providerKey);

            supported.forEach(method => {
                derivedMethods.push({
                    ...method,
                    gatewayId: gateway.id,
                    provider: gateway.name,
                });
            });
        }

        // 3. Auto-sync to PaymentMethod table: ensure each derived method has a DB record
        const existingMethods = await prisma.paymentMethod.findMany({
            where: { applicationId: appId }
        });

        const existingKey = (m: any) => `${m.name}||${m.provider}||${m.country}`;
        const existingMap = new Map(existingMethods.map((m: any) => [existingKey(m), m]));

        // Fallback map: name||country (case-insensitive) — tolerates provider renames
        const existingByNameCountry = new Map<string, any>();
        for (const m of existingMethods) {
            const k = `${m.name.toLowerCase()}||${m.country.toLowerCase()}`;
            if (!existingByNameCountry.has(k)) existingByNameCountry.set(k, m);
        }

        // Build the set of valid name||country keys from current derivedMethods
        const validNameCountryKeys = new Set(
            derivedMethods.map(dm => `${dm.name.toLowerCase()}||${dm.country.toLowerCase()}`)
        );

        // Delete stale DB records no longer in any active gateway's method list
        const coveredProviders = new Set(
            gateways.map(g => g.name).filter(n =>
                Object.keys(PROVIDER_METHODS).some(k => n.toLowerCase().includes(k))
            )
        );
        const staleIds = existingMethods
            .filter((m: any) =>
                coveredProviders.has(m.provider) &&
                !validNameCountryKeys.has(`${m.name.toLowerCase()}||${m.country.toLowerCase()}`)
            )
            .map((m: any) => m.id);

        if (staleIds.length > 0) {
            await prisma.paymentMethod.deleteMany({ where: { id: { in: staleIds } } });
            staleIds.forEach(id => {
                const entry = existingMethods.find((m: any) => m.id === id);
                if (entry) {
                    existingMap.delete(existingKey(entry));
                    existingByNameCountry.delete(`${entry.name.toLowerCase()}||${entry.country.toLowerCase()}`);
                }
            });
        }

        for (const dm of derivedMethods) {
            const exactKey = `${dm.name}||${dm.provider}||${dm.country}`;
            // Skip only on exact (name + provider + country) match.
            // The same method (e.g. "Orange Money CI") may legitimately be offered
            // by several providers; each gets its own row so it can be toggled
            // and configured independently.
            if (existingMap.has(exactKey)) continue;
            try {
                const created = await prisma.paymentMethod.create({
                    data: {
                        applicationId: appId,
                        name: dm.name,
                        country: dm.country,
                        flag: dm.flag || null,
                        provider: dm.provider,
                        type: dm.type === "CARD" ? "CARD" : "MOBILE_MONEY",
                        isActive: true,
                    }
                });
                existingMap.set(exactKey, created);
                const ncKey = `${dm.name.toLowerCase()}||${dm.country.toLowerCase()}`;
                if (!existingByNameCountry.has(ncKey)) existingByNameCountry.set(ncKey, created);
            } catch (e) {
                // ignore race-condition duplicates
            }
        }

        // 4. Build provider candidates per unique method (operator||country)
        // so the UI can detect conflicts (same method available from multiple providers).
        // Each entry carries the provider-specific PaymentMethod id and the per-provider
        // name so per-gateway pages can target the right row even when providers use
        // different naming conventions (e.g. PayDunya "MTN Bénin" vs PawaPay "MTN MoMo Bénin").
        const methodProviderMap = new Map<string, Array<{ gatewayId: string; provider: string; methodId?: string; isActive?: boolean; name?: string }>>();
        const methodAliasMap = new Map<string, Set<string>>();
        for (const dm of derivedMethods) {
            const key = `${getOperatorKey(dm.name)}||${normalizeCountry(dm.country)}`;
            if (!methodProviderMap.has(key)) methodProviderMap.set(key, []);
            if (!methodAliasMap.has(key)) methodAliasMap.set(key, new Set());
            methodAliasMap.get(key)!.add(dm.name);
            const existing = methodProviderMap.get(key)!;
            if (!existing.find(p => p.gatewayId === dm.gatewayId)) {
                const dbKey = `${dm.name}||${dm.provider}||${dm.country}`;
                const dbRow: any = existingMap.get(dbKey);
                existing.push({
                    gatewayId: dm.gatewayId,
                    provider: dm.provider,
                    methodId: dbRow?.id,
                    isActive: dbRow?.isActive,
                    name: dm.name,
                });
            }
        }

        // 5. Return methods with real DB ids and isActive from DB
        // De-duplicate: one entry per unique operator||country, with all providers listed
        const seen = new Set<string>();
        const result: any[] = [];

        for (const dm of derivedMethods) {
            const dedupeKey = `${getOperatorKey(dm.name)}||${normalizeCountry(dm.country)}`;
            if (seen.has(dedupeKey)) continue;
            seen.add(dedupeKey);

            const dbKey = `${dm.name}||${dm.provider}||${dm.country}`;
            const ncKey = `${dm.name.toLowerCase()}||${dm.country.toLowerCase()}`;
            // Primary lookup: exact name+provider+country; fallback: name+country only
            const dbRecord: any = existingMap.get(dbKey) ?? existingByNameCountry.get(ncKey);
            const providers = methodProviderMap.get(dedupeKey) || [];

            const aliases = Array.from(methodAliasMap.get(dedupeKey) || [dm.name]);
            result.push({
                id: dbRecord?.id || `temp-${dm.code}`,
                name: dm.name,
                gateway: dm.provider,
                gatewayId: dm.gatewayId,
                logo: dm.logo,
                code: dm.code,
                status: "Opérationnel",
                type: dm.type === "CARD" ? "Card" : "Mobile Money",
                country: dm.country,
                flag: dm.flag,
                uptime: dbRecord?.uptime || "99.9%",
                isActive: dbRecord?.isActive ?? true,
                providers, // all gateways that support this method
                aliases,   // all per-provider names for this operator+country
            });
        }

        return result;

    } catch (error) {
        console.error("Failed to fetch payment methods:", error);
        return [];
    }
}

// Note : le champ `flag` (et la colonne du meme nom) contient desormais le CODE ISO
// du pays, pas un emoji : les drapeaux sont des SVG (voir components/ui/drapeau).
export async function togglePaymentMethod(
    methodId: string,
    isActive: boolean,
    meta?: { name: string; country: string; provider: string; flag?: string; type?: string; logo?: string; code?: string }
) {
    try {
        // temp- ids mean the record was never persisted — create it first
        if (methodId.startsWith('temp-')) {
            if (!meta) return { success: false, error: "Métadonnées manquantes pour créer la méthode" };
            const session = await getSession();
            if (!session?.user) return { success: false, error: "Non autorisé" };
            const appId = await getSelectedAppId();
            if (!appId) return { success: false, error: "Application non sélectionnée" };

            const existing = await prisma.paymentMethod.findFirst({
                where: { applicationId: appId, name: meta.name, provider: meta.provider, country: meta.country }
            });
            let record;
            if (existing) {
                record = await prisma.paymentMethod.update({ where: { id: existing.id }, data: { isActive } });
            } else {
                record = await prisma.paymentMethod.create({
                    data: {
                        applicationId: appId,
                        name: meta.name,
                        country: meta.country,
                        flag: meta.flag || null,
                        provider: meta.provider,
                        type: meta.type === "CARD" ? "CARD" : "MOBILE_MONEY",
                        isActive,
                    }
                });
            }
            return { success: true, newId: record.id };
        }

        await prisma.paymentMethod.update({
            where: { id: methodId },
            data: { isActive }
        });
        return { success: true };
    } catch (error) {
        console.error("Failed to toggle payment method:", error);
        return { success: false, error: "Échec de la mise à jour" };
    }
}
export async function getPaymentMethodsByAppId(applicationId: string) {
    try {
        const gateways = await prisma.gateway.findMany({ where: { applicationId, status: "active" } });
        const managed = false;

        if (gateways.length === 0) return [];

        // Connect (mode gere, cles de la plateforme) : la carte bancaire vient de
        // Stripe SEUL (formulaire dans la page). La carte n'est pas activee sur le
        // compte PayDunya de la plateforme (decision du 18/09/2026) : sans ce
        // filtre, la carte « UEMOA » de PayDunya et la carte « Global » de Stripe
        // ne se dedoublonnaient pas (pays differents), deux entrees carte
        // s'affichaient et la premiere renvoyait vers la page PayDunya, ou tous
        // les payeurs abandonnaient (7 sur 7 en une semaine). Les marchands a cles
        // propres gardent les cartes de toutes leurs passerelles.
        const carteParStripe = managed;

        // Get disabled methods from DB — use operator||country as primary key
        const allDbMethods = await prisma.paymentMethod.findMany({
            where: { applicationId },
            select: { name: true, provider: true, country: true, isActive: true }
        });
        // Three sets: exact, name||country, and operator||country (catches all variants)
        const disabledKeys = new Set<string>();
        const disabledNameCountry = new Set<string>();
        const disabledOperatorCountry = new Set<string>();
        for (const m of allDbMethods) {
            if (!m.isActive) {
                disabledKeys.add(`${m.name.toLowerCase().trim()}||${m.provider.toLowerCase().trim()}||${m.country.toLowerCase().trim()}`);
                disabledNameCountry.add(`${m.name.toLowerCase().trim()}||${m.country.toLowerCase().trim()}`);
                disabledOperatorCountry.add(`${getOperatorKey(m.name)}||${normalizeCountry(m.country)}`);
            }
        }

        // Load routing config (method→provider assignments)
        let methodAssignments: Record<string, string> = {};
        try {
            const routingConfig = await (prisma as any).routingConfig.findUnique({
                where: { applicationId },
                select: { methodAssignments: true }
            });
            if (routingConfig?.methodAssignments) {
                methodAssignments = routingConfig.methodAssignments as Record<string, string>;
            }
        } catch { }

        // Build map of gatewayId → gateway
        const gatewayMap = new Map(gateways.map(g => [g.id, g]));

        // Collect all available methods per unique method key (name||country)
        // key → array of candidate gateways
        const methodCandidates: Map<string, any[]> = new Map();

        for (const gateway of gateways) {
            const gwName = gateway.name.toLowerCase();
            const providerKey = Object.keys(PROVIDER_METHODS).find(k => gwName.includes(k));
            const supported = moyensDeLaPasserelle(gateway, providerKey);

            // PawaPay : ne proposer que les correspondants actifs sur CE compte
            // (les codes du catalogue sont les ids de correspondants PawaPay).
            // null = configuration indisponible → on ne masque rien (fail-open).
            let pawapayActive: Set<string> | null = null;
            if (providerKey === "pawapay") {
                const { getPawaPayActiveCorrespondents } = await import("@/lib/orchestrator/pawapay-availability");
                pawapayActive = await getPawaPayActiveCorrespondents(
                    (gateway as any).apiKey || (gateway.config as any)?.apiKey
                );
            }

            for (const method of supported) {
                if (pawapayActive && !pawapayActive.has(method.code)) continue;
                if (carteParStripe && method.type === 'CARD' && providerKey !== 'stripe') continue;
                const disableKey = `${method.name.toLowerCase().trim()}||${gateway.name.toLowerCase().trim()}||${method.country.toLowerCase().trim()}`;
                const disableNcKey = `${method.name.toLowerCase().trim()}||${method.country.toLowerCase().trim()}`;
                const disableOpKey = `${getOperatorKey(method.name)}||${normalizeCountry(method.country)}`;
                if (disabledKeys.has(disableKey) || disabledNameCountry.has(disableNcKey) || disabledOperatorCountry.has(disableOpKey)) continue;

                // Deduplicate by operator + country (shown as one entry to the user)
                const dedupeKey = `${getOperatorKey(method.name)}||${normalizeCountry(method.country)}`;
                if (!methodCandidates.has(dedupeKey)) {
                    methodCandidates.set(dedupeKey, []);
                }
                methodCandidates.get(dedupeKey)!.push({
                    ...method,
                    gatewayId: gateway.id,
                    provider: gateway.name,
                    // SECURITY: do NOT carry gateway.config here — it holds the
                    // provider API keys/secrets and must never reach the client.
                });
            }
        }

        // For each deduplicated method, pick the assigned gateway or the first available
        const result: any[] = [];
        let index = 0;

        for (const [dedupeKey, candidates] of methodCandidates.entries()) {
            if (candidates.length === 0) continue;

            // Check if there's an explicit assignment for any of the candidate method codes
            let selected = candidates[0]; // default: first available
            for (const candidate of candidates) {
                const assignKey = `${candidate.code}||${candidate.country}`;
                const assignedGwId = methodAssignments[assignKey];
                if (assignedGwId && gatewayMap.has(assignedGwId)) {
                    // Prefer the candidate that matches the assigned gateway
                    const matchingCandidate = candidates.find(c => c.gatewayId === assignedGwId);
                    if (matchingCandidate) {
                        selected = matchingCandidate;
                        break;
                    }
                }
            }

            result.push({
                id: `${selected.gatewayId}-${selected.code}-${index}`,
                name: selected.name,
                gateway: selected.provider,
                gatewayId: selected.gatewayId,
                logo: selected.logo,
                type: selected.type,
                country: selected.country,
                flag: selected.flag,
                code: selected.code,
                // La cle PUBLIQUE Stripe, faite pour le navigateur : la page s'en
                // sert pour charger Stripe.js des le CHOIX de la carte, avant le
                // clic sur Payer. Les secrets, eux, ne sortent jamais d'ici.
                clePublique: /stripe/i.test(selected.provider || "") ? clePubliqueStripe(gatewayMap.get(selected.gatewayId)) : undefined,
                // SECURITY: gateway credentials (config) are intentionally NOT
                // returned to the client. The charge runs server-side by gatewayId.
                // Expose all candidates so checkout UI can show alternatives
                candidates: candidates.map(c => ({
                    gatewayId: c.gatewayId,
                    provider: c.provider,
                })),
            });
            index++;
        }

        return result;

    } catch (error) {
        console.error("Failed to fetch payment methods:", error);
        return [];
    }
}
