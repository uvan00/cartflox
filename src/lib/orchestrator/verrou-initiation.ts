import prisma from "@/lib/db";

/**
 * Un seul chemin d'initiation à la fois par paiement (le verrou Redis
 * d'Hyperswitch, ici dans `metadata.verrou` de la transaction, posé par une
 * seule requête SQL conditionnelle). Deux clics rapprochés sur « Payer », ou
 * deux onglets, lançaient deux demandes chez le fournisseur avant que la
 * première ait écrit sa référence. Le verrou expire seul après 90 s : une
 * requête morte ne bloque jamais un acheteur.
 *
 * Échoue en OUVERT : base muette ou valeur illisible, et le paiement passe
 * comme avant.
 */
export const DUREE_VERROU_MS = 90_000;

export async function poserVerrou(transactionId: string, maintenant = Date.now()): Promise<boolean> {
    try {
        const n = await prisma.$executeRaw`
            UPDATE "Transaction"
            SET metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{verrou}', to_jsonb(${maintenant}::bigint))
            WHERE id = ${transactionId}
              AND (metadata->>'verrou' IS NULL OR (metadata->>'verrou') !~ '^[0-9]+$' OR (metadata->>'verrou')::bigint < ${maintenant - DUREE_VERROU_MS}::bigint)`;
        return n === 1;
    } catch (e) {
        console.error("[verrou] pose impossible, paiement laissé passer :", String((e as { message?: unknown } | null)?.message || e));
        return true;
    }
}

export async function leverVerrou(transactionId: string): Promise<void> {
    try {
        await prisma.$executeRaw`UPDATE "Transaction" SET metadata = metadata - 'verrou' WHERE id = ${transactionId} AND metadata ? 'verrou'`;
    } catch {
        // Il expirera seul.
    }
}
