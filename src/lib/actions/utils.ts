"use server";

import { cookies } from "next/headers";
import prisma from "@/lib/db";
import { getSession } from "@/lib/session";

export async function getSelectedAppId() {
    const session = await getSession();
    if (!session?.user?.email) return null;

    const cookieStore = await cookies();
    const cookieAppId = cookieStore.get("applicationId")?.value;

    // SECURITY: the `applicationId` cookie is set client-side and is therefore
    // attacker-controlled. NEVER trust it blindly : only honor it when the
    // selected application actually belongs to the logged-in user. Otherwise a
    // user could point it at another merchant's app CUID and operate as them
    // (read transactions/PII, exfiltrate decrypted keys, trigger refunds).
    if (cookieAppId) {
        const owned = await prisma.application.findFirst({
            where: { id: cookieAppId, user: { email: session.user.email } },
            select: { id: true }
        });
        if (owned) return owned.id;
        // Cookie points to an app the user does not own : ignore it and fall back.
    }

    // Fallback: the first application owned by the user.
    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        include: { applications: { take: 1 } }
    });

    return user?.applications?.[0]?.id ?? null;
}

export async function validateAppOwnership(appId: string) {
    const session = await getSession();
    if (!session?.user?.email) return false;

    const app = await prisma.application.findFirst({
        where: {
            id: appId,
            user: { email: session.user.email }
        }
    });

    return !!app;
}
