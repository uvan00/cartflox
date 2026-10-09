import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Test d'INTÉGRATION contre une vraie base (jamais la production) : les tables
 * `Tentative` et `RoutageMesure`, le verrou d'initiation et la clôture des
 * tentatives. Ne tourne que si DATABASE_URL est posée :
 *   DATABASE_URL=postgresql://... npx vitest run base.integration
 */
const actif = !!process.env.DATABASE_URL && !/amazonaws|rds\./i.test(process.env.DATABASE_URL);

describe.skipIf(!actif)("base : tentatives, mesure, verrou", async () => {
    const { default: prisma } = await import("@/lib/db");
    const { poserVerrou, leverVerrou } = await import("./verrou-initiation");
    const { depotPrisma, cloreTentatives, transactionParTentative } = await import("./tentatives-depot");
    const { enregistrerIssue, lireMesures } = await import("./routage-mesure");
    const { referenceTentative } = await import("./tentatives");

    const contexte = `TEST|ROUTAGE|${Date.now()}`;
    let txId = "";

    beforeAll(async () => {
        const tx = await prisma.transaction.create({
            data: { orderId: `test-routage-${Date.now()}`, amount: 100, currency: "XOF", paymentType: "MOBILE_MONEY" as never, provider: "Test", customerName: "Test", customerEmail: "test@example.com", metadata: { methodCode: "mtn-ci" } },
        });
        txId = tx.id;
    });
    afterAll(async () => {
        if (txId) await prisma.transaction.delete({ where: { id: txId } }).catch(() => { });
        await prisma.routageMesure.deleteMany({ where: { contexte } }).catch(() => { });
        await prisma.$disconnect();
    });

    it("le verrou se pose une fois, se refuse ensuite, se lève, et les métadonnées restent", async () => {
        expect(await poserVerrou(txId)).toBe(true);
        expect(await poserVerrou(txId)).toBe(false);
        const t1 = await prisma.transaction.findUnique({ where: { id: txId } });
        expect((t1?.metadata as Record<string, unknown>).methodCode).toBe("mtn-ci");
        expect(typeof (t1?.metadata as Record<string, unknown>).verrou).toBe("number");
        await leverVerrou(txId);
        const t2 = await prisma.transaction.findUnique({ where: { id: txId } });
        expect((t2?.metadata as Record<string, unknown>).verrou).toBeUndefined();
        // Un verrou périmé (posé il y a plus de 90 s) se reprend.
        expect(await poserVerrou(txId, Date.now() - 100_000)).toBe(true);
        expect(await poserVerrou(txId)).toBe(true);
        await leverVerrou(txId);
    });

    it("le dépôt numérote les tentatives, les clôt, remplace les acceptées, et retrouve la transaction par référence", async () => {
        expect(await depotPrisma.prochainRang(txId)).toBe(1);
        const t1 = await depotPrisma.creer({ transactionId: txId, rang: 1, gatewayId: "gw_test", fournisseur: "pawapay", contexte, reference: referenceTentative(txId, 1), statut: "INITIEE", approche: "test" });
        await depotPrisma.terminer(t1.id, { statut: "REFUSEE", code: "X", categorie: "PANNE_FOURNISSEUR", decision: "REESSAYER", message: "m", dureeMs: 12 });
        const t2 = await depotPrisma.creer({ transactionId: txId, rang: 2, gatewayId: "gw_test2", fournisseur: "feexpay", contexte, reference: referenceTentative(txId, 2), statut: "INITIEE" });
        await depotPrisma.terminer(t2.id, { statut: "ACCEPTEE", providerRef: `fx-${txId}`, dureeMs: 30 });
        await depotPrisma.remplacerAcceptees(txId, t2.id);
        expect(await depotPrisma.prochainRang(txId)).toBe(3);

        const trouve = await transactionParTentative([`fx-${txId}`]);
        expect(trouve?.transaction.id).toBe(txId);
        expect(trouve?.tentative.gatewayId).toBe("gw_test2");

        const reperes = await cloreTentatives({ id: txId, providerRef: `fx-${txId}` }, "SUCCESS", { transactionId: txId, providerReference: `fx-${txId}`, status: "SUCCESS", rawData: {} });
        expect(reperes).toEqual({ contexte, passerelle: "feexpay", gatewayId: "gw_test2" });
        const lignes = await prisma.tentative.findMany({ where: { transactionId: txId }, orderBy: { rang: "asc" } });
        expect(lignes.map((l) => l.statut)).toEqual(["REFUSEE", "REUSSIE"]);
    });

    it("le cron classe une tentative incertaine invérifiable en échec après le délai, et clôt celles d'une transaction déjà dénouée", async () => {
        const { resoudreIncertaines } = await import("./tentatives-depot");
        const t3 = await depotPrisma.creer({ transactionId: txId, rang: 3, gatewayId: "gw_test3", fournisseur: "feexpay", contexte, reference: referenceTentative(txId, 3), statut: "INITIEE" });
        await depotPrisma.terminer(t3.id, { statut: "INCERTAINE", code: "_delai", categorie: "INCERTAIN", decision: "VERIFIER" });
        // Trop récente : on attend encore.
        const r1 = await resoudreIncertaines({ apresMs: 0, abandonMs: 60 * 60_000 });
        expect(r1.examinees).toBeGreaterThanOrEqual(1);
        expect((await prisma.tentative.findUnique({ where: { id: t3.id } }))?.statut).toBe("INCERTAINE");
        // Passé le délai, sans référence utilisable : échouée.
        const r2 = await resoudreIncertaines({ apresMs: 0, abandonMs: 0 });
        expect(r2.echouees).toBeGreaterThanOrEqual(1);
        expect((await prisma.tentative.findUnique({ where: { id: t3.id } }))?.statut).toBe("ECHOUEE");
        // Transaction déjà dénouée (SUCCESS plus haut) : une incertaine qui traîne est remplacée.
        const t4 = await depotPrisma.creer({ transactionId: txId, rang: 4, gatewayId: "gw_test3", fournisseur: "feexpay", contexte, reference: referenceTentative(txId, 4), statut: "INITIEE" });
        await depotPrisma.terminer(t4.id, { statut: "INCERTAINE" });
        await prisma.transaction.update({ where: { id: txId }, data: { status: "SUCCESS" } });
        await resoudreIncertaines({ apresMs: 0, abandonMs: 0 });
        expect((await prisma.tentative.findUnique({ where: { id: t4.id } }))?.statut).toBe("REMPLACEE");
        await prisma.transaction.update({ where: { id: txId }, data: { status: "PENDING" } });
    });

    it("la mesure écrit les deux portées, remplit le seau sur une panne et se relit par passerelle", async () => {
        for (let i = 0; i < 6; i++) await enregistrerIssue({ contexte, passerelle: "pawapay", gatewayId: "gw_test", reussi: i < 2, categorie: "PANNE_FOURNISSEUR" });
        await enregistrerIssue({ contexte, passerelle: "feexpay", gatewayId: "gw_test2", reussi: true });
        await enregistrerIssue({ contexte, passerelle: "feexpay", gatewayId: "gw_test2", reussi: false, categorie: "ABANDON_CLIENT" });
        const m = await lireMesures({ contexte }, [{ gatewayId: "gw_test", passerelle: "pawapay" }, { gatewayId: "gw_test2", passerelle: "feexpay" }, { gatewayId: "gw_inconnue", passerelle: "hub2" }]);
        expect(m.get("gw_test")).toMatchObject({ portee: "compte", ecarte: false, fenetre: { reussis: 2, echoues: 4, observations: 6 } });
        // Une issue neutre ne compte pas : une seule observation chez FeexPay, lue sur la portée plateforme.
        expect(m.get("gw_test2")).toMatchObject({ portee: "plateforme", fenetre: { reussis: 1, echoues: 0, observations: 1 } });
        expect(m.get("gw_inconnue")).toMatchObject({ portee: "aucune", fenetre: { observations: 0 } });
        const plat = await prisma.routageMesure.findUnique({ where: { portee_contexte_passerelle: { portee: "plateforme", contexte, passerelle: "pawapay" } } });
        expect(plat?.seau).toBeCloseTo(4, 0);
        expect(plat?.reussis).toBe(2);
        expect(plat?.echoues).toBe(4);
    });
});
