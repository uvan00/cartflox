import prisma from "@/lib/db";

/**
 * Journal d'activite d'un espace. Module ordinaire, PAS une action serveur :
 * exportee depuis un fichier "use server", cette fonction etait appelable par
 * HTTP sans session et permettait d'ecrire n'importe quoi dans le journal de
 * securite de n'importe quel espace.
 */
export async function logActivity(data: {
    applicationId: string;
    actorName: string;
    action: string;
    ipAddress?: string;
    location?: string;
}) {
    try {
        await prisma.auditLog.create({ data });
        return { success: true };
    } catch (error) {
        console.error("Failed to log activity:", error);
        return { success: false };
    }
}
