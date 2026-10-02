import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules, seedAccount } from "./test.setup";

async function withAdmin(t: ReturnType<typeof convexTest>) {
  const admin = await seedAccount(t, {
    email: "comite@ufolep19.fr",
    name: "Comité",
    role: "admin",
  });
  return t.withIdentity({ subject: admin });
}

type Admin = Awaited<ReturnType<typeof withAdmin>>;

/** Championnat standard de niveau 1, dans un circuit créé pour l'occasion. */
async function createChampionship(admin: Admin, seasonId: Id<"seasons">, name: string) {
  const circuitId = await admin.mutation(api.circuits.create, { seasonId, name: "Championnat" });
  return await admin.mutation(api.championships.create, {
    seasonId,
    circuitId,
    name,
    level: 1,
    format: "standard",
    reinforcementQuota: null,
  });
}

test("la première saison créée devient courante, les suivantes non", async () => {
  const t = convexTest(schema, modules);
  const admin = await withAdmin(t);

  await admin.mutation(api.seasons.create, { label: "2025-2026" });
  await admin.mutation(api.seasons.create, { label: "2026-2027" });

  const seasons = await t.query(api.seasons.list, {});
  expect(seasons.map((s) => [s.label, s.isCurrent])).toEqual([
    ["2026-2027", false],
    ["2025-2026", true],
  ]);
});

test("désigner la saison courante bascule la précédente", async () => {
  const t = convexTest(schema, modules);
  const admin = await withAdmin(t);
  await admin.mutation(api.seasons.create, { label: "2025-2026" });
  const next = await admin.mutation(api.seasons.create, { label: "2026-2027" });

  await admin.mutation(api.seasons.setCurrent, { seasonId: next });

  const current = await t.query(api.seasons.current, {});
  expect(current?.label).toBe("2026-2027");
  expect((await t.query(api.seasons.list, {})).filter((s) => s.isCurrent)).toHaveLength(1);
});

test("un libellé de saison en doublon est refusé", async () => {
  const t = convexTest(schema, modules);
  const admin = await withAdmin(t);
  await admin.mutation(api.seasons.create, { label: "2025-2026" });

  await expect(
    admin.mutation(api.seasons.create, { label: " 2025-2026 " }),
  ).rejects.toThrow(/existe déjà/i);
});

test("seul un administrateur met en place la structure", async () => {
  const t = convexTest(schema, modules);
  const manager = await seedAccount(t, {
    email: "responsable@club.fr",
    name: "Responsable",
    role: "manager",
  });

  await expect(t.mutation(api.seasons.create, { label: "2025-2026" })).rejects.toThrow(
    /authentification requise/i,
  );
  await expect(
    t.withIdentity({ subject: manager }).mutation(api.seasons.create, { label: "2025-2026" }),
  ).rejects.toThrow(/réservée aux administrateurs/i);
  await expect(
    t
      .withIdentity({ subject: manager })
      .mutation(api.clubs.create, { name: "Club A", defaultVenue: "Gymnase" }),
  ).rejects.toThrow(/réservée aux administrateurs/i);
});

test("un club en doublon de nom est refusé", async () => {
  const t = convexTest(schema, modules);
  const admin = await withAdmin(t);
  await admin.mutation(api.clubs.create, { name: "Club A", defaultVenue: "Gymnase A" });

  await expect(
    admin.mutation(api.clubs.create, { name: "Club A", defaultVenue: "Autre" }),
  ).rejects.toThrow(/existe déjà/i);
});

test("un championnat sur une saison inconnue est refusé", async () => {
  const t = convexTest(schema, modules);
  const admin = await withAdmin(t);
  const seasonId = await admin.mutation(api.seasons.create, { label: "2025-2026" });
  const circuitId = await admin.mutation(api.circuits.create, { seasonId, name: "Championnat" });
  await t.run(async (ctx) => ctx.db.delete(seasonId));

  await expect(
    admin.mutation(api.championships.create, {
      seasonId,
      circuitId,
      name: "Départemental",
      level: 1,
      format: "standard",
      reinforcementQuota: null,
    }),
  ).rejects.toThrow(/saison inconnue/i);
});

test("la saison d'une équipe est dérivée de son championnat", async () => {
  const t = convexTest(schema, modules);
  const admin = await withAdmin(t);
  const seasonId = await admin.mutation(api.seasons.create, { label: "2025-2026" });
  const championshipId = await createChampionship(admin, seasonId, "Départemental");
  const clubId = await admin.mutation(api.clubs.create, {
    name: "Club A",
    defaultVenue: "Gymnase A",
  }).then((result) => result.clubId);

  const teamId = await admin.mutation(api.teams.create, {
    clubId,
    championshipId,
    name: "Club A 1",
  });

  const team = await t.run(async (ctx) => ctx.db.get(teamId));
  expect(team?.seasonId).toBe(seasonId);
});

