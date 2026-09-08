import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireManagerOfTeam, requireUser } from "./authz";

const rosterPlayer = v.object({
  _id: v.id("players"),
  firstName: v.string(),
  lastName: v.string(),
  licenseNumber: v.string(),
});

/** Effectif d'une équipe. Nominatif : réservé aux comptes connectés. */
export const listByTeam = query({
  args: { teamId: v.id("teams") },
  returns: v.array(rosterPlayer),
  handler: async (ctx, { teamId }) => {
    await requireUser(ctx);
    const entries = await ctx.db
      .query("rosterEntries")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    const players = await Promise.all(entries.map((entry) => ctx.db.get(entry.playerId)));
    return players
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .map((p) => ({
        _id: p._id,
        firstName: p.firstName,
        lastName: p.lastName,
        licenseNumber: p.licenseNumber,
      }))
      .sort((a, b) => a.lastName.localeCompare(b.lastName, "fr"));
  },
});

export const add = mutation({
  args: { teamId: v.id("teams"), playerId: v.id("players") },
  returns: v.null(),
  handler: async (ctx, { teamId, playerId }) => {
    await requireManagerOfTeam(ctx, teamId);
    const team = await ctx.db.get(teamId);
    const player = await ctx.db.get(playerId);
    if (team === null || player === null) {
      throw new ConvexError("Équipe ou joueur inconnu.");
    }
    if (player.clubId !== team.clubId) {
      throw new ConvexError("Un joueur ne peut être aligné que dans une équipe de son club.");
    }
    const existing = await ctx.db
      .query("rosterEntries")
      .withIndex("by_team_and_player", (q) => q.eq("teamId", teamId).eq("playerId", playerId))
      .unique();
    if (existing === null) {
      await ctx.db.insert("rosterEntries", { teamId, playerId });
    }
    return null;
  },
});

export const remove = mutation({
  args: { teamId: v.id("teams"), playerId: v.id("players") },
  returns: v.null(),
  handler: async (ctx, { teamId, playerId }) => {
    await requireManagerOfTeam(ctx, teamId);
    const existing = await ctx.db
      .query("rosterEntries")
      .withIndex("by_team_and_player", (q) => q.eq("teamId", teamId).eq("playerId", playerId))
      .unique();
    if (existing !== null) {
      await ctx.db.delete(existing._id);
    }
    return null;
  },
});

/**
 * Équipe de la saison précédente dont l'effectif peut être repris : même club, même nom,
 * dans la saison la plus récente antérieure à celle de l'équipe visée.
 */
export const previousSeasonTeam = query({
  args: { teamId: v.id("teams") },
  returns: v.union(
    v.object({ _id: v.id("teams"), seasonLabel: v.string(), playerCount: v.number() }),
    v.null(),
  ),
  handler: async (ctx, { teamId }) => {
    await requireUser(ctx);
    const team = await ctx.db.get(teamId);
    if (team === null) {
      return null;
    }
    const season = await ctx.db.get(team.seasonId);
    if (season === null) {
      return null;
    }
    const earlier = await ctx.db
      .query("seasons")
      .withIndex("by_label")
      .order("desc")
      .filter((q) => q.lt(q.field("label"), season.label))
      .first();
    if (earlier === null) {
      return null;
    }
    const candidates = await ctx.db
      .query("teams")
      .withIndex("by_club_and_season", (q) =>
        q.eq("clubId", team.clubId).eq("seasonId", earlier._id),
      )
      .collect();
    const match = candidates.find((c) => c.name === team.name);
    if (match === undefined) {
      return null;
    }
    const entries = await ctx.db
      .query("rosterEntries")
      .withIndex("by_team", (q) => q.eq("teamId", match._id))
      .collect();
    return { _id: match._id, seasonLabel: earlier.label, playerCount: entries.length };
  },
});

/**
 * Reprend l'effectif d'une équipe d'une saison antérieure. Idempotent : rejouée, elle
 * n'introduit aucun doublon.
 */
export const copyFrom = mutation({
  args: { teamId: v.id("teams"), sourceTeamId: v.id("teams") },
  returns: v.number(),
  handler: async (ctx, { teamId, sourceTeamId }) => {
    await requireManagerOfTeam(ctx, teamId);
    const team = await ctx.db.get(teamId);
    const source = await ctx.db.get(sourceTeamId);
    if (team === null || source === null) {
      throw new ConvexError("Équipe inconnue.");
    }
    if (team.clubId !== source.clubId) {
      throw new ConvexError("La reprise d'effectif se fait au sein d'un même club.");
    }
    if (team._id === source._id) {
      throw new ConvexError("L'équipe source doit être différente de l'équipe visée.");
    }
    const sourceEntries = await ctx.db
      .query("rosterEntries")
      .withIndex("by_team", (q) => q.eq("teamId", sourceTeamId))
      .collect();
    let added = 0;
    for (const entry of sourceEntries) {
      const already = await ctx.db
        .query("rosterEntries")
        .withIndex("by_team_and_player", (q) =>
          q.eq("teamId", teamId).eq("playerId", entry.playerId),
        )
        .unique();
      if (already === null) {
        await ctx.db.insert("rosterEntries", {
          teamId,
          playerId: entry.playerId as Id<"players">,
        });
        added++;
      }
    }
    return added;
  },
});
