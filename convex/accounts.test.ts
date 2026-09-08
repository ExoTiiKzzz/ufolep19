import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { modules, seedAccount, setupChampionship } from "./test.setup";

test("l'administrateur crée un compte, qui peut ensuite se connecter", async () => {
  const t = convexTest(schema, modules);
  const admin = await seedAccount(t, {
    email: "comite@ufolep19.fr",
    name: "Comité",
    role: "admin",
  });

  const userId = await t.withIdentity({ subject: admin }).action(api.admin.createUserAccount, {
    email: "Responsable@Club-A.fr",
    password: "motdepasse-solide",
    name: "Responsable Club A",
    role: "manager",
  });

  expect(await t.withIdentity({ subject: userId }).query(api.users.me, {})).toMatchObject({
    email: "responsable@club-a.fr",
    role: "manager",
  });
  await expect(
    t.action(api.auth.signIn, {
      provider: "password",
      params: {
        email: "responsable@club-a.fr",
        password: "motdepasse-solide",
        flow: "signIn",
      },
    }),
  ).resolves.toBeDefined();
});

test("un responsable ne peut pas créer de compte", async () => {
  const t = convexTest(schema, modules);
  const manager = await seedAccount(t, {
    email: "responsable@club-a.fr",
    name: "Responsable",
    role: "manager",
  });

  await expect(
    t.withIdentity({ subject: manager }).action(api.admin.createUserAccount, {
      email: "complice@club-a.fr",
      password: "motdepasse-solide",
      name: "Complice",
      role: "admin",
    }),
  ).rejects.toThrow(/réservée aux administrateurs/i);
});

test("le rôle d'un compte se change dans les deux sens", async () => {
  const t = convexTest(schema, modules);
  const admin = await seedAccount(t, {
    email: "comite@ufolep19.fr",
    name: "Comité",
    role: "admin",
  });
  const asAdmin = t.withIdentity({ subject: admin });
  const player = await seedAccount(t, {
    email: "joueur@club-a.fr",
    name: "Joueur",
    role: "player",
  });

  await asAdmin.mutation(api.users.setRole, { userId: player, role: "manager" });
  expect(await t.withIdentity({ subject: player }).query(api.users.me, {})).toMatchObject({
    role: "manager",
  });

  await asAdmin.mutation(api.users.setRole, { userId: player, role: "player" });
  expect(await t.withIdentity({ subject: player }).query(api.users.me, {})).toMatchObject({
    role: "player",
  });
});

test("le dernier administrateur ne peut pas être rétrogradé", async () => {
  const t = convexTest(schema, modules);
  const admin = await seedAccount(t, {
    email: "comite@ufolep19.fr",
    name: "Comité",
    role: "admin",
  });

  await expect(
    t.withIdentity({ subject: admin }).mutation(api.users.setRole, {
      userId: admin,
      role: "manager",
    }),
  ).rejects.toThrow(/dernier administrateur/i);
});

test("un administrateur peut être rétrogradé dès qu'un autre existe", async () => {
  const t = convexTest(schema, modules);
  const first = await seedAccount(t, {
    email: "comite@ufolep19.fr",
    name: "Comité",
    role: "admin",
  });
  const second = await seedAccount(t, {
    email: "adjoint@ufolep19.fr",
    name: "Adjoint",
    role: "admin",
  });

  await t
    .withIdentity({ subject: first })
    .mutation(api.users.setRole, { userId: second, role: "manager" });

  expect(await t.withIdentity({ subject: second }).query(api.users.me, {})).toMatchObject({
    role: "manager",
  });
});

test("un compte responsable peut gérer plusieurs équipes", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const asAdmin = t.withIdentity({ subject: s.admin });

  await asAdmin.mutation(api.teams.addManager, {
    teamId: s.awayTeamId,
    userId: s.homeManager,
  });

  const teams = await t.withIdentity({ subject: s.homeManager }).query(api.teams.mine, {});
  expect(teams.map((team) => team.name).sort()).toEqual(["Club A 1", "Club B 1"]);
});

test("rattacher deux fois le même responsable ne crée pas de doublon", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const asAdmin = t.withIdentity({ subject: s.admin });

  await asAdmin.mutation(api.teams.addManager, { teamId: s.homeTeamId, userId: s.homeManager });

  expect(
    await t.withIdentity({ subject: s.homeManager }).query(api.teams.mine, {}),
  ).toHaveLength(1);
});

test("un compte de rôle joueur ne peut pas être rattaché comme responsable", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const player = await seedAccount(t, {
    email: "joueur@club-a.fr",
    name: "Joueur",
    role: "player",
  });

  await expect(
    t
      .withIdentity({ subject: s.admin })
      .mutation(api.teams.addManager, { teamId: s.homeTeamId, userId: player }),
  ).rejects.toThrow(/rôle joueur/i);
});

test("le rattachement d'un compte à une fiche joueur est facultatif", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const asAdmin = t.withIdentity({ subject: s.admin });
  const player = await seedAccount(t, {
    email: "joueur@club-a.fr",
    name: "Joueur",
    role: "player",
  });
  const playerId = await t
    .withIdentity({ subject: s.homeManager })
    .mutation(api.players.create, {
      clubId: s.homeClubId,
      firstName: "Camille",
      lastName: "Durand",
      licenseNumber: "L0001",
    });

  const asPlayer = t.withIdentity({ subject: player });
  expect(await asPlayer.query(api.users.me, {})).toMatchObject({ playerId: null });

  await asAdmin.mutation(api.users.linkPlayer, { userId: player, playerId });
  expect(await asPlayer.query(api.users.me, {})).toMatchObject({ playerId });

  await asAdmin.mutation(api.users.linkPlayer, { userId: player, playerId: null });
  expect(await asPlayer.query(api.users.me, {})).toMatchObject({ playerId: null });
});

test("seul un administrateur gère les rattachements d'équipe", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);

  await expect(
    t
      .withIdentity({ subject: s.homeManager })
      .mutation(api.teams.addManager, { teamId: s.homeTeamId, userId: s.awayManager }),
  ).rejects.toThrow(/réservée aux administrateurs/i);
});
