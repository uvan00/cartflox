import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ default: { codeFournisseur: { findMany: async () => [] } } }));

import { jouerTentatives, referenceTentative, type DepotTentatives, type EntreeTentatives } from "./tentatives";
import { categoriserEchec, categoriserException } from "./categorie-echec";
import type { Candidat } from "./routeur";
import type { PaymentResponse } from "./types";

const c = (id: string, cle: string): Candidat => ({ id, name: cle, status: "active", applicationId: "app", cle });
const A = c("g1", "pawapay"), B = c("g2", "feexpay"), C = c("g3", "hub2");

function depotMemoire() {
    const lignes: Array<Record<string, unknown>> = [];
    const depot: DepotTentatives = {
        async prochainRang() { return lignes.length + 1; },
        async creer(t) { const l = { id: `t${lignes.length + 1}`, ...t }; lignes.push(l); return { id: l.id }; },
        async terminer(id, patch) { Object.assign(lignes.find((l) => l.id === id) ?? {}, patch); },
        async remplacerAcceptees(transactionId, saufId) { for (const l of lignes) if (l.id !== saufId && l.statut === "ACCEPTEE") l.statut = "REMPLACEE"; },
    };
    return { depot, lignes };
}

type Scenario = Record<string, PaymentResponse | Error>;
const ok = (ref: string, extra: Partial<PaymentResponse> = {}): PaymentResponse => ({ transactionId: "tx", providerReference: ref, status: "PENDING", rawData: {}, ...extra });
const refus = (rawData: unknown): PaymentResponse => ({ transactionId: "tx", providerReference: "", status: "FAILED", rawData });

function monter(scenario: Scenario, x: Partial<EntreeTentatives> = {}) {
    const { depot, lignes } = depotMemoire();
    const appels: string[] = [];
    const mesures: Array<Record<string, unknown>> = [];
    const journal: Array<Record<string, unknown>> = [];
    const entree: EntreeTentatives = {
        transactionId: "tx_1", contexte: "CI|MTN|XOF", ordre: [A, B, C], maxTentatives: 3, approche: "priorite", choisie: "g1",
        adaptateur: (cand) => ({
            name: cand.cle,
            async initiatePayment() { appels.push(cand.cle); const r = scenario[cand.cle]; if (r instanceof Error) throw r; return r ?? ok(`${cand.cle}-ref`); },
            async verifyPayment() { return ok("x"); },
            async handleWebhook() { return { transactionId: "", status: "PENDING", providerReference: "", rawData: {} }; },
        }),
        requete: (cand, reference) => ({ amount: 100, currency: "XOF", customerName: "n", customerEmail: "e", orderId: "o", callbackUrl: "", returnUrl: "", metadata: { depositId: reference } }),
        depot, categoriser: categoriserEchec, categoriserException,
        mesurer: async (m) => { mesures.push(m); },
        motif: (raw) => { const d = (raw || {}) as { error?: unknown; message?: unknown; rejectionReason?: { rejectionMessage?: unknown } }; return String(d.error || d.message || d.rejectionReason?.rejectionMessage || ""); },
        journal: async (type, payload) => { journal.push({ type, ...payload }); },
        log: () => { },
        ...x,
    };
    return { entree, lignes, appels, mesures, journal };
}

