import { convexTest, type TestConvex } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules, seedAccount, setupChampionship } from "./test.setup";

type T = TestConvex<typeof schema>;

async function signIn(t: T, email: string, password: string) {
  return await t.action(api.auth.signIn, {
    provider: "password",
    params: { email, password, flow: "signIn" },
  });
}

/** Un administrateur, et un responsable créé par le vrai chemin, identifiants compris. */
async function setup() {
  const t = convexTest(schema, modules);
  const admin = await seedAccount(t, { email: "comite@ufolep19.fr", name: "Comité", role: "admin" });
  const { userId, account } = await t
    .withIdentity({ subject: admin })
    .action(api.admin.createUserAccount, {
      email: "responsable@club-a.fr",
      name: "Camille Durand",
      role: "manager",
    });
  return { t, admin, userId, password: account.temporaryPassword! };
}

async function sessionsOf(t: T, userId: Id<"users">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect(),
  );
}

test("l'administrateur réinitialise un mot de passe : l'ancien ne fonctionne plus", async () => {
  const { t, admin, userId, password } = await setup();
  await signIn(t, "responsable@club-a.fr", password);
  expect(await sessionsOf(t, userId)).toHaveLength(1);

  const issued = await t
    .withIdentity({ subject: admin })
    .action(api.admin.resetPassword, { userId });

  expect(issued.temporaryPassword).not.toBe(password);
  expect(issued.mail?.sent).toBe(false);
  // Les sessions ouvertes sont fermées.
  expect(await sessionsOf(t, userId)).toHaveLength(0);
  await expect(signIn(t, "responsable@club-a.fr", password)).rejects.toThrow();
  await expect(
    signIn(t, "responsable@club-a.fr", issued.temporaryPassword!),
  ).resolves.toBeDefined();
});

test("un responsable ne réinitialise pas le mot de passe d'un autre compte", async () => {
  const { t, admin, userId } = await setup();
  await expect(
    t.withIdentity({ subject: userId }).action(api.admin.resetPassword, { userId: admin }),
  ).rejects.toThrow(/réservée aux administrateurs/);
});

test("le titulaire change son mot de passe en donnant l'actuel", async () => {
  const { t, userId, password } = await setup();
  await t
    .withIdentity({ subject: userId })
    .action(api.password.change, { current: password, next: "volley-a-tulle" });

  await expect(signIn(t, "responsable@club-a.fr", password)).rejects.toThrow();
  await expect(signIn(t, "responsable@club-a.fr", "volley-a-tulle")).resolves.toBeDefined();
});

test("un mot de passe actuel faux est refusé, et rien ne change", async () => {
  const { t, userId, password } = await setup();
  await expect(
    t
      .withIdentity({ subject: userId })
      .action(api.password.change, { current: "pas-le-bon", next: "volley-a-tulle" }),
  ).rejects.toThrow(/Mot de passe actuel incorrect/);
  await expect(signIn(t, "responsable@club-a.fr", password)).resolves.toBeDefined();
});

test("un nouveau mot de passe trop court est refusé", async () => {
  const { t, userId, password } = await setup();
  await expect(
    t.withIdentity({ subject: userId }).action(api.password.change, { current: password, next: "court" }),
  ).rejects.toThrow(/au moins 8/);
});

test("changer de mot de passe exige d'être connecté", async () => {
  const { t } = await setup();
  await expect(
    t.action(api.password.change, { current: "x", next: "volley-a-tulle" }),
  ).rejects.toThrow(/Authentification requise/);
});

test("supprimer un compte : plus de connexion, adresse libérée, nom gardé dans l'historique", async () => {
  const { t, admin, userId, password } = await setup();
  const s = await setupChampionship(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("teamManagers", { teamId: s.homeTeamId, userId });
    await ctx.db.insert("slotProposals", {
      matchId: s.matchId,
      at: Date.now() + 86_400_000,
      venue: "Gymnase",
      proposedBy: userId,
      status: "rejected",
    });
  });

  await t.withIdentity({ subject: admin }).mutation(api.users.remove, { userId });

  await expect(signIn(t, "responsable@club-a.fr", password)).rejects.toThrow();
  const accounts = await t.withIdentity({ subject: admin }).query(api.users.list, {});
  expect(accounts.map((account) => account._id)).not.toContain(userId);
  // Un jeton émis avant la suppression n'ouvre plus rien.
  expect(await t.withIdentity({ subject: userId }).query(api.users.me, {})).toBeNull();
  // Plus aucun rattachement d'équipe.
  const managers = await t.run(async (ctx) =>
    ctx.db
      .query("teamManagers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
  );
  expect(managers).toHaveLength(0);
  // L'historique garde le nom.
  const history = await t
    .withIdentity({ subject: admin })
    .query(api.negotiation.history, { matchId: s.matchId });
  expect(history.proposals[0].proposedByName).toBe("Camille Durand (compte supprimé)");
  // L'adresse est libre pour un nouveau compte.
  await expect(
    t.withIdentity({ subject: admin }).action(api.admin.createUserAccount, {
      email: "responsable@club-a.fr",
      name: "Camille Durand",
      role: "manager",
    }),
  ).resolves.toBeDefined();
});

test("l'administrateur ne supprime pas son propre compte", async () => {
  const { t, admin } = await setup();
  await expect(
    t.withIdentity({ subject: admin }).mutation(api.users.remove, { userId: admin }),
  ).rejects.toThrow(/votre propre compte/);
});

test("un compte supprimé ne compte plus parmi les administrateurs", async () => {
  const { t, admin } = await setup();
  const second = await seedAccount(t, { email: "adjoint@ufolep19.fr", name: "Adjoint", role: "admin" });
  await t.withIdentity({ subject: admin }).mutation(api.users.remove, { userId: second });
  // `admin` est de nouveau le dernier : il ne peut pas perdre son rôle.
  await expect(
    t.withIdentity({ subject: admin }).mutation(api.users.setRole, { userId: admin, role: "manager" }),
  ).rejects.toThrow(/dernier administrateur/);
});

test("un responsable ne supprime pas de compte", async () => {
  const { t, admin, userId } = await setup();
  await expect(
    t.withIdentity({ subject: userId }).mutation(api.users.remove, { userId: admin }),
  ).rejects.toThrow(/réservée aux administrateurs/);
});
