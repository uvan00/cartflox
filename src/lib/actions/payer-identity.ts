"use server";

import prisma from "@/lib/db";
import { createHash } from "crypto";

// ────────────────────────────────────────────────────────────────────────────────
// Cartflox Identity — Payer Profile Network
// Le numéro de téléphone = identité unique du payeur à travers tout le réseau
// ────────────────────────────────────────────────────────────────────────────────

function normalizePhone(phone: string): string {
    // Remove spaces, dashes, dots
    let cleaned = phone.replace(/[\s\-\.()]/g, "");
    // Ensure it starts with +
    if (!cleaned.startsWith("+")) {
        // Try to add country code based on common patterns
        if (cleaned.startsWith("00")) cleaned = "+" + cleaned.slice(2);
        else if (cleaned.startsWith("0")) cleaned = "+221" + cleaned.slice(1); // Default SN
        else cleaned = "+" + cleaned;
    }
    return cleaned;
}

function hashPhone(phone: string): string {
    return createHash("sha256").update(normalizePhone(phone)).digest("hex");
}

// ─── Lookup: reconnaître un payeur par son numéro ───────────────────────────

export async function lookupPayer(phone: string) {
    try {
        const normalized = normalizePhone(phone);
        const hash = hashPhone(phone);

        const profile = await (prisma as any).payerProfile.findUnique({
            where: { phoneHash: hash }
        });

        if (!profile) {
            return { found: false, phone: normalized };
        }

        // Parse saved methods
        let methods: Array<{ method: string; provider?: string; lastUsed: string; successCount: number }> = [];
        try {
            methods = Array.isArray(profile.savedMethods) ? profile.savedMethods : [];
        } catch { }

        // Sort methods by successCount descending (most used first)
        methods.sort((a, b) => b.successCount - a.successCount);

        return {
            found: true,
            profile: {
                id: profile.id,
                phone: profile.phone,
                name: profile.name,
                // SECURITY: email intentionally NOT returned — this action is
                // unauthenticated and callable for ANY phone, so exposing email
                // enables cross-network harvesting/enumeration of payer PII.
                country: profile.country,
                preferredMethod: profile.preferredMethod,
                preferredProvider: profile.preferredProvider,
                savedMethods: methods,
                totalPayments: profile.totalPayments,
                isVerified: profile.isVerified,
                lastPaymentAt: profile.lastPaymentAt?.toISOString() || null,
            }
        };
    } catch (error: any) {
        console.error("[IDENTITY] Lookup error:", error.message);
        return { found: false, error: error.message };
    }
}

// ─── Create or update: sauvegarder/mettre à jour un profil payeur ───────────

export async function savePayerProfile(data: {
    phone: string;
    name?: string;
    email?: string;
    country: string;
    method?: string;
    provider?: string;
}) {
    try {
        const normalized = normalizePhone(data.phone);
        const hash = hashPhone(data.phone);

        const existing = await (prisma as any).payerProfile.findUnique({
            where: { phoneHash: hash }
        });

        if (existing) {
            // Update existing profile
            const updateData: any = { updatedAt: new Date() };
            if (data.name && !existing.name) updateData.name = data.name;
            if (data.email && !existing.email) updateData.email = data.email;
            if (data.method) updateData.preferredMethod = data.method;
            if (data.provider) updateData.preferredProvider = data.provider;

            const updated = await (prisma as any).payerProfile.update({
                where: { id: existing.id },
                data: updateData
            });

            return { success: true, profile: updated, isNew: false };
        }

        // Create new profile
        const profile = await (prisma as any).payerProfile.create({
            data: {
                phone: normalized,
                phoneHash: hash,
                name: data.name || null,
                email: data.email || null,
                country: data.country,
                preferredMethod: data.method || null,
                preferredProvider: data.provider || null,
                savedMethods: data.method ? [{ method: data.method, provider: data.provider || null, lastUsed: new Date().toISOString(), successCount: 0 }] : [],
                updatedAt: new Date(),
            }
        });

        console.log(`[IDENTITY] New payer profile: ${normalized} (${data.country})`);
        return { success: true, profile, isNew: true };
    } catch (error: any) {
        console.error("[IDENTITY] Save error:", error.message);
        return { success: false, error: error.message };
    }
}

// ─── After successful payment: update profile stats + method history ─────────

