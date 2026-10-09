import { describe, expect, it } from "vitest";
import { vi } from "vitest";

vi.mock("@/lib/db", () => ({ default: {} }));

import { affectationPour, router, type EntreeRouteur, type PasserelleCandidate } from "./routeur";
import type { MesureBrute } from "./routage-mesure";
import { ajouterIssue, fenetre, type Bloc } from "./mesure-fenetre";

const APP = "app_1";
const g = (id: string, name: string, extra: Partial<PasserelleCandidate> = {}): PasserelleCandidate =>
    ({ id, name, status: "active", applicationId: APP, countries: null, createdAt: new Date(2026, 0, Number(id.replace(/\D/g, "")) || 1), ...extra });

/** Alpha, Beta, Gamma : noms hors catalogue, donc « servent tout » ; Stripe et PayDunya sont réels. */
const A = g("g1", "Alpha"), B = g("g2", "Beta"), C = g("g3", "Gamma"), S = g("g4", "Stripe"), D = g("g5", "Delta", { status: "inactive" }), E = g("g6", "Epsilon", { applicationId: "autre" });
const PAYDUNYA = g("g7", "PayDunya");

const mesure = (gatewayId: string, reussis: number, echoues: number, ecarte = false): MesureBrute => {
    let blocs: Bloc[] = [];
    for (let i = 0; i < reussis; i++) blocs = ajouterIssue(blocs, true);
    for (let i = 0; i < echoues; i++) blocs = ajouterIssue(blocs, false);
    const f = fenetre(blocs);
    return { gatewayId, passerelle: gatewayId, fenetre: f, totaux: f, ecarte, portee: "compte" };
};

const entree = (x: Partial<EntreeRouteur> = {}): EntreeRouteur => ({
    choisie: "g1",
    config: { algorithmKind: "PRIORITY", fallbackOrder: [], volumeSplits: null, routingRules: null, successScores: null, allowedProviders: [], maxRetries: 3, methodAssignments: {} },
    contexte: { amount: 1000, currency: "XOF", country: "CI", methodCode: "mtn-ci" },
    candidats: [A, B, C, S, D, E],
    managed: false,
    plateformeIds: new Set(),
    applicationId: APP,
    autorisee: (p) => p.applicationId === APP,
    etatMoyen: () => "DISPONIBLE",
    mesures: new Map(),
    alea: () => 0.99,
    ...x,
});
const ids = (s: ReturnType<typeof router>) => s.ordre.map((c) => c.id);

describe("éligibilité", () => {
    it("écarte l'inactive, l'étrangère et Stripe hors carte, avec un motif chacune", () => {
        const s = router(entree());
        expect(ids(s)).toEqual(["g1", "g2", "g3"]);
        expect(s.exclues).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: "g5", motif: "inactive" }),
            expect.objectContaining({ id: "g6", motif: "passerelle d'un autre espace" }),
            expect.objectContaining({ id: "g4", motif: "carte seulement" }),
        ]));
        expect(s.maxTentatives).toBe(3);
    });

    it("une passerelle qui ne sert pas ce moyen n'est pas un secours (PayDunya pour Airtel RDC)", () => {
        const s = router(entree({ candidats: [A, PAYDUNYA, B], contexte: { amount: 1000, currency: "CDF", country: "CD", methodCode: "AIRTEL_COD" } }));
        expect(ids(s)).toEqual(["g1", "g2"]);
        expect(s.exclues).toContainEqual(expect.objectContaining({ id: "g7", motif: "ne sert pas ce moyen" }));
    });

    it("un moyen en panne chez une passerelle l'écarte du secours, jamais la choisie", () => {
        const s = router(entree({ etatMoyen: (p) => (p.id === "g2" || p.id === "g1" ? "INDISPONIBLE" : "DISPONIBLE") }));
        expect(ids(s)).toEqual(["g1", "g3"]);
    });

    it("PayDunya en secours pour Orange CI sans code : écartée ; avec code : gardée", () => {
        const ctx = { amount: 1000, currency: "XOF", country: "CI", methodCode: "ORANGE_CIV" };
        expect(ids(router(entree({ candidats: [A, PAYDUNYA], contexte: ctx })))).toEqual(["g1"]);
        expect(ids(router(entree({ candidats: [A, PAYDUNYA], contexte: ctx, otp: true })))).toEqual(["g1", "g7"]);
    });

    it("une passerelle déjà jouée par un chemin spécial n'est pas rejouée", () => {
        expect(ids(router(entree({ dejaTentees: new Set(["g1"]) })))).toEqual(["g2", "g3"]);
    });
});

