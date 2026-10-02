import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import {
  BEFORE_WINDOW,
  insertChampionship,
  modules,
  seedAccount,
  seedRoster,
  SLOT_AT,
} from "./test.setup";

afterEach(() => {
  vi.useRealTimers();
});

const DAY = 86_400_000;
const PLATEAU = { at: SLOT_AT, venue: "Gymnase de Malemort" };

type T = ReturnType<typeof convexTest>;

/**
 * Un championnat féminin au format plateau, dans son propre circuit, avec trois équipes de
 * trois clubs et un administrateur. Aucune journée : chaque test crée la sienne.
 */
async function setupPlateau(t: T) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(BEFORE_WINDOW));
  const admin = await seedAccount(t, {
    email: "comite@ufolep19.fr",
    name: "Comité",
    role: "admin",
  });
  const manager = await seedAccount(t, {
    email: "resp@club-a.fr",
    name: "Responsable A",
    role: "manager",
  });
  const s = await t.run(async (ctx) => {
    const seasonId = await ctx.db.insert("seasons", { label: "2025-2026", isCurrent: true });
    const circuitId = await ctx.db.insert("circuits", { seasonId, name: "Féminin" });
    const championshipId = await insertChampionship(ctx, {
      seasonId,
      circuitId,
      name: "Féminin",
      format: "plateau",
    });
    const teams = [];
    for (const name of ["A", "B", "C"]) {
      const clubId = await ctx.db.insert("clubs", {
        name: `Club ${name}`,
        defaultVenue: `Gymnase ${name}`,
      });
      const teamId = await ctx.db.insert("teams", {
        clubId,
        seasonId,
        championshipId,
        name: `Club ${name} F`,
      });
      teams.push({ clubId, teamId });
    }
    await ctx.db.insert("teamManagers", { teamId: teams[0].teamId, userId: manager });
    return { seasonId, championshipId, teams };
  });
  const asAdmin = t.withIdentity({ subject: admin });
  const rosters = [];
  for (const team of s.teams) {
    rosters.push(await seedRoster(t, { ...team, count: 6 }));
  }
  return { ...s, admin, manager, asAdmin, rosters };
}

async function createPlateauDay(p: Awaited<ReturnType<typeof setupPlateau>>) {
  return await p.asAdmin.mutation(api.matchdays.create, {
    championshipId: p.championshipId,
    number: 1,
    windowStart: SLOT_AT - 12 * 3_600_000,
    windowEnd: SLOT_AT + 4 * 3_600_000,
    plateau: PLATEAU,
  });
}

async function plateauMatch(
  p: Awaited<ReturnType<typeof setupPlateau>>,
  matchdayId: Awaited<ReturnType<typeof createPlateauDay>>,
  home: number,
  away: number,
) {
  const { matchId } = await p.asAdmin.mutation(api.matches.create, {
    matchdayId,
    homeTeamId: p.teams[home].teamId,
    awayTeamId: p.teams[away].teamId,
  });
  return matchId;
}

test("une journée de plateau porte une date et une salle, une journée standard non", async () => {
  const t = convexTest(schema, modules);
  const p = await setupPlateau(t);

  await expect(
    p.asAdmin.mutation(api.matchdays.create, {
      championshipId: p.championshipId,
      number: 1,
      windowStart: SLOT_AT - DAY,
      windowEnd: SLOT_AT + DAY,
    }),
  ).rejects.toThrow(/date, une heure et une salle/i);

  await expect(
    p.asAdmin.mutation(api.matchdays.create, {
      championshipId: p.championshipId,
      number: 1,
      windowStart: SLOT_AT + DAY,
      windowEnd: SLOT_AT + 2 * DAY,
      plateau: PLATEAU,
    }),
  ).rejects.toThrow(/tomber dans sa journée/i);

  const standard = await t.run(async (ctx) =>
    insertChampionship(ctx, { seasonId: p.seasonId, name: "D1" }),
  );
  await expect(
    p.asAdmin.mutation(api.matchdays.create, {
      championshipId: standard,
      number: 1,
      windowStart: SLOT_AT - DAY,
      windowEnd: SLOT_AT + DAY,
      plateau: PLATEAU,
    }),
  ).rejects.toThrow(/format plateau/i);
});

