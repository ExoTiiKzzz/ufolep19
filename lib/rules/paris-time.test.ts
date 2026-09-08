import { expect, test } from "vitest";

import { endOfDayBefore, isSameParisDay, parisParts, parisWallClock } from "./paris-time";

/** Formate un instant en heure de Paris, pour lire les assertions sans calcul mental. */
function paris(at: number): string {
  const p = parisParts(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

test("la veille d'un créneau est le jour précédent à 23:59:59 heure de Paris", () => {
  const slot = parisWallClock(2026, 1, 10, 20, 0);
  expect(paris(endOfDayBefore(slot))).toBe("2026-01-09 23:59:59");
});

test("la veille passe correctement au mois précédent", () => {
  const slot = parisWallClock(2026, 3, 1, 18, 30);
  expect(paris(endOfDayBefore(slot))).toBe("2026-02-28 23:59:59");
});

test("la veille passe correctement à l'année précédente", () => {
  const slot = parisWallClock(2026, 1, 1, 0, 30);
  expect(paris(endOfDayBefore(slot))).toBe("2025-12-31 23:59:59");
});

test("la veille reste juste au passage à l'heure d'été", () => {
  // En 2026, le changement d'heure a lieu le 29 mars : ce jour-là Paris passe de +1 à +2.
  const slot = parisWallClock(2026, 3, 30, 20, 0);
  const veille = endOfDayBefore(slot);
  expect(paris(veille)).toBe("2026-03-29 23:59:59");
  // 23:59 heure d'été = 21:59 UTC.
  expect(new Date(veille).toISOString()).toBe("2026-03-29T21:59:59.999Z");
});

test("la veille reste juste au passage à l'heure d'hiver", () => {
  // Le 25 octobre 2026, Paris repasse de +2 à +1.
  const slot = parisWallClock(2026, 10, 26, 20, 0);
  expect(new Date(endOfDayBefore(slot)).toISOString()).toBe("2026-10-25T22:59:59.999Z");
});

test("un match tard le soir appartient au jour parisien, pas au jour UTC", () => {
  // 1er janvier 2026, 00 h 30 à Paris, soit le 31 décembre 23 h 30 en UTC.
  const slot = parisWallClock(2026, 1, 1, 0, 30);
  expect(new Date(slot).toISOString()).toBe("2025-12-31T23:30:00.000Z");
  expect(paris(slot)).toBe("2026-01-01 00:30:00");
  expect(isSameParisDay(slot, parisWallClock(2026, 1, 1, 23, 0))).toBe(true);
  expect(isSameParisDay(slot, parisWallClock(2025, 12, 31, 23, 0))).toBe(false);
});

test("une heure murale parisienne se convertit dans les deux sens", () => {
  const winter = parisWallClock(2026, 1, 10, 20, 0);
  expect(new Date(winter).toISOString()).toBe("2026-01-10T19:00:00.000Z");
  const summer = parisWallClock(2026, 7, 10, 20, 0);
  expect(new Date(summer).toISOString()).toBe("2026-07-10T18:00:00.000Z");
});
