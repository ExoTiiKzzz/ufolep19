import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./authz";

const club = v.object({
  _id: v.id("clubs"),
  _creationTime: v.number(),
  name: v.string(),
  defaultVenue: v.string(),
});

/** Liste des clubs. Lecture publique : un club est une structure, pas une personne. */
export const list = query({
  args: {},
  returns: v.array(club),
  handler: async (ctx) => {
    return await ctx.db.query("clubs").withIndex("by_name").collect();
  },
});

export const create = mutation({
  args: { name: v.string(), defaultVenue: v.string() },
  returns: v.id("clubs"),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const name = args.name.trim();
    if (name === "") {
      throw new ConvexError("Le nom du club est obligatoire.");
    }
    const existing = await ctx.db
      .query("clubs")
      .withIndex("by_name", (q) => q.eq("name", name))
      .unique();
    if (existing !== null) {
      throw new ConvexError(`Le club ${name} existe déjà.`);
    }
    return await ctx.db.insert("clubs", { name, defaultVenue: args.defaultVenue.trim() });
  },
});

export const update = mutation({
  args: {
    clubId: v.id("clubs"),
    name: v.optional(v.string()),
    defaultVenue: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { clubId, name, defaultVenue }) => {
    await requireAdmin(ctx);
    const existing = await ctx.db.get(clubId);
    if (existing === null) {
      throw new ConvexError("Club inconnu.");
    }
    const patch: { name?: string; defaultVenue?: string } = {};
    if (name !== undefined) {
      if (name.trim() === "") {
        throw new ConvexError("Le nom du club est obligatoire.");
      }
      patch.name = name.trim();
    }
    if (defaultVenue !== undefined) {
      patch.defaultVenue = defaultVenue.trim();
    }
    await ctx.db.patch(clubId, patch);
    return null;
  },
});

/**
 * Fiche d'un club : ses coordonnées et ses équipes, saison par saison.
 *
 * Lecture publique — un club est une structure, pas une personne. Ses licenciés, eux,
 * passent par `players.listByClub`, réservée aux comptes connectés.
 */
export const get = query({
  args: { clubId: v.id("clubs") },
  returns: v.union(
    v.object({
      _id: v.id("clubs"),
      name: v.string(),
      defaultVenue: v.string(),
      teams: v.array(
        v.object({
          _id: v.id("teams"),
          name: v.string(),
          seasonLabel: v.string(),
          isCurrentSeason: v.boolean(),
          championshipId: v.id("championships"),
          championshipName: v.string(),
        }),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, { clubId }) => {
    const club = await ctx.db.get(clubId);
    if (club === null) {
      return null;
    }
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_club_and_season", (q) => q.eq("clubId", clubId))
      .collect();

    const detailed = await Promise.all(
      teams.map(async (team) => {
        const [season, championship] = await Promise.all([
          ctx.db.get(team.seasonId),
          ctx.db.get(team.championshipId),
        ]);
        return {
          _id: team._id,
          name: team.name,
          seasonLabel: season?.label ?? "",
          isCurrentSeason: season?.isCurrent ?? false,
          championshipId: team.championshipId,
          championshipName: championship?.name ?? "",
        };
      }),
    );

    return {
      _id: club._id,
      name: club.name,
      defaultVenue: club.defaultVenue,
      // Saison courante en tête, puis les plus récentes.
      teams: detailed.sort(
        (a, b) =>
          Number(b.isCurrentSeason) - Number(a.isCurrentSeason) ||
          b.seasonLabel.localeCompare(a.seasonLabel) ||
          a.name.localeCompare(b.name, "fr"),
      ),
    };
  },
});
