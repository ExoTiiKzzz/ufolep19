import { expect, test } from "vitest";

import { parisWallClock } from "./paris-time";
import { sheetTacitDeadline, slotTacitDeadline, TACIT_DELAY_MS } from "./tacit";

const slot = parisWallClock(2026, 1, 20, 20, 0);

test("l'échéance est à 7 jours quand le créneau est loin", () => {
  const now = parisWallClock(2026, 1, 5, 12, 0);
  expect(slotTacitDeadline(now, slot)).toBe(now + TACIT_DELAY_MS);
});

test("l'échéance est plafonnée à la veille du créneau", () => {
  // Proposition faite 3 jours avant le match : 7 jours dépasseraient la date du match.
  const now = parisWallClock(2026, 1, 17, 12, 0);
  const deadline = slotTacitDeadline(now, slot);
  expect(deadline).not.toBeNull();
  expect(deadline).toBeLessThan(slot);
  expect(new Date(deadline as number).toISOString()).toBe("2026-01-19T22:59:59.999Z");
});

test("aucune échéance quand il reste moins de 24 h pour réagir", () => {
  // Proposition la veille à midi : le plafond tombe à 23:59 le même jour, soit 12 h de
  // réaction. Trop court pour engager une équipe par son silence.
  const now = parisWallClock(2026, 1, 19, 12, 0);
  expect(slotTacitDeadline(now, slot)).toBeNull();
});

test("une échéance courte mais supérieure à 24 h est programmée", () => {
  // Proposition l'avant-veille à midi : 36 h de réaction jusqu'au plafond.
  const now = parisWallClock(2026, 1, 18, 12, 0);
  const deadline = slotTacitDeadline(now, slot);
  expect(new Date(deadline as number).toISOString()).toBe("2026-01-19T22:59:59.999Z");
});

test("aucune échéance quand le créneau est le jour même", () => {
  const now = parisWallClock(2026, 1, 20, 12, 0);
  expect(slotTacitDeadline(now, slot)).toBeNull();
});

test("aucune échéance pour un créneau déjà passé", () => {
  const now = parisWallClock(2026, 1, 25, 12, 0);
  expect(slotTacitDeadline(now, slot)).toBeNull();
});

test("l'échéance d'une feuille est à 7 jours, sans plafond", () => {
  const now = parisWallClock(2026, 1, 20, 22, 30);
  expect(sheetTacitDeadline(now)).toBe(now + TACIT_DELAY_MS);
});
