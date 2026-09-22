import prisma from "@/lib/db";

type NotificationType = "payment" | "security" | "system" | "info";

/**
 * Une notification pour le compte, rangee en base : c'est la cloche du
 * tableau de bord. Ne bloque jamais l'appelant.
 */
export async function createNotification({
    userId,
    type,
    title,
    body,
    link,
}: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    link?: string;
}) {
    try {
        await (prisma as any).notification.create({
            data: { userId, type, title, body, link: link ?? null },
        });
    } catch (e) {
        console.error("[Notifications] Failed to create:", e);
    }
}