test("les équipes engagées sont listées avec leur club, sans compte", async () => {
  const t = convexTest(schema, modules);
  const admin = await withAdmin(t);
  const seasonId = await admin.mutation(api.seasons.create, { label: "2025-2026" });
  const championshipId = await createChampionship(admin, seasonId, "Départemental");
  const clubId = await admin.mutation(api.clubs.create, {
    name: "Club A",
    defaultVenue: "Gymnase A",
  }).then((result) => result.clubId);
  await admin.mutation(api.teams.create, { clubId, championshipId, name: "Club A 1" });
  await admin.mutation(api.teams.create, { clubId, championshipId, name: "Club A 2" });

  const teams = await t.query(api.teams.listByChampionship, { championshipId });
  expect(teams.map((team) => [team.name, team.clubName])).toEqual([
    ["Club A 1", "Club A"],
    ["Club A 2", "Club A"],
  ]);
});

test("une équipe engagée dans un championnat inconnu est refusée", async () => {
  const t = convexTest(schema, modules);
  const admin = await withAdmin(t);
  const seasonId = await admin.mutation(api.seasons.create, { label: "2025-2026" });
  const championshipId = await createChampionship(admin, seasonId, "Départemental");
  const clubId = await admin.mutation(api.clubs.create, {
    name: "Club A",
    defaultVenue: "Gymnase A",
  }).then((result) => result.clubId);
  await t.run(async (ctx) => ctx.db.delete(championshipId));

  await expect(
    admin.mutation(api.teams.create, { clubId, championshipId, name: "Club A 1" }),
  ).rejects.toThrow(/championnat inconnu/i);
});

test("un championnat porte un circuit de sa saison, un niveau et un format", async () => {
  const t = convexTest(schema, modules);
  const admin = await withAdmin(t);
  const seasonId = await admin.mutation(api.seasons.create, { label: "2025-2026" });
  const otherSeason = await admin.mutation(api.seasons.create, { label: "2026-2027" });
  const main = await admin.mutation(api.circuits.create, { seasonId, name: "Championnat" });
  const foreign = await admin.mutation(api.circuits.create, {
    seasonId: otherSeason,
    name: "Championnat",
  });
  const base = { seasonId, name: "Mixte", format: "standard" as const };

  await expect(
    admin.mutation(api.championships.create, {
      ...base,
      circuitId: foreign,
      level: 3,
      reinforcementQuota: null,
    }),
  ).rejects.toThrow(/n'appartient pas à la saison/i);
  await expect(
    admin.mutation(api.championships.create, {
      ...base,
      circuitId: main,
      level: 0,
      reinforcementQuota: null,
    }),
  ).rejects.toThrow(/niveau/i);
  await expect(
    admin.mutation(api.championships.create, {
      ...base,
      circuitId: main,
      level: 3,
      reinforcementQuota: { maxPlayers: 2, completeTo: 1 },
    }),
  ).rejects.toThrow(/compléter/i);

  const mixte = await admin.mutation(api.championships.create, {
    ...base,
    circuitId: main,
    level: 3,
    reinforcementQuota: { maxPlayers: 2, completeTo: 6 },
  });
  expect(await t.query(api.championships.get, { championshipId: mixte })).toMatchObject({
    circuitName: "Championnat",
    level: 3,
    format: "standard",
    reinforcementQuota: { maxPlayers: 2, completeTo: 6 },
  });
});

test("deux circuits du même nom dans une saison sont refusés", async () => {
  const t = convexTest(schema, modules);
  const admin = await withAdmin(t);
  const seasonId = await admin.mutation(api.seasons.create, { label: "2025-2026" });
  await admin.mutation(api.circuits.create, { seasonId, name: "Coupe" });
  await expect(admin.mutation(api.circuits.create, { seasonId, name: "coupe" })).rejects.toThrow(
    /existe déjà/i,
  );
});

test("le format d'un championnat ne change plus une fois une journée créée", async () => {
  const t = convexTest(schema, modules);
  const admin = await withAdmin(t);
  const seasonId = await admin.mutation(api.seasons.create, { label: "2025-2026" });
  const championshipId = await createChampionship(admin, seasonId, "Féminin");
  const championship = await t.query(api.championships.get, { championshipId });
  const settings = {
    championshipId,
    name: "Féminin",
    circuitId: championship!.circuitId,
    level: 1,
    reinforcementQuota: null,
  };

  // Sans journée, le format se change librement.
  await admin.mutation(api.championships.update, { ...settings, format: "plateau" });
  await admin.mutation(api.championships.update, { ...settings, format: "standard" });

  await admin.mutation(api.matchdays.create, {
    championshipId,
    number: 1,
    windowStart: Date.UTC(2026, 0, 5),
    windowEnd: Date.UTC(2026, 0, 18),
  });
  await expect(
    admin.mutation(api.championships.update, { ...settings, format: "plateau" }),
  ).rejects.toThrow(/format ne se change plus/i);
  // Le reste se modifie toujours.
  await admin.mutation(api.championships.update, {
    ...settings,
    name: "Féminin (plateaux)",
    level: 2,
    format: "standard",
  });
  expect(await t.query(api.championships.get, { championshipId })).toMatchObject({
    name: "Féminin (plateaux)",
    level: 2,
  });
});
