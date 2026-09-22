"use server";

import prisma from "@/lib/db";
import { getSession } from "@/lib/session";
import { getSelectedAppId } from "./utils";

/**
 * Parcours de demarrage du marchand : trois etapes, dans l'ordre ou l'argent
 * circule. Tout est deduit de l'etat reel du compte, rien a cocher a la main.
 *
 *   1. Brancher son agregateur   (sans lui, aucun paiement n'est possible)
 *   2. Encaisser un premier paiement (la preuve que tout marche)
 */
export type EtapeDemarrage = {
    cle: string;
    titre: string;
    detail: string;
    href: string;
    action: string;
    fait: boolean;
    enCours?: string;
};

export type Demarrage = {
    etapes: EtapeDemarrage[];
    faites: number;
    complet: boolean;
    /** Espace en mode test : aucun paiement reel ne passe. */
    bacASable: boolean;
    /** Conserve pour les ecrans qui le lisent ; vide en version ouverte (pas de verification d'identite). */
    lienIdentite: string;
};

export async function getDemarrage(): Promise<Demarrage | null> {
    try {
        const session = await getSession();
        if (!session?.user) return null;
        const appId = await getSelectedAppId();
        if (!appId) return null;

        const [passerelles, txTotal, txReussies] = await Promise.all([
            prisma.gateway.count({ where: { applicationId: appId, status: "active" } }),
            prisma.transaction.count({ where: { applicationId: appId } }),
            prisma.transaction.count({ where: { applicationId: appId, status: "SUCCESS" } }),
        ]);

        const espace = (await prisma.application.findUnique({
            where: { id: appId }, select: { liveMode: true } as any,
        })) as any;
        const bacASable = espace?.liveMode !== true;
        const lienIdentite = "";

        const etapes: EtapeDemarrage[] = [
            {
                cle: "passerelle",
                titre: "Brancher votre agrégateur",
                detail: "PayDunya, CinetPay, PawaPay, Stripe... Collez les clés API de votre compte : c'est lui qui encaisse et vous verse l'argent. Sans passerelle, vos clients ne peuvent pas payer.",
                href: "/gateways",
                action: "Brancher une passerelle",
                fait: passerelles > 0,
            },
            {
                cle: "paiement",
                titre: "Encaisser un premier paiement",
                detail: "Créez un lien de paiement et testez-le vous-même avec 100 F : vous verrez le paiement arriver ici, puis sur votre compte agrégateur. Possible une fois votre identité vérifiée.",
                href: "/payment-links/new",
                action: "Créer un lien de paiement",
                fait: txReussies > 0,
                enCours: txReussies === 0 && txTotal > 0
                    ? `${txTotal} tentative${txTotal > 1 ? "s" : ""} sans paiement réussi : vérifiez vos clés dans Passerelles, ou écrivez-nous.`
                    : undefined,
            },
        ];

        const faites = etapes.filter((e) => e.fait).length;
        return { etapes, faites, complet: faites === etapes.length, bacASable, lienIdentite };
    } catch (e) {
        console.error("[demarrage]", e);
        return null;
    }
}
