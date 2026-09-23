import { NextRequest, NextResponse } from "next/server";
import { cronAutorise } from "@/lib/cron-auth";
import prisma from "@/lib/db";
import { AVEC_TESTS, CONSERVATION_TESTS_JOURS } from "@/lib/donnees-test";

/**
 * GET /api/cron/purge-tests : une fois par jour.
 *  - efface les transactions de TEST de plus de 90 jours, avec leurs lignes
 *    filles (journal fournisseur, decisions de routage...), decouvertes par les
 *    cles etrangeres plutot qu'enumerees a la main ;
 *  - efface les livraisons de webhooks terminees depuis plus de 30 jours.
 * Jamais une donnee de production.
 */
export async function GET(req: NextRequest) {
    if (!cronAutorise(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
        const limite = new Date(Date.now() - CONSERVATION_TESTS_JOURS * 24 * 3600_000);
        const anciennes = await prisma.transaction.findMany({
            where: { test: true, createdAt: { lt: limite } },
            select: { id: true },
            take: 500,
        });
        const ids = anciennes.map((t) => t.id);
        let filles = 0;
        if (ids.length) {
            const fks = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
                SELECT kcu.table_name, kcu.column_name
                  FROM information_schema.table_constraints tc
                  JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
                  JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
                 WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'Transaction' AND ccu.column_name = 'id'`;
            for (const fk of fks) {
                const n = await prisma.$executeRawUnsafe(
                    `DELETE FROM "${fk.table_name}" WHERE "${fk.column_name}" = ANY($1::text[])`,
                    ids,
                );
                filles += Number(n) || 0;
            }
            await prisma.transaction.deleteMany({ where: { id: { in: ids }, test: true } });
        }
        const livraisons = await prisma.webhookDelivery.deleteMany({
            where: { status: { in: ["DELIVERED", "FAILED"] }, createdAt: { lt: new Date(Date.now() - 30 * 24 * 3600_000) }, ...AVEC_TESTS },
        });
        console.log(`[cron:purge-tests] ${ids.length} transaction(s) de test effacée(s), ${filles} ligne(s) fille(s), ${livraisons.count} livraison(s) de webhook`);
        return NextResponse.json({ ok: true, transactions: ids.length, lignesFilles: filles, livraisons: livraisons.count });
    } catch (e: any) {
        console.error("[cron:purge-tests]", e);
        return NextResponse.json({ ok: false, error: e?.message || "erreur" }, { status: 500 });
    }
}
