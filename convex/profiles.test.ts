import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import {
  forceConfirmed,
  modules,
  seedBothRosters,
  seedRoster,
  setupChampionship,
  SLOT_AT,
  VALID_SETS,
} from "./test.setup";

afterEach(() => {
  vi.useRealTimers();
});

test("la fiche d'un club expose ses équipes, saison courante en tête", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  // Une équipe du même club dans une saison antérieure.
  await t.run(async (ctx) => {
    const seasonId = await ctx.db.insert("seasons", { label: "2024-2025", isCurrent: false });
    const championshipId = await ctx.db.insert("championships", {
      seasonId,
      name: "Départemental mixte",
    });
    await ctx.db.insert("teams", {
      clubId: s.homeClubId,
      seasonId,
      championshipId,
      name: "Club A 1",
    });
  });

  const club = await t.query(api.clubs.get, { clubId: s.homeClubId });
  expect(club).toMatchObject({ name: "Club A", defaultVenue: "Gymnase du Coiroux" });
  expect(club?.teams.map((team) => [team.seasonLabel, team.isCurrentSeason])).toEqual([
    ["2025-2026", true],
    ["2024-2025", false],
  ]);
});

test("la fiche d'un club est lisible sans compte, mais pas ses licenciés", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  await seedBothRosters(t, s, 3);

  expect(await t.query(api.clubs.get, { clubId: s.homeClubId })).not.toBeNull();
  await expect(t.query(api.players.listByClub, { clubId: s.homeClubId })).rejects.toThrow(
    /authentification requise/i,
  );
});

test("la fiche d'une équipe expose son club, son championnat et sa saison", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);

  const team = await t.query(api.teams.get, { teamId: s.homeTeamId });
  expect(team).toMatchObject({
    name: "Club A 1",
    clubName: "Club A",
    clubVenue: "Gymnase du Coiroux",
    championshipName: "Départemental mixte",
    seasonLabel: "2025-2026",
    isCurrentSeason: true,
  });
});

test("les matchs d'une équipe rassemblent ses réceptions et ses déplacements", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  // Match retour, où l'équipe se déplace.
  await t.run(async (ctx) => {
    const matchdayId = await ctx.db.insert("matchdays", {
      championshipId: s.championshipId,
      number: 2,
      windowStart: 0,
      windowEnd: 1,
    });
    await ctx.db.insert("matches", {
      championshipId: s.championshipId,
      matchdayId,
      homeTeamId: s.awayTeamId,
      awayTeamId: s.homeTeamId,
      state: "planned",
    });
  });

  const matches = await t.query(api.teams.matches, { teamId: s.homeTeamId });
  expect(matches.map((match) => [match.matchdayNumber, match.homeTeamName])).toEqual([
    [1, "Club A 1"],
    [2, "Club B 1"],
  ]);
});

test("la fiche d'un joueur est refusée sans compte", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const rosters = await seedBothRosters(t, s, 3);

  await expect(t.query(api.players.get, { playerId: rosters.home[0] })).rejects.toThrow(
    /authentification requise/i,
  );
});

test("la fiche d'un joueur liste ses équipes et les matchs où il a été aligné", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(SLOT_AT - 7 * 86_400_000));
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const rosters = await seedBothRosters(t, s, 8);
  await forceConfirmed(t, { matchId: s.matchId, proposedBy: s.homeManager });
  vi.setSystemTime(new Date(SLOT_AT + 3_600_000));
  await t.withIdentity({ subject: s.homeManager }).mutation(api.sheets.submit, {
    matchId: s.matchId,
    sets: VALID_SETS,
    homeLineup: rosters.home.slice(0, 6),
    awayLineup: rosters.away.slice(0, 6),
  });

  const aligned = await t
    .withIdentity({ subject: s.homeManager })
    .query(api.players.get, { playerId: rosters.home[0] });
  expect(aligned).toMatchObject({ clubName: "Club A" });
  expect(aligned?.teams.map((team) => team.name)).toEqual(["Club A 1"]);
  expect(aligned?.appearances).toHaveLength(1);
  expect(aligned?.appearances[0]).toMatchObject({
    teamName: "Club A 1",
    match: { homeTeamName: "Club A 1", awayTeamName: "Club B 1" },
  });

  // Un joueur de l'effectif resté sur le banc n'a aucune apparition.
  const benched = await t
    .withIdentity({ subject: s.homeManager })
    .query(api.players.get, { playerId: rosters.home[7] });
  expect(benched?.teams.map((team) => team.name)).toEqual(["Club A 1"]);
  expect(benched?.appearances).toHaveLength(0);
});

test("les nouvelles queries publiques ne renvoient aucun nom de personne", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const rosters = await seedBothRosters(t, s, 3);
  const lastName = await t.run(async (ctx) => {
    const player = await ctx.db.get(rosters.home[0]);
    return player === null ? "" : player.lastName;
  });

  const payloads = JSON.stringify([
    await t.query(api.clubs.get, { clubId: s.homeClubId }),
    await t.query(api.teams.get, { teamId: s.homeTeamId }),
    await t.query(api.teams.matches, { teamId: s.homeTeamId }),
  ]);
  expect(payloads).not.toContain(lastName);
});

