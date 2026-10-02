import { describe, expect, test } from "vitest";

import {
  assessLineup,
  DEFAULT_QUOTA,
  type LineupCandidate,
  type LineupContext,
} from "./reinforcement";

const D1 = "tulle-1";
const D2 = "tulle-2";
const D3 = "tulle-3";
const MIXTE = "tulle-mixte";

function player(
  playerId: string,
  originTeamId: string | null,
  originLevel: number | null,
  upperMatchesBefore = 0,
): LineupCandidate {
  return { playerId, originTeamId, originLevel, upperMatchesBefore };
}

const inD2: LineupContext = { teamId: D2, level: 2, quota: null };
const inMixte: LineupContext = { teamId: MIXTE, level: 3, quota: DEFAULT_QUOTA };

function own(count: number, teamId: string, level: number) {
  return Array.from({ length: count }, (_, i) => player(`own-${i}`, teamId, level));
}

describe("situation d'un joueur aligné", () => {
  test("un joueur de la feuille verte n'est pas un renfort", () => {
    const [assessed] = assessLineup(inD2, [player("p", D2, 2)]);
    expect(assessed).toMatchObject({ kind: "own", flags: [] });
  });

  test("un joueur de D3 en D2 monte, sans signalement jusqu'au 3e match", () => {
    const [assessed] = assessLineup(inD2, [player("p", D3, 3, 2)]);
    expect(assessed).toMatchObject({ kind: "upward", upperMatchNumber: 3, flags: [] });
  });

  test("le 4e match au-dessus de son niveau est signalé", () => {
    const [assessed] = assessLineup(inD2, [player("p", D3, 3, 3)]);
    expect(assessed).toMatchObject({ kind: "upward", upperMatchNumber: 4, flags: ["upperLimit"] });
  });

  test("le saut de deux niveaux est permis", () => {
    const [assessed] = assessLineup({ teamId: D1, level: 1, quota: null }, [player("p", D3, 3)]);
    expect(assessed).toMatchObject({ kind: "upward", flags: [] });
  });

  test("une descente est signalée, pas refusée", () => {
    const [assessed] = assessLineup(inD2, [player("p", D1, 1)]);
    expect(assessed).toMatchObject({ kind: "downward", flags: ["downward"] });
  });

  test("un joueur sans feuille verte dans le circuit est signalé", () => {
    const [assessed] = assessLineup(inD2, [player("p", null, null)]);
    expect(assessed).toMatchObject({ kind: "noRoster", flags: ["noRoster"] });
  });

  test("le même niveau (D3 ↔ mixte) est affiché, ni signalé ni compté", () => {
    const [assessed] = assessLineup(inMixte, [player("p", D3, 3, 5)]);
    expect(assessed).toMatchObject({ kind: "sameLevel", flags: [], upperMatchNumber: 0 });
  });
});

describe("quota du mixte : 2 renforts de D1/D2, pour compléter à 6", () => {
  test("4 joueurs du mixte et 2 de D1 : admis", () => {
    const assessed = assessLineup(inMixte, [
      ...own(4, MIXTE, 3),
      player("a", D1, 1),
      player("b", D2, 2),
    ]);
    expect(assessed.flatMap((p) => p.flags)).toEqual([]);
  });

  test("5 joueurs du mixte et 2 de D1 : on dépasse 6, signalé", () => {
    const assessed = assessLineup(inMixte, [
      ...own(5, MIXTE, 3),
      player("a", D1, 1),
      player("b", D1, 1),
    ]);
    expect(assessed.filter((p) => p.flags.includes("quotaExceeded")).map((p) => p.playerId)).toEqual(
      ["a", "b"],
    );
  });

  test("3 joueurs du mixte et 3 de D2 : plus de 2, signalé", () => {
    const assessed = assessLineup(inMixte, [
      ...own(3, MIXTE, 3),
      player("a", D2, 2),
      player("b", D2, 2),
      player("c", D2, 2),
    ]);
    expect(assessed.filter((p) => p.flags.length > 0)).toHaveLength(3);
  });

  test("les joueurs de D3 n'entrent pas dans le quota", () => {
    const assessed = assessLineup(inMixte, [
      ...own(2, MIXTE, 3),
      player("x", D3, 3),
      player("y", D3, 3),
      player("a", D1, 1),
      player("b", D2, 2),
    ]);
    expect(assessed.flatMap((p) => p.flags)).toEqual([]);
  });

  test("un 7e joueur sans renfort venu d'en haut n'est pas l'affaire du quota", () => {
    const assessed = assessLineup(inMixte, own(8, MIXTE, 3));
    expect(assessed.flatMap((p) => p.flags)).toEqual([]);
  });
});
