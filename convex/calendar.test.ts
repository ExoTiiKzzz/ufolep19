import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { modules, setupChampionship, WINDOW_END, WINDOW_START } from "./test.setup";

test("une journée est bornée par une fenêtre de dates", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);

  await t.withIdentity({ subject: s.admin }).mutation(api.matchdays.create, {
    championshipId: s.championshipId,
    number: 2,
    windowStart: WINDOW_START,
    windowEnd: WINDOW_END,
  });

  const days = await t.query(api.matchdays.listByChampionship, {
    championshipId: s.championshipId,
  });
  expect(days.map((day) => day.number)).toEqual([1, 2]);
});

test("une fenêtre qui se termine avant de commencer est refusée", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);

  await expect(
    t.withIdentity({ subject: s.admin }).mutation(api.matchdays.create, {
      championshipId: s.championshipId,
      number: 2,
      windowStart: WINDOW_END,
      windowEnd: WINDOW_START,
    }),
  ).rejects.toThrow(/ne peut pas précéder/i);
});

test("un numéro de journée en doublon est refusé", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);

  await expect(
    t.withIdentity({ subject: s.admin }).mutation(api.matchdays.create, {
      championshipId: s.championshipId,
      number: 1,
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
    }),
  ).rejects.toThrow(/existe déjà/i);
});

test("une équipe ne peut pas être programmée contre elle-même", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);

  await expect(
    t.withIdentity({ subject: s.admin }).mutation(api.matches.create, {
      matchdayId: s.matchdayId,
      homeTeamId: s.homeTeamId,
      awayTeamId: s.homeTeamId,
    }),
  ).rejects.toThrow(/elle-même/i);
});

test("une équipe non engagée dans le championnat est refusée", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const otherTeam = await t.run(async (ctx) => {
    const championshipId = await ctx.db.insert("championships", {
      seasonId: s.seasonId,
      name: "Autre championnat",
    });
    return await ctx.db.insert("teams", {
      clubId: s.awayClubId,
      seasonId: s.seasonId,
      championshipId,
      name: "Club B 2",
    });
  });

  await expect(
    t.withIdentity({ subject: s.admin }).mutation(api.matches.create, {
      matchdayId: s.matchdayId,
      homeTeamId: s.homeTeamId,
      awayTeamId: otherTeam,
    }),
  ).rejects.toThrow(/n'est pas engagée dans ce championnat/i);
});

test("un doublon de paire avec le même receveur est signalé sans être bloqué", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const asAdmin = t.withIdentity({ subject: s.admin });
  const secondDay = await asAdmin.mutation(api.matchdays.create, {
    championshipId: s.championshipId,
    number: 2,
    windowStart: WINDOW_START,
    windowEnd: WINDOW_END,
  });

  const result = await asAdmin.mutation(api.matches.create, {
    matchdayId: secondDay,
    homeTeamId: s.homeTeamId,
    awayTeamId: s.awayTeamId,
  });

  expect(result.duplicateWarning).toMatch(/reçoit déjà/i);
  expect(
    await t.query(api.matches.listByChampionship, { championshipId: s.championshipId }),
  ).toHaveLength(2);
});

test("le match retour n'est pas signalé comme doublon", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const asAdmin = t.withIdentity({ subject: s.admin });
  const secondDay = await asAdmin.mutation(api.matchdays.create, {
    championshipId: s.championshipId,
    number: 2,
    windowStart: WINDOW_START,
    windowEnd: WINDOW_END,
  });

  const result = await asAdmin.mutation(api.matches.create, {
    matchdayId: secondDay,
    homeTeamId: s.awayTeamId,
    awayTeamId: s.homeTeamId,
  });

  expect(result.duplicateWarning).toBeNull();
});

test("le calendrier public expose les équipes et la journée, sans compte", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);

  const matches = await t.query(api.matches.listByChampionship, {
    championshipId: s.championshipId,
  });
  expect(matches).toHaveLength(1);
  expect(matches[0]).toMatchObject({
    homeTeamName: "Club A 1",
    awayTeamName: "Club B 1",
    matchdayNumber: 1,
    state: "planned",
  });
  expect(matches[0].slot).toBeUndefined();
});

test("seul un administrateur saisit le calendrier", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);

  await expect(
    t.withIdentity({ subject: s.homeManager }).mutation(api.matches.create, {
      matchdayId: s.matchdayId,
      homeTeamId: s.homeTeamId,
      awayTeamId: s.awayTeamId,
    }),
  ).rejects.toThrow(/réservée aux administrateurs/i);
});
