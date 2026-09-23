"use server";

import prisma from "@/lib/db";
import { getSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { getSelectedAppId } from "./utils";
import { sendTeamInviteEmail } from "@/lib/email";
import { logActivity } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

export async function getTeamMembers() {
    try {
        const session = await getSession();
        if (!session?.user) throw new Error("Unauthorized");

        const appId = await getSelectedAppId();
        if (!appId) return [];

        const members = await prisma.teamMember.findMany({
            where: { applicationId: appId },
            orderBy: { createdAt: 'asc' }
        });

        return members;
    } catch (error) {
        console.error("Failed to fetch team members:", error);
        return [];
    }
}

export async function inviteTeamMember(data: {
    name: string,
    email: string,
    role: string,
    permission: string
}) {
    try {
        const session = await getSession();
        if (!session?.user) throw new Error("Unauthorized");

        const appId = await getSelectedAppId();
        if (!appId) throw new Error("No application selected");

        // Champs explicites et bornes : ce qui vient du navigateur ne decide pas de
        // ce qui entre en base. Une seule adresse par invitation.
        const name = String(data.name || "").trim().slice(0, 80);
        const email = String(data.email || "").trim().toLowerCase().slice(0, 160);
        const role = String(data.role || "").trim().slice(0, 40) || "Membre";
        const permission = String(data.permission || "").trim().slice(0, 40);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { success: false, error: "Adresse e-mail invalide." };
        // Chaque invitation part en e-mail signe de la plateforme : vingt par jour et par espace.
        const quota = await rateLimit(`invitation:${appId}`, { limit: 20, windowSec: 86400 });
        if (!quota.allowed) return { success: false, error: "Vingt invitations ont déjà été envoyées aujourd'hui. Réessayez demain." };

        const member = await prisma.teamMember.create({
            data: {
                name,
                email,
                role,
                permission,
                applicationId: appId,
                status: "Hors ligne",
                avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name.split(' ')[0] || email)}`,
                lastActive: "Jamais"
            }
        });

        // Fetch app name for the email
        const app = await prisma.application.findUnique({ where: { id: appId }, select: { name: true } });
        const appName = app?.name || "votre organisation";
        const inviterName = (session.user as any).name || session.user.email || "Un collaborateur";
        const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const inviteUrl = `${baseUrl}/auth/login?callbackUrl=/team`;

        // Send invitation email (non-blocking)
        sendTeamInviteEmail({
            to: email,
            toName: name,
            inviterName,
            appName,
            role,
            permission,
            inviteUrl,
        }).catch(err => console.error("[team] Failed to send invite email:", err));

        // Log the activity
        await logActivity({
            applicationId: appId,
            actorName: inviterName,
            action: `A invité ${name} en tant que ${role}`,
            location: "Dashboard"
        });

        revalidatePath('/team');
        return { success: true, member };
    } catch (error) {
        console.error("Failed to invite team member:", error);
        return { success: false, error: "Une erreur est survenue." };
    }
}

export async function removeTeamMember(id: string) {
    try {
        const session = await getSession();
        if (!session?.user) throw new Error("Unauthorized");

        const appId = await getSelectedAppId();
        if (!appId) throw new Error("No application selected");

        const member = await prisma.teamMember.findUnique({ where: { id } });

        await prisma.teamMember.delete({
            where: {
                id,
                applicationId: appId
            }
        });

        if (member) {
            await logActivity({
                applicationId: appId,
                actorName: session.user.name || session.user.email || "Système",
                action: `A retiré ${member.name} de l'équipe`,
                location: "Dashboard"
            });
        }

        revalidatePath('/team');
        return { success: true };
    } catch (error) {
        console.error("Failed to remove team member:", error);
        return { success: false, error: "Impossible de supprimer ce membre." };
    }
}

export async function getAuditLogs() {
    try {
        const session = await getSession();
        if (!session?.user) throw new Error("Unauthorized");

        const appId = await getSelectedAppId();
        if (!appId) return [];

        const logs = await prisma.auditLog.findMany({
            where: { applicationId: appId },
            orderBy: { createdAt: 'desc' },
            take: 20
        });

        return logs;
    } catch (error) {
        console.error("Failed to fetch audit logs:", error);
        return [];
    }
}

