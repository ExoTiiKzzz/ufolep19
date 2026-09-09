import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
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
  await t.run(async (ctx) => ctx.db.delete(seasonId));

  await expect(
    admin.mutation(api.championships.create, { seasonId, name: "Départemental" }),
  ).rejects.toThrow(/saison inconnue/i);
});

test("la saison d'une équipe est dérivée de son championnat", async () => {
  const t = convexTest(schema, modules);
  const admin = await withAdmin(t);
  const seasonId = await admin.mutation(api.seasons.create, { label: "2025-2026" });
  const championshipId = await admin.mutation(api.championships.create, {
    seasonId,
    name: "Départemental",
  });
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
  const championshipId = await admin.mutation(api.championships.create, {
    seasonId,
    name: "Départemental",
  });
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
  const championshipId = await admin.mutation(api.championships.create, {
    seasonId,
    name: "Départemental",
  });
  const clubId = await admin.mutation(api.clubs.create, {
    name: "Club A",
    defaultVenue: "Gymnase A",
  }).then((result) => result.clubId);
  await t.run(async (ctx) => ctx.db.delete(championshipId));

  await expect(
    admin.mutation(api.teams.create, { clubId, championshipId, name: "Club A 1" }),
  ).rejects.toThrow(/championnat inconnu/i);
});
