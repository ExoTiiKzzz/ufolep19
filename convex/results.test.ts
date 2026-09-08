import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import {
  forceConfirmed,
  modules,
  seedBothRosters,
  seedRoster,
  setupChampionship,
  SLOT_AT,
  VALID_SETS,
  WINDOW_END,
  WINDOW_START,
} from "./test.setup";

afterEach(() => {
  vi.useRealTimers();
});

/** Joue le match du helper jusqu'à son terme et rend le contexte. */
async function completedMatch(t: ReturnType<typeof convexTest>) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(SLOT_AT - 7 * 86_400_000));
  const s = await setupChampionship(t);
  const rosters = await seedBothRosters(t, s);
  await forceConfirmed(t, { matchId: s.matchId, proposedBy: s.homeManager });
  vi.setSystemTime(new Date(SLOT_AT + 3_600_000));
  await t.withIdentity({ subject: s.homeManager }).mutation(api.sheets.submit, {
    matchId: s.matchId,
    sets: VALID_SETS,
    homeLineup: rosters.home.slice(0, 6),
    awayLineup: rosters.away.slice(0, 6),
  });
  await t
    .withIdentity({ subject: s.awayManager })
    .mutation(api.sheets.validate, { matchId: s.matchId });
  return { s, rosters };
}

test("seuls les matchs terminés entrent au classement", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(SLOT_AT - 7 * 86_400_000));
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);

  const before = await t.query(api.standings.byChampionship, {
    championshipId: s.championshipId,
  });
  expect(before.map((row) => [row.teamName, row.played, row.points])).toEqual([
    ["Club A 1", 0, 0],
    ["Club B 1", 0, 0],
  ]);
  // Rien ne les sépare : elles sont ex aequo, pas ordonnées arbitrairement.
  expect(before.map((row) => row.rank)).toEqual([1, 1]);
});

test("un match terminé 3-1 donne 3 points au vainqueur et 0 au perdant", async () => {
  const t = convexTest(schema, modules);
  const { s } = await completedMatch(t);

  const standings = await t.query(api.standings.byChampionship, {
    championshipId: s.championshipId,
  });
  expect(standings.map((row) => [row.teamName, row.points, row.rank])).toEqual([
    ["Club A 1", 3, 1],
    ["Club B 1", 0, 2],
  ]);
  expect(standings[0]).toMatchObject({
    played: 1,
    wins: 1,
    setsWon: 3,
    setsLost: 1,
    pointsFor: 93,
    pointsAgainst: 86,
  });
});

test("un forfait entre au classement comme un 3-0, sans cas particulier", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(SLOT_AT - 7 * 86_400_000));
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);

  await t
    .withIdentity({ subject: s.admin })
    .mutation(api.sheets.forfeit, { matchId: s.matchId, forfeitingTeamId: s.awayTeamId });

  const standings = await t.query(api.standings.byChampionship, {
    championshipId: s.championshipId,
  });
  expect(standings.map((row) => [row.teamName, row.points, row.setsWon, row.pointsFor])).toEqual([
    ["Club A 1", 3, 3, 75],
    ["Club B 1", 0, 0, 0],
  ]);
});

test("le classement est lisible sans compte", async () => {
  const t = convexTest(schema, modules);
  const { s } = await completedMatch(t);

  const standings = await t.query(api.standings.byChampionship, {
    championshipId: s.championshipId,
  });
  expect(standings).toHaveLength(2);
});

test("les listes publiques ne renvoient pas de nom de joueur", async () => {
  // La feuille d'un match terminé est la seule exception, délibérée (ADR-0004) : elle est
  // couverte par ses propres tests plus bas. Les listes, elles, restent anonymes.
  const t = convexTest(schema, modules);
  const { s, rosters } = await completedMatch(t);
  const playerName = await t.run(async (ctx) => {
    const player = await ctx.db.get(rosters.home[0]);
    return player === null ? "" : player.lastName;
  });
  expect(playerName).not.toBe("");

  const publicPayloads = JSON.stringify([
    await t.query(api.seasons.list, {}),
    await t.query(api.championships.listBySeason, { seasonId: s.seasonId }),
    await t.query(api.teams.listByChampionship, { championshipId: s.championshipId }),
    await t.query(api.matchdays.listByChampionship, { championshipId: s.championshipId }),
    await t.query(api.matches.listByChampionship, { championshipId: s.championshipId }),
    await t.query(api.matches.get, { matchId: s.matchId }),
    await t.query(api.standings.byChampionship, { championshipId: s.championshipId }),
  ]);

  expect(publicPayloads).not.toContain(playerName);
});

