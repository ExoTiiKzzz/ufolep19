import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import {
  forceConfirmed,
  modules,
  seedBothRosters,
  setupChampionship,
  SLOT_AT,
  VALID_SETS,
} from "./test.setup";

afterEach(() => {
  vi.useRealTimers();
});

function at(instant: number) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(instant));
}

/** Un match confirmé, ses deux effectifs, et l'horloge après le créneau. */
async function playedMatch() {
  at(SLOT_AT - 7 * 86_400_000);
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const rosters = await seedBothRosters(t, s);
  await forceConfirmed(t, { matchId: s.matchId, proposedBy: s.homeManager });
  vi.setSystemTime(new Date(SLOT_AT + 3_600_000));
  return { t, s, rosters, admin: t.withIdentity({ subject: s.admin }) };
}

test("l'administrateur saisit la feuille d'un match standard : terminé sans validation", async () => {
  const { t, s, rosters, admin } = await playedMatch();
  await admin.mutation(api.sheets.record, {
    matchId: s.matchId,
    sets: VALID_SETS,
    homeLineup: rosters.home.slice(0, 6),
    awayLineup: rosters.away.slice(0, 6),
  });
  const match = await t.run(async (ctx) => ctx.db.get(s.matchId));
  expect(match).toMatchObject({ state: "completed", result: { homeSets: 3, awaySets: 1 } });
});

test("l'administrateur corrige la feuille d'un match terminé, score et compositions", async () => {
  const { t, s, rosters, admin } = await playedMatch();
  const record = (sets: typeof VALID_SETS, size: number) =>
    admin.mutation(api.sheets.record, {
      matchId: s.matchId,
      sets,
      homeLineup: rosters.home.slice(0, size),
      awayLineup: rosters.away.slice(0, size),
    });
  await record(VALID_SETS, 6);
  await record(
    [
      { home: 20, away: 25 },
      { home: 20, away: 25 },
      { home: 20, away: 25 },
    ],
    7,
  );
  const after = await t.run(async (ctx) => ({
    match: await ctx.db.get(s.matchId),
    lineup: await ctx.db
      .query("lineupEntries")
      .withIndex("by_match", (q) => q.eq("matchId", s.matchId))
      .collect(),
  }));
  expect(after.match?.result).toMatchObject({ winnerTeamId: s.awayTeamId, awaySets: 3 });
  expect(after.lineup).toHaveLength(14);
});

test("un forfait corrigé en résultat joué n'est plus un forfait", async () => {
  const { t, s, rosters, admin } = await playedMatch();
  await admin.mutation(api.sheets.forfeit, { matchId: s.matchId, forfeitingTeamId: s.awayTeamId });
  await admin.mutation(api.sheets.record, {
    matchId: s.matchId,
    sets: VALID_SETS,
    homeLineup: rosters.home.slice(0, 6),
    awayLineup: rosters.away.slice(0, 6),
  });
  const match = await t.run(async (ctx) => ctx.db.get(s.matchId));
  expect(match?.forfeitAgainst).toBeUndefined();
});

test("un responsable ne saisit pas la feuille en administrateur", async () => {
  const { t, s, rosters } = await playedMatch();
  await expect(
    t.withIdentity({ subject: s.homeManager }).mutation(api.sheets.record, {
      matchId: s.matchId,
      sets: VALID_SETS,
      homeLineup: rosters.home.slice(0, 6),
      awayLineup: rosters.away.slice(0, 6),
    }),
  ).rejects.toThrow(/réservée aux administrateurs/);
});

test("l'administrateur fixe le créneau : la négociation en cours est annulée", async () => {
  at(SLOT_AT - 7 * 86_400_000);
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  await t.withIdentity({ subject: s.homeManager }).mutation(api.negotiation.proposeSlot, {
    matchId: s.matchId,
    at: SLOT_AT,
    venue: "Gymnase",
  });
  const admin = t.withIdentity({ subject: s.admin });
  await admin.mutation(api.negotiation.fixSlot, {
    matchId: s.matchId,
    at: SLOT_AT + 86_400_000,
    venue: "Salle du comité",
  });
  const match = await t.run(async (ctx) => ctx.db.get(s.matchId));
  expect(match).toMatchObject({
    state: "confirmed",
    slot: { at: SLOT_AT + 86_400_000, venue: "Salle du comité" },
  });
  expect(match?.tacitJobId).toBeUndefined();
  const history = await admin.query(api.negotiation.history, { matchId: s.matchId });
  expect(history.proposals.map((proposal) => proposal.status).sort()).toEqual([
    "accepted",
    "cancelled",
  ]);
});