export async function updatePayerAfterPayment(data: {
    phone: string;
    method: string;
    provider: string;
    amount: number;
    merchantName?: string;
    country: string;
    name?: string;
    email?: string;
}) {
    try {
        const normalized = normalizePhone(data.phone);
        const hash = hashPhone(data.phone);

        // SECURITY: this action is callable directly from the client. Only honor
        // it when a REAL SUCCESS transaction exists for this phone — otherwise
        // anyone could inflate stats / poison the network profile for arbitrary
        // numbers. Use the transaction's server-stored amount, never the
        // client-supplied amount.
        const phoneDigits = normalized.replace(/\D/g, "");
        const last8 = phoneDigits.slice(-8);
        const paidTx = last8.length >= 6 ? await prisma.transaction.findFirst({
            where: { status: "SUCCESS", customerPhone: { contains: last8 } },
            orderBy: { createdAt: "desc" },
            select: { amount: true }
        }) : null;
        if (!paidTx) {
            return { success: false, error: "Aucun paiement vérifié pour ce numéro" };
        }
        const verifiedAmount = paidTx.amount;

        let profile = await (prisma as any).payerProfile.findUnique({
            where: { phoneHash: hash }
        });

        const now = new Date();

        if (!profile) {
            // Auto-create profile on first successful payment
            profile = await (prisma as any).payerProfile.create({
                data: {
                    phone: normalized,
                    phoneHash: hash,
                    name: data.name || null,
                    email: data.email || null,
                    country: data.country,
                    preferredMethod: data.method,
                    preferredProvider: data.provider,
                    savedMethods: [{
                        method: data.method,
                        provider: data.provider,
                        lastUsed: now.toISOString(),
                        successCount: 1,
                    }],
                    totalPayments: 1,
                    totalAmount: verifiedAmount,
                    lastPaymentAt: now,
                    lastMerchantName: data.merchantName || null,
                    isVerified: true,
                    verifiedAt: now,
                    updatedAt: now,
                }
            });
            console.log(`[IDENTITY] Auto-created profile after payment: ${normalized}`);
            return { success: true, profile, created: true };
        }

        // Update existing: increment stats + update saved methods
        let methods: any[] = [];
        try {
            methods = Array.isArray(profile.savedMethods) ? [...profile.savedMethods] : [];
        } catch { }

        // Find or add this method in the saved methods list
        const existingMethodIdx = methods.findIndex(
            (m: any) => m.method === data.method
        );

        if (existingMethodIdx >= 0) {
            methods[existingMethodIdx].successCount = (methods[existingMethodIdx].successCount || 0) + 1;
            methods[existingMethodIdx].lastUsed = now.toISOString();
            methods[existingMethodIdx].provider = data.provider;
        } else {
            methods.push({
                method: data.method,
                provider: data.provider,
                lastUsed: now.toISOString(),
                successCount: 1,
            });
        }

        // The most-used method becomes the preferred method
        methods.sort((a: any, b: any) => (b.successCount || 0) - (a.successCount || 0));
        const topMethod = methods[0];

        const updated = await (prisma as any).payerProfile.update({
            where: { id: profile.id },
            data: {
                savedMethods: methods,
                preferredMethod: topMethod?.method || data.method,
                preferredProvider: topMethod?.provider || data.provider,
                totalPayments: (profile.totalPayments || 0) + 1,
                totalAmount: (profile.totalAmount || 0) + verifiedAmount,
                lastPaymentAt: now,
                lastMerchantName: data.merchantName || profile.lastMerchantName,
                name: data.name || profile.name,
                email: data.email || profile.email,
                isVerified: true,
                verifiedAt: profile.verifiedAt || now,
                updatedAt: now,
            }
        });

        console.log(`[IDENTITY] Updated payer: ${normalized} | payments=${updated.totalPayments} | preferred=${topMethod?.method}`);
        return { success: true, profile: updated, created: false };
    } catch (error: any) {
        console.error("[IDENTITY] Update after payment error:", error.message);
        return { success: false, error: error.message };
    }
}

// ─── Get payer stats for a phone (public, minimal info) ─────────────────────

export async function getPayerQuickInfo(phone: string) {
    try {
        const hash = hashPhone(phone);
        const profile = await (prisma as any).payerProfile.findUnique({
            where: { phoneHash: hash },
            select: {
                name: true,
                preferredMethod: true,
                preferredProvider: true,
                totalPayments: true,
                isVerified: true,
                country: true,
                savedMethods: true,
            }
        });

        if (!profile) return { found: false };

        return {
            found: true,
            name: profile.name,
            preferredMethod: profile.preferredMethod,
            preferredProvider: profile.preferredProvider,
            totalPayments: profile.totalPayments,
            isVerified: profile.isVerified,
            country: profile.country,
            savedMethods: Array.isArray(profile.savedMethods) ? profile.savedMethods : [],
        };
    } catch {
        return { found: false };
    }
}