test("le calendrier public montre le créneau ferme et signale ceux qui manquent", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(SLOT_AT - 7 * 86_400_000));
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const secondMatch = await t.run(async (ctx) =>
    ctx.db.insert("matches", {
      championshipId: s.championshipId,
      matchdayId: s.matchdayId,
      homeTeamId: s.awayTeamId,
      awayTeamId: s.homeTeamId,
      state: "planned",
    }),
  );
  await forceConfirmed(t, { matchId: s.matchId, proposedBy: s.homeManager });

  const matches = await t.query(api.matches.listByChampionship, {
    championshipId: s.championshipId,
  });
  const withSlot = matches.find((match) => match._id === s.matchId);
  const withoutSlot = matches.find((match) => match._id === secondMatch);
  expect(withSlot?.slot).toEqual({ at: SLOT_AT, venue: "Gymnase du Coiroux" });
  expect(withoutSlot?.slot).toBeUndefined();
  expect(withoutSlot?.state).toBe("planned");
});

test("les matchs sans créneau dont la fenêtre se termine sont remontés à l'administrateur", async () => {
  vi.useFakeTimers();
  // Trois jours avant la fin de la fenêtre, aucun créneau n'est ferme.
  vi.setSystemTime(new Date(WINDOW_END - 3 * 86_400_000));
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);

  const overdue = await t.withIdentity({ subject: s.admin }).query(api.adminViews.overdueSlots, {});
  expect(overdue).toHaveLength(1);
  expect(overdue[0].windowClosed).toBe(false);
  expect(overdue[0].managers.sort()).toEqual(["Responsable Club A", "Responsable Club B"]);

  // Après la fin de la fenêtre, le match est signalé comme hors délai.
  vi.setSystemTime(new Date(WINDOW_END + 86_400_000));
  const late = await t.withIdentity({ subject: s.admin }).query(api.adminViews.overdueSlots, {});
  expect(late[0].windowClosed).toBe(true);
});

test("un match dont la fenêtre est encore loin n'encombre pas la vue", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(WINDOW_START - 30 * 86_400_000));
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);

  expect(
    await t.withIdentity({ subject: s.admin }).query(api.adminViews.overdueSlots, {}),
  ).toHaveLength(0);
});

test("les matchs bloqués sont classés par motif", async () => {
  const t = convexTest(schema, modules);
  vi.useFakeTimers();
  vi.setSystemTime(new Date(SLOT_AT - 7 * 86_400_000));
  const s = await setupChampionship(t);
  await forceConfirmed(t, { matchId: s.matchId, proposedBy: s.homeManager });

  // Le match est joué mais personne n'a saisi la feuille.
  vi.setSystemTime(new Date(SLOT_AT + 2 * 86_400_000));
  const stalled = await t.withIdentity({ subject: s.admin }).query(api.adminViews.stalled, {});
  expect(stalled.map((row) => row.reason)).toEqual(["sheetMissing"]);

  const rosters = await seedBothRosters(t, s);
  await t.withIdentity({ subject: s.homeManager }).mutation(api.sheets.submit, {
    matchId: s.matchId,
    sets: VALID_SETS,
    homeLineup: rosters.home.slice(0, 6),
    awayLineup: rosters.away.slice(0, 6),
  });
  expect(
    (await t.withIdentity({ subject: s.admin }).query(api.adminViews.stalled, {})).map(
      (row) => row.reason,
    ),
  ).toEqual(["sheetPending"]);

  await t.withIdentity({ subject: s.awayManager }).mutation(api.sheets.dispute, {
    matchId: s.matchId,
    reason: "Score faux.",
  });
  expect(
    (await t.withIdentity({ subject: s.admin }).query(api.adminViews.stalled, {})).map(
      (row) => row.reason,
    ),
  ).toEqual(["disputed"]);
});

