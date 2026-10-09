import { describe, expect, it } from "vitest";
import { BLOC_TAILLE, MAX_BLOCS, ajouterIssue, classerMesures, ecartee, fenetre, lireBlocs, niveauSeau, scoreLisse, type ScoreMesure } from "./mesure-fenetre";

const d = (ms: number) => new Date(1_700_000_000_000 + ms);

describe("fenêtre glissante", () => {
    it("remplit un bloc de cinq issues, puis en ouvre un autre, et ne garde que les huit derniers", () => {
        let blocs = ajouterIssue([], true, d(0));
        for (let i = 1; i < BLOC_TAILLE; i++) blocs = ajouterIssue(blocs, false, d(i));
        expect(blocs).toHaveLength(1);
        expect(blocs[0]).toMatchObject({ r: 1, e: 4 });
        blocs = ajouterIssue(blocs, true, d(10));
        expect(blocs).toHaveLength(2);
        expect(blocs[1]).toMatchObject({ r: 1, e: 0 });
        for (let i = 0; i < BLOC_TAILLE * (MAX_BLOCS + 2); i++) blocs = ajouterIssue(blocs, true, d(100 + i));
        expect(blocs).toHaveLength(MAX_BLOCS);
        // Sept blocs pleins et un bloc entamé d'une issue : la fenêtre ne compte jamais plus de quarante.
        expect(fenetre(blocs).observations).toBe(BLOC_TAILLE * (MAX_BLOCS - 1) + 1);
    });

    it("lit des blocs abîmés sans lever", () => {
        expect(lireBlocs(null)).toEqual([]);
        expect(lireBlocs([{ r: "3", e: -1 }, null, "x"])).toEqual([{ r: 3, e: 0, le: "" }]);
    });

    it("sans observation, le score est pile l'estimation ; quarante échecs le font tomber", () => {
        expect(scoreLisse(fenetre([]), 0.92)).toBeCloseTo(0.92, 6);
        let blocs: ReturnType<typeof ajouterIssue> = [];
        for (let i = 0; i < 40; i++) blocs = ajouterIssue(blocs, false, d(i));
        expect(scoreLisse(fenetre(blocs), 0.92)).toBeLessThan(0.2);
        expect(scoreLisse({ reussis: 3, echoues: 0, observations: 3 }, 0.5)).toBeGreaterThan(0.5);
    });

    it("le seau fuit d'un point toutes les dix minutes et écarte au-delà de quatre", () => {
        const pose = d(0);
        expect(niveauSeau(5, pose, pose.getTime() + 1)).toBeCloseTo(5, 3);
        expect(ecartee(5, pose, pose.getTime() + 1)).toBe(true);
        expect(ecartee(5, pose, pose.getTime() + 10 * 60_000 + 1)).toBe(false);
        expect(ecartee(1, pose, pose.getTime() + 1)).toBe(false);
        expect(niveauSeau(2, pose, pose.getTime() + 60 * 60_000)).toBe(0);
    });
});

describe("classement", () => {
    const s = (passerelle: string, score: number, observations = 20, ecarte = false): ScoreMesure =>
        ({ passerelle, gatewayId: passerelle, score, observations, mesure: observations >= 10, ecarte });

    it("classe par score, les écartées derrière", () => {
        const { ordre, approche } = classerMesures([s("a", 0.5), s("b", 0.9, 20, true), s("c", 0.7)], () => 0.99);
        expect(ordre.map((x) => x.passerelle)).toEqual(["c", "a", "b"]);
        expect(approche).toBe("mesure");
    });

    it("explore la moins observée des saines non mesurées, une fois sur dix", () => {
        const details = [s("a", 0.9), s("b", 0.8, 2), s("c", 0.95, 7)];
        expect(classerMesures(details, () => 0.05).ordre.map((x) => x.passerelle)).toEqual(["b", "c", "a"]);
        expect(classerMesures(details, () => 0.05).approche).toBe("exploration");
        expect(classerMesures(details, () => 0.5).ordre.map((x) => x.passerelle)).toEqual(["c", "a", "b"]);
    });

    it("une seule candidate : rien à classer", () => {
        expect(classerMesures([s("a", 0.1)]).approche).toBe("insuffisant");
    });
});
