import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  BEFORE_WINDOW,
  insertChampionship,
  modules,
  seedBothRosters,
  seedRoster,
  setupChampionship,
  SLOT_AT,
  VALID_SETS,
} from "./test.setup";

afterEach(() => {
  vi.useRealTimers();
});

const DAY = 86_400_000;

type T = ReturnType<typeof convexTest>;

/**
 * Le championnat semé (niveau 1, circuit principal) et, dans le même circuit, une D2 où le
 * club receveur engage « Club A 2 ». Le joueur de sa feuille verte est le renfort type.
 */
async function withLowerTeam(t: T) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(BEFORE_WINDOW));
  const s = await setupChampionship(t);
  const rosters = await seedBothRosters(t, s);
  const lowerTeam = await t.run(async (ctx) => {
    const d2 = await insertChampionship(ctx, { seasonId: s.seasonId, name: "D2", level: 2 });
    return await ctx.db.insert("teams", {
      clubId: s.homeClubId,
      seasonId: s.seasonId,
      championshipId: d2,
      name: "Club A 2",
    });
  });
  const [reinforcement] = await seedRoster(t, {
    teamId: lowerTeam,
    clubId: s.homeClubId,
    count: 1,
  });
  return { s, rosters, lowerTeam, reinforcement };
}

/** Un match confirmé du championnat semé, au créneau donné. */
async function confirmedMatch(
  t: T,
  s: Awaited<ReturnType<typeof setupChampionship>>,
  at: number,
  championshipId = s.championshipId,
  matchdayId = s.matchdayId,
  teams = { home: s.homeTeamId, away: s.awayTeamId },
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("matches", {
      championshipId,
      matchdayId,
      homeTeamId: teams.home,
      awayTeamId: teams.away,
      state: "confirmed",
      slot: { at, venue: "Gymnase du Coiroux" },
    }),
  );
}

async function homeLineupInfo(
  t: T,
  managerId: Id<"users">,
  matchId: Id<"matches">,
  playerId: Id<"players">,
) {
  const sheet = await t.withIdentity({ subject: managerId }).query(api.sheets.get, { matchId });
  return sheet?.homeLineup.find((player) => player._id === playerId)?.reinforcement;
}

test("un renfort venu de D2 est accepté, et classé comme montant", async () => {
  const t = convexTest(schema, modules);
  const { s, rosters, reinforcement } = await withLowerTeam(t);
  const matchId = await confirmedMatch(t, s, SLOT_AT);
  vi.setSystemTime(new Date(SLOT_AT + 3_600_000));

  await t.withIdentity({ subject: s.homeManager }).mutation(api.sheets.submit, {
    matchId,
    sets: VALID_SETS,
    homeLineup: [reinforcement, ...rosters.home.slice(0, 5)],
    awayLineup: rosters.away.slice(0, 6),
  });

  expect(await homeLineupInfo(t, s.homeManager, matchId, reinforcement)).toEqual({
    kind: "upward",
    flags: [],
    upperMatchNumber: 1,
    originTeamName: "Club A 2",
  });
  expect(await homeLineupInfo(t, s.homeManager, matchId, rosters.home[0])).toMatchObject({
    kind: "own",
    flags: [],
  });
});

test("le 4e match au-dessus de son niveau est signalé, dans l'ordre des dates de match", async () => {
  const t = convexTest(schema, modules);
  const { s, rosters, reinforcement } = await withLowerTeam(t);
  const matches = [];
  for (let day = 0; day < 4; day++) {
    matches.push(await confirmedMatch(t, s, SLOT_AT + day * DAY));
  }
  vi.setSystemTime(new Date(SLOT_AT + 5 * DAY));

  // Le dernier match en date est saisi le premier : c'est pourtant lui le 4e.
  const asHome = t.withIdentity({ subject: s.homeManager });
  for (const matchId of [matches[3], matches[0], matches[1], matches[2]]) {
    await asHome.mutation(api.sheets.submit, {
      matchId,
      sets: VALID_SETS,
      homeLineup: [reinforcement, ...rosters.home.slice(0, 5)],
      awayLineup: rosters.away.slice(0, 6),
    });
  }

  const numbers = [];
  for (const matchId of matches) {
    numbers.push(await homeLineupInfo(t, s.homeManager, matchId, reinforcement));
  }
  expect(numbers.map((info) => [info?.upperMatchNumber, info?.flags])).toEqual([
    [1, []],
    [2, []],
    [3, []],
    [4, ["upperLimit"]],
  ]);

  // Le comité le retrouve dans sa vue de contrôle.
  const flags = await t
    .withIdentity({ subject: s.admin })
    .query(api.adminViews.reinforcementFlags, { championshipId: s.championshipId });
  expect(flags).toEqual([
    expect.objectContaining({
      matchId: matches[3],
      playerId: reinforcement,
      originTeamName: "Club A 2",
      messages: [expect.stringMatching(/4ᵉ match au-dessus de son niveau/)],
    }),
  ]);
});

