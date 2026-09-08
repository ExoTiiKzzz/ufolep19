import { expect, test } from "vitest";

import { formatCountdown, inputValueFromTimestamp, parisTimestampFromInput } from "./format";
import { parisWallClock } from "./rules/paris-time";

test("un délai de presque 7 jours s'affiche « dans 7 jours », pas 6", () => {
  const now = Date.UTC(2026, 0, 1, 12, 0);
  expect(formatCountdown(now + 7 * 86_400_000 - 2 * 3_600_000, now)).toBe("dans 7 jours");
});

test("les délais courts sont exprimés en heures puis en minutes", () => {
  const now = Date.UTC(2026, 0, 1, 12, 0);
  expect(formatCountdown(now + 5 * 3_600_000, now)).toBe("dans 5 h");
  expect(formatCountdown(now + 30 * 60_000, now)).toBe("dans 30 min");
  expect(formatCountdown(now - 1, now)).toBe("échéance dépassée");
});

test("la saisie d'un créneau est interprétée en heure de Paris, aller et retour", () => {
  const at = parisTimestampFromInput("2026-01-10T20:00");
  expect(at).toBe(parisWallClock(2026, 1, 10, 20, 0));
  expect(inputValueFromTimestamp(at as number)).toBe("2026-01-10T20:00");
});

test("une saisie mal formée est rejetée", () => {
  expect(parisTimestampFromInput("10/01/2026 20:00")).toBeNull();
});
