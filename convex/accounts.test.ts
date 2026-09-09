import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { modules, seedAccount, setupChampionship } from "./test.setup";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test("l'administrateur crée un compte, qui peut ensuite se connecter", async () => {
  const t = convexTest(schema, modules);
  const admin = await seedAccount(t, {
    email: "comite@ufolep19.fr",
    name: "Comité",
    role: "admin",
  });

  const { userId, mail } = await t
    .withIdentity({ subject: admin })
    .action(api.admin.createUserAccount, {
      email: "Responsable@Club-A.fr",
      password: "motdepasse-solide",
      name: "Responsable Club A",
      role: "manager",
    });

  // Aucun fournisseur d'envoi n'est configuré en test : la création réussit et le dit.
  expect(mail).toMatchObject({ sent: false });
  expect(mail.error).toMatch(/Envoi impossible : BREVO_API_KEY, MAIL_SENDER_EMAIL/);

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
    .action(api.players.create, {
      clubId: s.homeClubId,
      firstName: "Camille",
      lastName: "Durand",
      licenseNumber: "L0001",
    }).then((result) => result.playerId);

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

test("un licencié sans e-mail ne crée aucun compte", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);

  const result = await t.withIdentity({ subject: s.homeManager }).action(api.players.create, {
    clubId: s.homeClubId,
    firstName: "Camille",
    lastName: "Durand",
    licenseNumber: "L0001",
  });

  expect(result.account).toBeNull();
  // Toujours les trois comptes du helper.
  expect(await t.withIdentity({ subject: s.admin }).query(api.users.list, {})).toHaveLength(3);
});

test("un licencié avec e-mail reçoit un compte de consultation rattaché à sa fiche", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);

  const { playerId, account } = await t
    .withIdentity({ subject: s.homeManager })
    .action(api.players.create, {
      clubId: s.homeClubId,
      firstName: "Camille",
      lastName: "Durand",
      licenseNumber: "L0001",
      email: "  Camille.Durand@Club-A.FR ",
    });

  expect(account).toMatchObject({ email: "camille.durand@club-a.fr", linkedExisting: false });
  expect(account?.temporaryPassword).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);

  // Le compte existe, a le rôle joueur, et pointe sur la fiche.
  const accounts = await t.withIdentity({ subject: s.admin }).query(api.users.list, {});
  const created = accounts.find((row) => row.email === "camille.durand@club-a.fr");
  expect(created?.role).toBe("player");
  expect(await t.run(async (ctx) => (await ctx.db.get(created!._id))?.playerId)).toBe(playerId);

  // Et il peut se connecter avec le mot de passe provisoire.
  await expect(
    t.action(api.auth.signIn, {
      provider: "password",
      params: {
        email: "camille.durand@club-a.fr",
        password: account?.temporaryPassword,
        flow: "signIn",
      },
    }),
  ).resolves.toBeDefined();
});

test("le compte créé pour un licencié n'a aucun droit d'écriture", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const { account } = await t
    .withIdentity({ subject: s.homeManager })
    .action(api.players.create, {
      clubId: s.homeClubId,
      firstName: "Camille",
      lastName: "Durand",
      licenseNumber: "L0001",
      email: "camille@club-a.fr",
    });
  const created = (await t.withIdentity({ subject: s.admin }).query(api.users.list, {})).find(
    (row) => row.email === account?.email,
  );

  await expect(
    t
      .withIdentity({ subject: created?._id })
      .mutation(api.roster.add, { teamId: s.homeTeamId, playerId: s.homeTeamId as never }),
  ).rejects.toThrow();
});

test("une adresse déjà titulaire d'un compte est rattachée, pas dupliquée", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const existing = await seedAccount(t, {
    email: "deja@club-a.fr",
    name: "Déjà là",
    role: "player",
  });

  const { playerId, account } = await t
    .withIdentity({ subject: s.homeManager })
    .action(api.players.create, {
      clubId: s.homeClubId,
      firstName: "Déjà",
      lastName: "Là",
      licenseNumber: "L0002",
      email: "deja@club-a.fr",
    });

  expect(account).toMatchObject({ linkedExisting: true, temporaryPassword: null });
  expect(await t.run(async (ctx) => (await ctx.db.get(existing))?.playerId)).toBe(playerId);
  // Aucun compte supplémentaire.
  expect(await t.withIdentity({ subject: s.admin }).query(api.users.list, {})).toHaveLength(4);
});

test("une adresse déjà rattachée à un autre licencié est refusée", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const asHome = t.withIdentity({ subject: s.homeManager });
  await asHome.action(api.players.create, {
    clubId: s.homeClubId,
    firstName: "Camille",
    lastName: "Durand",
    licenseNumber: "L0001",
    email: "camille@club-a.fr",
  });

  await expect(
    asHome.action(api.players.create, {
      clubId: s.homeClubId,
      firstName: "Autre",
      lastName: "Personne",
      licenseNumber: "L0002",
      email: "camille@club-a.fr",
    }),
  ).rejects.toThrow(/déjà rattachée/i);
});