test("un match de plateau naît confirmé, et une équipe peut en jouer plusieurs", async () => {
  const t = convexTest(schema, modules);
  const p = await setupPlateau(t);
  const day = await createPlateauDay(p);

  const first = await plateauMatch(p, day, 0, 1);
  await plateauMatch(p, day, 0, 2);
  await plateauMatch(p, day, 1, 2);

  const match = await t.query(api.matches.get, { matchId: first });
  expect(match).toMatchObject({ state: "confirmed", slot: PLATEAU });
  expect(await t.query(api.matches.listByChampionship, { championshipId: p.championshipId }))
    .toHaveLength(3);
});

test("un plateau ne se négocie pas, ne se reporte pas entre responsables", async () => {
  const t = convexTest(schema, modules);
  const p = await setupPlateau(t);
  const day = await createPlateauDay(p);
  const matchId = await plateauMatch(p, day, 0, 1);
  const asManager = t.withIdentity({ subject: p.manager });

  await expect(
    asManager.mutation(api.negotiation.requestPostponement, { matchId, reason: "Salle prise" }),
  ).rejects.toThrow(/plateau/i);
  await expect(
    p.asAdmin.mutation(api.negotiation.imposePostponement, { matchId, reason: "" }),
  ).rejects.toThrow(/plateau/i);
});

test("le résultat d'un plateau est saisi par l'administrateur, et le match est terminé", async () => {
  const t = convexTest(schema, modules);
  const p = await setupPlateau(t);
  const day = await createPlateauDay(p);
  const matchId = await plateauMatch(p, day, 0, 1);
  vi.setSystemTime(new Date(SLOT_AT + 3_600_000));
  const lineups = {
    homeLineup: p.rosters[0].slice(0, 4),
    awayLineup: p.rosters[1].slice(0, 4),
  };

  // Le responsable n'a pas la main : pas de feuille à transcrire, pas de validation.
  await expect(
    t.withIdentity({ subject: p.manager }).mutation(api.sheets.submit, {
      matchId,
      sets: [
        { home: 25, away: 20 },
        { home: 25, away: 18 },
      ],
      ...lineups,
    }),
  ).rejects.toThrow(/administrateur qui saisit/i);

  // Trois sets : pas un plateau.
  await expect(
    p.asAdmin.mutation(api.sheets.record, {
      matchId,
      sets: [
        { home: 25, away: 20 },
        { home: 20, away: 25 },
        { home: 15, away: 10 },
      ],
      ...lineups,
    }),
  ).rejects.toThrow(/2 sets secs/i);

  await p.asAdmin.mutation(api.sheets.record, {
    matchId,
    sets: [
      { home: 25, away: 20 },
      { home: 25, away: 18 },
    ],
    ...lineups,
  });
  const match = await t.query(api.matches.get, { matchId });
  expect(match).toMatchObject({
    state: "completed",
    result: { winnerTeamId: p.teams[0].teamId, homeSets: 2, awaySets: 0 },
  });
  expect(await t.query(api.sheets.publicResult, { matchId })).toMatchObject({
    homeLineup: expect.arrayContaining([expect.objectContaining({ name: "Joueuse1 Nom1" })]),
  });
});

test("un set partout à égalité de points : match nul, sans vainqueur, au classement", async () => {
  const t = convexTest(schema, modules);
  const p = await setupPlateau(t);
  const day = await createPlateauDay(p);
  const draw = await plateauMatch(p, day, 0, 1);
  const pointsWin = await plateauMatch(p, day, 0, 2);
  vi.setSystemTime(new Date(SLOT_AT + 3_600_000));

  await p.asAdmin.mutation(api.sheets.record, {
    matchId: draw,
    sets: [
      { home: 25, away: 23 },
      { home: 23, away: 25 },
    ],
    homeLineup: p.rosters[0].slice(0, 4),
    awayLineup: p.rosters[1].slice(0, 4),
  });
  // 1-1, mais 48 points contre 40 : victoire aux points de A.
  await p.asAdmin.mutation(api.sheets.record, {
    matchId: pointsWin,
    sets: [
      { home: 25, away: 15 },
      { home: 23, away: 25 },
    ],
    homeLineup: p.rosters[0].slice(0, 4),
    awayLineup: p.rosters[2].slice(0, 4),
  });

  const drawn = await t.query(api.matches.get, { matchId: draw });
  expect(drawn?.result).toMatchObject({ homeSets: 1, awaySets: 1 });
  expect(drawn?.result?.winnerTeamId).toBeUndefined();

  const standings = await t.query(api.standings.byChampionship, {
    championshipId: p.championshipId,
  });
  const row = (index: number) => standings.find((r) => r.teamId === p.teams[index].teamId);
  // A : un nul (1) et une victoire 1-1 aux points (2).
  expect(row(0)).toMatchObject({ played: 2, wins: 1, draws: 1, losses: 0, points: 3 });
  expect(row(1)).toMatchObject({ played: 1, wins: 0, draws: 1, losses: 0, points: 1 });
  // C : défaite 1-1 aux points.
  expect(row(2)).toMatchObject({ played: 1, wins: 0, draws: 0, losses: 1, points: 1 });
});

