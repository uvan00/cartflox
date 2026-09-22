"use server";

import prisma from "@/lib/db";
import { getSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { getSelectedAppId } from "./utils";
import { sendTeamInviteEmail } from "@/lib/email";

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

        const member = await prisma.teamMember.create({
            data: {
                ...data,
                applicationId: appId,
                status: "Hors ligne",
                avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.name.split(' ')[0]}`,
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
            to: data.email,
            toName: data.name,
            inviterName,
            appName,
            role: data.role,
            permission: data.permission,
            inviteUrl,
        }).catch(err => console.error("[team] Failed to send invite email:", err));

        // Log the activity
        await logActivity({
            applicationId: appId,
            actorName: inviterName,
            action: `A invité ${data.name} en tant que ${data.role}`,
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

export async function logActivity(data: {
    applicationId: string,
    actorName: string,
    action: string,
    ipAddress?: string,
    location?: string
}) {
    try {
        await prisma.auditLog.create({
            data
        });
        return { success: true };
    } catch (error) {
        console.error("Failed to log activity:", error);
        return { success: false };
    }
}