test("une adresse invraisemblable est refusée avant toute création", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);

  await expect(
    t.withIdentity({ subject: s.homeManager }).action(api.players.create, {
      clubId: s.homeClubId,
      firstName: "Camille",
      lastName: "Durand",
      licenseNumber: "L0001",
      email: "camille-at-club",
    }),
  ).rejects.toThrow(/adresse e-mail/i);

  // Rien n'a été créé.
  expect(
    await t.withIdentity({ subject: s.homeManager }).query(api.players.listByClub, {
      clubId: s.homeClubId,
    }),
  ).toHaveLength(0);
});

test("un responsable étranger au club ne peut pas créer de licencié", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);

  await expect(
    t.withIdentity({ subject: s.awayManager }).action(api.players.create, {
      clubId: s.homeClubId,
      firstName: "Intrus",
      lastName: "Personne",
      licenseNumber: "L9999",
      email: "intrus@ailleurs.fr",
    }),
  ).rejects.toThrow(/ne gérez aucune équipe de ce club/i);
  await expect(
    t.action(api.players.create, {
      clubId: s.homeClubId,
      firstName: "Anonyme",
      lastName: "Personne",
      licenseNumber: "L9998",
    }),
  ).rejects.toThrow(/authentification requise/i);
});

test("sans fournisseur configuré, le compte est créé et l'échec d'envoi est rapporté", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);

  const { account } = await t.withIdentity({ subject: s.homeManager }).action(api.players.create, {
    clubId: s.homeClubId,
    firstName: "Camille",
    lastName: "Durand",
    licenseNumber: "L0001",
    email: "camille@club-a.fr",
  });

  expect(account?.temporaryPassword).not.toBeNull();
  expect(account?.mail).toMatchObject({ sent: false });
  expect(account?.mail?.error).toMatch(/BREVO_API_KEY/);
});

test("un compte rattaché à une adresse existante ne déclenche aucun envoi", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  await seedAccount(t, { email: "deja@club-a.fr", name: "Déjà là", role: "player" });

  const { account } = await t.withIdentity({ subject: s.homeManager }).action(api.players.create, {
    clubId: s.homeClubId,
    firstName: "Déjà",
    lastName: "Là",
    licenseNumber: "L0002",
    email: "deja@club-a.fr",
  });

  expect(account).toMatchObject({ linkedExisting: true, mail: null });
});

test("le message part chez Brevo avec la bonne requête quand la configuration est là", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  vi.stubEnv("BREVO_API_KEY", "cle-de-test");
  vi.stubEnv("MAIL_SENDER_EMAIL", "volley@ufolep19.fr");
  vi.stubEnv("SITE_URL", "https://ufolep19.vercel.app");
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response("{}", { status: 201 });
  });

  const { account } = await t.withIdentity({ subject: s.homeManager }).action(api.players.create, {
    clubId: s.homeClubId,
    firstName: "Camille",
    lastName: "Durand",
    licenseNumber: "L0001",
    email: "camille@club-a.fr",
  });

  expect(account?.mail).toEqual({ sent: true, error: null });
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe("https://api.brevo.com/v3/smtp/email");
  expect((calls[0].init.headers as Record<string, string>)["api-key"]).toBe("cle-de-test");
  const body = JSON.parse(String(calls[0].init.body));
  expect(body).toMatchObject({
    sender: { email: "volley@ufolep19.fr" },
    to: [{ email: "camille@club-a.fr", name: "Camille Durand" }],
  });
  // Le mot de passe rendu à l'écran est bien celui envoyé.
  expect(body.textContent).toContain(account?.temporaryPassword);
  expect(body.textContent).toContain("https://ufolep19.vercel.app/connexion");

  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test("un refus de Brevo est remonté avec son motif, sans empêcher la création", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  vi.stubEnv("BREVO_API_KEY", "cle-invalide");
  vi.stubEnv("MAIL_SENDER_EMAIL", "volley@ufolep19.fr");
  vi.stubEnv("SITE_URL", "https://ufolep19.vercel.app");
  vi.stubGlobal("fetch", async () =>
    new Response('{"message":"Sender not verified"}', { status: 400 }),
  );

  const { playerId, account } = await t
    .withIdentity({ subject: s.homeManager })
    .action(api.players.create, {
      clubId: s.homeClubId,
      firstName: "Camille",
      lastName: "Durand",
      licenseNumber: "L0001",
      email: "camille@club-a.fr",
    });

  expect(playerId).toBeDefined();
  expect(account?.mail?.sent).toBe(false);
  expect(account?.mail?.error).toMatch(/400.*Sender not verified/);
  expect(account?.temporaryPassword).not.toBeNull();

  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
