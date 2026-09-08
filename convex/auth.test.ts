import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules, seedAccount } from "./test.setup";

test("l'inscription publique est refusée", async () => {
  const t = convexTest(schema, modules);

  await expect(
    t.action(api.auth.signIn, {
      provider: "password",
      params: {
        email: "intrus@example.fr",
        password: "motdepasse-solide",
        flow: "signUp",
      },
    }),
  ).rejects.toThrow(/inscription publique/i);

  // Aucun compte n'a été créé au passage.
  const admin = await seedAccount(t, {
    email: "admin@ufolep19.fr",
    name: "Comité",
    role: "admin",
  });
  const accounts = await t.withIdentity({ subject: admin }).query(api.users.list, {});
  expect(accounts.map((a) => a.email)).toEqual(["admin@ufolep19.fr"]);
});

test("l'amorçage crée un administrateur, qui peut ensuite se connecter", async () => {
  const t = convexTest(schema, modules);

  const userId = await t.action(internal.admin.createAdmin, {
    email: "Comite@UFOLEP19.fr",
    password: "motdepasse-solide",
    name: "Comité UFOLEP 19",
  });

  const account = await t.withIdentity({ subject: userId }).query(api.users.me, {});
  expect(account).toMatchObject({ email: "comite@ufolep19.fr", role: "admin" });

  // Le compte amorcé se connecte réellement avec son mot de passe.
  await expect(
    t.action(api.auth.signIn, {
      provider: "password",
      params: {
        email: "comite@ufolep19.fr",
        password: "motdepasse-solide",
        flow: "signIn",
      },
    }),
  ).resolves.toBeDefined();
});

test("l'amorçage refuse d'écraser un compte existant", async () => {
  const t = convexTest(schema, modules);
  await t.action(internal.admin.createAdmin, {
    email: "comite@ufolep19.fr",
    password: "motdepasse-solide",
    name: "Comité UFOLEP 19",
  });

  await expect(
    t.action(internal.admin.createAdmin, {
      email: "comite@ufolep19.fr",
      password: "un-autre-mot-de-passe",
      name: "Quelqu'un d'autre",
    }),
  ).rejects.toThrow(/existe déjà/i);
});

test("l'amorçage refuse un mot de passe trop court", async () => {
  const t = convexTest(schema, modules);

  await expect(
    t.action(internal.admin.createAdmin, {
      email: "comite@ufolep19.fr",
      password: "court",
      name: "Comité UFOLEP 19",
    }),
  ).rejects.toThrow(/8 caractères/i);
});

test("une query privée échoue sans compte, au lieu de répondre partiellement", async () => {
  const t = convexTest(schema, modules);
  await seedAccount(t, { email: "admin@ufolep19.fr", name: "Comité", role: "admin" });

  await expect(t.query(api.users.list, {})).rejects.toThrow(/authentification requise/i);
});

test("un compte non administrateur ne peut pas lister les comptes", async () => {
  const t = convexTest(schema, modules);
  const manager = await seedAccount(t, {
    email: "responsable@club.fr",
    name: "Responsable",
    role: "manager",
  });
  const player = await seedAccount(t, {
    email: "joueur@club.fr",
    name: "Joueur",
    role: "player",
  });

  for (const subject of [manager, player]) {
    await expect(
      t.withIdentity({ subject }).query(api.users.list, {}),
    ).rejects.toThrow(/réservée aux administrateurs/i);
  }
});

test("le compte courant est nul pour un visiteur anonyme", async () => {
  const t = convexTest(schema, modules);

  expect(await t.query(api.users.me, {})).toBeNull();
});

test("le compte courant expose son rôle", async () => {
  const t = convexTest(schema, modules);
  const manager = await seedAccount(t, {
    email: "responsable@club.fr",
    name: "Responsable",
    role: "manager",
  });

  const account = await t.withIdentity({ subject: manager }).query(api.users.me, {});
  expect(account).toMatchObject({ email: "responsable@club.fr", role: "manager" });
});
