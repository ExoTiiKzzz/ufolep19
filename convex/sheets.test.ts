import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";

import { TACIT_DELAY_MS } from "../lib/rules/tacit";
import { api } from "./_generated/api";
import schema from "./schema";
import {
  forceConfirmed,
  modules,
  seedBothRosters,
  SLOT_AT,
  setupChampionship,
  VALID_SETS,
} from "./test.setup";

afterEach(() => {
  vi.useRealTimers();
});

/** Un match confirmé, effectifs constitués, horloge posée après l'heure du match. */
async function playedMatch(t: ReturnType<typeof convexTest>, offset = 2 * 3_600_000) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(SLOT_AT - 7 * 86_400_000));
  const s = await setupChampionship(t);
  const rosters = await seedBothRosters(t, s);
  await forceConfirmed(t, { matchId: s.matchId, proposedBy: s.homeManager });
  vi.setSystemTime(new Date(SLOT_AT + offset));
  return { s, rosters };
}

test("la saisie n'ouvre qu'à l'heure du match", async () => {
  const t = convexTest(schema, modules);
  const { s, rosters } = await playedMatch(t, -3_600_000);

  await expect(
    t.withIdentity({ subject: s.homeManager }).mutation(api.sheets.submit, {
      matchId: s.matchId,
      sets: VALID_SETS,
      homeLineup: rosters.home.slice(0, 6),
      awayLineup: rosters.away.slice(0, 6),
    }),
  ).rejects.toThrow(/n'a pas encore eu lieu/i);
});

test("le receveur saisit, le visiteur valide, le match entre au classement", async () => {
  const t = convexTest(schema, modules);
  const { s, rosters } = await playedMatch(t);

  const { tacitDeadline } = await t
    .withIdentity({ subject: s.homeManager })
    .mutation(api.sheets.submit, {
      matchId: s.matchId,
      sets: VALID_SETS,
      homeLineup: rosters.home.slice(0, 6),
      awayLineup: rosters.away.slice(0, 6),
    });
  expect(tacitDeadline).toBe(SLOT_AT + 2 * 3_600_000 + TACIT_DELAY_MS);
  expect((await t.query(api.matches.get, { matchId: s.matchId }))?.state).toBe("awaitingSheet");

  await t
    .withIdentity({ subject: s.awayManager })
    .mutation(api.sheets.validate, { matchId: s.matchId });

  const match = await t.query(api.matches.get, { matchId: s.matchId });
  expect(match?.state).toBe("completed");
  expect(match?.result).toMatchObject({
    winnerTeamId: s.homeTeamId,
    homeSets: 3,
    awaySets: 1,
    homePoints: 93,
    awayPoints: 86,
  });
});

test("un score impossible est refusé en nommant la règle et le set", async () => {
  const t = convexTest(schema, modules);
  const { s, rosters } = await playedMatch(t);

  await expect(
    t.withIdentity({ subject: s.homeManager }).mutation(api.sheets.submit, {
      matchId: s.matchId,
      sets: [
        { home: 25, away: 20 },
        { home: 25, away: 24 },
        { home: 25, away: 22 },
      ],
      homeLineup: rosters.home.slice(0, 6),
      awayLineup: rosters.away.slice(0, 6),
    }),
  ).rejects.toThrow(/Set 2 .*écart doit être d'au moins 2 points/i);
});

test("le receveur n'a pas la main pour valider : elle revient au visiteur", async () => {
  const t = convexTest(schema, modules);
  const { s, rosters } = await playedMatch(t);
  const asHome = t.withIdentity({ subject: s.homeManager });
  await asHome.mutation(api.sheets.submit, {
    matchId: s.matchId,
    sets: VALID_SETS,
    homeLineup: rosters.home.slice(0, 6),
    awayLineup: rosters.away.slice(0, 6),
  });

  await expect(asHome.mutation(api.sheets.validate, { matchId: s.matchId })).rejects.toThrow(
    /pas la main pour valider la feuille/i,
  );
});

test("un responsable des deux équipes ne valide pas sa propre feuille", async () => {
  const t = convexTest(schema, modules);
  const { s, rosters } = await playedMatch(t);
  await t
    .withIdentity({ subject: s.admin })
    .mutation(api.teams.addManager, { teamId: s.awayTeamId, userId: s.homeManager });
  const asHome = t.withIdentity({ subject: s.homeManager });
  await asHome.mutation(api.sheets.submit, {
    matchId: s.matchId,
    sets: VALID_SETS,
    homeLineup: rosters.home.slice(0, 6),
    awayLineup: rosters.away.slice(0, 6),
  });

  // Il tient les deux bouts du match : le cycle de vie l'autorise comme visiteur, mais la
  // règle « on ne valide pas sa propre soumission » reprend la main.
  await expect(asHome.mutation(api.sheets.validate, { matchId: s.matchId })).rejects.toThrow(
    /votre propre feuille/i,
  );

  // La validation revient alors à l'administrateur.
  await t
    .withIdentity({ subject: s.admin })
    .mutation(api.sheets.validate, { matchId: s.matchId });
  expect((await t.query(api.matches.get, { matchId: s.matchId }))?.state).toBe("completed");
});

test("une composition de plus de 12 joueurs est refusée", async () => {
  const t = convexTest(schema, modules);
  vi.useFakeTimers();
  vi.setSystemTime(new Date(SLOT_AT - 7 * 86_400_000));
  const s = await setupChampionship(t);
  const rosters = await seedBothRosters(t, s, 14);
  await forceConfirmed(t, { matchId: s.matchId, proposedBy: s.homeManager });
  vi.setSystemTime(new Date(SLOT_AT + 3_600_000));

  await expect(
    t.withIdentity({ subject: s.homeManager }).mutation(api.sheets.submit, {
      matchId: s.matchId,
      sets: VALID_SETS,
      homeLineup: rosters.home.slice(0, 13),
      awayLineup: rosters.away.slice(0, 6),
    }),
  ).rejects.toThrow(/12 joueurs au maximum/i);
});

test("une composition vide est refusée : ce n'est pas un sous-effectif", async () => {
  const t = convexTest(schema, modules);
  const { s, rosters } = await playedMatch(t);

  await expect(
    t.withIdentity({ subject: s.homeManager }).mutation(api.sheets.submit, {
      matchId: s.matchId,
      sets: VALID_SETS,
      homeLineup: rosters.home.slice(0, 6),
      awayLineup: [],
    }),
  ).rejects.toThrow(/vide/i);
});

test("une équipe venue à cinq est enregistrée telle quelle", async () => {
  const t = convexTest(schema, modules);
  const { s, rosters } = await playedMatch(t);

  await t.withIdentity({ subject: s.homeManager }).mutation(api.sheets.submit, {
    matchId: s.matchId,
    sets: VALID_SETS,
    homeLineup: rosters.home.slice(0, 6),
    awayLineup: rosters.away.slice(0, 5),
  });

  const sheet = await t
    .withIdentity({ subject: s.awayManager })
    .query(api.sheets.get, { matchId: s.matchId });
  expect(sheet?.awayLineup).toHaveLength(5);
});

test("un joueur hors de l'effectif est refusé", async () => {
  const t = convexTest(schema, modules);
  const { s, rosters } = await playedMatch(t);

  await expect(
    t.withIdentity({ subject: s.homeManager }).mutation(api.sheets.submit, {
      matchId: s.matchId,
      sets: VALID_SETS,
      homeLineup: [rosters.away[0], ...rosters.home.slice(0, 5)],
      awayLineup: rosters.away.slice(0, 6),
    }),
  ).rejects.toThrow(/n'appartient pas à l'effectif/i);
});

test("le même joueur dans les deux compositions du match est refusé", async () => {
  const t = convexTest(schema, modules);
  vi.useFakeTimers();
  vi.setSystemTime(new Date(SLOT_AT - 7 * 86_400_000));
  const s = await setupChampionship(t);
  const rosters = await seedBothRosters(t, s);
  // Le joueur est inscrit dans les deux effectifs : cas limite, seule la feuille le bloque.
  await t.run(async (ctx) => {
    await ctx.db.insert("rosterEntries", {
      teamId: s.awayTeamId,
      playerId: rosters.home[0],
    });
  });
  await forceConfirmed(t, { matchId: s.matchId, proposedBy: s.homeManager });
  vi.setSystemTime(new Date(SLOT_AT + 3_600_000));

  await expect(
    t.withIdentity({ subject: s.homeManager }).mutation(api.sheets.submit, {
      matchId: s.matchId,
      sets: VALID_SETS,
      homeLineup: rosters.home.slice(0, 6),
      awayLineup: [rosters.home[0], ...rosters.away.slice(0, 5)],
    }),
  ).rejects.toThrow(/deux compositions/i);
});

test("un joueur deux fois dans la même composition est refusé", async () => {
  const t = convexTest(schema, modules);
  const { s, rosters } = await playedMatch(t);

  await expect(
    t.withIdentity({ subject: s.homeManager }).mutation(api.sheets.submit, {
      matchId: s.matchId,
      sets: VALID_SETS,
      homeLineup: [rosters.home[0], rosters.home[0], rosters.home[1]],
      awayLineup: rosters.away.slice(0, 6),
    }),
  ).rejects.toThrow(/figure deux fois/i);
});

test("une feuille contestée part en litige, que l'administrateur tranche", async () => {
  const t = convexTest(schema, modules);
  const { s, rosters } = await playedMatch(t);
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
  expect((await t.query(api.matches.get, { matchId: s.matchId }))?.state).toBe("disputed");

  await t.withIdentity({ subject: s.admin }).mutation(api.sheets.settleDispute, {
    matchId: s.matchId,
    sets: [
      { home: 25, away: 20 },
      { home: 18, away: 25 },
      { home: 25, away: 27 },
      { home: 25, away: 19 },
      { home: 15, away: 12 },
    ],
  });

  const match = await t.query(api.matches.get, { matchId: s.matchId });
  expect(match?.state).toBe("completed");
  expect(match?.result).toMatchObject({ homeSets: 3, awaySets: 2 });
});

test("un responsable ne peut pas trancher un litige", async () => {
  const t = convexTest(schema, modules);
  const { s, rosters } = await playedMatch(t);
  await t.withIdentity({ subject: s.homeManager }).mutation(api.sheets.submit, {
    matchId: s.matchId,
    sets: VALID_SETS,
    homeLineup: rosters.home.slice(0, 6),
    awayLineup: rosters.away.slice(0, 6),
  });
  await t.withIdentity({ subject: s.awayManager }).mutation(api.sheets.dispute, {
    matchId: s.matchId,
    reason: "Score faux.",
  });

  await expect(
    t.withIdentity({ subject: s.homeManager }).mutation(api.sheets.settleDispute, {
      matchId: s.matchId,
      sets: VALID_SETS,
    }),
  ).rejects.toThrow(/réservée aux administrateurs/i);
});

test("une feuille sans réponse est validée à l'échéance de 7 jours", async () => {
  const t = convexTest(schema, modules);
  const { s, rosters } = await playedMatch(t);
  await t.withIdentity({ subject: s.homeManager }).mutation(api.sheets.submit, {
    matchId: s.matchId,
    sets: VALID_SETS,
    homeLineup: rosters.home.slice(0, 6),
    awayLineup: rosters.away.slice(0, 6),
  });

  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const match = await t.query(api.matches.get, { matchId: s.matchId });
  expect(match?.state).toBe("completed");
  expect(match?.result?.homeSets).toBe(3);
});

test("une contestation avant l'échéance annule la validation tacite", async () => {
  const t = convexTest(schema, modules);
  const { s, rosters } = await playedMatch(t);
  await t.withIdentity({ subject: s.homeManager }).mutation(api.sheets.submit, {
    matchId: s.matchId,
    sets: VALID_SETS,
    homeLineup: rosters.home.slice(0, 6),
    awayLineup: rosters.away.slice(0, 6),
  });
  await t.withIdentity({ subject: s.awayManager }).mutation(api.sheets.dispute, {
    matchId: s.matchId,
    reason: "Score faux.",
  });

  await t.finishAllScheduledFunctions(vi.runAllTimers);

  expect((await t.query(api.matches.get, { matchId: s.matchId }))?.state).toBe("disputed");
});

test("un forfait contre le visiteur donne 3-0 et 75-0 au receveur", async () => {
  const t = convexTest(schema, modules);
  const { s } = await playedMatch(t);

  await t
    .withIdentity({ subject: s.admin })
    .mutation(api.sheets.forfeit, { matchId: s.matchId, forfeitingTeamId: s.awayTeamId });

  const match = await t.query(api.matches.get, { matchId: s.matchId });
  expect(match?.state).toBe("completed");
  expect(match?.forfeitAgainst).toBe(s.awayTeamId);
  expect(match?.result).toMatchObject({
    winnerTeamId: s.homeTeamId,
    homeSets: 3,
    awaySets: 0,
    homePoints: 75,
    awayPoints: 0,
  });
});

test("un forfait contre le receveur est orienté dans l'autre sens", async () => {
  const t = convexTest(schema, modules);
  const { s } = await playedMatch(t);

  await t
    .withIdentity({ subject: s.admin })
    .mutation(api.sheets.forfeit, { matchId: s.matchId, forfeitingTeamId: s.homeTeamId });

  expect((await t.query(api.matches.get, { matchId: s.matchId }))?.result).toMatchObject({
    winnerTeamId: s.awayTeamId,
    homeSets: 0,
    awaySets: 3,
    homePoints: 0,
    awayPoints: 75,
  });
});

test("un forfait peut être prononcé sur un match encore en négociation", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(SLOT_AT - 7 * 86_400_000));
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);

  await t
    .withIdentity({ subject: s.admin })
    .mutation(api.sheets.forfeit, { matchId: s.matchId, forfeitingTeamId: s.awayTeamId });

  expect((await t.query(api.matches.get, { matchId: s.matchId }))?.state).toBe("completed");
});

