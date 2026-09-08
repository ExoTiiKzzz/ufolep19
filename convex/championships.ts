import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./authz";

const championship = v.object({
  _id: v.id("championships"),
  _creationTime: v.number(),
  seasonId: v.id("seasons"),
  name: v.string(),
});

/** Championnats d'une saison. Lecture publique. */
export const listBySeason = query({
  args: { seasonId: v.id("seasons") },
  returns: v.array(championship),
  handler: async (ctx, { seasonId }) => {
    return await ctx.db
      .query("championships")
      .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
      .collect();
  },
});

/** Un championnat, avec le libellé de sa saison. Lecture publique. */
export const get = query({
  args: { championshipId: v.id("championships") },
  returns: v.union(
    v.object({
      _id: v.id("championships"),
      _creationTime: v.number(),
      seasonId: v.id("seasons"),
      name: v.string(),
      seasonLabel: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, { championshipId }) => {
    const championship = await ctx.db.get(championshipId);
    if (championship === null) {
      return null;
    }
    const season = await ctx.db.get(championship.seasonId);
    return { ...championship, seasonLabel: season?.label ?? "" };
  },
});

export const create = mutation({
  args: { seasonId: v.id("seasons"), name: v.string() },
  returns: v.id("championships"),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const name = args.name.trim();
    if (name === "") {
      throw new ConvexError("Le nom du championnat est obligatoire.");
    }
    if ((await ctx.db.get(args.seasonId)) === null) {
      throw new ConvexError("Saison inconnue.");
    }
    return await ctx.db.insert("championships", { seasonId: args.seasonId, name });
  },
});

/**
 * Tous les championnats, avec leur saison, la saison courante en tête.
 *
 * Sert au sélecteur de la page d'accueil : les saisons passées restent atteignables sans
 * quitter la page. Lecture publique.
 */
export const listAll = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("championships"),
      name: v.string(),
      seasonId: v.id("seasons"),
      seasonLabel: v.string(),
      isCurrentSeason: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const seasons = await ctx.db.query("seasons").withIndex("by_label").order("desc").collect();
    const rows = [];
    for (const season of seasons) {
      const championships = await ctx.db
        .query("championships")
        .withIndex("by_season", (q) => q.eq("seasonId", season._id))
        .collect();
      for (const championship of championships) {
        rows.push({
          _id: championship._id,
          name: championship.name,
          seasonId: season._id,
          seasonLabel: season.label,
          isCurrentSeason: season.isCurrent,
        });
      }
    }
    return rows.sort(
      (a, b) =>
        Number(b.isCurrentSeason) - Number(a.isCurrentSeason) ||
        b.seasonLabel.localeCompare(a.seasonLabel) ||
        a.name.localeCompare(b.name, "fr"),
    );
  },
});
