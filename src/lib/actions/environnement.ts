"use server";

import prisma from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { getSelectedAppId } from "./utils";
import { cookies } from "next/headers";
import { COOKIE_DONNEES_TEST, lireVueTest } from "@/lib/donnees-test";
import { oublierModeEspace } from "@/lib/db";

/**
 * Environnement de l'espace courant : bac a sable (rien n'est encaisse pour de
 * vrai) ou production. C'est la colonne `Application.liveMode`, la seule que le
 * chemin de paiement consulte (cf. src/lib/mode-espace.ts).
 *
 * Le marchand bascule librement dans les deux sens : il encaisse avec ses
 * propres cles, c'est son agregateur qui a verifie son identite.
 */
export type EtatEnvironnement = {
    bacASable: boolean;
    /** Le marchand ne peut pas revenir en production par lui-meme. */
    verrouille: boolean;
    gere: boolean;
    /** Passerelles branchees avec des cles de test, information distincte. */
    passerellesTest: string[];
    /** Le tableau de bord montre les donnees de test (cookie, ou espace en bac a sable). */
    vueTest: boolean;
};

async function espaceCourantSecurise() {
    const session = await getSession();
    if (!session?.user) return null;
    const appId = await getSelectedAppId();
    if (!appId) return null;
    // getSelectedAppId ne rend qu'un espace appartenant a la session : sur une
    // mutation on relit quand meme l'enregistrement, on ne fait pas confiance
    // a un identifiant qui a transite par un cookie.
    const espace = (await prisma.application.findUnique({
        where: { id: appId },
        select: { id: true, liveMode: true } as any,
    })) as any;
    return espace || null;
}

export async function etatEnvironnement(): Promise<EtatEnvironnement | null> {
    try {
        const espace = await espaceCourantSecurise();
        if (!espace) return null;
        const gere = false;
        const verifiee = true;
        const passerelles = await prisma.gateway.findMany({
            where: { applicationId: espace.id, status: "active" },
            select: { name: true, config: true },
        });
        return {
            bacASable: espace.liveMode !== true,
            verrouille: !gere && !verifiee,
            gere,
            passerellesTest: passerelles.filter((g) => ((g.config as any)?.mode || "live") === "test").map((g) => g.name),
            vueTest: (await lireVueTest()) ?? espace.liveMode !== true,
        };
    } catch (e) {
        console.error("[environnement] lecture impossible", e);
        return null;
    }
}

export async function basculerEnvironnement(versBacASable: boolean): Promise<{ ok: boolean; message?: string }> {
    const espace = await espaceCourantSecurise();
    if (!espace) return { ok: false, message: "Aucun espace sélectionné." };

    await prisma.application.update({
        where: { id: espace.id },
        data: { liveMode: !versBacASable } as any,
    });
    // La vue suit le mode : plus de choix explicite, la couche base montre le monde de l'espace.
    oublierModeEspace(espace.id);
    try { (await cookies()).delete(COOKIE_DONNEES_TEST); } catch { /* hors requete */ }

    revalidatePath("/dashboard");
    revalidatePath("/transactions");
    return {
        ok: true,
        message: versBacASable
            ? "Espace passé en mode test : aucun paiement réel ne sera encaissé."
            : "Espace repassé en production : vos clients peuvent payer pour de vrai.",
    };
}

/** « Voir les données de test » : le choix vaut pour tout le tableau de bord, 30 jours. */
export async function definirVueTest(voir: boolean): Promise<{ ok: boolean }> {
    const espace = await espaceCourantSecurise();
    if (!espace) return { ok: false };
    try {
        (await cookies()).set(COOKIE_DONNEES_TEST, voir ? "1" : "0", { path: "/", sameSite: "lax", secure: true, httpOnly: true, maxAge: 30 * 24 * 3600 });
    } catch { return { ok: false }; }
    revalidatePath("/dashboard");
    revalidatePath("/transactions");
    revalidatePath("/developer");
    return { ok: true };
}