test("un joueur aligné pour deux équipes la même journée est remonté sans être bloqué", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(SLOT_AT - 7 * 86_400_000));
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);

  // Deuxième équipe du même club, engagée dans le même championnat, et un joueur commun.
  const { secondTeam, secondMatch } = await t.run(async (ctx) => {
    const secondTeam = await ctx.db.insert("teams", {
      clubId: s.homeClubId,
      seasonId: s.seasonId,
      championshipId: s.championshipId,
      name: "Club A 2",
    });
    const secondMatch = await ctx.db.insert("matches", {
      championshipId: s.championshipId,
      matchdayId: s.matchdayId,
      homeTeamId: secondTeam,
      awayTeamId: s.awayTeamId,
      state: "planned",
    });
    return { secondTeam, secondMatch };
  });
  const [player] = await seedRoster(t, {
    teamId: s.homeTeamId,
    clubId: s.homeClubId,
    count: 1,
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("rosterEntries", { teamId: secondTeam, playerId: player });
    // Les deux compositions de la même journée alignent le même joueur.
    await ctx.db.insert("lineupEntries", {
      matchId: s.matchId,
      matchdayId: s.matchdayId,
      teamId: s.homeTeamId,
      playerId: player,
    });
    await ctx.db.insert("lineupEntries", {
      matchId: secondMatch,
      matchdayId: s.matchdayId,
      teamId: secondTeam,
      playerId: player,
    });
  });

  const overlaps = await t
    .withIdentity({ subject: s.admin })
    .query(api.adminViews.playerOverlaps, { championshipId: s.championshipId });
  expect(overlaps).toHaveLength(1);
  expect(overlaps[0]).toMatchObject({ matchdayNumber: 1, teams: ["Club A 1", "Club A 2"] });
});

test("un joueur aligné sur deux journées différentes n'est pas un cumul", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(SLOT_AT - 7 * 86_400_000));
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const [player] = await seedRoster(t, {
    teamId: s.homeTeamId,
    clubId: s.homeClubId,
    count: 1,
  });

  await t.run(async (ctx) => {
    const secondDay = await ctx.db.insert("matchdays", {
      championshipId: s.championshipId,
      number: 2,
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
    });
    const secondMatch = await ctx.db.insert("matches", {
      championshipId: s.championshipId,
      matchdayId: secondDay,
      homeTeamId: s.homeTeamId,
      awayTeamId: s.awayTeamId,
      state: "planned",
    });
    await ctx.db.insert("lineupEntries", {
      matchId: s.matchId,
      matchdayId: s.matchdayId,
      teamId: s.homeTeamId,
      playerId: player,
    });
    await ctx.db.insert("lineupEntries", {
      matchId: secondMatch,
      matchdayId: secondDay,
      teamId: s.homeTeamId,
      playerId: player,
    });
  });

  expect(
    await t
      .withIdentity({ subject: s.admin })
      .query(api.adminViews.playerOverlaps, { championshipId: s.championshipId }),
  ).toHaveLength(0);
});

test("les vues de contrôle sont réservées à l'administrateur", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(SLOT_AT - 7 * 86_400_000));
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const asManager = t.withIdentity({ subject: s.homeManager });

  await expect(asManager.query(api.adminViews.overdueSlots, {})).rejects.toThrow(
    /réservée aux administrateurs/i,
  );
  await expect(asManager.query(api.adminViews.stalled, {})).rejects.toThrow(
    /réservée aux administrateurs/i,
  );
  await expect(
    asManager.query(api.adminViews.playerOverlaps, { championshipId: s.championshipId }),
  ).rejects.toThrow(/réservée aux administrateurs/i);
  await expect(asManager.query(api.adminViews.progress, {})).rejects.toThrow(
    /réservée aux administrateurs/i,
  );
});

test("l'avancement de chaque championnat de la saison courante est chiffré", async () => {
  const t = convexTest(schema, modules);
  const { s } = await completedMatch(t);

  const progress = await t.withIdentity({ subject: s.admin }).query(api.adminViews.progress, {});
  expect(progress).toEqual([
    {
      championshipId: s.championshipId,
      championshipName: "Départemental mixte",
      total: 1,
      completed: 1,
      negotiating: 0,
      confirmed: 0,
      disputed: 0,
    },
  ]);
});