test("un forfait de plateau se joue sur 2 sets à 25-0", async () => {
  const t = convexTest(schema, modules);
  const p = await setupPlateau(t);
  const day = await createPlateauDay(p);
  const matchId = await plateauMatch(p, day, 0, 1);

  await p.asAdmin.mutation(api.sheets.forfeit, { matchId, forfeitingTeamId: p.teams[1].teamId });
  expect((await t.query(api.matches.get, { matchId }))?.result).toMatchObject({
    winnerTeamId: p.teams[0].teamId,
    homeSets: 2,
    awaySets: 0,
    homePoints: 50,
  });
});

test("un plateau n'attend rien des responsables : il n'est pas « à traiter »", async () => {
  const t = convexTest(schema, modules);
  const p = await setupPlateau(t);
  const day = await createPlateauDay(p);
  await plateauMatch(p, day, 0, 1);
  vi.setSystemTime(new Date(SLOT_AT + 3_600_000));

  const asManager = t.withIdentity({ subject: p.manager });
  expect(await asManager.query(api.matches.myTodo, {})).toEqual([]);
  expect(await asManager.query(api.matches.myTodoCount, {})).toBe(0);
});

test("déplacer un plateau déplace ses matchs non joués", async () => {
  const t = convexTest(schema, modules);
  const p = await setupPlateau(t);
  const day = await createPlateauDay(p);
  const played = await plateauMatch(p, day, 0, 1);
  const pending = await plateauMatch(p, day, 0, 2);
  vi.setSystemTime(new Date(SLOT_AT + 3_600_000));
  await p.asAdmin.mutation(api.sheets.record, {
    matchId: played,
    sets: [
      { home: 25, away: 20 },
      { home: 25, away: 18 },
    ],
    homeLineup: p.rosters[0].slice(0, 4),
    awayLineup: p.rosters[1].slice(0, 4),
  });

  const moved = { at: SLOT_AT + 7 * DAY, venue: "Gymnase du Coiroux" };
  await p.asAdmin.mutation(api.matchdays.updatePlateau, {
    matchdayId: day,
    windowStart: moved.at - 12 * 3_600_000,
    windowEnd: moved.at + 4 * 3_600_000,
    plateau: moved,
  });
  expect((await t.query(api.matches.get, { matchId: pending }))?.slot).toEqual(moved);
  expect((await t.query(api.matches.get, { matchId: played }))?.slot).toEqual(PLATEAU);
});

test("la composition d'une équipe est reprise d'un match à l'autre du même plateau", async () => {
  const t = convexTest(schema, modules);
  const p = await setupPlateau(t);
  const day = await createPlateauDay(p);
  const first = await plateauMatch(p, day, 0, 1);
  const second = await plateauMatch(p, day, 2, 0);
  vi.setSystemTime(new Date(SLOT_AT + 3_600_000));
  await p.asAdmin.mutation(api.sheets.record, {
    matchId: first,
    sets: [
      { home: 25, away: 20 },
      { home: 25, away: 18 },
    ],
    homeLineup: p.rosters[0].slice(0, 5),
    awayLineup: p.rosters[1].slice(0, 4),
  });

  const candidates = await p.asAdmin.query(api.sheets.lineupCandidates, {
    matchId: second,
    teamId: p.teams[0].teamId,
  });
  expect([...candidates.previousOnMatchday].sort()).toEqual([...p.rosters[0].slice(0, 5)].sort());
});