test("un forfait est refusé aux responsables et sur un match déjà terminé", async () => {
  const t = convexTest(schema, modules);
  const { s } = await playedMatch(t);

  await expect(
    t
      .withIdentity({ subject: s.homeManager })
      .mutation(api.sheets.forfeit, { matchId: s.matchId, forfeitingTeamId: s.awayTeamId }),
  ).rejects.toThrow(/réservée aux administrateurs/i);

  const asAdmin = t.withIdentity({ subject: s.admin });
  await asAdmin.mutation(api.sheets.forfeit, {
    matchId: s.matchId,
    forfeitingTeamId: s.awayTeamId,
  });
  await expect(
    asAdmin.mutation(api.sheets.forfeit, {
      matchId: s.matchId,
      forfeitingTeamId: s.homeTeamId,
    }),
  ).rejects.toThrow(/Action impossible dans l'état/i);
});

test("une équipe étrangère au match ne peut pas être déclarée forfait", async () => {
  const t = convexTest(schema, modules);
  const { s } = await playedMatch(t);
  const otherTeam = await t.run(async (ctx) =>
    ctx.db.insert("teams", {
      clubId: s.homeClubId,
      seasonId: s.seasonId,
      championshipId: s.championshipId,
      name: "Club A 2",
    }),
  );

  await expect(
    t
      .withIdentity({ subject: s.admin })
      .mutation(api.sheets.forfeit, { matchId: s.matchId, forfeitingTeamId: otherTeam }),
  ).rejects.toThrow(/ne joue pas ce match/i);
});

test("l'administrateur corrige la feuille d'un match terminé", async () => {
  const t = convexTest(schema, modules);
  const { s, rosters } = await playedMatch(t);
  await t.withIdentity({ subject: s.homeManager }).mutation(api.sheets.submit, {
    matchId: s.matchId,
    sets: VALID_SETS,
    homeLineup: rosters.home.slice(0, 6),
    awayLineup: rosters.away.slice(0, 6),
  });
  await t
    .withIdentity({ subject: s.awayManager })
    .mutation(api.sheets.validate, { matchId: s.matchId });

  await t.withIdentity({ subject: s.admin }).mutation(api.sheets.correct, {
    matchId: s.matchId,
    sets: [
      { home: 20, away: 25 },
      { home: 18, away: 25 },
      { home: 22, away: 25 },
    ],
  });

  expect((await t.query(api.matches.get, { matchId: s.matchId }))?.result).toMatchObject({
    winnerTeamId: s.awayTeamId,
    homeSets: 0,
    awaySets: 3,
  });
});

test("la feuille nominative est réservée aux comptes connectés", async () => {
  const t = convexTest(schema, modules);
  const { s, rosters } = await playedMatch(t);
  await t.withIdentity({ subject: s.homeManager }).mutation(api.sheets.submit, {
    matchId: s.matchId,
    sets: VALID_SETS,
    homeLineup: rosters.home.slice(0, 6),
    awayLineup: rosters.away.slice(0, 6),
  });

  await expect(t.query(api.sheets.get, { matchId: s.matchId })).rejects.toThrow(
    /authentification requise/i,
  );
});
