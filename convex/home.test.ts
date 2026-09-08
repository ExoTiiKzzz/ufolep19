import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { modules, setupChampionship, WINDOW_END, WINDOW_START } from "./test.setup";

afterEach(() => {
  vi.useRealTimers();
});

test("les championnats sont listés saison courante en tête", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  await t.run(async (ctx) => {
    const older = await ctx.db.insert("seasons", { label: "2024-2025", isCurrent: false });
    await ctx.db.insert("championships", { seasonId: older, name: "Départemental mixte" });
    await ctx.db.insert("championships", { seasonId: s.seasonId, name: "Loisir" });
  });

  const all = await t.query(api.championships.listAll, {});
  expect(all.map((row) => [row.seasonLabel, row.name])).toEqual([
    ["2025-2026", "Départemental mixte"],
    ["2025-2026", "Loisir"],
    ["2024-2025", "Départemental mixte"],
  ]);
  expect(all[0].isCurrentSeason).toBe(true);
});

test("pendant une fenêtre, la journée en cours est rendue avec ses matchs", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(WINDOW_START + 86_400_000));
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);

  const day = await t.query(api.matchdays.currentOrNext, {
    championshipId: s.championshipId,
  });
  expect(day).toMatchObject({ number: 1, status: "current" });
  expect(day?.matches.map((match) => match.homeTeamName)).toEqual(["Club A 1"]);
});

test("entre deux journées, c'est la prochaine qui est rendue", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("matchdays", {
      championshipId: s.championshipId,
      number: 2,
      windowStart: WINDOW_END + 7 * 86_400_000,
      windowEnd: WINDOW_END + 21 * 86_400_000,
    });
  });

  // Après la fermeture de la journée 1, avant l'ouverture de la journée 2.
  vi.setSystemTime(new Date(WINDOW_END + 86_400_000));

  const day = await t.query(api.matchdays.currentOrNext, {
    championshipId: s.championshipId,
  });
  expect(day).toMatchObject({ number: 2, status: "upcoming" });
});

test("avant le début de la saison, c'est la première journée qui est rendue", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(WINDOW_START - 30 * 86_400_000));
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);

  expect(
    await t.query(api.matchdays.currentOrNext, { championshipId: s.championshipId }),
  ).toMatchObject({ number: 1, status: "upcoming" });
});

test("la saison finie, la dernière journée est rendue plutôt qu'un écran vide", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  await t.run(async (ctx) => {
    await ctx.db.insert("matchdays", {
      championshipId: s.championshipId,
      number: 2,
      windowStart: WINDOW_END + 7 * 86_400_000,
      windowEnd: WINDOW_END + 21 * 86_400_000,
    });
  });
  vi.setSystemTime(new Date(WINDOW_END + 60 * 86_400_000));

  expect(
    await t.query(api.matchdays.currentOrNext, { championshipId: s.championshipId }),
  ).toMatchObject({ number: 2, status: "past" });
});

test("un championnat sans journée ne rend rien, sans échouer", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const empty = await t.run(async (ctx) =>
    ctx.db.insert("championships", { seasonId: s.seasonId, name: "Championnat vide" }),
  );

  expect(await t.query(api.matchdays.currentOrNext, { championshipId: empty })).toBeNull();
});

test("la journée en cours est lisible sans compte et sans nom de joueur", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(WINDOW_START + 86_400_000));
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);

  const payload = JSON.stringify([
    await t.query(api.matchdays.currentOrNext, { championshipId: s.championshipId }),
    await t.query(api.championships.listAll, {}),
  ]);
  expect(payload).not.toContain("Joueuse");
});
