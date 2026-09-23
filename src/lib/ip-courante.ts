import { headers } from "next/headers";

/**
 * IP du client dans une action serveur : X-Real-IP, pose par le mandataire, puis le
 * dernier element de X-Forwarded-For (celui du mandataire), jamais le premier,
 * que le client peut ecrire lui-meme.
 */
export async function ipCourante(): Promise<string> {
    try {
        const h = await headers();
        const xff = (h.get("x-forwarded-for") || "").split(",").map((s) => s.trim()).filter(Boolean);
        return h.get("x-real-ip") || xff[xff.length - 1] || "unknown";
    } catch {
        return "unknown";
    }
}