test("l'e-mail d'un licencié ne sort jamais par une query publique", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  await t.withIdentity({ subject: s.homeManager }).action(api.players.create, {
    clubId: s.homeClubId,
    firstName: "Camille",
    lastName: "Durand",
    licenseNumber: "L0001",
    email: "camille.durand@club-a.fr",
  });

  const payloads = JSON.stringify([
    await t.query(api.clubs.get, { clubId: s.homeClubId }),
    await t.query(api.clubs.list, {}),
    await t.query(api.teams.get, { teamId: s.homeTeamId }),
    await t.query(api.teams.matches, { teamId: s.homeTeamId }),
    await t.query(api.matches.listByChampionship, { championshipId: s.championshipId }),
    await t.query(api.standings.byChampionship, { championshipId: s.championshipId }),
  ]);

  expect(payloads).not.toContain("camille.durand@club-a.fr");
  // La liste des licenciés, elle, l'expose — mais elle exige un compte.
  await expect(t.query(api.players.listByClub, { clubId: s.homeClubId })).rejects.toThrow(
    /authentification requise/i,
  );
  const list = await t
    .withIdentity({ subject: s.homeManager })
    .query(api.players.listByClub, { clubId: s.homeClubId });
  expect(list[0].email).toBe("camille.durand@club-a.fr");
});

test("la recherche de licenciés trouve par nom, licence et adresse", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const asManager = t.withIdentity({ subject: s.homeManager });
  await asManager.action(api.players.create, {
    clubId: s.homeClubId,
    firstName: "Camille",
    lastName: "Pénicaut",
    licenseNumber: "L0042",
    email: "camille.penicaut@club-a.fr",
  });
  await asManager.action(api.players.create, {
    clubId: s.homeClubId,
    firstName: "Noé",
    lastName: "Lascaux",
    licenseNumber: "L0043",
  });
  const asAdmin = t.withIdentity({ subject: s.admin });

  // Sans terme, toutes les fiches.
  expect((await asAdmin.query(api.players.search, { term: "" })).total).toBe(2);

  // Le nom, sans son accent.
  const byName = await asAdmin.query(api.players.search, { term: "penicaut" });
  expect(byName.players.map((p) => p.lastName)).toEqual(["Pénicaut"]);
  expect(byName.players[0]).toMatchObject({
    clubName: "Club A",
    licenseNumber: "L0042",
    hasAccount: true,
  });

  // Le numéro de licence, et l'adresse.
  expect((await asAdmin.query(api.players.search, { term: "L0043" })).total).toBe(1);
  expect((await asAdmin.query(api.players.search, { term: "club-a.fr" })).total).toBe(1);

  // Un licencié sans adresse n'a pas de compte.
  const withoutEmail = await asAdmin.query(api.players.search, { term: "lascaux" });
  expect(withoutEmail.players[0]).toMatchObject({ email: null, hasAccount: false });
});

test("la recherche indique les équipes du licencié", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  await seedRoster(t, { teamId: s.homeTeamId, clubId: s.homeClubId, count: 1 });

  const found = await t.withIdentity({ subject: s.admin }).query(api.players.search, {
    term: "nom1",
  });
  expect(found.players[0]).toMatchObject({ teamNames: ["Club A 1"] });
});

test("la recherche de licenciés est réservée à l'administrateur", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);

  await expect(t.query(api.players.search, { term: "" })).rejects.toThrow(
    /authentification requise/i,
  );
  await expect(
    t.withIdentity({ subject: s.homeManager }).query(api.players.search, { term: "" }),
  ).rejects.toThrow(/réservée aux administrateurs/i);
});

test("au-delà de la limite, la recherche le signale", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  await t.run(async (ctx) => {
    for (let i = 0; i < 105; i++) {
      await ctx.db.insert("players", {
        clubId: s.homeClubId,
        firstName: `Prénom${i}`,
        lastName: `Nom${String(i).padStart(3, "0")}`,
        licenseNumber: `L${String(i).padStart(4, "0")}`,
      });
    }
  });

  const found = await t
    .withIdentity({ subject: s.admin })
    .query(api.players.search, { term: "" });
  expect(found.total).toBe(105);
  expect(found.players).toHaveLength(100);
  expect(found.truncated).toBe(true);
  // Triées par nom : la première page commence au début de l'alphabet.
  expect(found.players[0].lastName).toBe("Nom000");
});

test("la recherche de licenciés filtre aussi par club", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  await seedRoster(t, { teamId: s.homeTeamId, clubId: s.homeClubId, count: 2 });
  await seedRoster(t, { teamId: s.awayTeamId, clubId: s.awayClubId, count: 3 });
  const asAdmin = t.withIdentity({ subject: s.admin });

  expect((await asAdmin.query(api.players.search, { term: "" })).total).toBe(5);
  const clubA = await asAdmin.query(api.players.search, { term: "club a" });
  expect(clubA.total).toBe(2);
  expect(clubA.players.every((player) => player.clubName === "Club A")).toBe(true);
  expect((await asAdmin.query(api.players.search, { term: "club b" })).total).toBe(3);
});
