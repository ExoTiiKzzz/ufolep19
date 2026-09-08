/// <reference types="vite/client" />

import type { TestConvex } from "convex-test";

import type { Id } from "./_generated/dataModel";
import type schema from "./schema";

/**
 * Modules Convex chargés par `convex-test`.
 *
 * Le motif extglob de la documentation `convex-test` (`./**\/!(*.*.)*.*s`) ne
 * renvoie plus rien avec la version de Vite embarquée par Vitest 5 : l'extglob
 * n'y est pas interprété. On énumère donc explicitement, en excluant les
 * déclarations de types et les fichiers de test, qui ne sont pas des modules
 * Convex.
 */
export const modules = import.meta.glob([
  "./**/*.ts",
  "./**/*.js",
  "!./**/*.d.ts",
  "!./**/*.test.ts",
  "!./**/*.setup.ts",
]);

type T = TestConvex<typeof schema>;

export type Role = "player" | "manager" | "admin";

/**
 * Repères temporels des tests. Une journée dont la fenêtre court du 5 au 18 janvier 2026,
 * et un créneau le samedi 10 janvier à 20 h (heure de Paris, UTC+1 en janvier).
 */
export const WINDOW_START = Date.UTC(2026, 0, 5, 0, 0);
export const WINDOW_END = Date.UTC(2026, 0, 18, 23, 59);
export const SLOT_AT = Date.UTC(2026, 0, 10, 19, 0);
/** Un instant confortablement antérieur au créneau, pour poser l'horloge des tests. */
export const BEFORE_WINDOW = Date.UTC(2025, 11, 15, 12, 0);

/**
 * Crée un compte directement en base, sans mot de passe : suffisant pour incarner un
 * rôle dans les tests d'autorisation. Le vrai chemin de création (avec identifiants)
 * est couvert par les tests de `admin:createAdmin`.
 */
export async function seedAccount(
  t: T,
  { email, name, role }: { email: string; name: string; role: Role },
) {
  return await t.run(async (ctx) => ctx.db.insert("users", { email, name, role }));
}

export async function seedSeason(
  t: T,
  { label, isCurrent = false }: { label: string; isCurrent?: boolean },
) {
  return await t.run(async (ctx) => ctx.db.insert("seasons", { label, isCurrent }));
}

/**
 * Championnat prêt à jouer : une saison courante, deux clubs, deux équipes engagées avec
 * leur responsable, et un administrateur. Sans ce helper, chaque test noierait la règle
 * qu'il protège dans vingt lignes de préparation.
 *
 * Ce helper grossit ticket après ticket (journée, match, effectifs).
 */
export async function setupChampionship(t: T, { label = "2025-2026" } = {}) {
  const admin = await seedAccount(t, {
    email: "comite@ufolep19.fr",
    name: "Comité UFOLEP 19",
    role: "admin",
  });
  const homeManager = await seedAccount(t, {
    email: "receveur@club-a.fr",
    name: "Responsable Club A",
    role: "manager",
  });
  const awayManager = await seedAccount(t, {
    email: "visiteur@club-b.fr",
    name: "Responsable Club B",
    role: "manager",
  });

  return await t.run(async (ctx) => {
    const seasonId = await ctx.db.insert("seasons", { label, isCurrent: true });
    const championshipId = await ctx.db.insert("championships", {
      seasonId,
      name: "Départemental mixte",
    });
    const homeClubId = await ctx.db.insert("clubs", {
      name: "Club A",
      defaultVenue: "Gymnase du Coiroux",
    });
    const awayClubId = await ctx.db.insert("clubs", {
      name: "Club B",
      defaultVenue: "Gymnase de Malemort",
    });
    const homeTeamId = await ctx.db.insert("teams", {
      clubId: homeClubId,
      seasonId,
      championshipId,
      name: "Club A 1",
    });
    const awayTeamId = await ctx.db.insert("teams", {
      clubId: awayClubId,
      seasonId,
      championshipId,
      name: "Club B 1",
    });
    await ctx.db.insert("teamManagers", { teamId: homeTeamId, userId: homeManager });
    await ctx.db.insert("teamManagers", { teamId: awayTeamId, userId: awayManager });

    const matchdayId = await ctx.db.insert("matchdays", {
      championshipId,
      number: 1,
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
    });
    const matchId = await ctx.db.insert("matches", {
      championshipId,
      matchdayId,
      homeTeamId,
      awayTeamId,
      state: "planned",
    });

    return {
      admin,
      homeManager,
      awayManager,
      seasonId,
      championshipId,
      homeClubId,
      awayClubId,
      homeTeamId,
      awayTeamId,
      matchdayId,
      matchId,
    };
  });
}

/** Ajoute des joueurs à l'effectif d'une équipe et renvoie leurs identifiants. */
export async function seedRoster(
  t: T,
  { teamId, clubId, count }: { teamId: Id<"teams">; clubId: Id<"clubs">; count: number },
) {
  return await t.run(async (ctx) => {
    const ids: Id<"players">[] = [];
    for (let i = 1; i <= count; i++) {
      const playerId = await ctx.db.insert("players", {
        clubId,
        firstName: `Joueuse${i}`,
        lastName: `Nom${i}`,
        licenseNumber: `L${String(i).padStart(4, "0")}`,
      });
      await ctx.db.insert("rosterEntries", { teamId, playerId });
      ids.push(playerId);
    }
    return ids;
  });
}

/**
 * Amène un match à l'état « créneau ferme » sans rejouer la négociation, pour les tests
 * qui portent sur la suite du cycle de vie.
 */
export async function forceConfirmed(
  t: T,
  {
    matchId,
    proposedBy,
    at = SLOT_AT,
    venue = "Gymnase du Coiroux",
  }: {
    matchId: Id<"matches">;
    proposedBy: Id<"users">;
    at?: number;
    venue?: string;
  },
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("slotProposals", {
      matchId,
      at,
      venue,
      proposedBy,
      status: "accepted",
      respondedAt: at,
    });
    await ctx.db.patch(matchId, { state: "confirmed", slot: { at, venue } });
  });
}

/** Effectifs des deux équipes, prêts à être alignés sur une feuille de match. */
export async function seedBothRosters(
  t: T,
  s: { homeTeamId: Id<"teams">; homeClubId: Id<"clubs">; awayTeamId: Id<"teams">; awayClubId: Id<"clubs"> },
  count = 8,
) {
  const home = await seedRoster(t, { teamId: s.homeTeamId, clubId: s.homeClubId, count });
  const away = await seedRoster(t, { teamId: s.awayTeamId, clubId: s.awayClubId, count });
  return { home, away };
}

/** Un 3-1 valide, pour les tests qui ne portent pas sur les règles de score. */
export const VALID_SETS = [
  { home: 25, away: 20 },
  { home: 18, away: 25 },
  { home: 25, away: 22 },
  { home: 25, away: 19 },
];
