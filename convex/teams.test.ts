import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { modules, seedRoster, setupChampionship } from "./test.setup";

test("renommer une équipe s'applique à ses matchs", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);

  await t
    .withIdentity({ subject: s.admin })
    .mutation(api.teams.rename, { teamId: s.homeTeamId, name: "  Club A Seniors " });

  const match = await t.query(api.matches.get, { matchId: s.matchId });
  expect(match?.homeTeamName).toBe("Club A Seniors");
});

test("un nom d'équipe vide est refusé", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  await expect(
    t.withIdentity({ subject: s.admin }).mutation(api.teams.rename, { teamId: s.homeTeamId, name: " " }),
  ).rejects.toThrow(/obligatoire/);
});

test("supprimer une équipe emporte ses matchs planifiés, sa feuille verte et ses responsables", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  await seedRoster(t, { teamId: s.homeTeamId, clubId: s.homeClubId, count: 3 });
  // Un match revenu à Planifié après un refus garde son historique : il part avec lui.
  await t.run(async (ctx) =>
    ctx.db.insert("slotProposals", {
      matchId: s.matchId,
      at: Date.now(),
      venue: "Gymnase",
      proposedBy: s.homeManager,
      status: "rejected",
    }),
  );
  const admin = t.withIdentity({ subject: s.admin });

  expect(await admin.query(api.teams.removalImpact, { teamId: s.homeTeamId })).toEqual({
    matches: 1,
    rosterEntries: 3,
    managers: 1,
    blockingMatches: [],
  });

  await admin.mutation(api.teams.remove, { teamId: s.homeTeamId });

  const left = await t.run(async (ctx) => ({
    team: await ctx.db.get(s.homeTeamId),
    match: await ctx.db.get(s.matchId),
    roster: await ctx.db.query("rosterEntries").collect(),
    managers: await ctx.db.query("teamManagers").collect(),
    proposals: await ctx.db.query("slotProposals").collect(),
  }));
  expect(left.team).toBeNull();
  expect(left.match).toBeNull();
  expect(left.roster).toHaveLength(0);
  expect(left.proposals).toHaveLength(0);
  // Le responsable de l'autre équipe reste rattaché.
  expect(left.managers.map((row) => row.userId)).toEqual([s.awayManager]);
});

test("une équipe dont un match a un créneau proposé ne se supprime pas", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  await t.run(async (ctx) => ctx.db.patch(s.matchId, { state: "awaitingSlot" }));
  const admin = t.withIdentity({ subject: s.admin });

  const impact = await admin.query(api.teams.removalImpact, { teamId: s.awayTeamId });
  expect(impact.blockingMatches).toEqual(["J1 Club A 1 – Club B 1"]);
  await expect(admin.mutation(api.teams.remove, { teamId: s.awayTeamId })).rejects.toThrow(
    /J1 Club A 1 – Club B 1/,
  );
  expect(await t.run(async (ctx) => ctx.db.get(s.awayTeamId))).not.toBeNull();
});

test("seul l'administrateur renomme ou supprime une équipe", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const manager = t.withIdentity({ subject: s.homeManager });
  await expect(
    manager.mutation(api.teams.rename, { teamId: s.homeTeamId, name: "Pirate" }),
  ).rejects.toThrow(/réservée aux administrateurs/);
  await expect(manager.mutation(api.teams.remove, { teamId: s.homeTeamId })).rejects.toThrow(
    /réservée aux administrateurs/,
  );
});

test("les équipes de la saison sont toutes listées, groupées par championnat", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  // Trois championnats de plus : l'ancien sélecteur n'en lisait que deux.
  await t.run(async (ctx) => {
    for (const name of ["D1", "D2", "D3"]) {
      const championshipId = await ctx.db.insert("championships", {
        seasonId: s.seasonId,
        circuitId: (await ctx.db.get(s.championshipId))!.circuitId,
        name,
        level: 1,
        format: "standard",
      });
      await ctx.db.insert("teams", {
        clubId: s.homeClubId,
        seasonId: s.seasonId,
        championshipId,
        name: `Club A ${name}`,
      });
    }
  });

  const teams = await t.query(api.teams.listBySeason, { seasonId: s.seasonId });
  expect(teams.map((team) => `${team.championshipName} / ${team.name}`)).toEqual([
    "D1 / Club A D1",
    "D2 / Club A D2",
    "D3 / Club A D3",
    "Départemental mixte / Club A 1",
    "Départemental mixte / Club B 1",
  ]);
});
