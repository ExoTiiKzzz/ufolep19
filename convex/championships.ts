import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { requireAdmin } from "./authz";
import { rosterTeamInCircuit } from "./circuits";
import { matchFormat, reinforcementQuota } from "./schema";

const championship = v.object({
  _id: v.id("championships"),
  _creationTime: v.number(),
  seasonId: v.id("seasons"),
  circuitId: v.id("circuits"),
  name: v.string(),
  level: v.number(),
  format: matchFormat,
  reinforcementQuota: v.optional(reinforcementQuota),
});

/** Les réglages d'un championnat que l'administrateur choisit. */
const settings = {
  name: v.string(),
  circuitId: v.id("circuits"),
  level: v.number(),
  format: matchFormat,
  // `null` : pas de quota, une descente de niveau est signalée comme telle.
  reinforcementQuota: v.union(reinforcementQuota, v.null()),
};

type Settings = {
  name: string;
  circuitId: Id<"circuits">;
  level: number;
  format: Doc<"championships">["format"];
  reinforcementQuota: { maxPlayers: number; completeTo: number } | null;
};

/** Valide les réglages et rend ceux à écrire. */
async function checkSettings(ctx: MutationCtx, seasonId: Id<"seasons">, args: Settings) {
  const name = args.name.trim();
  if (name === "") {
    throw new ConvexError("Le nom du championnat est obligatoire.");
  }
  const circuit = await ctx.db.get(args.circuitId);
  if (circuit === null || circuit.seasonId !== seasonId) {
    throw new ConvexError("Le circuit choisi n'appartient pas à la saison du championnat.");
  }
  if (!Number.isInteger(args.level) || args.level < 1) {
    throw new ConvexError("Le niveau est un entier positif : 1 pour le plus fort.");
  }
  const quota = args.reinforcementQuota;
  if (quota !== null) {
    if (!Number.isInteger(quota.maxPlayers) || quota.maxPlayers < 1) {
      throw new ConvexError("Le quota de renforts est d'au moins 1 joueur.");
    }
    if (!Number.isInteger(quota.completeTo) || quota.completeTo < quota.maxPlayers) {
      throw new ConvexError(
        "Le total à compléter doit être un entier au moins égal au quota de renforts.",
      );
    }
  }
  return {
    name,
    circuitId: args.circuitId,
    level: args.level,
    format: args.format,
    reinforcementQuota: quota ?? undefined,
  };
}

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
      circuitId: v.id("circuits"),
      name: v.string(),
      level: v.number(),
      format: matchFormat,
      reinforcementQuota: v.optional(reinforcementQuota),
      seasonLabel: v.string(),
      circuitName: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, { championshipId }) => {
    const championship = await ctx.db.get(championshipId);
    if (championship === null) {
      return null;
    }
    const [season, circuit] = await Promise.all([
      ctx.db.get(championship.seasonId),
      ctx.db.get(championship.circuitId),
    ]);
    return {
      ...championship,
      seasonLabel: season?.label ?? "",
      circuitName: circuit?.name ?? "",
    };
  },
});

export const create = mutation({
  args: { seasonId: v.id("seasons"), ...settings },
  returns: v.id("championships"),
  handler: async (ctx, { seasonId, ...args }) => {
    await requireAdmin(ctx);
    if ((await ctx.db.get(seasonId)) === null) {
      throw new ConvexError("Saison inconnue.");
    }
    return await ctx.db.insert("championships", {
      seasonId,
      ...(await checkSettings(ctx, seasonId, args)),
    });
  },
});

/**
 * Modifie les réglages d'un championnat.
 *
 * Deux garde-fous :
 *
 * - le **format** ne change plus dès qu'une journée existe — une journée de plateau porte
 *   une date et une salle, une journée standard une fenêtre de négociation ;
 * - le **circuit** ne change que si aucun joueur de ses feuilles vertes n'en a déjà une
 *   dans le circuit visé : sinon la règle d'unicité serait violée en silence.
 *
 * Le niveau et le quota, eux, changent à tout moment : les signalements de renfort sont
 * recalculés à la lecture.
 */
export const update = mutation({
  args: { championshipId: v.id("championships"), ...settings },
  returns: v.null(),
  handler: async (ctx, { championshipId, ...args }) => {
    await requireAdmin(ctx);
    const current = await ctx.db.get(championshipId);
    if (current === null) {
      throw new ConvexError("Championnat inconnu.");
    }
    const next = await checkSettings(ctx, current.seasonId, args);

    if (next.format !== current.format) {
      const matchday = await ctx.db
        .query("matchdays")
        .withIndex("by_championship", (q) => q.eq("championshipId", championshipId))
        .first();
      if (matchday !== null) {
        throw new ConvexError(
          "Le format ne se change plus une fois des journées créées : leurs dates n'ont " +
            "pas la même forme en plateau.",
        );
      }
    }

    if (next.circuitId !== current.circuitId) {
      const teams = await ctx.db
        .query("teams")
        .withIndex("by_championship", (q) => q.eq("championshipId", championshipId))
        .collect();
      for (const team of teams) {
        const entries = await ctx.db
          .query("rosterEntries")
          .withIndex("by_team", (q) => q.eq("teamId", team._id))
          .collect();
        for (const entry of entries) {
          const other = await rosterTeamInCircuit(
            ctx,
            entry.playerId,
            next.circuitId,
            championshipId,
          );
          if (other !== null) {
            const player = await ctx.db.get(entry.playerId);
            const who = player === null ? "Un joueur" : `${player.firstName} ${player.lastName}`;
            throw new ConvexError(
              `${who} figure déjà sur la feuille verte de ${other.team.name} dans le ` +
                "circuit visé : un joueur n'a qu'une feuille verte par circuit.",
            );
          }
        }
      }
    }

    await ctx.db.replace(championshipId, { seasonId: current.seasonId, ...next });
    return null;
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
      format: matchFormat,
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
          format: championship.format,
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
