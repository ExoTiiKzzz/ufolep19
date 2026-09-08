import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import { modules, seedSeason } from "./test.setup";

test("les saisons sont listées de la plus récente à la plus ancienne", async () => {
  const t = convexTest(schema, modules);
  await seedSeason(t, { label: "2024-2025" });
  await seedSeason(t, { label: "2026-2027" });
  await seedSeason(t, { label: "2025-2026", isCurrent: true });

  const seasons = await t.query(api.seasons.list, {});

  expect(seasons.map((s) => s.label)).toEqual(["2026-2027", "2025-2026", "2024-2025"]);
});

test("la saison courante est signalée, les autres non", async () => {
  const t = convexTest(schema, modules);
  await seedSeason(t, { label: "2024-2025" });
  await seedSeason(t, { label: "2025-2026", isCurrent: true });

  const seasons = await t.query(api.seasons.list, {});

  expect(seasons.filter((s) => s.isCurrent).map((s) => s.label)).toEqual(["2025-2026"]);
});

test("la liste est vide sur une base vierge, sans échouer", async () => {
  const t = convexTest(schema, modules);

  expect(await t.query(api.seasons.list, {})).toEqual([]);
});

test("un visiteur anonyme peut lire les saisons", async () => {
  const t = convexTest(schema, modules);
  await seedSeason(t, { label: "2025-2026", isCurrent: true });

  // Aucun `withIdentity` : la lecture publique ne demande pas de compte.
  const seasons = await t.query(api.seasons.list, {});

  expect(seasons).toHaveLength(1);
});