test("une descente et un joueur sans feuille verte sont signalés, jamais refusés", async () => {
  const t = convexTest(schema, modules);
  const { s, rosters, lowerTeam } = await withLowerTeam(t);
  // Match de D2 : Club A 2 reçoit une équipe du club B engagée en D2.
  const { d2, d2Day, awayD2 } = await t.run(async (ctx) => {
    const lower = await ctx.db.get(lowerTeam);
    const d2Day = await ctx.db.insert("matchdays", {
      championshipId: lower!.championshipId,
      number: 1,
      windowStart: SLOT_AT - DAY,
      windowEnd: SLOT_AT + DAY,
    });
    const awayD2 = await ctx.db.insert("teams", {
      clubId: s.awayClubId,
      seasonId: s.seasonId,
      championshipId: lower!.championshipId,
      name: "Club B 2",
    });
    await ctx.db.insert("teamManagers", { teamId: lowerTeam, userId: s.homeManager });
    return { d2: lower!.championshipId, d2Day, awayD2 };
  });
  const [unregistered] = await t.run(async (ctx) => {
    const playerId = await ctx.db.insert("players", {
      clubId: s.homeClubId,
      firstName: "Sans",
      lastName: "Feuille",
    });
    await ctx.db.insert("licenses", {
      playerId,
      number: "L-SANS",
      validFrom: SLOT_AT - 100 * DAY,
      validUntil: SLOT_AT + 100 * DAY,
    });
    return [playerId];
  });
  const matchId = await confirmedMatch(t, s, SLOT_AT, d2, d2Day, {
    home: lowerTeam,
    away: awayD2,
  });
  vi.setSystemTime(new Date(SLOT_AT + 3_600_000));

  // Un joueur de D1 descend en D2, un autre n'a aucune feuille verte : la feuille passe.
  await t.withIdentity({ subject: s.homeManager }).mutation(api.sheets.submit, {
    matchId,
    sets: VALID_SETS,
    homeLineup: [rosters.home[0], unregistered],
    awayLineup: rosters.away.slice(0, 6),
  });

  expect(await homeLineupInfo(t, s.homeManager, matchId, rosters.home[0])).toMatchObject({
    kind: "downward",
    flags: ["downward"],
  });
  expect(await homeLineupInfo(t, s.homeManager, matchId, unregistered)).toMatchObject({
    kind: "noRoster",
    flags: ["noRoster"],
  });
});

