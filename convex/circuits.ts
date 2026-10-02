import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireAdmin } from "./authz";

type Ctx = QueryCtx | MutationCtx;

const circuit = v.object({
  _id: v.id("circuits"),
  _creationTime: v.number(),
  seasonId: v.id("seasons"),
  name: v.string(),
});

/** Circuits d'une saison, par nom. Lecture publique. */
export const listBySeason = query({
  args: { seasonId: v.id("seasons") },
  returns: v.array(circuit),
  handler: async (ctx, { seasonId }) => {
    const circuits = await ctx.db
      .query("circuits")
      .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
      .collect();
    return circuits.sort((a, b) => a.name.localeCompare(b.name, "fr"));
  },
});

/**
 * Crée un circuit dans une saison. Le nom est unique dans la saison : deux circuits
 * « Coupe » rendraient le choix d'un championnat ambigu.
 */
export const create = mutation({
  args: { seasonId: v.id("seasons"), name: v.string() },
  returns: v.id("circuits"),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const name = args.name.trim();
    if (name === "") {
      throw new ConvexError("Le nom du circuit est obligatoire.");
    }
    if ((await ctx.db.get(args.seasonId)) === null) {
      throw new ConvexError("Saison inconnue.");
    }
    const existing = await ctx.db
      .query("circuits")
      .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
      .collect();
    if (existing.some((other) => other.name.toLowerCase() === name.toLowerCase())) {
      throw new ConvexError(`Le circuit « ${name} » existe déjà dans cette saison.`);
    }
    return await ctx.db.insert("circuits", { seasonId: args.seasonId, name });
  },
});

/** Le championnat d'une équipe, ou une erreur explicite. */
export async function championshipOfTeam(
  ctx: Ctx,
  team: Doc<"teams">,
): Promise<Doc<"championships">> {
  const championship = await ctx.db.get(team.championshipId);
  if (championship === null) {
    throw new ConvexError("Championnat inconnu.");
  }
  return championship;
}

/**
 * L'équipe dont la feuille verte porte ce joueur dans ce circuit, ou `null`.
 *
 * Au plus une, par la règle d'unicité. `exceptChampionshipId` ignore les équipes d'un
 * championnat : celui qu'on s'apprête à déplacer d'un circuit à l'autre.
 */
export async function rosterTeamInCircuit(
  ctx: Ctx,
  playerId: Id<"players">,
  circuitId: Id<"circuits">,
  exceptChampionshipId?: Id<"championships">,
): Promise<{ team: Doc<"teams">; championship: Doc<"championships"> } | null> {
  const entries = await ctx.db
    .query("rosterEntries")
    .withIndex("by_player", (q) => q.eq("playerId", playerId))
    .collect();
  for (const entry of entries) {
    const team = await ctx.db.get(entry.teamId);
    if (team === null || team.championshipId === exceptChampionshipId) {
      continue;
    }
    const championship = await ctx.db.get(team.championshipId);
    if (championship !== null && championship.circuitId === circuitId) {
      return { team, championship };
    }
  }
  return null;
}
