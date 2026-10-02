import { describe, expect, test } from "vitest";

import {
  computeStandings,
  plateauPointsForResult,
  pointsForResult,
  type MatchOutcome,
} from "./standings";

function outcome(
  home: string,
  away: string,
  homeSets: number,
  awaySets: number,
  homePoints = 0,
  awayPoints = 0,
): MatchOutcome {
  return { homeTeamId: home, awayTeamId: away, homeSets, awaySets, homePoints, awayPoints };
}

describe("barème", () => {
  test.each([
    ["victoire 3-0", 3, 0, 3],
    ["victoire 3-1", 3, 1, 3],
    ["victoire 3-2", 3, 2, 2],
    ["défaite 2-3", 2, 3, 1],
    ["défaite 1-3", 1, 3, 0],
    ["défaite 0-3", 0, 3, 0],
  ])("%s rapporte %i point(s)", (_label, won, lost, expected) => {
    expect(pointsForResult(won, lost)).toBe(expected);
  });

  test("les deux équipes d'un 3-2 marquent, l'une 2 points l'autre 1", () => {
    const rows = computeStandings(["a", "b"], [outcome("a", "b", 3, 2)]);
    expect(rows.map((row) => [row.teamId, row.points])).toEqual([
      ["a", 2],
      ["b", 1],
    ]);
  });
});

describe("départage", () => {
  test("les points de classement passent avant tout", () => {
    const rows = computeStandings(
      ["a", "b"],
      [outcome("a", "b", 3, 2), outcome("b", "a", 3, 0)],
    );
    // a : 2 + 0 = 2 points ; b : 1 + 3 = 4 points.
    expect(rows.map((row) => row.teamId)).toEqual(["b", "a"]);
  });

  test("à égalité de points, le nombre de victoires départage", () => {
    // a : deux victoires 3-2 (4 points, 2 victoires).
    // b : une victoire 3-0 et une défaite 2-3 (4 points, 1 victoire).
    const rows = computeStandings(
      ["a", "b", "c", "d"],
      [
        outcome("a", "c", 3, 2),
        outcome("a", "d", 3, 2),
        outcome("b", "c", 3, 0),
        outcome("b", "d", 2, 3),
      ],
    );
    const ranked = rows.filter((row) => ["a", "b"].includes(row.teamId));
    expect(ranked.map((row) => [row.teamId, row.points, row.wins])).toEqual([
      ["a", 4, 2],
      ["b", 4, 1],
    ]);
    expect(rows.findIndex((r) => r.teamId === "a")).toBeLessThan(
      rows.findIndex((r) => r.teamId === "b"),
    );
  });

  test("à égalité de points et de victoires, le ratio de sets départage", () => {
    const rows = computeStandings(
      ["a", "b"],
      [outcome("a", "x", 3, 0), outcome("b", "y", 3, 1)],
    );
    expect(rows.map((row) => row.teamId)).toEqual(["a", "b"]);
  });

  test("puis le ratio de points", () => {
    const rows = computeStandings(
      ["a", "b"],
      [outcome("a", "x", 3, 1, 90, 60), outcome("b", "y", 3, 1, 80, 70)],
    );
    expect(rows.map((row) => row.teamId)).toEqual(["a", "b"]);
  });

  test("une équipe n'ayant perdu aucun set ne provoque pas de division par zéro", () => {
    const rows = computeStandings(
      ["a", "b"],
      [outcome("a", "x", 3, 0, 75, 40), outcome("b", "y", 3, 1, 100, 80)],
    );
    expect(rows[0].teamId).toBe("a");
    expect(rows[0].setsLost).toBe(0);
    expect(Number.isFinite(rows[0].points)).toBe(true);
  });
});

describe("ex aequo", () => {
  test("deux équipes que rien ne sépare partagent le même rang, et le suivant saute", () => {
    const rows = computeStandings(
      ["a", "b", "c"],
      [
        outcome("a", "x", 3, 1, 90, 70),
        outcome("b", "y", 3, 1, 90, 70),
        outcome("c", "z", 0, 3, 40, 75),
      ],
    );
    expect(rows.map((row) => [row.teamId, row.rank])).toEqual([
      ["a", 1],
      ["b", 1],
      ["c", 3],
    ]);
  });

  test("trois équipes ex aequo partagent le rang 1", () => {
    const rows = computeStandings(
      ["a", "b", "c"],
      [
        outcome("a", "x", 3, 1, 90, 70),
        outcome("b", "y", 3, 1, 90, 70),
        outcome("c", "z", 3, 1, 90, 70),
      ],
    );
    expect(rows.map((row) => row.rank)).toEqual([1, 1, 1]);
  });
});

describe("matchs non comptabilisés", () => {
  test("une équipe sans match terminé est à zéro partout, et classée", () => {
    const rows = computeStandings(["a", "b"], []);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ played: 0, points: 0, rank: 1 });
    expect(rows[1]).toMatchObject({ played: 0, points: 0, rank: 1 });
  });

  test("un résultat portant sur une équipe hors championnat est ignoré", () => {
    const rows = computeStandings(["a"], [outcome("a", "hors-championnat", 3, 0, 75, 40)]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ teamId: "a", played: 1, points: 3 });
  });
});

test("un forfait est homogène : 3 points au vainqueur, 0 au fautif, 75-0 en points", () => {
  const rows = computeStandings(["a", "b"], [outcome("a", "b", 3, 0, 75, 0)]);
  expect(rows.map((row) => [row.teamId, row.points, row.pointsFor, row.pointsAgainst])).toEqual([
    ["a", 3, 75, 0],
    ["b", 0, 0, 75],
  ]);
});

describe("barème plateau (provisoire)", () => {
  test.each([
    ["victoire 2-0", 2, 0, 50, 30, 3],
    ["victoire 1-1 aux points", 1, 1, 48, 40, 2],
    ["match nul", 1, 1, 48, 48, 1],
    ["défaite 1-1 aux points", 1, 1, 40, 48, 1],
    ["défaite 0-2", 0, 2, 30, 50, 0],
  ])("%s rapporte %i point(s)", (_label, setsWon, setsLost, pointsFor, pointsAgainst, expected) => {
    expect(plateauPointsForResult({ setsWon, setsLost, pointsFor, pointsAgainst })).toBe(expected);
  });

  test("un match nul compte comme nul pour les deux équipes", () => {
    const rows = computeStandings(["a", "b"], [outcome("a", "b", 1, 1, 48, 48)], "plateau");
    for (const row of rows) {
      expect(row).toMatchObject({ played: 1, wins: 0, draws: 1, losses: 0, points: 1 });
    }
    // Rien ne les sépare : ex aequo.
    expect(rows.map((row) => row.rank)).toEqual([1, 1]);
  });

  test("à un set partout, le vainqueur aux points prend la victoire", () => {
    const rows = computeStandings(["a", "b"], [outcome("a", "b", 1, 1, 40, 48)], "plateau");
    expect(rows.map((row) => [row.teamId, row.wins, row.losses, row.points])).toEqual([
      ["b", 1, 0, 2],
      ["a", 0, 1, 1],
    ]);
  });

  test("le format standard garde son barème", () => {
    const rows = computeStandings(["a", "b"], [outcome("a", "b", 3, 2, 110, 100)]);
    expect(rows.map((row) => row.points)).toEqual([2, 1]);
  });
});
