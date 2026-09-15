import { describe, expect, test } from "vitest";

import {
  computeStandings,
  pointsForForfeit,
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

/** Le score conventionnel d'un forfait, tel que l'écrit `sheets.forfeit` : 3-0, 75-0. */
function forfeitOutcome(winner: string, defaulting: string): MatchOutcome {
  return {
    homeTeamId: winner,
    awayTeamId: defaulting,
    homeSets: 3,
    awaySets: 0,
    homePoints: 75,
    awayPoints: 0,
    forfeitAgainst: defaulting,
  };
}

describe("barème", () => {
  test.each([
    ["victoire 3-0", 3, 0, 3],
    ["victoire 3-1", 3, 1, 3],
    ["victoire 3-2", 3, 2, 3],
    ["défaite 2-3", 2, 3, 2],
    ["défaite 1-3", 1, 3, 1],
    ["défaite 0-3", 0, 3, 1],
  ])("%s rapporte %i point(s)", (_label, won, lost, expected) => {
    expect(pointsForResult(won, lost)).toBe(expected);
  });

  test("toute victoire vaut autant : le score n'y change rien", () => {
    // La distinction 3-0 / 3-2 du barème FIVB n'a pas été retenue.
    expect(new Set([0, 1, 2].map((lost) => pointsForResult(3, lost)))).toEqual(new Set([3]));
  });

  test("une défaite rapporte toujours quelque chose", () => {
    // L'équipe s'est déplacée et a joué : c'est le forfait qui ne rapporte rien, pas la
    // défaite, aussi sèche soit-elle.
    expect(pointsForResult(0, 3)).toBeGreaterThan(0);
  });

  test("les deux équipes d'un 3-2 marquent, l'une 3 points l'autre 2", () => {
    const rows = computeStandings(["a", "b"], [outcome("a", "b", 3, 2)]);
    expect(rows.map((row) => [row.teamId, row.points])).toEqual([
      ["a", 3],
      ["b", 2],
    ]);
  });
});

describe("forfaits", () => {
  test.each([
    ["le premier", 1, 0],
    ["le deuxième", 2, -1],
    ["le troisième", 3, -2],
    ["le quatrième", 4, -2],
    ["le dixième", 10, -2],
  ])("%s forfait vaut %i point(s)", (_label, rank, expected) => {
    expect(pointsForForfeit(rank)).toBe(expected);
  });

  test("un forfait ne rapporte rien à l'équipe défaillante, 3 points à l'autre", () => {
    // Et non 1 point comme une défaite 0-3 : le score conventionnel ressemble à une défaite
    // sèche, mais le barème ne doit pas s'y tromper.
    const rows = computeStandings(["a", "b"], [forfeitOutcome("a", "b")]);
    expect(rows.map((row) => [row.teamId, row.points, row.forfeits])).toEqual([
      ["a", 3, 0],
      ["b", 0, 1],
    ]);
  });

  test("les forfaits s'aggravent et peuvent faire passer un total sous zéro", () => {
    const rows = computeStandings(
      ["a", "b", "c", "d"],
      [forfeitOutcome("b", "a"), forfeitOutcome("c", "a"), forfeitOutcome("d", "a")],
    );
    // 0, puis -1, puis -2 : chaque forfait porte sa propre valeur.
    expect(rows.find((row) => row.teamId === "a")).toMatchObject({ points: -3, forfeits: 3 });
  });

  test("au-delà du troisième, la pénalité ne s'aggrave plus", () => {
    const rows = computeStandings(
      ["a", "b"],
      Array.from({ length: 5 }, () => forfeitOutcome("b", "a")),
    );
    // 0 - 1 - 2 - 2 - 2 : le plafond tient, le classement a déjà dit ce qu'il avait à dire.
    expect(rows.find((row) => row.teamId === "a")?.points).toBe(-7);
  });

  test("le total ne dépend que du nombre de forfaits, pas de leur ordre", () => {
    // Propriété qui dispense de trier les matchs par date : si elle tombe, le calcul
    // devient dépendant d'un ordre que personne ne garantit.
    const played = outcome("a", "b", 0, 3);
    const forfeits = [forfeitOutcome("b", "a"), forfeitOutcome("b", "a")];
    const before = computeStandings(["a", "b"], [...forfeits, played]);
    const after = computeStandings(["a", "b"], [played, ...forfeits]);
    expect(before.find((row) => row.teamId === "a")?.points).toBe(
      after.find((row) => row.teamId === "a")?.points,
    );
    // 1 pour la défaite jouée, 0 et -1 pour les deux forfaits.
    expect(after.find((row) => row.teamId === "a")?.points).toBe(0);
  });

  test("un forfait compte quand même dans les sets et les points marqués", () => {
    // Le score conventionnel est matérialisé pour que les ratios de départage restent
    // comparables d'une équipe à l'autre.
    const rows = computeStandings(["a", "b"], [forfeitOutcome("a", "b")]);
    expect(rows.find((row) => row.teamId === "b")).toMatchObject({
      played: 1,
      losses: 1,
      setsWon: 0,
      setsLost: 3,
      pointsFor: 0,
      pointsAgainst: 75,
    });
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
    // a : deux victoires (6 points, 2 victoires).
    // b : une victoire et trois défaites sèches (3 + 1 + 1 + 1 = 6 points, 1 victoire).
    const rows = computeStandings(
      ["a", "b", "c", "d", "e", "f"],
      [
        outcome("a", "c", 3, 0),
        outcome("a", "d", 3, 0),
        outcome("b", "c", 3, 0),
        outcome("d", "b", 3, 0),
        outcome("e", "b", 3, 0),
        outcome("f", "b", 3, 0),
      ],
    );
    const ranked = rows.filter((row) => ["a", "b"].includes(row.teamId));
    expect(ranked.map((row) => [row.teamId, row.points, row.wins])).toEqual([
      ["a", 6, 2],
      ["b", 6, 1],
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

