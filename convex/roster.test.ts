import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import {
  insertChampionship,
  modules,
  seedAccount,
  seedRoster,
  setupChampionship,
  testLicense,
} from "./test.setup";

test("un responsable constitue l'effectif de son équipe", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const asHome = t.withIdentity({ subject: s.homeManager });

  const playerId = await asHome.action(api.players.create, {
    clubId: s.homeClubId,
    firstName: "Camille",
    lastName: "Durand",
    license: testLicense("L0001"),
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
      license: testLicense("L0001"),
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
    license: testLicense("L0001"),
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
    const championshipId = await insertChampionship(ctx, {
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
  ).toEqual({ added: 6, skipped: [] });
  expect(
    await asHome.mutation(api.roster.copyFrom, {
      teamId: s.homeTeamId,
      sourceTeamId: previous,
    }),
  ).toEqual({ added: 0, skipped: [] });
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
    license: testLicense("L0001"),
  });

  await expect(
    asHome.action(api.players.create, {
      clubId: s.homeClubId,
      firstName: "Autre",
      lastName: "Personne",
      license: testLicense("L0001"),
    }),
  ).rejects.toThrow(/déjà enregistré/i);
});

/** Une seconde équipe du club receveur, gérée par le même responsable. */
async function secondHomeTeam(
  t: ReturnType<typeof convexTest>,
  s: Awaited<ReturnType<typeof setupChampionship>>,
  championshipId = s.championshipId,
) {
  const teamId = await t.run(async (ctx) =>
    ctx.db.insert("teams", {
      clubId: s.homeClubId,
      seasonId: s.seasonId,
      championshipId,
      name: "Club A 2",
    }),
  );
  await t.run(async (ctx) => ctx.db.insert("teamManagers", { teamId, userId: s.homeManager }));
  return teamId;
}

test("un licencié n'a qu'une feuille verte par circuit", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  // D2 du même circuit que le championnat semé.
  const d2 = await t.run(async (ctx) =>
    insertChampionship(ctx, { seasonId: s.seasonId, name: "D2", level: 2 }),
  );
  const secondTeam = await secondHomeTeam(t, s, d2);
  const asHome = t.withIdentity({ subject: s.homeManager });
  const playerId = await asHome.action(api.players.create, {
    clubId: s.homeClubId,
    firstName: "Camille",
    lastName: "Durand",
    license: testLicense("L0001"),
  }).then((result) => result.playerId);

  await asHome.mutation(api.roster.add, { teamId: s.homeTeamId, playerId });
  await expect(asHome.mutation(api.roster.add, { teamId: secondTeam, playerId })).rejects.toThrow(
    /déjà sur la feuille verte de Club A 1/i,
  );
  // Rejouer l'inscription sur sa propre équipe n'est pas un doublon.
  await asHome.mutation(api.roster.add, { teamId: s.homeTeamId, playerId });

  // Retiré de la première, il peut rejoindre la seconde.
  await asHome.mutation(api.roster.remove, { teamId: s.homeTeamId, playerId });
  await asHome.mutation(api.roster.add, { teamId: secondTeam, playerId });
  expect(await asHome.query(api.roster.listByTeam, { teamId: secondTeam })).toHaveLength(1);
});

test("la coupe a ses propres feuilles vertes : un autre circuit, une autre inscription", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const cup = await t.run(async (ctx) => {
    const circuitId = await ctx.db.insert("circuits", { seasonId: s.seasonId, name: "Coupe" });
    return insertChampionship(ctx, { seasonId: s.seasonId, circuitId, name: "Coupe de Corrèze" });
  });
  const cupTeam = await secondHomeTeam(t, s, cup);
  const asHome = t.withIdentity({ subject: s.homeManager });
  const playerId = await asHome.action(api.players.create, {
    clubId: s.homeClubId,
    firstName: "Camille",
    lastName: "Durand",
    license: testLicense("L0001"),
  }).then((result) => result.playerId);

  await asHome.mutation(api.roster.add, { teamId: s.homeTeamId, playerId });
  await asHome.mutation(api.roster.add, { teamId: cupTeam, playerId });

  const candidates = await asHome.query(api.roster.candidates, { teamId: cupTeam });
  expect(candidates).toEqual([
    expect.objectContaining({ _id: playerId, onThisTeam: true, otherTeamName: null }),
  ]);
});

test("les licenciés inscriptibles signalent l'autre feuille verte du circuit", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const secondTeam = await secondHomeTeam(t, s);
  const [playerId] = await seedRoster(t, { teamId: s.homeTeamId, clubId: s.homeClubId, count: 1 });
  const asHome = t.withIdentity({ subject: s.homeManager });

  const candidates = await asHome.query(api.roster.candidates, { teamId: secondTeam });
  expect(candidates).toEqual([
    expect.objectContaining({ _id: playerId, onThisTeam: false, otherTeamName: "Club A 1" }),
  ]);
  // La recherche couvre les numéros de licence.
  expect(candidates[0].licenseNumbers).toHaveLength(1);
});

test("la reprise de feuille verte laisse de côté qui est déjà inscrit ailleurs", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t, { label: "2026-2027" });
  const previous = await t.run(async (ctx) => {
    const seasonId = await ctx.db.insert("seasons", { label: "2025-2026", isCurrent: false });
    const championshipId = await insertChampionship(ctx, { seasonId, name: "Départemental" });
    return await ctx.db.insert("teams", {
      clubId: s.homeClubId,
      seasonId,
      championshipId,
      name: "Club A 1",
    });
  });
  const players = await seedRoster(t, { teamId: previous, clubId: s.homeClubId, count: 3 });
  const secondTeam = await secondHomeTeam(t, s);
  await t.run(async (ctx) =>
    ctx.db.insert("rosterEntries", { teamId: secondTeam, playerId: players[0] }),
  );

  const asHome = t.withIdentity({ subject: s.homeManager });
  expect(
    await asHome.mutation(api.roster.copyFrom, { teamId: s.homeTeamId, sourceTeamId: previous }),
  ).toEqual({ added: 2, skipped: ["Joueuse1 Nom1"] });
});

test("un championnat ne change pas de circuit au prix de l'unicité", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const cupCircuit = await t.run(async (ctx) =>
    ctx.db.insert("circuits", { seasonId: s.seasonId, name: "Coupe" }),
  );
  const cup = await t.run(async (ctx) =>
    insertChampionship(ctx, { seasonId: s.seasonId, circuitId: cupCircuit, name: "Coupe" }),
  );
  const cupTeam = await secondHomeTeam(t, s, cup);
  const [playerId] = await seedRoster(t, { teamId: s.homeTeamId, clubId: s.homeClubId, count: 1 });
  await t.run(async (ctx) => ctx.db.insert("rosterEntries", { teamId: cupTeam, playerId }));

  const admin = t.withIdentity({ subject: s.admin });
  await expect(
    admin.mutation(api.championships.update, {
      championshipId: cup,
      name: "Coupe",
      circuitId: (await t.query(api.championships.get, { championshipId: s.championshipId }))!
        .circuitId,
      level: 1,
      format: "standard",
      reinforcementQuota: null,
    }),
  ).rejects.toThrow(/déjà sur la feuille verte/i);
});

test("un joueur sans compte n'apparaît pas dans la liste des comptes", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  await seedRoster(t, { teamId: s.homeTeamId, clubId: s.homeClubId, count: 3 });
  await seedAccount(t, { email: "joueur@club-a.fr", name: "Joueur", role: "player" });

  const accounts = await t.withIdentity({ subject: s.admin }).query(api.users.list, {});
  expect(accounts).toHaveLength(4);
});
