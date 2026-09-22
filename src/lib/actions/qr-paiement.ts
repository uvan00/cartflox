"use server";

import prisma from "@/lib/db";
import { qrCartflox } from "@/lib/qr";
import { lienCheckout } from "@/lib/lien-checkout";

const SITE = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");

/**
 * Le QR du lien de paiement, pour finir l'achat sur telephone quand on est
 * devant un ordinateur.
 *
 * SECURITE : l'adresse est reconstruite ICI a partir de l'identifiant, jamais
 * reprise du navigateur. Sans cela, n'importe qui pourrait faire fabriquer un
 * QR a la marque Cartflox pointant vers l'adresse de son choix.
 *
 * On ne rend un code que pour un paiement encore en attente : inutile de
 * proposer de scanner un paiement deja regle ou expire.
 */
export async function qrDuPaiement(transactionId: string): Promise<string | null> {
    try {
        if (!/^[a-z0-9]{8,64}$/i.test(transactionId || "")) return null;
        const t = await prisma.transaction.findUnique({
            where: { id: transactionId },
            select: { id: true, status: true },
        });
        if (!t || t.status !== "PENDING") return null;
        return await qrCartflox(lienCheckout(t.id), 420);
    } catch (e) {
        console.error("[qr-paiement] generation impossible", e);
        return null;
    }
}
