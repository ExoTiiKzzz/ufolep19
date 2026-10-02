import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireManagerOfTeam, requireUser } from "./authz";
import { championshipOfTeam, rosterTeamInCircuit } from "./circuits";
import { licenseStatus, newLicenseCache, statusAt } from "./licenses";

const rosterPlayer = v.object({
  _id: v.id("players"),
  firstName: v.string(),
  lastName: v.string(),
  license: licenseStatus,
});

/**
 * Effectif — la feuille verte — d'une équipe, avec l'état de licence de chacun. Nominatif : réservé aux comptes
 * connectés.
 *
 * `at` est la date à laquelle juger la validité — celle du match qu'on prépare, et non
 * l'instant de la requête. Sans elle, la composition d'un match joué la semaine dernière
 * signalerait à tort les licences expirées depuis.
 */
export const listByTeam = query({
  args: { teamId: v.id("teams"), at: v.optional(v.number()) },
  returns: v.array(rosterPlayer),
  handler: async (ctx, { teamId, at }) => {
    await requireUser(ctx);
    const entries = await ctx.db
      .query("rosterEntries")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    const players = await Promise.all(entries.map((entry) => ctx.db.get(entry.playerId)));
    const on = at ?? Date.now();
    const cache = newLicenseCache();
    const rows = await Promise.all(
      players
        .filter((p): p is NonNullable<typeof p> => p !== null)
        .map(async (p) => ({
          _id: p._id,
          firstName: p.firstName,
          lastName: p.lastName,
          license: await statusAt(ctx, p._id, on, cache),
        })),
    );
    return rows.sort((a, b) => a.lastName.localeCompare(b.lastName, "fr"));
  },
});

/**
 * L'équipe du même circuit dont la feuille verte porte déjà ce joueur, hors l'équipe visée.
 * Un joueur n'a qu'une feuille verte par circuit : c'est elle qui fixe son niveau d'origine.
 */
async function conflictingTeam(
  ctx: MutationCtx | QueryCtx,
  team: Doc<"teams">,
  playerId: Id<"players">,
) {
  const championship = await championshipOfTeam(ctx, team);
  const other = await rosterTeamInCircuit(ctx, playerId, championship.circuitId);
  return other === null || other.team._id === team._id ? null : other.team;
}

/**
 * Inscrit un licencié sur la feuille verte d'une équipe.
 *
 * Refusé si le licencié est d'un autre club, ou s'il figure déjà sur la feuille verte d'une
 * autre équipe du même circuit — la coupe et le féminin, qui ont leur propre circuit, ont
 * leurs propres feuilles vertes.
 */
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
      throw new ConvexError(
        "Un licencié ne peut figurer que sur la feuille verte d'une équipe de son club.",
      );
    }
    const existing = await ctx.db
      .query("rosterEntries")
      .withIndex("by_team_and_player", (q) => q.eq("teamId", teamId).eq("playerId", playerId))
      .unique();
    if (existing !== null) {
      return null;
    }
    const other = await conflictingTeam(ctx, team, playerId);
    if (other !== null) {
      throw new ConvexError(
        `${player.firstName} ${player.lastName} figure déjà sur la feuille verte de ` +
          `${other.name} : un licencié n'a qu'une feuille verte par circuit. Retirez-le ` +
          "d'abord de l'autre équipe.",
      );
    }
    await ctx.db.insert("rosterEntries", { teamId, playerId });
    return null;
  },
});

/**
 * Licenciés du club inscriptibles sur la feuille verte d'une équipe, avec, pour chacun,
 * l'autre équipe du circuit qui le porte déjà le cas échéant.
 *
 * Nominatif : réservé aux comptes connectés. Couvre tous les numéros de licence, y compris
 * périmés, pour que la recherche trouve le licencié avec la carte de l'an dernier.
 */
export const candidates = query({
  args: { teamId: v.id("teams") },
  returns: v.array(
    v.object({
      _id: v.id("players"),
      firstName: v.string(),
      lastName: v.string(),
      licenseNumbers: v.array(v.string()),
      license: licenseStatus,
      onThisTeam: v.boolean(),
      otherTeamName: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, { teamId }) => {
    await requireUser(ctx);
    const team = await ctx.db.get(teamId);
    if (team === null) {
      return [];
    }
    const championship = await championshipOfTeam(ctx, team);
    const players = await ctx.db
      .query("players")
      .withIndex("by_club", (q) => q.eq("clubId", team.clubId))
      .collect();
    const now = Date.now();
    const cache = newLicenseCache();
    const rows = await Promise.all(
      players.map(async (player) => {
        const [holder, licenses] = await Promise.all([
          rosterTeamInCircuit(ctx, player._id, championship.circuitId),
          ctx.db
            .query("licenses")
            .withIndex("by_player", (q) => q.eq("playerId", player._id))
            .collect(),
        ]);
        return {
          _id: player._id,
          firstName: player.firstName,
          lastName: player.lastName,
          licenseNumbers: [...new Set(licenses.map((license) => license.number))],
          license: await statusAt(ctx, player._id, now, cache),
          onThisTeam: holder?.team._id === teamId,
          otherTeamName:
            holder === null || holder.team._id === teamId ? null : holder.team.name,
        };
      }),
    );
    return rows.sort(
      (a, b) =>
        a.lastName.localeCompare(b.lastName, "fr") ||
        a.firstName.localeCompare(b.firstName, "fr"),
    );
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
 * Reprend la feuille verte d'une équipe d'une saison antérieure. Idempotent : rejouée, elle
 * n'introduit aucun doublon.
 *
 * Un joueur déjà inscrit sur une autre feuille verte du circuit est **laissé de côté**, et
 * compté dans `skipped` : la reprise ne doit pas violer l'unicité en silence, ni échouer en
 * bloc pour un seul joueur.
 */
export const copyFrom = mutation({
  args: { teamId: v.id("teams"), sourceTeamId: v.id("teams") },
  returns: v.object({ added: v.number(), skipped: v.array(v.string()) }),
  handler: async (ctx, { teamId, sourceTeamId }) => {
    await requireManagerOfTeam(ctx, teamId);
    const team = await ctx.db.get(teamId);
    const source = await ctx.db.get(sourceTeamId);
    if (team === null || source === null) {
      throw new ConvexError("Équipe inconnue.");
    }
    if (team.clubId !== source.clubId) {
      throw new ConvexError("La reprise de feuille verte se fait au sein d'un même club.");
    }
    if (team._id === source._id) {
      throw new ConvexError("L'équipe source doit être différente de l'équipe visée.");
    }
    const sourceEntries = await ctx.db
      .query("rosterEntries")
      .withIndex("by_team", (q) => q.eq("teamId", sourceTeamId))
      .collect();
    let added = 0;
    const skipped: string[] = [];
    for (const entry of sourceEntries) {
      const already = await ctx.db
        .query("rosterEntries")
        .withIndex("by_team_and_player", (q) =>
          q.eq("teamId", teamId).eq("playerId", entry.playerId),
        )
        .unique();
      if (already !== null) {
        continue;
      }
      if ((await conflictingTeam(ctx, team, entry.playerId)) !== null) {
        const player = await ctx.db.get(entry.playerId);
        skipped.push(player === null ? "Joueur supprimé" : `${player.firstName} ${player.lastName}`);
        continue;
      }
      await ctx.db.insert("rosterEntries", { teamId, playerId: entry.playerId });
      added++;
    }
    return { added, skipped };
  },
});
