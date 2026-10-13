import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { modules, seedBothRosters, setupChampionship, SLOT_AT, VALID_SETS } from "./test.setup";

afterEach(() => {
  vi.useRealTimers();
});

/** Un match jamais programmé, et l'horloge deux jours après qu'il s'est joué. */
async function unscheduled() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(SLOT_AT - 7 * 86_400_000));
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const rosters = await seedBothRosters(t, s);
  const sheet = {
    matchId: s.matchId,
    sets: VALID_SETS,
    homeLineup: rosters.home.slice(0, 6),
    awayLineup: rosters.away.slice(0, 6),
  };
  return { t, s, sheet };
}

const PLAYED = { at: SLOT_AT, venue: "Gymnase du Coiroux" };

test("le receveur saisit la feuille d'un match joué sans créneau fixé", async () => {
  const { t, s, sheet } = await unscheduled();
  vi.setSystemTime(new Date(SLOT_AT + 2 * 86_400_000));
  await t
    .withIdentity({ subject: s.homeManager })
    .mutation(api.sheets.submit, { ...sheet, slot: PLAYED });

  const match = await t.run(async (ctx) => ctx.db.get(s.matchId));
  expect(match).toMatchObject({ state: "awaitingSheet", slot: PLAYED });

  // Le visiteur valide la feuille, date comprise.
  await t.withIdentity({ subject: s.awayManager }).mutation(api.sheets.validate, {
    matchId: s.matchId,
  });
  expect((await t.run(async (ctx) => ctx.db.get(s.matchId)))?.state).toBe("completed");
});

test("sans créneau fixé, la feuille doit dire où et quand le match s'est joué", async () => {
  const { t, s, sheet } = await unscheduled();
  vi.setSystemTime(new Date(SLOT_AT + 2 * 86_400_000));
  await expect(
    t.withIdentity({ subject: s.homeManager }).mutation(api.sheets.submit, sheet),
  ).rejects.toThrow(/indiquez la date et le lieu/);
});

test("un match pas encore joué ne se saisit pas", async () => {
  const { t, s, sheet } = await unscheduled();
  await expect(
    t.withIdentity({ subject: s.homeManager }).mutation(api.sheets.submit, {
      ...sheet,
      slot: PLAYED,
    }),
  ).rejects.toThrow(/pas encore eu lieu/);
});

test("une proposition restée ouverte est annulée par la saisie", async () => {
  const { t, s, sheet } = await unscheduled();
  await t.withIdentity({ subject: s.homeManager }).mutation(api.negotiation.proposeSlot, {
    matchId: s.matchId,
    at: SLOT_AT + 86_400_000,
    venue: "Gymnase",
  });
  vi.setSystemTime(new Date(SLOT_AT + 2 * 86_400_000));
  await t
    .withIdentity({ subject: s.homeManager })
    .mutation(api.sheets.submit, { ...sheet, slot: PLAYED });

  const proposals = await t.run(async (ctx) => ctx.db.query("slotProposals").collect());
  expect(proposals.map((proposal) => proposal.status)).toEqual(["cancelled"]);
  // L'échéance tacite qui court est celle de la feuille, plus celle du créneau.
  const jobs = await t.run(async (ctx) => ctx.db.system.query("_scheduled_functions").collect());
  expect(
    jobs.filter((job) => job.state.kind === "pending").map((job) => job.name),
  ).toEqual(["sheets:applyTacitSheet"]);
});

test("le visiteur ne saisit pas la feuille d'un match sans créneau", async () => {
  const { t, s, sheet } = await unscheduled();
  vi.setSystemTime(new Date(SLOT_AT + 2 * 86_400_000));
  await expect(
    t.withIdentity({ subject: s.awayManager }).mutation(api.sheets.submit, {
      ...sheet,
      slot: PLAYED,
    }),
  ).rejects.toThrow();
});

test("l'administrateur enregistre directement un match joué sans créneau", async () => {
  const { t, s, sheet } = await unscheduled();
  vi.setSystemTime(new Date(SLOT_AT + 2 * 86_400_000));
  await t.withIdentity({ subject: s.admin }).mutation(api.sheets.record, { ...sheet, slot: PLAYED });
  const match = await t.run(async (ctx) => ctx.db.get(s.matchId));
  expect(match).toMatchObject({ state: "completed", slot: PLAYED, result: { homeSets: 3 } });
});