test("le mixte admet 2 renforts de D1/D2 pour compléter à 6, et signale au-delà", async () => {
  const t = convexTest(schema, modules);
  const { s, rosters } = await withLowerTeam(t);
  const mixte = await t.run(async (ctx) => {
    const championshipId = await insertChampionship(ctx, {
      seasonId: s.seasonId,
      name: "Mixte",
      level: 3,
      reinforcementQuota: { maxPlayers: 2, completeTo: 6 },
    });
    const matchdayId = await ctx.db.insert("matchdays", {
      championshipId,
      number: 1,
      windowStart: SLOT_AT - DAY,
      windowEnd: SLOT_AT + 3 * DAY,
    });
    const home = await ctx.db.insert("teams", {
      clubId: s.homeClubId,
      seasonId: s.seasonId,
      championshipId,
      name: "Club A Mixte",
    });
    const away = await ctx.db.insert("teams", {
      clubId: s.awayClubId,
      seasonId: s.seasonId,
      championshipId,
      name: "Club B Mixte",
    });
    await ctx.db.insert("teamManagers", { teamId: home, userId: s.homeManager });
    return { championshipId, matchdayId, home, away };
  });
  const mixtePlayers = await seedRoster(t, { teamId: mixte.home, clubId: s.homeClubId, count: 5 });
  const awayPlayers = await seedRoster(t, { teamId: mixte.away, clubId: s.awayClubId, count: 6 });
  const teams = { home: mixte.home, away: mixte.away };
  const withinQuota = await confirmedMatch(t, s, SLOT_AT, mixte.championshipId, mixte.matchdayId, teams);
  const overQuota = await confirmedMatch(
    t,
    s,
    SLOT_AT + DAY,
    mixte.championshipId,
    mixte.matchdayId,
    teams,
  );
  vi.setSystemTime(new Date(SLOT_AT + 2 * DAY));
  const asHome = t.withIdentity({ subject: s.homeManager });

  // 4 joueurs du mixte + 2 de D1 : 6, dans le quota.
  await asHome.mutation(api.sheets.submit, {
    matchId: withinQuota,
    sets: VALID_SETS,
    homeLineup: [...mixtePlayers.slice(0, 4), rosters.home[0], rosters.home[1]],
    awayLineup: awayPlayers,
  });
  // 5 joueurs du mixte + 2 de D1 : 7, au-delà du total à compléter.
  await asHome.mutation(api.sheets.submit, {
    matchId: overQuota,
    sets: VALID_SETS,
    homeLineup: [...mixtePlayers, rosters.home[0], rosters.home[1]],
    awayLineup: awayPlayers,
  });

  expect(await homeLineupInfo(t, s.homeManager, withinQuota, rosters.home[0])).toMatchObject({
    kind: "downward",
    flags: [],
  });
  expect(await homeLineupInfo(t, s.homeManager, overQuota, rosters.home[0])).toMatchObject({
    kind: "downward",
    flags: ["quotaExceeded"],
  });
});

test("les licenciés alignables couvrent tout le club, feuille verte en tête", async () => {
  const t = convexTest(schema, modules);
  const { s, reinforcement } = await withLowerTeam(t);
  const matchId = await confirmedMatch(t, s, SLOT_AT);

  const candidates = await t
    .withIdentity({ subject: s.homeManager })
    .query(api.sheets.lineupCandidates, { matchId, teamId: s.homeTeamId });
  expect(candidates.context).toEqual({ teamId: s.homeTeamId, level: 1, quota: null });
  expect(candidates.players).toHaveLength(9);
  expect(candidates.players.slice(0, 8).every((p) => p.originTeamId === s.homeTeamId)).toBe(true);
  expect(candidates.players[8]).toMatchObject({
    _id: reinforcement,
    originTeamName: "Club A 2",
    originLevel: 2,
    upperMatchesBefore: 0,
  });
});

test("la liste des licenciés alignables est réservée aux équipes du match", async () => {
  const t = convexTest(schema, modules);
  const { s } = await withLowerTeam(t);
  const matchId = await confirmedMatch(t, s, SLOT_AT);

  await expect(
    t.query(api.sheets.lineupCandidates, { matchId, teamId: s.homeTeamId }),
  ).rejects.toThrow(/authentification requise/i);
});

test("la feuille publique ne dit rien des renforts", async () => {
  const t = convexTest(schema, modules);
  const { s, rosters, reinforcement } = await withLowerTeam(t);
  const matchId = await confirmedMatch(t, s, SLOT_AT);
  vi.setSystemTime(new Date(SLOT_AT + 3_600_000));
  await t.withIdentity({ subject: s.homeManager }).mutation(api.sheets.submit, {
    matchId,
    sets: VALID_SETS,
    homeLineup: [reinforcement, ...rosters.home.slice(0, 5)],
    awayLineup: rosters.away.slice(0, 6),
  });
  await t.withIdentity({ subject: s.awayManager }).mutation(api.sheets.validate, { matchId });

  const sheet = await t.query(api.sheets.publicResult, { matchId });
  expect(Object.keys(sheet!.homeLineup[0]).sort()).toEqual(["_id", "name"]);
});
