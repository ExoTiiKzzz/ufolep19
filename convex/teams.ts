import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { matchSummary, newTeamCache, summarize } from "./matches";
import { attachedTeamIds, managedTeamIds, requireAdmin, requireUser } from "./authz";

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

/**
 * Équipes d'une saison, groupées par championnat (nom du championnat, puis de l'équipe).
 * Sert au rattachement d'un responsable, qui peut viser n'importe quelle équipe de la
 * saison. Lecture publique : rien de nominatif.
 */
export const listBySeason = query({
  args: { seasonId: v.id("seasons") },
  returns: v.array(
    v.object({
      _id: v.id("teams"),
      name: v.string(),
      championshipId: v.id("championships"),
      championshipName: v.string(),
    }),
  ),
  handler: async (ctx, { seasonId }) => {
    const [teams, championships] = await Promise.all([
      ctx.db
        .query("teams")
        .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
        .collect(),
      ctx.db
        .query("championships")
        .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
        .collect(),
    ]);
    const names = new Map(championships.map((c) => [c._id, c.name]));
    return teams
      .map((team) => ({
        _id: team._id,
        name: team.name,
        championshipId: team.championshipId,
        championshipName: names.get(team.championshipId) ?? "",
      }))
      .sort(
        (a, b) =>
          a.championshipName.localeCompare(b.championshipName, "fr") ||
          a.name.localeCompare(b.name, "fr"),
      );
  },
});

/**
 * Renomme une équipe. Le nom n'est recopié nulle part — matchs et feuilles pointent vers
 * l'équipe —, si bien que le nouveau nom s'applique partout, matchs passés compris.
 */
export const rename = mutation({
  args: { teamId: v.id("teams"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const name = args.name.trim();
    if (name === "") {
      throw new ConvexError("Le nom de l'équipe est obligatoire.");
    }
    if ((await ctx.db.get(args.teamId)) === null) {
      throw new ConvexError("Équipe inconnue.");
    }
    await ctx.db.patch(args.teamId, { name });
    return null;
  },
});

/** Matchs d'une équipe, qu'elle reçoive ou se déplace. */
async function matchesOfTeam(ctx: QueryCtx, teamId: Id<"teams">) {
  const [home, away] = await Promise.all([
    ctx.db
      .query("matches")
      .withIndex("by_home_team", (q) => q.eq("homeTeamId", teamId))
      .collect(),
    ctx.db
      .query("matches")
      .withIndex("by_away_team", (q) => q.eq("awayTeamId", teamId))
      .collect(),
  ]);
  return [...home, ...away];
}

/**
 * Ce que la suppression d'une équipe emporterait, et ce qui l'empêche.
 *
 * Une équipe se supprime tant qu'aucun de ses matchs n'a dépassé Planifié : c'est le cas de
 * l'équipe saisie en double ou dans le mauvais championnat. Dès qu'un créneau est proposé,
 * un autre responsable attend ce match, et il ne doit pas disparaître de son tableau de bord.
 * Le retrait d'une équipe en cours de saison relève du forfait, pas d'une suppression.
 */
async function removal(ctx: QueryCtx, teamId: Id<"teams">) {
  const team = await ctx.db.get(teamId);
  if (team === null) {
    throw new ConvexError("Équipe inconnue.");
  }
  const [matches, roster, managers] = await Promise.all([
    matchesOfTeam(ctx, teamId),
    ctx.db
      .query("rosterEntries")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect(),
    ctx.db
      .query("teamManagers")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect(),
  ]);
  const blocking = await Promise.all(
    matches
      .filter((match) => match.state !== "planned")
      .map(async (match) => {
        const [home, away, matchday] = await Promise.all([
          ctx.db.get(match.homeTeamId),
          ctx.db.get(match.awayTeamId),
          ctx.db.get(match.matchdayId),
        ]);
        return {
          number: matchday?.number ?? 0,
          label: `J${matchday?.number ?? "?"} ${home?.name ?? "?"} – ${away?.name ?? "?"}`,
        };
      }),
  );
  return {
    team,
    matches,
    roster,
    managers,
    blocking: blocking.sort((a, b) => a.number - b.number).map((match) => match.label),
  };
}

export const removalImpact = query({
  args: { teamId: v.id("teams") },
  returns: v.object({
    matches: v.number(),
    rosterEntries: v.number(),
    managers: v.number(),
    blockingMatches: v.array(v.string()),
  }),
  handler: async (ctx, { teamId }) => {
    await requireAdmin(ctx);
    const { matches, roster, managers, blocking } = await removal(ctx, teamId);
    return {
      matches: matches.length,
      rosterEntries: roster.length,
      managers: managers.length,
      blockingMatches: blocking,
    };
  },
});

/**
 * Supprime une équipe engagée par erreur, avec ses matchs (tous Planifiés, et leur
 * historique de négociation), sa feuille verte et ses rattachements de responsables.
 * Refusée, en nommant les matchs, dès qu'un match a dépassé Planifié.
 */
export const remove = mutation({
  args: { teamId: v.id("teams") },
  returns: v.null(),
  handler: async (ctx, { teamId }) => {
    await requireAdmin(ctx);
    const { team, matches, roster, managers, blocking } = await removal(ctx, teamId);
    if (blocking.length > 0) {
      throw new ConvexError(
        `${team.name} ne peut pas être supprimée : ces matchs ont déjà un créneau ou une ` +
          `feuille — ${blocking.join(", ")}.`,
      );
    }
    for (const match of matches) {
      // Un match revenu à Planifié après un refus ou un report garde son historique.
      for (const table of ["slotProposals", "postponementRequests"] as const) {
        const rows = await ctx.db
          .query(table)
          .withIndex("by_match", (q) => q.eq("matchId", match._id))
          .collect();
        for (const row of rows) {
          await ctx.db.delete(row._id);
        }
      }
      await ctx.db.delete(match._id);
    }
    for (const row of [...roster, ...managers]) {
      await ctx.db.delete(row._id);
    }
    await ctx.db.delete(teamId);
    return null;
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

/**
 * Les équipes rattachées au compte connecté.
 *
 * Deux rattachements y mènent : **gérer** l'équipe, et **en faire partie** — un compte de
 * rôle `player` voit ainsi les équipes de sa fiche. Ce n'est qu'une liste d'affichage :
 * `managerOf` dit lequel des deux rattachements ouvre des droits, et il est le seul à faire
 * autorité côté écriture.
 *
 * La saison courante passe devant : un licencié qui traverse les saisons accumule des
 * équipes, et celle de l'an dernier n'est pas ce qu'il vient chercher.
 */
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
      isCurrentSeason: v.boolean(),
      managerOf: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const managed = new Set((await managedTeamIds(ctx, user._id)).map(String));
    const teamIds = await attachedTeamIds(ctx, user);
    const teams = await Promise.all(teamIds.map((teamId) => ctx.db.get(teamId)));
    const rows = await Promise.all(
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
            isCurrentSeason: season?.isCurrent ?? false,
            managerOf: managed.has(String(team._id)),
          };
        }),
    );
    return rows.sort(
      (a, b) =>
        Number(b.isCurrentSeason) - Number(a.isCurrentSeason) ||
        b.seasonLabel.localeCompare(a.seasonLabel) ||
        a.name.localeCompare(b.name),
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