test("après la feuille, fixer le créneau ne fait que le corriger", async () => {
  const { t, s, rosters, admin } = await playedMatch();
  await admin.mutation(api.sheets.record, {
    matchId: s.matchId,
    sets: VALID_SETS,
    homeLineup: rosters.home.slice(0, 6),
    awayLineup: rosters.away.slice(0, 6),
  });
  await admin.mutation(api.negotiation.fixSlot, {
    matchId: s.matchId,
    at: SLOT_AT,
    venue: "Autre gymnase",
  });
  const match = await t.run(async (ctx) => ctx.db.get(s.matchId));
  expect(match).toMatchObject({ state: "completed", slot: { venue: "Autre gymnase" } });
});

test("changer les équipes d'un match en négociation annule la proposition", async () => {
  at(SLOT_AT - 7 * 86_400_000);
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  await t.withIdentity({ subject: s.homeManager }).mutation(api.negotiation.proposeSlot, {
    matchId: s.matchId,
    at: SLOT_AT,
    venue: "Gymnase",
  });
  await t.withIdentity({ subject: s.admin }).mutation(api.matches.update, {
    matchId: s.matchId,
    homeTeamId: s.awayTeamId,
    awayTeamId: s.homeTeamId,
  });
  const match = await t.run(async (ctx) => ctx.db.get(s.matchId));
  expect(match).toMatchObject({
    state: "planned",
    homeTeamId: s.awayTeamId,
    awayTeamId: s.homeTeamId,
  });
});

test("un match qui a une feuille garde ses équipes, mais change de journée", async () => {
  const { t, s, rosters, admin } = await playedMatch();
  await admin.mutation(api.sheets.record, {
    matchId: s.matchId,
    sets: VALID_SETS,
    homeLineup: rosters.home.slice(0, 6),
    awayLineup: rosters.away.slice(0, 6),
  });
  await expect(
    admin.mutation(api.matches.update, {
      matchId: s.matchId,
      homeTeamId: s.awayTeamId,
      awayTeamId: s.homeTeamId,
    }),
  ).rejects.toThrow(/supprimez le match et recréez-le/);

  const secondDay = await t.run(async (ctx) =>
    ctx.db.insert("matchdays", {
      championshipId: s.championshipId,
      number: 2,
      windowStart: SLOT_AT,
      windowEnd: SLOT_AT + 7 * 86_400_000,
    }),
  );
  await admin.mutation(api.matches.update, { matchId: s.matchId, matchdayId: secondDay });
  const entries = await t.run(async (ctx) =>
    ctx.db
      .query("lineupEntries")
      .withIndex("by_match", (q) => q.eq("matchId", s.matchId))
      .collect(),
  );
  expect(entries.every((entry) => entry.matchdayId === secondDay)).toBe(true);
});

test("supprimer un match emporte sa feuille, ses compositions et son historique", async () => {
  const { t, s, rosters, admin } = await playedMatch();
  await admin.mutation(api.sheets.record, {
    matchId: s.matchId,
    sets: VALID_SETS,
    homeLineup: rosters.home.slice(0, 6),
    awayLineup: rosters.away.slice(0, 6),
  });
  await admin.mutation(api.matches.remove, { matchId: s.matchId });
  const left = await t.run(async (ctx) => ({
    match: await ctx.db.get(s.matchId),
    sheets: await ctx.db.query("matchSheets").collect(),
    lineups: await ctx.db.query("lineupEntries").collect(),
    proposals: await ctx.db.query("slotProposals").collect(),
  }));
  expect(left).toEqual({ match: null, sheets: [], lineups: [], proposals: [] });
});

test("seul l'administrateur corrige, fixe ou supprime un match", async () => {
  at(SLOT_AT - 7 * 86_400_000);
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const manager = t.withIdentity({ subject: s.homeManager });
  await expect(manager.mutation(api.matches.remove, { matchId: s.matchId })).rejects.toThrow(
    /réservée aux administrateurs/,
  );
  await expect(
    manager.mutation(api.negotiation.fixSlot, { matchId: s.matchId, at: SLOT_AT, venue: "G" }),
  ).rejects.toThrow(/réservée aux administrateurs/);
  await expect(
    manager.mutation(api.matches.update, {
      matchId: s.matchId,
      homeTeamId: s.awayTeamId,
      awayTeamId: s.homeTeamId,
    }),
  ).rejects.toThrow(/réservée aux administrateurs/);
});
