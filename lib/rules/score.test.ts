import { describe, expect, test } from "vitest";

import { forfeitScore, validateMatchScore, type SetScore } from "./score";

/** Raccourci de lecture : « 25-20 » plutôt qu'un objet. */
function sets(...scores: string[]): SetScore[] {
  return scores.map((score) => {
    const [home, away] = score.split("-").map(Number);
    return { home, away };
  });
}

describe("scores recevables", () => {
  const cases: Array<[string, SetScore[], [number, number], "home" | "away"]> = [
    ["3-0 net", sets("25-20", "25-18", "25-22"), [3, 0], "home"],
    ["3-1", sets("25-20", "18-25", "25-22", "25-19"), [3, 1], "home"],
    ["3-2 avec tie-break", sets("25-20", "18-25", "25-22", "20-25", "15-13"), [3, 2], "home"],
    ["0-3 symétrique", sets("20-25", "18-25", "22-25"), [0, 3], "away"],
    ["1-3 symétrique", sets("25-20", "18-25", "22-25", "20-25"), [1, 3], "away"],
    ["2-3 symétrique, tie-break perdu", sets("25-20", "18-25", "25-22", "20-25", "13-15"), [2, 3], "away"],
    ["prolongation à 26-24", sets("26-24", "25-18", "25-22"), [3, 0], "home"],
    ["prolongation à 27-25", sets("27-25", "25-18", "25-22"), [3, 0], "home"],
    ["prolongation illimitée à 34-32", sets("34-32", "25-18", "25-22"), [3, 0], "home"],
    ["tie-break en prolongation 17-15", sets("25-20", "18-25", "25-22", "20-25", "17-15"), [3, 2], "home"],
    ["tie-break en prolongation 22-20", sets("25-20", "18-25", "25-22", "20-25", "22-20"), [3, 2], "home"],
    ["set à 25-0", sets("25-0", "25-0", "25-0"), [3, 0], "home"],
  ];

  test.each(cases)("%s", (_label, score, [homeSets, awaySets], winner) => {
    const result = validateMatchScore(score);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outcome.homeSets).toBe(homeSets);
      expect(result.outcome.awaySets).toBe(awaySets);
      expect(result.outcome.winner).toBe(winner);
    }
  });

  test("les points marqués sont agrégés sur tous les sets", () => {
    const result = validateMatchScore(sets("25-20", "18-25", "25-22"));
    expect(result.ok).toBe(false);

    const complete = validateMatchScore(sets("25-20", "18-25", "25-22", "25-19"));
    expect(complete.ok).toBe(true);
    if (complete.ok) {
      expect(complete.outcome.homePoints).toBe(25 + 18 + 25 + 25);
      expect(complete.outcome.awayPoints).toBe(20 + 25 + 22 + 19);
    }
  });
});

describe("scores refusés, et quelle règle est signalée", () => {
  const cases: Array<[string, SetScore[], string, number | undefined]> = [
    ["moins de 3 sets", sets("25-20", "25-18"), "setCount", undefined],
    ["plus de 5 sets", sets("25-20", "18-25", "25-22", "20-25", "15-13", "25-20"), "setCount", undefined],
    ["set non terminé", sets("24-22", "25-18", "25-22"), "setUnfinished", 1],
    ["écart insuffisant à 25", sets("25-24", "25-18", "25-22"), "setMargin", 1],
    ["écart insuffisant en prolongation", sets("28-25", "25-18", "25-22"), "setExtension", 1],
    ["prolongation à 3 points d'écart", sets("29-26", "25-18", "25-22"), "setExtension", 1],
    ["tie-break joué en 25", sets("25-20", "18-25", "25-22", "20-25", "25-20"), "setExtension", 5],
    ["tie-break non terminé", sets("25-20", "18-25", "25-22", "20-25", "14-12"), "setUnfinished", 5],
    ["tie-break sans écart suffisant", sets("25-20", "18-25", "25-22", "20-25", "15-14"), "setMargin", 5],
    ["quatrième set joué en 15", sets("25-20", "18-25", "25-22", "15-13"), "setUnfinished", 4],
    ["set en trop après 3 sets gagnés", sets("25-20", "25-18", "25-22", "25-19"), "matchAlreadyWon", 4],
    ["match non terminé à 2-2", sets("25-20", "18-25", "25-22", "20-25"), "matchUnfinished", undefined],
  ];

  test.each(cases)("%s", (_label, score, code, setNumber) => {
    const result = validateMatchScore(score);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(code);
      expect(result.error.setNumber).toBe(setNumber);
    }
  });

  test("un score négatif est refusé", () => {
    const result = validateMatchScore([
      { home: 25, away: -2 },
      { home: 25, away: 18 },
      { home: 25, away: 22 },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalidNumber");
      expect(result.error.setNumber).toBe(1);
    }
  });

  test("un score non entier est refusé", () => {
    const result = validateMatchScore([
      { home: 25.5, away: 20 },
      { home: 25, away: 18 },
      { home: 25, away: 22 },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("invalidNumber");
    }
  });

  test("le message d'erreur nomme le set fautif", () => {
    const result = validateMatchScore(sets("25-20", "25-24", "25-22"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/^Set 2 :/);
    }
  });
});

test("le score conventionnel de forfait est un 3-0 valide", () => {
  const result = validateMatchScore(forfeitScore());
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.outcome).toMatchObject({
      homeSets: 3,
      awaySets: 0,
      homePoints: 75,
      awayPoints: 0,
      winner: "home",
    });
  }
});
