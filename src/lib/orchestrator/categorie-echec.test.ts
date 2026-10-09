import { beforeEach, describe, expect, it, vi } from "vitest";

const lignes: Array<Record<string, unknown>> = [];
vi.mock("@/lib/db", () => ({ default: { codeFournisseur: { findMany: async () => lignes } } }));

import { categoriserEchec, categoriserEchecRapide, categoriserException, codeBrut, issueNeutre, oublierCodesFournisseur } from "./categorie-echec";

beforeEach(() => { lignes.length = 0; oublierCodesFournisseur(); });

describe("classification des refus", () => {
    it("lit les codes PawaPay, Stripe et Hub2", async () => {
        expect(await categoriserEchec("pawapay", { rejectionReason: { rejectionCode: "INSUFFICIENT_BALANCE" } })).toMatchObject({ code: "INSUFFICIENT_BALANCE", categorie: "REFUS_CLIENT", decision: "ARRETER" });
        expect(await categoriserEchec("stripe", { last_payment_error: { decline_code: "insufficient_funds" } })).toMatchObject({ categorie: "REFUS_CLIENT", decision: "ARRETER" });
        expect(await categoriserEchec("hub2", { payments: [{ failure: { code: "forbidden_by_hub2" } }] })).toMatchObject({ categorie: "PANNE_FOURNISSEUR", decision: "REESSAYER" });
        expect(await categoriserEchec("pawapay", { failureReason: { failureCode: "PAYMENT_NOT_APPROVED" } })).toMatchObject({ categorie: "ABANDON_CLIENT" });
    });

    it("lit les codes sous leurs autres formes : response_code, errors[0].code, code numérique", async () => {
        expect(codeBrut({ response_code: "4003", response_text: "Invalid Total Amount" }, null)).toBe("4003");
        expect(codeBrut({ errors: [{ code: "E42", message: "x" }] }, null)).toBe("E42");
        expect(codeBrut({ code: 601, message: "Transaction refusée" }, null)).toBe("601");
        expect(await categoriserEchec("cinetpay", { code: "601" })).toMatchObject({ code: "601", categorie: "INCONNU", decision: "REESSAYER" });
    });

    it("un délai dépassé est INCERTAIN : on vérifie, on ne renvoie pas ailleurs", async () => {
        expect(await categoriserEchec("pawapay", { error: "The operation was aborted due to timeout" })).toMatchObject({ code: "_delai", categorie: "INCERTAIN", decision: "VERIFIER" });
        expect(await categoriserEchec("feexpay", { error: "FeexPay ne répond pas (délai dépassé)" })).toMatchObject({ categorie: "INCERTAIN" });
        expect(await categoriserEchec("x", { status: 504 })).toMatchObject({ code: "_delai" });
        expect(await categoriserEchec("pawapay", { error: "PawaPay : page indisponible", _delai: true })).toMatchObject({ code: "_delai", categorie: "INCERTAIN", decision: "VERIFIER" });
        expect(await categoriserException("x", Object.assign(new Error("x"), { name: "TimeoutError" }))).toMatchObject({ categorie: "INCERTAIN", decision: "VERIFIER" });
    });

    it("injoignable et 5xx : panne du fournisseur, on tente ailleurs", async () => {
        expect(await categoriserEchec("x", { error: "fetch failed" })).toMatchObject({ code: "_injoignable", categorie: "PANNE_FOURNISSEUR", decision: "REESSAYER" });
        expect(await categoriserEchec("x", { status: 503 })).toMatchObject({ code: "_http_5xx", categorie: "PANNE_FOURNISSEUR" });
        expect(await categoriserException("x", new Error("connect ECONNREFUSED 1.2.3.4:443"))).toMatchObject({ categorie: "PANNE_FOURNISSEUR" });
    });

    it("une clé refusée est la faute du compte, pas du fournisseur", async () => {
        expect(await categoriserEchec("x", { status: 401, message: "Unauthorized" })).toMatchObject({ code: "_identifiants", categorie: "IDENTIFIANTS", decision: "REESSAYER" });
        expect(await categoriserEchec("x", { message: "Invalid API key provided" })).toMatchObject({ categorie: "IDENTIFIANTS" });
        expect(await categoriserEchec("x", { code: "AUTH_001", error: "Access denied for this merchant" })).toMatchObject({ code: "AUTH_001", categorie: "IDENTIFIANTS" });
    });

    it("rien d'exploitable : INCONNU, on réessaie", async () => {
        expect(await categoriserEchec("x", {})).toEqual({ code: "", categorie: "INCONNU", decision: "REESSAYER" });
        expect(categoriserEchecRapide({ error: "fetch failed" })).toMatchObject({ categorie: "PANNE_FOURNISSEUR" });
    });

    it("la base corrige le filet : par passerelle, par joker, et par fragment pour tout code inconnu", async () => {
        lignes.push(
            { passerelle: "feexpay", code: "X1", categorie: "MOYEN_INVALIDE", decision: "ARRETER", messageUnifie: "Numéro invalide." },
            { passerelle: "*", code: "_injoignable", categorie: "TEMPORAIRE", decision: "ARRETER" },
            { passerelle: "*", fragmentMessage: "numero MTN Benin valide", categorie: "MOYEN_INVALIDE", decision: "ARRETER", messageUnifie: "Entrez un numéro MTN Bénin valide." },
        );
        expect(await categoriserEchec("feexpay", { errorCode: "X1" })).toMatchObject({ code: "X1", categorie: "MOYEN_INVALIDE", message: "Numéro invalide." });
        expect(await categoriserEchec("pawapay", { errorCode: "X1" })).toMatchObject({ categorie: "INCONNU" });
        expect(await categoriserEchec("qosic", { error: "fetch failed" })).toMatchObject({ categorie: "TEMPORAIRE", decision: "ARRETER" });
        expect(await categoriserEchec("feexpay", { code: "ERR_77", message: "Veuillez entrer un numéro MTN Bénin valide" })).toMatchObject({ code: "ERR_77", categorie: "MOYEN_INVALIDE", message: "Entrez un numéro MTN Bénin valide." });
    });

    it("sait ce qui ne dit rien de la passerelle", () => {
        expect(issueNeutre("ABANDON_CLIENT")).toBe(true);
        expect(issueNeutre("INCERTAIN")).toBe(true);
        expect(issueNeutre("PANNE_FOURNISSEUR")).toBe(false);
    });
});
