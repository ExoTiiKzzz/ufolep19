import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./authz";

const season = v.object({
  _id: v.id("seasons"),
  _creationTime: v.number(),
  label: v.string(),
  isCurrent: v.boolean(),
});

/**
 * Liste des saisons, de la plus récente à la plus ancienne.
 *
 * Lecture publique : aucune identité requise, et aucune donnée nominative renvoyée.
 */
export const list = query({
  args: {},
  returns: v.array(season),
  handler: async (ctx) => {
    return await ctx.db.query("seasons").withIndex("by_label").order("desc").collect();
  },
});

/** La saison courante, ou `null` si aucune n'est désignée. Lecture publique. */
export const current = query({
  args: {},
  returns: v.union(season, v.null()),
  handler: async (ctx) => {
    return await ctx.db
      .query("seasons")
      .withIndex("by_current", (q) => q.eq("isCurrent", true))
      .unique();
  },
});

/** Crée une saison. La première créée devient courante d'office. */
export const create = mutation({
  args: { label: v.string() },
  returns: v.id("seasons"),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const label = args.label.trim();
    if (label === "") {
      throw new ConvexError("Le libellé de la saison est obligatoire.");
    }
    const existing = await ctx.db
      .query("seasons")
      .withIndex("by_label", (q) => q.eq("label", label))
      .unique();
    if (existing !== null) {
      throw new ConvexError(`La saison ${label} existe déjà.`);
    }
    const anyCurrent = await ctx.db
      .query("seasons")
      .withIndex("by_current", (q) => q.eq("isCurrent", true))
      .first();
    return await ctx.db.insert("seasons", { label, isCurrent: anyCurrent === null });
  },
});

/**
 * Désigne la saison courante. Une seule à la fois : l'ancienne est basculée dans le même
 * appel, pour que l'invariant ne puisse jamais être rompu.
 */
export const setCurrent = mutation({
  args: { seasonId: v.id("seasons") },
  returns: v.null(),
  handler: async (ctx, { seasonId }) => {
    await requireAdmin(ctx);
    const season = await ctx.db.get(seasonId);
    if (season === null) {
      throw new ConvexError("Saison inconnue.");
    }
    const previous = await ctx.db
      .query("seasons")
      .withIndex("by_current", (q) => q.eq("isCurrent", true))
      .collect();
    for (const other of previous) {
      if (other._id !== seasonId) {
        await ctx.db.patch(other._id, { isCurrent: false });
      }
    }
    await ctx.db.patch(seasonId, { isCurrent: true });
    return null;
  },
});
