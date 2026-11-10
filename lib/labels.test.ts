import { expect, test } from "vitest";

import { matchStateLabel, postponementNote } from "./labels";
import { parisWallClock } from "./rules/paris-time";

const OCT_11 = parisWallClock(2026, 10, 11, 20, 30);

test("un match reporté en attente de créneau se dit « Reporté », pas « Créneau à fixer »", () => {
  expect(matchStateLabel({ state: "planned", postponement: { previousAt: OCT_11 } })).toBe(
    "Reporté",
  );
  expect(matchStateLabel({ state: "planned" })).toBe("Créneau à fixer");
  expect(matchStateLabel({ state: "confirmed", postponement: {} })).toBe("Créneau confirmé");
});

test("la mention du report ne répète pas le badge et garde la date annulée", () => {
  expect(postponementNote({ state: "planned", postponement: { previousAt: OCT_11 } })).toBe(
    "Initialement le 11 oct. 2026",
  );
  expect(postponementNote({ state: "confirmed", postponement: { previousAt: OCT_11 } })).toBe(
    "Reporté, initialement le 11 oct. 2026",
  );
});

test("un report enregistré sans date ne donne que ce qu'il sait", () => {
  expect(postponementNote({ state: "planned", postponement: {} })).toBeNull();
  expect(postponementNote({ state: "completed", postponement: {} })).toBe("Reporté");
  expect(postponementNote({ state: "completed" })).toBeNull();
});
