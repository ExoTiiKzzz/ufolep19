import { ConvexError, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { matchSummary, newTeamCache, summarize } from "./matches";
import { managedTeamIds, requireAdmin, requireUser } from "./authz";

const team = v.object({
  _id: v.id("teams"),
  _creationTime: v.number(),
  clubId: v.id("clubs"),
  seasonId: v.id("seasons"),
  championshipId: v.id("championships"),
  name: v.string(),
  clubName: v.string(),
});

/** Équipes engagées dans un championnat, avec leur club. Lecture publique. */
export const listByChampionship = query({
  args: { championshipId: v.id("championships") },
  returns: v.array(team),
  handler: async (ctx, { championshipId }) => {
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_championship", (q) => q.eq("championshipId", championshipId))
      .collect();
    return await Promise.all(
      teams.map(async (t) => ({
        ...t,
        clubName: (await ctx.db.get(t.clubId))?.name ?? "",
      })),
    );
  },
});

/**
 * Engage une équipe dans un championnat.
 *
 * La saison n'est pas un paramètre : elle est dérivée du championnat, de sorte qu'une
 * équipe ne puisse jamais être rattachée à une saison contredisant son championnat.
 */
export const create = mutation({
  args: {
    clubId: v.id("clubs"),
    championshipId: v.id("championships"),
    name: v.string(),
  },
  returns: v.id("teams"),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const name = args.name.trim();
    if (name === "") {
      throw new ConvexError("Le nom de l'équipe est obligatoire.");
    }
    if ((await ctx.db.get(args.clubId)) === null) {
      throw new ConvexError("Club inconnu.");
    }
    const championship = await ctx.db.get(args.championshipId);
    if (championship === null) {
      throw new ConvexError("Championnat inconnu.");
    }
    return await ctx.db.insert("teams", {
      clubId: args.clubId,
      seasonId: championship.seasonId,
      championshipId: args.championshipId,
      name,
    });
  },
});

/** Rattache un compte responsable à une équipe. Un compte peut gérer plusieurs équipes. */
export const addManager = mutation({
  args: { teamId: v.id("teams"), userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { teamId, userId }) => {
    await requireAdmin(ctx);
    const team = await ctx.db.get(teamId);
    const user = await ctx.db.get(userId);
    if (team === null || user === null) {
      throw new ConvexError("Équipe ou compte inconnu.");
    }
    if (user.role === "player") {
      throw new ConvexError(
        "Ce compte a le rôle joueur : donnez-lui d'abord le rôle responsable d'équipe.",
      );
    }
    const existing = await ctx.db
      .query("teamManagers")
      .withIndex("by_team_and_user", (q) => q.eq("teamId", teamId).eq("userId", userId))
      .unique();
    if (existing === null) {
      await ctx.db.insert("teamManagers", { teamId, userId });
    }
    return null;
  },
});

/** Détache un compte responsable d'une équipe. */
export const removeManager = mutation({
  args: { teamId: v.id("teams"), userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { teamId, userId }) => {
    await requireAdmin(ctx);
    const existing = await ctx.db
      .query("teamManagers")
      .withIndex("by_team_and_user", (q) => q.eq("teamId", teamId).eq("userId", userId))
      .unique();
    if (existing !== null) {
      await ctx.db.delete(existing._id);
    }
    return null;
  },
});

/** Responsables rattachés à une équipe. Réservé aux comptes connectés. */
export const managers = query({
  args: { teamId: v.id("teams") },
  returns: v.array(
    v.object({ _id: v.id("users"), name: v.optional(v.string()), email: v.optional(v.string()) }),
  ),
  handler: async (ctx, { teamId }) => {
    await requireUser(ctx);
    const rows = await ctx.db
      .query("teamManagers")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    const users = await Promise.all(rows.map((row) => ctx.db.get(row.userId)));
    return users
      .filter((user): user is NonNullable<typeof user> => user !== null)
      .map((user) => ({ _id: user._id, name: user.name, email: user.email }));
  },
});

/** Les équipes gérées par le compte connecté. */
export const mine = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("teams"),
      name: v.string(),
      clubId: v.id("clubs"),
      championshipId: v.id("championships"),
      championshipName: v.string(),
      seasonLabel: v.string(),
    }),
  ),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const teamIds = await managedTeamIds(ctx, user._id);
    const teams = await Promise.all(teamIds.map((teamId) => ctx.db.get(teamId)));
    return await Promise.all(
      teams
        .filter((team): team is NonNullable<typeof team> => team !== null)
        .map(async (team) => {
          const championship = await ctx.db.get(team.championshipId);
          const season = championship === null ? null : await ctx.db.get(championship.seasonId);
          return {
            _id: team._id,
            name: team.name,
            clubId: team.clubId,
            championshipId: team.championshipId,
            championshipName: championship?.name ?? "",
            seasonLabel: season?.label ?? "",
          };
        }),
    );
  },
});

/**
 * Fiche d'une équipe : son club, son championnat et sa saison.
 *
 * Lecture publique : aucune donnée nominative. L'effectif passe par `roster.listByTeam` et
 * les responsables par `teams.managers`, tous deux réservés aux comptes connectés.
 */
export const get = query({
  args: { teamId: v.id("teams") },
  returns: v.union(
    v.object({
      _id: v.id("teams"),
      name: v.string(),
      clubId: v.id("clubs"),
      clubName: v.string(),
      clubVenue: v.string(),
      clubLogoUrl: v.union(v.string(), v.null()),
      championshipId: v.id("championships"),
      championshipName: v.string(),
      seasonId: v.id("seasons"),
      seasonLabel: v.string(),
      isCurrentSeason: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, { teamId }) => {
    const team = await ctx.db.get(teamId);
    if (team === null) {
      return null;
    }
    const [club, championship, season] = await Promise.all([
      ctx.db.get(team.clubId),
      ctx.db.get(team.championshipId),
      ctx.db.get(team.seasonId),
    ]);
    return {
      _id: team._id,
      name: team.name,
      clubId: team.clubId,
      clubName: club?.name ?? "",
      clubVenue: club?.defaultVenue ?? "",
      clubLogoUrl:
        club?.logoId === undefined ? null : await ctx.storage.getUrl(club.logoId),
      championshipId: team.championshipId,
      championshipName: championship?.name ?? "",
      seasonId: team.seasonId,
      seasonLabel: season?.label ?? "",
      isCurrentSeason: season?.isCurrent ?? false,
    };
  },
});

/** Tous les matchs d'une équipe, qu'elle reçoive ou se déplace. Lecture publique. */
export const matches = query({
  args: { teamId: v.id("teams") },
  returns: v.array(matchSummary),
  handler: async (ctx, { teamId }) => {
    const [asHome, asAway] = await Promise.all([
      ctx.db
        .query("matches")
        .withIndex("by_home_team", (q) => q.eq("homeTeamId", teamId))
        .collect(),
      ctx.db
        .query("matches")
        .withIndex("by_away_team", (q) => q.eq("awayTeamId", teamId))
        .collect(),
    ]);
    const cache = newTeamCache();
    const summaries = await Promise.all(
      [...asHome, ...asAway].map((match) => summarize(ctx, match, cache)),
    );
    return summaries.sort(
      (a, b) => a.matchdayNumber - b.matchdayNumber || (a.slot?.at ?? 0) - (b.slot?.at ?? 0),
    );
  },
});