test("la feuille d'un match terminé est lisible sans compte, sets et noms compris", async () => {
  const t = convexTest(schema, modules);
  const { s, rosters } = await completedMatch(t);
  const firstName = await t.run(async (ctx) => {
    const player = await ctx.db.get(rosters.home[0]);
    return player === null ? "" : `${player.firstName} ${player.lastName}`;
  });

  // Aucun `withIdentity` : c'est bien la lecture d'un visiteur anonyme.
  const sheet = await t.query(api.sheets.publicResult, { matchId: s.matchId });

  expect(sheet?.sets).toEqual(VALID_SETS);
  expect(sheet?.isForfeit).toBe(false);
  expect(sheet?.homeLineup).toHaveLength(6);
  expect(sheet?.homeLineup.map((player) => player.name)).toContain(firstName);
  expect(sheet?.awayLineup).toHaveLength(6);
});

test("la feuille d'un match non terminé n'est pas publique", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(SLOT_AT - 7 * 86_400_000));
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const rosters = await seedBothRosters(t, s);
  await forceConfirmed(t, { matchId: s.matchId, proposedBy: s.homeManager });

  // Créneau confirmé, match pas encore joué.
  expect(await t.query(api.sheets.publicResult, { matchId: s.matchId })).toBeNull();

  // Feuille saisie mais pas encore validée : le score peut encore changer.
  vi.setSystemTime(new Date(SLOT_AT + 3_600_000));
  await t.withIdentity({ subject: s.homeManager }).mutation(api.sheets.submit, {
    matchId: s.matchId,
    sets: VALID_SETS,
    homeLineup: rosters.home.slice(0, 6),
    awayLineup: rosters.away.slice(0, 6),
  });
  expect(await t.query(api.sheets.publicResult, { matchId: s.matchId })).toBeNull();

  // Contestée : encore moins.
  await t.withIdentity({ subject: s.awayManager }).mutation(api.sheets.dispute, {
    matchId: s.matchId,
    reason: "Score faux.",
  });
  expect(await t.query(api.sheets.publicResult, { matchId: s.matchId })).toBeNull();

  // Une fois le litige tranché, elle devient publique.
  await t.withIdentity({ subject: s.admin }).mutation(api.sheets.settleDispute, {
    matchId: s.matchId,
    sets: VALID_SETS,
  });
  expect(await t.query(api.sheets.publicResult, { matchId: s.matchId })).not.toBeNull();
});

test("la feuille publique ne dit rien du déroulé administratif", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(SLOT_AT - 7 * 86_400_000));
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const rosters = await seedBothRosters(t, s);
  await forceConfirmed(t, { matchId: s.matchId, proposedBy: s.homeManager });
  vi.setSystemTime(new Date(SLOT_AT + 3_600_000));
  await t.withIdentity({ subject: s.homeManager }).mutation(api.sheets.submit, {
    matchId: s.matchId,
    sets: VALID_SETS,
    homeLineup: rosters.home.slice(0, 6),
    awayLineup: rosters.away.slice(0, 6),
  });
  await t.withIdentity({ subject: s.awayManager }).mutation(api.sheets.dispute, {
    matchId: s.matchId,
    reason: "Le troisième set s'est terminé 25-27.",
  });
  await t
    .withIdentity({ subject: s.admin })
    .mutation(api.sheets.settleDispute, { matchId: s.matchId, sets: VALID_SETS });

  const payload = JSON.stringify(
    await t.query(api.sheets.publicResult, { matchId: s.matchId }),
  );
  expect(payload).not.toContain("25-27");
  expect(payload).not.toContain("submittedBy");
  expect(payload).not.toContain("deadline");
});

test("un forfait est publié sans composition", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(SLOT_AT - 7 * 86_400_000));
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  await t
    .withIdentity({ subject: s.admin })
    .mutation(api.sheets.forfeit, { matchId: s.matchId, forfeitingTeamId: s.awayTeamId });

  const sheet = await t.query(api.sheets.publicResult, { matchId: s.matchId });
  expect(sheet).toMatchObject({ isForfeit: true, homeLineup: [], awayLineup: [] });
  expect(sheet?.sets).toEqual([
    { home: 25, away: 0 },
    { home: 25, away: 0 },
    { home: 25, away: 0 },
  ]);
});