describe("priorité", () => {
    it("la choisie reste en tête, les secours sont classés sur la mesure", () => {
        const mesures = new Map([["g2", mesure("g2", 2, 30)], ["g3", mesure("g3", 30, 2)]]);
        const s = router(entree({ mesures }));
        expect(ids(s)).toEqual(["g1", "g3", "g2"]);
        expect(s.approche).toContain("mesure");
    });

    it("la choisie écartée (seau plein) passe derrière", () => {
        const mesures = new Map([["g1", mesure("g1", 0, 0, true)]]);
        const s = router(entree({ mesures }));
        expect(ids(s)).toEqual(["g2", "g3", "g1"]);
        expect(s.approche).toContain("tete ecartee");
    });

    it("respecte la liste de secours du marchand et n'ajoute rien d'implicite", () => {
        const s = router(entree({ config: { ...entree().config, fallbackOrder: ["g3"] } }));
        expect(ids(s)).toEqual(["g1", "g3"]);
    });

    it("maxRetries borne les essais", () => {
        expect(router(entree({ config: { ...entree().config, maxRetries: 0 } })).maxTentatives).toBe(1);
    });
});

describe("dynamique, répartition, règles, unique", () => {
    it("dynamique : la mesure classe tout, choisie comprise", () => {
        const mesures = new Map([["g1", mesure("g1", 2, 30)], ["g2", mesure("g2", 30, 2)]]);
        const s = router(entree({ config: { ...entree().config, algorithmKind: "DYNAMIC" }, mesures }));
        expect(ids(s)[0]).toBe("g2");
        expect(ids(s)[2]).toBe("g1");
    });

    it("répartition par volume : le tirage décide, la mesure ne reclasse pas, une écartée est reléguée", () => {
        const config = { ...entree().config, algorithmKind: "VOLUME_SPLIT" as const, volumeSplits: [{ gatewayId: "g2", split: 70 }, { gatewayId: "g3", split: 30 }] };
        // La troisième passerelle active de l'espace suit en secours implicite.
        expect(ids(router(entree({ config, alea: () => 0.5 })))).toEqual(["g2", "g3", "g1"]);
        expect(ids(router(entree({ config, alea: () => 0.9 })))).toEqual(["g3", "g2", "g1"]);
        const mesures = new Map([["g2", mesure("g2", 0, 0, true)]]);
        const s = router(entree({ config, alea: () => 0.5, mesures }));
        expect(ids(s)).toEqual(["g3", "g1", "g2"]);
        expect(s.approche).toContain("repartition");
    });

    it("règles : la première règle vraie donne l'ordre, sinon la priorité", () => {
        const config = { ...entree().config, algorithmKind: "ADVANCED" as const, routingRules: [{ name: "gros montants", conditions: [{ field: "amount" as const, operator: "gt" as const, value: 5000 }], gatewayIds: ["g3", "g2"] }] };
        const s = router(entree({ config, contexte: { amount: 9000, currency: "XOF", country: "CI", methodCode: "mtn-ci" } }));
        expect(ids(s)).toEqual(["g3", "g2", "g1"]);
        expect(s.approche).toContain("regle:gros montants");
        expect(ids(router(entree({ config })))).toEqual(["g1", "g2", "g3"]);
    });

    it("unique : une seule passerelle, un seul essai", () => {
        const s = router(entree({ config: { ...entree().config, algorithmKind: "SINGLE" } }));
        expect(ids(s)).toEqual(["g1"]);
        expect(s.maxTentatives).toBe(1);
    });
});

describe("affectation, Stripe, mode géré", () => {
    it("l'affectation écrite avec le nom du pays est retrouvée avec le code ISO", () => {
        expect(affectationPour({ "mtn-ci||Côte d'Ivoire": "g3" }, "mtn-ci", "CI")).toBe("g3");
        expect(affectationPour({ "mtn-ci||CI": "g2", "mtn-ci||Côte d'Ivoire": "g3" }, "mtn-ci", "CI")).toBe("g2");
        expect(affectationPour({ "wave-sn||Sénégal": "g3" }, "mtn-ci", "CI")).toBeNull();
        const s = router(entree({ config: { ...entree().config, methodAssignments: { "mtn-ci||Côte d'Ivoire": "g3" } } }));
        expect(ids(s)[0]).toBe("g3");
        expect(s.approche).toContain("affectation");
    });

    it("un moyen propre à Stripe garde Stripe en tête, même en dynamique", () => {
        const mesures = new Map([["g4", mesure("g4", 0, 30)]]);
        const s = router(entree({ choisie: "g4", config: { ...entree().config, algorithmKind: "DYNAMIC" }, contexte: { amount: 10, currency: "USD", country: "CI", methodCode: "card-usd-stripe" }, mesures }));
        expect(ids(s)[0]).toBe("g4");
    });

    it("mode géré : la choisie puis les passerelles de la plateforme, rien d'autre", () => {
        const P1 = g("p1", "PawaPay plateforme", { applicationId: null, isPlatform: true });
        const P2 = g("p2", "Hub2 plateforme", { applicationId: null, isPlatform: true });
        const s = router(entree({ choisie: "p1", managed: true, plateformeIds: new Set(["p1", "p2"]), candidats: [P1, P2, A], autorisee: (p) => !!p.isPlatform }));
        expect(ids(s)).toEqual(["p1", "p2"]);
        expect(s.approche).toContain("gere");
    });
});
