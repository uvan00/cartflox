import prisma from "@/lib/db";

/**
 * Un espace est en PRODUCTION (il appelle ses agregateurs et encaisse pour de
 * vrai) ou en MODE TEST (aucun agregateur n'est appele, les paiements sont
 * simules par /api/checkout/sandbox). `Application.liveMode` est la seule
 * colonne lue sur le chemin de paiement, et le marchand la bascule lui-meme
 * depuis son tableau de bord.
 */
export type EtatEspace = {
    /** L'espace peut-il appeler un agregateur et encaisser pour de vrai ? */
    direct: boolean;
    /** Tout est simule. */
    bacASable: boolean;
};

/** Message montre au client d'un espace en mode test. */
export function messageBacASable(): string {
    return "Cet espace est en mode test : aucun paiement réel ne peut être encaissé tant que le marchand ne l'a pas remis en production.";
}

export async function etatEspace(applicationId: string | null | undefined): Promise<EtatEspace> {
    if (!applicationId) return { direct: true, bacASable: false };
    const espace = (await prisma.application.findUnique({
        where: { id: applicationId },
        select: { liveMode: true } as any,
    })) as any;
    if (!espace) return { direct: false, bacASable: true };
    const direct = espace.liveMode === true;
    return { direct, bacASable: !direct };
}