describe("tentatives", () => {
    it("un refus définitif du client arrête tout : une seule tentative, mesurée, motif du moyen choisi", async () => {
        const { entree, lignes, appels, mesures } = monter({ pawapay: refus({ rejectionReason: { rejectionCode: "INSUFFICIENT_BALANCE", rejectionMessage: "Solde insuffisant" } }) });
        const issue = await jouerTentatives(entree);
        expect(issue.issue).toBe("ECHEC");
        if (issue.issue !== "ECHEC") return;
        expect(appels).toEqual(["pawapay"]);
        expect(issue.tentatives).toBe(1);
        expect(issue.motifPrincipal).toBe("Solde insuffisant");
        expect(issue.verdict?.decision).toBe("ARRETER");
        expect(lignes[0]).toMatchObject({ rang: 1, statut: "REFUSEE", code: "INSUFFICIENT_BALANCE", categorie: "REFUS_CLIENT", fournisseur: "pawapay" });
        expect(mesures).toEqual([expect.objectContaining({ passerelle: "pawapay", gatewayId: "g1", reussi: false, categorie: "REFUS_CLIENT" })]);
    });

    it("une panne du fournisseur passe au secours, qui est accepté ; l'acceptée porte sa référence", async () => {
        const { entree, lignes, appels, mesures, journal } = monter({ pawapay: refus({ error: "fetch failed" }), feexpay: ok("fx-123") });
        const issue = await jouerTentatives(entree);
        expect(issue.issue).toBe("ACCEPTEE");
        if (issue.issue !== "ACCEPTEE") return;
        expect(appels).toEqual(["pawapay", "feexpay"]);
        expect(issue.candidat.id).toBe("g2");
        expect(issue.estSecours).toBe(true);
        expect(issue.rang).toBe(2);
        expect(lignes.map((l) => l.statut)).toEqual(["REFUSEE", "ACCEPTEE"]);
        expect(lignes[1].providerRef).toBe("fx-123");
        expect(lignes[1].reference).toBe(referenceTentative("tx_1", 2));
        expect(mesures).toHaveLength(1);
        expect(journal.map((j) => j.type)).toEqual(["INITIATE_FAILED", "FALLBACK_SUCCESS"]);
    });

    it("un délai dépassé est INCERTAIN : on s'arrête, rien n'est renvoyé ailleurs, rien n'est mesuré", async () => {
        const { entree, lignes, appels, mesures } = monter({ pawapay: Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }) });
        const issue = await jouerTentatives(entree);
        expect(issue.issue).toBe("INCERTAINE");
        expect(appels).toEqual(["pawapay"]);
        expect(lignes[0]).toMatchObject({ statut: "INCERTAINE", categorie: "INCERTAIN", decision: "VERIFIER" });
        expect(mesures).toEqual([]);
    });

    it("une réponse FAILED « délai dépassé » d'un adaptateur vaut aussi INCERTAIN", async () => {
        const { entree } = monter({ pawapay: refus({ error: "FeexPay ne répond pas (délai dépassé)" }) });
        expect((await jouerTentatives(entree)).issue).toBe("INCERTAINE");
    });

    it("un adaptateur muet au-delà du garde-fou est INCERTAIN", async () => {
        const { entree } = monter({ pawapay: ok("jamais") }, { delaiMs: 20 });
        entree.adaptateur = () => ({ name: "lent", initiatePayment: () => new Promise(() => { }), verifyPayment: async () => ok("x"), handleWebhook: async () => ({ transactionId: "", status: "PENDING", providerReference: "", rawData: {} }) });
        expect((await jouerTentatives(entree)).issue).toBe("INCERTAINE");
    });

    it("maxTentatives borne, et le rang continue après les tentatives passées", async () => {
        const { entree, lignes, appels } = monter({ pawapay: refus({ error: "fetch failed" }), feexpay: refus({ error: "fetch failed" }) }, { maxTentatives: 2 });
        entree.depot.prochainRang = async () => 4;
        const issue = await jouerTentatives(entree);
        expect(issue.issue).toBe("ECHEC");
        expect(appels).toEqual(["pawapay", "feexpay"]);
        expect(lignes.map((l) => l.rang)).toEqual([4, 5]);
        if (issue.issue === "ECHEC") expect(issue.autreEchec).toBe(true);
    });

    it("un secours qui redirige sans référence est refusé et on passe au suivant", async () => {
        const { entree, lignes, journal } = monter({ pawapay: refus({ error: "fetch failed" }), feexpay: ok("", { checkoutUrl: "https://pay.example/x" }), hub2: ok("pi_1") });
        const issue = await jouerTentatives(entree);
        expect(issue.issue).toBe("ACCEPTEE");
        if (issue.issue === "ACCEPTEE") expect(issue.candidat.id).toBe("g3");
        expect(lignes[1]).toMatchObject({ statut: "REFUSEE", code: "_sans_reference" });
        expect(journal.map((j) => j.type)).toContain("FALLBACK_REFUSED");
    });

    it("un opérateur fermé est signalé et distingué d'un autre échec", async () => {
        const ferme = vi.fn(async () => true);
        const { entree } = monter({ pawapay: refus({ rejectionReason: { rejectionCode: "CORRESPONDENT_TEMPORARILY_UNAVAILABLE" } }), feexpay: refus({ rejectionReason: { rejectionCode: "CORRESPONDENT_TEMPORARILY_UNAVAILABLE" } }), hub2: refus({ rejectionReason: { rejectionCode: "PROVIDER_TEMPORARILY_UNAVAILABLE" } }) }, { operateurFerme: ferme });
        const issue = await jouerTentatives(entree);
        expect(issue.issue).toBe("ECHEC");
        if (issue.issue !== "ECHEC") return;
        expect(issue.operateurFerme).toBe(true);
        expect(issue.autreEchec).toBe(false);
        expect(ferme).toHaveBeenCalledTimes(3);
    });

    it("une clé refusée est signalée, et le secours est tenté", async () => {
        const { entree, appels } = monter({ pawapay: refus({ status: 401, message: "Unauthorized" }), feexpay: ok("fx") });
        const issue = await jouerTentatives(entree);
        expect(issue.issue).toBe("ACCEPTEE");
        expect(appels).toEqual(["pawapay", "feexpay"]);
    });

    it("la référence d'une tentative est un UUID stable", () => {
        const r = referenceTentative("tx_1", 1);
        expect(r).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        expect(referenceTentative("tx_1", 1)).toBe(r);
        expect(referenceTentative("tx_1", 2)).not.toBe(r);
    });
});
