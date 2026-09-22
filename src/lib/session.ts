import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { avatarParDefaut } from "@/lib/avatar";

/**
 * Session courante cote serveur (composants serveur, actions, routes).
 * Meme forme que l'ancien getServerSession de NextAuth, pour ne rien
 * changer au code metier : { user: { id, name, email, image }, expires }.
 */
export type UtilisateurSession = { id: string; name: string; email: string; image: string };
export type SessionCourante = { user: UtilisateurSession; expires: string } | null;

export async function getSession(): Promise<SessionCourante> {
    try {
        const s = await auth.api.getSession({ headers: await headers() });
        if (!s?.user) return null;
        return {
            user: {
                id: s.user.id,
                name: s.user.name || "",
                email: s.user.email,
                image: s.user.image || avatarParDefaut(s.user.name || s.user.email),
            },
            expires: new Date(s.session.expiresAt).toISOString(),
        };
    } catch {
        return null;
    }
}
