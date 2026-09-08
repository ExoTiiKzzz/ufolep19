import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireManagerOfClub, requireUser } from "./authz";
import { matchSummary, newTeamCache, summarize } from "./matches";

const player = v.object({
  _id: v.id("players"),
  _creationTime: v.number(),
  clubId: v.id("clubs"),
  firstName: v.string(),
  lastName: v.string(),
  licenseNumber: v.string(),
});

/**
 * Licenciés d'un club.
 *
 * Donnée nominative : réservée aux comptes connectés, jamais exposée au public.
 */
export const listByClub = query({
  args: { clubId: v.id("clubs") },
  returns: v.array(player),
  handler: async (ctx, { clubId }) => {
    await requireUser(ctx);
    return await ctx.db
      .query("players")
      .withIndex("by_club", (q) => q.eq("clubId", clubId))
      .collect();
  },
});

/** Crée une fiche joueur. Sans e-mail ni compte : c'est une donnée d'effectif. */
export const create = mutation({
  args: {
    clubId: v.id("clubs"),
    firstName: v.string(),
    lastName: v.string(),
    licenseNumber: v.string(),
  },
  returns: v.id("players"),
  handler: async (ctx, args) => {
    await requireManagerOfClub(ctx, args.clubId);
    const firstName = args.firstName.trim();
    const lastName = args.lastName.trim();
    const licenseNumber = args.licenseNumber.trim();
    if (firstName === "" || lastName === "") {
      throw new ConvexError("Le nom et le prénom du joueur sont obligatoires.");
    }
    if (licenseNumber !== "") {
      const existing = await ctx.db
        .query("players")
        .withIndex("by_license", (q) => q.eq("licenseNumber", licenseNumber))
        .first();
      if (existing !== null) {
        throw new ConvexError(`Le numéro de licence ${licenseNumber} est déjà enregistré.`);
      }
    }
    return await ctx.db.insert("players", { clubId: args.clubId, firstName, lastName, licenseNumber });
  },
});

/**
 * Fiche d'un licencié : son club, ses équipes, et les matchs sur lesquels il a été aligné.
 *
 * Nominative de bout en bout : réservée aux comptes connectés, jamais exposée au public.
 */
export const get = query({
  args: { playerId: v.id("players") },
  returns: v.union(
    v.object({
      _id: v.id("players"),
      firstName: v.string(),
      lastName: v.string(),
      licenseNumber: v.string(),
      clubId: v.id("clubs"),
      clubName: v.string(),
      teams: v.array(
        v.object({
          _id: v.id("teams"),
          name: v.string(),
          seasonLabel: v.string(),
          isCurrentSeason: v.boolean(),
        }),
      ),
      appearances: v.array(v.object({ match: matchSummary, teamName: v.string() })),
    }),
    v.null(),
  ),
  handler: async (ctx, { playerId }) => {
    await requireUser(ctx);
    const player = await ctx.db.get(playerId);
    if (player === null) {
      return null;
    }
    const club = await ctx.db.get(player.clubId);

    const rosterEntries = await ctx.db
      .query("rosterEntries")
      .withIndex("by_player", (q) => q.eq("playerId", playerId))
      .collect();
    const teams = await Promise.all(
      rosterEntries.map(async (entry) => {
        const team = await ctx.db.get(entry.teamId);
        if (team === null) {
          return null;
        }
        const season = await ctx.db.get(team.seasonId);
        return {
          _id: team._id,
          name: team.name,
          seasonLabel: season?.label ?? "",
          isCurrentSeason: season?.isCurrent ?? false,
        };
      }),
    );

    // L'index des compositions commence par le joueur : ses apparitions se lisent sans
    // balayage de table.
    const lineups = await ctx.db
      .query("lineupEntries")
      .withIndex("by_player_and_matchday", (q) => q.eq("playerId", playerId))
      .collect();
    const cache = newTeamCache();
    const appearances = await Promise.all(
      lineups.map(async (entry) => {
        const match = await ctx.db.get(entry.matchId);
        if (match === null) {
          return null;
        }
        const team = await ctx.db.get(entry.teamId);
        return { match: await summarize(ctx, match, cache), teamName: team?.name ?? "" };
      }),
    );

    return {
      _id: player._id,
      firstName: player.firstName,
      lastName: player.lastName,
      licenseNumber: player.licenseNumber,
      clubId: player.clubId,
      clubName: club?.name ?? "",
      teams: teams
        .filter((team): team is NonNullable<typeof team> => team !== null)
        .sort(
          (a, b) =>
            Number(b.isCurrentSeason) - Number(a.isCurrentSeason) ||
            b.seasonLabel.localeCompare(a.seasonLabel),
        ),
      appearances: appearances
        .filter((row): row is NonNullable<typeof row> => row !== null)
        .sort((a, b) => a.match.matchdayNumber - b.match.matchdayNumber),
    };
  },
});
