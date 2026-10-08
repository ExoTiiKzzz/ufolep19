import { expect, test } from "vitest";

import {
  bracketSize,
  groupDemand,
  rangeAfter,
  rangeLabel,
  roundCount,
  type Outcome,
} from "./bracket";

test("le tableau est complété à la puissance de 2 supérieure", () => {
  expect([2, 3, 16, 17, 29, 32, 33].map(bracketSize)).toEqual([2, 4, 16, 32, 32, 32, 64]);
  expect(roundCount(32)).toBe(5);
  expect(roundCount(29)).toBe(5);
});

test("à 32 équipes, le règlement : groupes de 16, de 8, de 4 sans aucun exempt", () => {
  expect(groupDemand({ from: 1, to: 32 }, 32)).toMatchObject({ byes: 0, matches: 16 });
  expect(groupDemand({ from: 17, to: 32 }, 32)).toMatchObject({ real: 16, byes: 0 });
  expect(groupDemand({ from: 9, to: 16 }, 32)).toMatchObject({ real: 8, matches: 4 });
});

test("à 30 équipes, 2 exempts au tour 1 puis encore 2 chez les vaincus", () => {
  expect(groupDemand({ from: 1, to: 32 }, 30)).toMatchObject({ empty: 2, byes: 2, matches: 14 });
  // Vainqueurs : les 2 exempts et les 14 vainqueurs, groupe complet.
  expect(groupDemand({ from: 1, to: 16 }, 30)).toMatchObject({ real: 16, byes: 0 });
  // Vaincus : 14 équipes et les 2 places vides.
  expect(groupDemand({ from: 17, to: 32 }, 30)).toMatchObject({ real: 14, byes: 2, matches: 6 });
  expect(groupDemand({ from: 25, to: 32 }, 30)).toMatchObject({ real: 6, byes: 2, matches: 2 });
});

test("à 17 équipes, une seule rencontre au tour 1, et le dernier va seul jusqu'au bout", () => {
  expect(groupDemand({ from: 1, to: 32 }, 17)).toMatchObject({ byes: 15, matches: 1 });
  expect(groupDemand({ from: 17, to: 32 }, 17)).toMatchObject({ real: 1, byes: 1, matches: 0 });
  expect(groupDemand({ from: 17, to: 24 }, 17)).toMatchObject({ real: 1, byes: 1 });
  expect(groupDemand({ from: 25, to: 32 }, 17)).toMatchObject({ real: 0, byes: 0, matches: 0 });
});

test("la fourchette suit le parcours, l'exempt comptant comme une victoire", () => {
  expect(rangeAfter([], 32)).toEqual({ from: 1, to: 32 });
  expect(rangeAfter(["lost"], 32)).toEqual({ from: 17, to: 32 });
  expect(rangeAfter(["won", "lost"], 32)).toEqual({ from: 9, to: 16 });
  expect(rangeAfter(["bye", "lost", "won"], 32)).toEqual({ from: 9, to: 12 });
  expect(rangeAfter(["lost", "lost", "lost", "lost", "lost"], 32)).toEqual({ from: 32, to: 32 });
});

test("un bloc qui n'existe pas dans le tableau est une erreur", () => {
  expect(() => groupDemand({ from: 3, to: 6 }, 32)).toThrow(/absent du tableau/);
});

test("libellés de fourchette et de place", () => {
  expect(rangeLabel({ from: 17, to: 24 })).toBe("places 17 à 24");
  expect(rangeLabel({ from: 1, to: 1 })).toBe("1ʳᵉ place");
  expect(rangeLabel({ from: 9, to: 9 })).toBe("9ᵉ place");
});

/** Générateur pseudo-aléatoire déterministe : un test qui échoue doit se rejouer. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

test("tout tableau joué selon les comptes exigés classe les équipes de 1 à N", () => {
  for (let teamCount = 2; teamCount <= 40; teamCount++) {
    for (let seed = 1; seed <= 5; seed++) {
      const random = seeded(teamCount * 100 + seed);
      const paths: Outcome[][] = Array.from({ length: teamCount }, () => []);
      for (let round = 1; round <= roundCount(teamCount); round++) {
        // Regroupe les équipes par bloc de places, comme le ferait l'administrateur.
        const groups = new Map<number, number[]>();
        paths.forEach((path, team) => {
          const { from } = rangeAfter(path, teamCount);
          groups.set(from, [...(groups.get(from) ?? []), team]);
        });
        for (const [from, teams] of groups) {
          const size = bracketSize(teamCount) / 2 ** (round - 1);
          const demand = groupDemand({ from, to: from + size - 1 }, teamCount);
          // L'effectif prédit est bien celui que le tableau produit.
          expect(teams.length).toBe(demand.real);
          const shuffled = [...teams].sort(() => random() - 0.5);
          // Choix libre des exempts, nombre imposé.
          for (const team of shuffled.slice(0, demand.byes)) {
            paths[team].push("bye");
          }
          const rest = shuffled.slice(demand.byes);
          expect(rest.length).toBe(demand.matches * 2);
          for (let i = 0; i < rest.length; i += 2) {
            const homeWins = random() < 0.5;
            paths[rest[i]].push(homeWins ? "won" : "lost");
            paths[rest[i + 1]].push(homeWins ? "lost" : "won");
          }
        }
      }
      const places = paths.map((path) => {
        const range = rangeAfter(path, teamCount);
        expect(range.from).toBe(range.to);
        return range.from;
      });
      expect([...places].sort((a, b) => a - b)).toEqual(
        Array.from({ length: teamCount }, (_, i) => i + 1),
      );
    }
  }
});
