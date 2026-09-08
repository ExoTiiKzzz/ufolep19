import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./authz";

const matchday = v.object({
  _id: v.id("matchdays"),
  _creationTime: v.number(),
  championshipId: v.id("championships"),
  number: v.number(),
  windowStart: v.number(),
  windowEnd: v.number(),
});

/** Journées d'un championnat, par numéro croissant. Lecture publique. */
export const listByChampionship = query({
  args: { championshipId: v.id("championships") },
  returns: v.array(matchday),
  handler: async (ctx, { championshipId }) => {
    const days = await ctx.db
      .query("matchdays")
      .withIndex("by_championship", (q) => q.eq("championshipId", championshipId))
      .collect();
    return days.sort((a, b) => a.number - b.number);
  },
});

/**
 * Crée une journée bornée par une fenêtre de dates. La fenêtre fait office de date butoir
 * de négociation : le créneau d'un match doit tomber à l'intérieur.
 */
export const create = mutation({
  args: {
    championshipId: v.id("championships"),
    number: v.number(),
    windowStart: v.number(),
    windowEnd: v.number(),
  },
  returns: v.id("matchdays"),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if ((await ctx.db.get(args.championshipId)) === null) {
      throw new ConvexError("Championnat inconnu.");
    }
    if (!Number.isInteger(args.number) || args.number < 1) {
      throw new ConvexError("Le numéro de journée doit être un entier positif.");
    }
    if (args.windowEnd < args.windowStart) {
      throw new ConvexError("La fin de fenêtre ne peut pas précéder son début.");
    }
    const existing = await ctx.db
      .query("matchdays")
      .withIndex("by_championship_and_number", (q) =>
        q.eq("championshipId", args.championshipId).eq("number", args.number),
      )
      .unique();
    if (existing !== null) {
      throw new ConvexError(`La journée ${args.number} existe déjà dans ce championnat.`);
    }
    return await ctx.db.insert("matchdays", args);
  },
});

/** Déplace la fenêtre de dates d'une journée. */
export const updateWindow = mutation({
  args: {
    matchdayId: v.id("matchdays"),
    windowStart: v.number(),
    windowEnd: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { matchdayId, windowStart, windowEnd }) => {
    await requireAdmin(ctx);
    if ((await ctx.db.get(matchdayId)) === null) {
      throw new ConvexError("Journée inconnue.");
    }
    if (windowEnd < windowStart) {
      throw new ConvexError("La fin de fenêtre ne peut pas précéder son début.");
    }
    await ctx.db.patch(matchdayId, { windowStart, windowEnd });
    return null;
  },
});
