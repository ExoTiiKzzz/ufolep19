import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { requireAdmin } from "./authz";
import { matchSummary, summarize } from "./matches";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Vues de pilotage de l'administrateur.
 *
 * Aucune notification n'est envoyée (ADR-0002) : ces vues sont le seul filet de sécurité
 * du comité pour repérer ce qui traîne et relancer les responsables concernés.
 */

/** Matchs sans créneau ferme dont la fenêtre de journée se termine bientôt, ou est passée. */
export const overdueSlots = query({
  args: {},
  returns: v.array(
    v.object({
      match: matchSummary,
      windowClosed: v.boolean(),
      managers: v.array(v.string()),
    }),
  ),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const pending = [
      ...(await ctx.db.query("matches").withIndex("by_state", (q) => q.eq("state", "planned")).collect()),
      ...(await ctx.db
        .query("matches")
        .withIndex("by_state", (q) => q.eq("state", "awaitingSlot"))
        .collect()),
    ];

    const rows = [];
    for (const match of pending) {
      const matchday = await ctx.db.get(match.matchdayId);
      if (matchday === null || matchday.windowEnd > now + WEEK_MS) {
        continue;
      }
      const managers: string[] = [];
      for (const teamId of [match.homeTeamId, match.awayTeamId]) {
        const rattachements = await ctx.db
          .query("teamManagers")
          .withIndex("by_team", (q) => q.eq("teamId", teamId))
          .collect();
        for (const rattachement of rattachements) {
          const user = await ctx.db.get(rattachement.userId);
          if (user !== null) {
            managers.push(user.name ?? user.email ?? "Compte sans nom");
          }
        }
      }
      rows.push({
        match: await summarize(ctx, match),
        windowClosed: matchday.windowEnd < now,
        managers,
      });
    }
    return rows.sort((a, b) => a.match.windowEnd - b.match.windowEnd);
  },
});

/** Matchs bloqués : feuille non saisie après la date, feuille non validée, litige ouvert. */
export const stalled = query({
  args: {},
  returns: v.array(
    v.object({
      match: matchSummary,
      reason: v.union(
        v.literal("sheetMissing"),
        v.literal("sheetPending"),
        v.literal("disputed"),
      ),
    }),
  ),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const rows = [];

    for (const match of await ctx.db
      .query("matches")
      .withIndex("by_state", (q) => q.eq("state", "confirmed"))
      .collect()) {
      if (match.slot !== undefined && match.slot.at < now) {
        rows.push({ match: await summarize(ctx, match), reason: "sheetMissing" as const });
      }
    }
    for (const match of await ctx.db
      .query("matches")
      .withIndex("by_state", (q) => q.eq("state", "awaitingSheet"))
      .collect()) {
      rows.push({ match: await summarize(ctx, match), reason: "sheetPending" as const });
    }
    for (const match of await ctx.db
      .query("matches")
      .withIndex("by_state", (q) => q.eq("state", "disputed"))
      .collect()) {
      rows.push({ match: await summarize(ctx, match), reason: "disputed" as const });
    }
    return rows;
  },
});

/**
 * Joueurs alignés pour deux équipes différentes dans la même journée.
 *
 * Le cumul est **autorisé** : cette vue le rend visible sans l'interdire. Elle passe par
 * l'index des compositions par journée, sans balayage de table.
 */
export const playerOverlaps = query({
  args: { championshipId: v.id("championships") },
  returns: v.array(
    v.object({
      playerId: v.id("players"),
      playerName: v.string(),
      matchdayNumber: v.number(),
      teams: v.array(v.string()),
    }),
  ),
  handler: async (ctx, { championshipId }) => {
    await requireAdmin(ctx);
    const matchdays = await ctx.db
      .query("matchdays")
      .withIndex("by_championship", (q) => q.eq("championshipId", championshipId))
      .collect();

    const rows = [];
    for (const matchday of matchdays) {
      const entries = await ctx.db
        .query("lineupEntries")
        .withIndex("by_matchday", (q) => q.eq("matchdayId", matchday._id))
        .collect();

      const byPlayer = new Map<Id<"players">, Set<Id<"teams">>>();
      for (const entry of entries) {
        const teams = byPlayer.get(entry.playerId) ?? new Set<Id<"teams">>();
        teams.add(entry.teamId);
        byPlayer.set(entry.playerId, teams);
      }

      for (const [playerId, teamIds] of byPlayer) {
        if (teamIds.size < 2) {
          continue;
        }
        const player = await ctx.db.get(playerId);
        const names: string[] = [];
        for (const teamId of teamIds) {
          const team = await ctx.db.get(teamId);
          names.push(team?.name ?? "");
        }
        rows.push({
          playerId,
          playerName:
            player === null ? "Joueur supprimé" : `${player.firstName} ${player.lastName}`,
          matchdayNumber: matchday.number,
          teams: names.sort(),
        });
      }
    }

    return rows.sort((a, b) => a.matchdayNumber - b.matchdayNumber);
  },
});

/** Avancement de chaque championnat de la saison courante. */
export const progress = query({
  args: {},
  returns: v.array(
    v.object({
      championshipId: v.id("championships"),
      championshipName: v.string(),
      total: v.number(),
      completed: v.number(),
      negotiating: v.number(),
      confirmed: v.number(),
      disputed: v.number(),
    }),
  ),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const season = await ctx.db
      .query("seasons")
      .withIndex("by_current", (q) => q.eq("isCurrent", true))
      .unique();
    if (season === null) {
      return [];
    }
    const championships = await ctx.db
      .query("championships")
      .withIndex("by_season", (q) => q.eq("seasonId", season._id))
      .collect();

    return await Promise.all(
      championships.map(async (championship) => {
        const matches = await ctx.db
          .query("matches")
          .withIndex("by_championship", (q) => q.eq("championshipId", championship._id))
          .collect();
        const count = (states: string[]) =>
          matches.filter((match) => states.includes(match.state)).length;
        return {
          championshipId: championship._id,
          championshipName: championship.name,
          total: matches.length,
          completed: count(["completed"]),
          negotiating: count(["planned", "awaitingSlot"]),
          confirmed: count(["confirmed", "awaitingSheet"]),
          disputed: count(["disputed"]),
        };
      }),
    );
  },
});
