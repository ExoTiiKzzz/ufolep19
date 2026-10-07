import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

const ROW = {
  clubName: "VOLLEY CLUB ALLASSAC",
  firstName: "Camille",
  lastName: "DURAND",
  number: "019_03107365",
  validFrom: "2026-09-11",
  validUntil: "2027-08-31",
};

test("l'import crée club, fiche et licence, et se rejoue sans doublon", async () => {
  const t = convexTest(schema, modules);
  const second = { ...ROW, firstName: "Léa", number: "019_03107366" };

  expect(await t.mutation(internal.imports.licensees, { rows: [ROW, second] })).toEqual({
    clubsCreated: 1,
    playersCreated: 2,
    licensesAdded: 2,
    unchanged: 0,
    rejected: [],
  });
  expect(await t.mutation(internal.imports.licensees, { rows: [ROW, second] })).toEqual({
    clubsCreated: 0,
    playersCreated: 0,
    licensesAdded: 0,
    unchanged: 2,
    rejected: [],
  });

  const players = await t.run(async (ctx) => ctx.db.query("players").collect());
  expect(players).toHaveLength(2);
  const license = await t.run(async (ctx) =>
    ctx.db
      .query("licenses")
      .withIndex("by_number", (q) => q.eq("number", "019_03107365"))
      .unique(),
  );
  // Couvert jusqu'au 31 août au soir, heure de Paris.
  expect(license?.validUntil).toBe(Date.UTC(2027, 7, 31, 21, 59, 59, 999));
});

test("un numéro connu reçoit la nouvelle saison, sans nouvelle fiche", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.imports.licensees, {
    rows: [{ ...ROW, validFrom: "2025-09-01", validUntil: "2026-08-31" }],
  });

  const report = await t.mutation(internal.imports.licensees, { rows: [ROW] });
  expect(report).toMatchObject({ playersCreated: 0, licensesAdded: 1 });
  expect(await t.run(async (ctx) => ctx.db.query("licenses").collect())).toHaveLength(2);
});

test("une période qui chevauche une licence enregistrée est rejetée, pas réécrite", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.imports.licensees, { rows: [ROW] });

  const report = await t.mutation(internal.imports.licensees, {
    rows: [{ ...ROW, validFrom: "2026-10-01" }],
  });
  expect(report.rejected).toEqual([
    { number: "019_03107365", reason: expect.stringMatching(/chevauche/) },
  ]);
});
