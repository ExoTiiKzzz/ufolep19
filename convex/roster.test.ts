import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { modules, seedAccount, seedRoster, setupChampionship } from "./test.setup";

test("un responsable constitue l'effectif de son équipe", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const asHome = t.withIdentity({ subject: s.homeManager });

  const playerId = await asHome.action(api.players.create, {
    clubId: s.homeClubId,
    firstName: "Camille",
    lastName: "Durand",
    licenseNumber: "L0001",
  }).then((result) => result.playerId);
  await asHome.mutation(api.roster.add, { teamId: s.homeTeamId, playerId });

  const roster = await asHome.query(api.roster.listByTeam, { teamId: s.homeTeamId });
  expect(roster.map((p) => p.lastName)).toEqual(["Durand"]);
});

test("une fiche joueur existe sans compte utilisateur", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);

  const playerId = await t
    .withIdentity({ subject: s.homeManager })
    .action(api.players.create, {
      clubId: s.homeClubId,
      firstName: "Camille",
      lastName: "Durand",
      licenseNumber: "L0001",
    }).then((result) => result.playerId);

  const player = await t.run(async (ctx) => ctx.db.get(playerId));
  expect(player).not.toBeNull();
  // Aucun compte n'a été créé au passage : seul l'administrateur et les deux
  // responsables du helper existent.
  const accounts = await t.withIdentity({ subject: s.admin }).query(api.users.list, {});
  expect(accounts).toHaveLength(3);
});

test("ajouter deux fois le même joueur ne crée pas de doublon", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const asHome = t.withIdentity({ subject: s.homeManager });
  const playerId = await asHome.action(api.players.create, {
    clubId: s.homeClubId,
    firstName: "Camille",
    lastName: "Durand",
    licenseNumber: "L0001",
  }).then((result) => result.playerId);

  await asHome.mutation(api.roster.add, { teamId: s.homeTeamId, playerId });
  await asHome.mutation(api.roster.add, { teamId: s.homeTeamId, playerId });

  expect(await asHome.query(api.roster.listByTeam, { teamId: s.homeTeamId })).toHaveLength(1);
});

test("un responsable ne touche pas à l'effectif d'une équipe qu'il ne gère pas", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const [playerId] = await seedRoster(t, {
    teamId: s.awayTeamId,
    clubId: s.awayClubId,
    count: 1,
  });

  await expect(
    t
      .withIdentity({ subject: s.homeManager })
      .mutation(api.roster.remove, { teamId: s.awayTeamId, playerId }),
  ).rejects.toThrow(/ne gérez pas cette équipe/i);
});

test("un joueur ne peut pas rejoindre l'effectif d'un autre club", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const [playerId] = await seedRoster(t, {
    teamId: s.awayTeamId,
    clubId: s.awayClubId,
    count: 1,
  });

  await expect(
    t
      .withIdentity({ subject: s.homeManager })
      .mutation(api.roster.add, { teamId: s.homeTeamId, playerId }),
  ).rejects.toThrow(/équipe de son club/i);
});

test("un effectif est réservé aux comptes connectés", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);

  await expect(t.query(api.roster.listByTeam, { teamId: s.homeTeamId })).rejects.toThrow(
    /authentification requise/i,
  );
});

test("la reprise d'effectif rejouée deux fois n'introduit aucun doublon", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t, { label: "2026-2027" });

  // Une saison antérieure, avec la même équipe (même club, même nom) et son effectif.
  const previous = await t.run(async (ctx) => {
    const seasonId = await ctx.db.insert("seasons", { label: "2025-2026", isCurrent: false });
    const championshipId = await ctx.db.insert("championships", {
      seasonId,
      name: "Départemental mixte",
    });
    return await ctx.db.insert("teams", {
      clubId: s.homeClubId,
      seasonId,
      championshipId,
      name: "Club A 1",
    });
  });
  await seedRoster(t, { teamId: previous, clubId: s.homeClubId, count: 6 });

  const asHome = t.withIdentity({ subject: s.homeManager });
  const candidate = await asHome.query(api.roster.previousSeasonTeam, {
    teamId: s.homeTeamId,
  });
  expect(candidate).toMatchObject({ seasonLabel: "2025-2026", playerCount: 6 });

  expect(
    await asHome.mutation(api.roster.copyFrom, {
      teamId: s.homeTeamId,
      sourceTeamId: previous,
    }),
  ).toBe(6);
  expect(
    await asHome.mutation(api.roster.copyFrom, {
      teamId: s.homeTeamId,
      sourceTeamId: previous,
    }),
  ).toBe(0);
  expect(await asHome.query(api.roster.listByTeam, { teamId: s.homeTeamId })).toHaveLength(6);
});

test("un numéro de licence déjà enregistré est refusé", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const asHome = t.withIdentity({ subject: s.homeManager });
  await asHome.action(api.players.create, {
    clubId: s.homeClubId,
    firstName: "Camille",
    lastName: "Durand",
    licenseNumber: "L0001",
  });

  await expect(
    asHome.action(api.players.create, {
      clubId: s.homeClubId,
      firstName: "Autre",
      lastName: "Personne",
      licenseNumber: "L0001",
    }),
  ).rejects.toThrow(/déjà enregistré/i);
});

test("un joueur peut appartenir à deux équipes de son club", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const secondTeam = await t.run(async (ctx) =>
    ctx.db.insert("teams", {
      clubId: s.homeClubId,
      seasonId: s.seasonId,
      championshipId: s.championshipId,
      name: "Club A 2",
    }),
  );
  await t.run(async (ctx) =>
    ctx.db.insert("teamManagers", { teamId: secondTeam, userId: s.homeManager }),
  );
  const asHome = t.withIdentity({ subject: s.homeManager });
  const playerId = await asHome.action(api.players.create, {
    clubId: s.homeClubId,
    firstName: "Camille",
    lastName: "Durand",
    licenseNumber: "L0001",
  }).then((result) => result.playerId);

  await asHome.mutation(api.roster.add, { teamId: s.homeTeamId, playerId });
  await asHome.mutation(api.roster.add, { teamId: secondTeam, playerId });

  expect(await asHome.query(api.roster.listByTeam, { teamId: s.homeTeamId })).toHaveLength(1);
  expect(await asHome.query(api.roster.listByTeam, { teamId: secondTeam })).toHaveLength(1);
});

test("un joueur sans compte n'apparaît pas dans la liste des comptes", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  await seedRoster(t, { teamId: s.homeTeamId, clubId: s.homeClubId, count: 3 });
  await seedAccount(t, { email: "joueur@club-a.fr", name: "Joueur", role: "player" });

  const accounts = await t.withIdentity({ subject: s.admin }).query(api.users.list, {});
  expect(accounts).toHaveLength(4);
});
