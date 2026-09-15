import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { attachedTeamIds, managedTeamIds, requireAdmin, requireUser } from "./authz";
import { matchResult, matchState, slot } from "./schema";

export const matchSummary = v.object({
  _id: v.id("matches"),
  championshipId: v.id("championships"),
  matchdayId: v.id("matchdays"),
  matchdayNumber: v.number(),
  windowStart: v.number(),
  windowEnd: v.number(),
  homeTeamId: v.id("teams"),
  awayTeamId: v.id("teams"),
  homeTeamName: v.string(),
  awayTeamName: v.string(),
  homeClubName: v.string(),
  awayClubName: v.string(),
  homeClubLogoUrl: v.union(v.string(), v.null()),
  awayClubLogoUrl: v.union(v.string(), v.null()),
  state: matchState,
  slot: v.optional(slot),
  result: v.optional(matchResult),
  forfeitAgainst: v.optional(v.id("teams")),
});

/**
 * Mémoire d'une seule requête, pour ne pas relire la même équipe et le même club à chaque
 * match. Un calendrier complet résoudrait sinon deux logos par match.
 */
export type TeamCache = Map<
  Id<"teams">,
  { teamName: string; clubName: string; clubLogoUrl: string | null }
>;

export function newTeamCache(): TeamCache {
  return new Map();
}

async function presentTeam(ctx: QueryCtx, teamId: Id<"teams">, cache: TeamCache) {
  const known = cache.get(teamId);
  if (known !== undefined) {
    return known;
  }
  const team = await ctx.db.get(teamId);
  const club = team === null ? null : await ctx.db.get(team.clubId);
  const presentation = {
    teamName: team?.name ?? "",
    clubName: club?.name ?? "",
    clubLogoUrl:
      club === null || club.logoId === undefined
        ? null
        : await ctx.storage.getUrl(club.logoId),
  };
  cache.set(teamId, presentation);
  return presentation;
}

/**
 * Enrichit un match de ce qu'il faut pour l'afficher sans requête supplémentaire.
 *
 * Passez le **même** `cache` sur toute une liste de matchs : les équipes s'y répètent.
 */
export async function summarize(
  ctx: QueryCtx,
  match: Doc<"matches">,
  cache: TeamCache = newTeamCache(),
) {
  const [matchday, home, away] = await Promise.all([
    ctx.db.get(match.matchdayId),
    presentTeam(ctx, match.homeTeamId, cache),
    presentTeam(ctx, match.awayTeamId, cache),
  ]);
  return {
    _id: match._id,
    championshipId: match.championshipId,
    matchdayId: match.matchdayId,
    matchdayNumber: matchday?.number ?? 0,
    windowStart: matchday?.windowStart ?? 0,
    windowEnd: matchday?.windowEnd ?? 0,
    homeTeamId: match.homeTeamId,
    awayTeamId: match.awayTeamId,
    homeTeamName: home.teamName,
    awayTeamName: away.teamName,
    homeClubName: home.clubName,
    awayClubName: away.clubName,
    homeClubLogoUrl: home.clubLogoUrl,
    awayClubLogoUrl: away.clubLogoUrl,
    state: match.state,
    slot: match.slot,
    result: match.result,
    forfeitAgainst: match.forfeitAgainst,
  };
}

/** Tous les matchs d'un championnat. Lecture publique : aucune donnée nominative. */
export const listByChampionship = query({
  args: { championshipId: v.id("championships") },
  returns: v.array(matchSummary),
  handler: async (ctx, { championshipId }) => {
    const matches = await ctx.db
      .query("matches")
      .withIndex("by_championship", (q) => q.eq("championshipId", championshipId))
      .collect();
    const cache = newTeamCache();
    const summaries = await Promise.all(
      matches.map((match) => summarize(ctx, match, cache)),
    );
    return summaries.sort(
      (a, b) => a.matchdayNumber - b.matchdayNumber || (a.slot?.at ?? 0) - (b.slot?.at ?? 0),
    );
  },
});

/**
 * Crée un match dans une journée.
 *
 * Le calendrier est saisi à la main (ADR-0001) : cette mutation porte donc les garde-fous
 * qu'un générateur aurait donnés gratuitement. Le doublon de paire est **signalé sans
 * bloquer** — un championnat peut légitimement programmer deux fois la même affiche.
 */
export const create = mutation({
  args: {
    matchdayId: v.id("matchdays"),
    homeTeamId: v.id("teams"),
    awayTeamId: v.id("teams"),
  },
  returns: v.object({
    matchId: v.id("matches"),
    duplicateWarning: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.homeTeamId === args.awayTeamId) {
      throw new ConvexError("Une équipe ne peut pas se rencontrer elle-même.");
    }
    const matchday = await ctx.db.get(args.matchdayId);
    if (matchday === null) {
      throw new ConvexError("Journée inconnue.");
    }
    const [homeTeam, awayTeam] = await Promise.all([
      ctx.db.get(args.homeTeamId),
      ctx.db.get(args.awayTeamId),
    ]);
    if (homeTeam === null || awayTeam === null) {
      throw new ConvexError("Équipe inconnue.");
    }
    for (const team of [homeTeam, awayTeam]) {
      if (team.championshipId !== matchday.championshipId) {
        throw new ConvexError(
          `L'équipe ${team.name} n'est pas engagée dans ce championnat.`,
        );
      }
    }

    const sameChampionship = await ctx.db
      .query("matches")
      .withIndex("by_championship", (q) => q.eq("championshipId", matchday.championshipId))
      .collect();
    const duplicate = sameChampionship.find(
      (match) =>
        match.homeTeamId === args.homeTeamId && match.awayTeamId === args.awayTeamId,
    );

    const matchId = await ctx.db.insert("matches", {
      championshipId: matchday.championshipId,
      matchdayId: args.matchdayId,
      homeTeamId: args.homeTeamId,
      awayTeamId: args.awayTeamId,
      state: "planned",
    });

    return {
      matchId,
      duplicateWarning:
        duplicate === undefined
          ? null
          : `${homeTeam.name} reçoit déjà ${awayTeam.name} dans ce championnat. ` +
            "Le match a été créé quand même.",
    };
  },
});

/** Corrige un match tant qu'aucun créneau n'est confirmé. */
export const updatePlanned = mutation({
  args: {
    matchId: v.id("matches"),
    matchdayId: v.optional(v.id("matchdays")),
    homeTeamId: v.optional(v.id("teams")),
    awayTeamId: v.optional(v.id("teams")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const match = await ctx.db.get(args.matchId);
    if (match === null) {
      throw new ConvexError("Match inconnu.");
    }
    if (match.state !== "planned") {
      throw new ConvexError(
        "Ce match n'est plus modifiable : une négociation est engagée. Passez par un report.",
      );
    }
    const homeTeamId = args.homeTeamId ?? match.homeTeamId;
    const awayTeamId = args.awayTeamId ?? match.awayTeamId;
    if (homeTeamId === awayTeamId) {
      throw new ConvexError("Une équipe ne peut pas se rencontrer elle-même.");
    }
    const matchdayId = args.matchdayId ?? match.matchdayId;
    const matchday = await ctx.db.get(matchdayId);
    if (matchday === null) {
      throw new ConvexError("Journée inconnue.");
    }
    for (const teamId of [homeTeamId, awayTeamId] as Id<"teams">[]) {
      const team = await ctx.db.get(teamId);
      if (team === null || team.championshipId !== matchday.championshipId) {
        throw new ConvexError("Équipe inconnue ou non engagée dans ce championnat.");
      }
    }
    await ctx.db.patch(args.matchId, {
      matchdayId,
      homeTeamId,
      awayTeamId,
      championshipId: matchday.championshipId,
    });
    return null;
  },
});

/** Un match, avec ce qu'il faut pour l'afficher. Lecture publique. */
export const get = query({
  args: { matchId: v.id("matches") },
  returns: v.union(matchSummary, v.null()),
  handler: async (ctx, { matchId }) => {
    const match = await ctx.db.get(matchId);
    return match === null ? null : await summarize(ctx, match);
  },
});

/** Les actions possibles sur un match, du point de vue d'un responsable. */
const todoAction = v.union(
  v.literal("proposeSlot"),
  v.literal("respondSlot"),
  v.literal("respondPostponement"),
  v.literal("submitSheet"),
  v.literal("respondSheet"),
  v.literal("waiting"),
  v.literal("disputed"),
);

export type TodoAction =
  | "proposeSlot"
  | "respondSlot"
  | "respondPostponement"
  | "submitSheet"
  | "respondSheet"
  | "waiting"
  | "disputed";

/** Ordre d'urgence : ce qui bloque l'adversaire passe devant ce qui ne bloque personne. */
const TODO_PRIORITY: Record<TodoAction, number> = {
  respondPostponement: 0,
  respondSheet: 1,
  respondSlot: 2,
  submitSheet: 3,
  proposeSlot: 4,
  disputed: 5,
  waiting: 6,
};

/**
 * Tous les matchs des équipes gérées, dédoublonnés — une équipe peut recevoir sur l'un et
 * se déplacer sur l'autre, et deux équipes gérées peuvent s'affronter.
 */
async function matchesOfTeams(ctx: QueryCtx, teamIds: Id<"teams">[]) {
  const seen = new Set<string>();
  const matches: Doc<"matches">[] = [];
  for (const teamId of teamIds) {
    for (const index of ["by_home_team", "by_away_team"] as const) {
      const rows = await ctx.db
        .query("matches")
        .withIndex(index, (q) =>
          index === "by_home_team" ? q.eq("homeTeamId", teamId) : q.eq("awayTeamId", teamId),
        )
        .collect();
      for (const match of rows) {
        if (!seen.has(match._id)) {
          seen.add(match._id);
          matches.push(match);
        }
      }
    }
  }
  return matches;
}

/**
 * Ce que ce match attend du compte donné, et l'échéance tacite qui court le cas échéant.
 *
 * Séparé de `myTodo` pour que le compteur du bandeau puisse classer les matchs **sans**
 * payer le `summarize` de chacun : un badge de navigation, présent sur toutes les pages,
 * n'a pas à résoudre deux URL de logo par ligne.
 */
async function classifyTodo(
  ctx: QueryCtx,
  match: Doc<"matches">,
  userId: Id<"users">,
  managed: Set<string>,
  now: number,
): Promise<{ action: TodoAction; deadline: number | null } | null> {
  if (match.state === "completed") {
    return null;
  }
  const iAmHome = managed.has(String(match.homeTeamId));
  const iAmAway = managed.has(String(match.awayTeamId));
  if (!iAmHome && !iAmAway) {
    return null;
  }

  const proposals = await ctx.db
    .query("slotProposals")
    .withIndex("by_match", (q) => q.eq("matchId", match._id))
    .collect();
  const pendingProposal = proposals.find((proposal) => proposal.status === "pending");
  const requests = await ctx.db
    .query("postponementRequests")
    .withIndex("by_match", (q) => q.eq("matchId", match._id))
    .collect();
  const pendingRequest = requests.find((request) => request.status === "pending");
  const sheet = await ctx.db
    .query("matchSheets")
    .withIndex("by_match", (q) => q.eq("matchId", match._id))
    .unique();

  let action: TodoAction = "waiting";
  let deadline: number | null = null;

  if (pendingRequest !== undefined && pendingRequest.requestedBy !== userId) {
    action = "respondPostponement";
  } else if (match.state === "planned" && iAmHome) {
    action = "proposeSlot";
  } else if (match.state === "awaitingSlot") {
    deadline = pendingProposal?.deadline ?? null;
    action =
      pendingProposal !== undefined && pendingProposal.proposedBy !== userId
        ? "respondSlot"
        : "waiting";
  } else if (match.state === "confirmed") {
    action =
      iAmHome && match.slot !== undefined && now >= match.slot.at ? "submitSheet" : "waiting";
  } else if (match.state === "awaitingSheet") {
    deadline = sheet?.deadline ?? null;
    action = sheet !== null && sheet.submittedBy !== userId ? "respondSheet" : "waiting";
  } else if (match.state === "disputed") {
    action = "disputed";
  }

  return { action, deadline };
}

/**
 * Tous les matchs des équipes rattachées au compte connecté, du plus ancien au plus récent.
 *
 * C'est le calendrier personnel, en **lecture seule** : il part de `attachedTeamIds`, donc
 * un compte de rôle `player` y voit les matchs des équipes dont sa fiche fait partie. Rien
 * ici n'ouvre de droit — ce que le compte peut *faire* reste décidé par `myTodo`, qui ne
 * regarde que les équipes gérées.
 *
 * Trié par date réelle, et non par numéro de journée : un compte peut suivre deux
 * championnats à la fois, dont les journées 3 ne tombent pas le même mois. Un match sans
 * créneau se range à l'ouverture de sa fenêtre, là où il se jouera.
 */
export const mine = query({
  args: {},
  returns: v.array(matchSummary),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const teamIds = await attachedTeamIds(ctx, user);
    if (teamIds.length === 0) {
      return [];
    }
    const matches = await matchesOfTeams(ctx, teamIds);
    const cache = newTeamCache();
    const summaries = await Promise.all(matches.map((match) => summarize(ctx, match, cache)));
    return summaries.sort((a, b) => (a.slot?.at ?? a.windowStart) - (b.slot?.at ?? b.windowStart));
  },
});

/** Ce qui attend l'action du compte connecté, sur les équipes qu'il gère. */
export const myTodo = query({
  args: {},
  returns: v.array(
    v.object({
      match: matchSummary,
      action: todoAction,
      deadline: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const teamIds = await managedTeamIds(ctx, user._id);
    if (teamIds.length === 0) {
      return [];
    }

    const matches = await matchesOfTeams(ctx, teamIds);
    const now = Date.now();
    const managed = new Set(teamIds.map(String));
    const cache = newTeamCache();
    const todo = [];

    for (const match of matches) {
      const classified = await classifyTodo(ctx, match, user._id, managed, now);
      if (classified === null) {
        continue;
      }
      todo.push({
        match: await summarize(ctx, match, cache),
        action: classified.action,
        deadline: classified.deadline,
      });
    }

    return todo.sort(
      (a, b) =>
        TODO_PRIORITY[a.action] - TODO_PRIORITY[b.action] ||
        a.match.matchdayNumber - b.match.matchdayNumber,
    );
  },
});

/**
 * Combien de matchs attendent une action du compte connecté.
 *
 * Même classement que `myTodo`, sans l'habillage : c'est la requête du compteur porté par
 * le bandeau, présent sur toutes les pages. Compte ce que le tableau de bord range dans
 * « À traiter », donc tout sauf `waiting` — les deux nombres ne peuvent pas diverger.
 */
export const myTodoCount = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const teamIds = await managedTeamIds(ctx, user._id);
    if (teamIds.length === 0) {
      return 0;
    }

    const matches = await matchesOfTeams(ctx, teamIds);
    const now = Date.now();
    const managed = new Set(teamIds.map(String));
    let count = 0;

    for (const match of matches) {
      const classified = await classifyTodo(ctx, match, user._id, managed, now);
      if (classified !== null && classified.action !== "waiting") {
        count++;
      }
    }
    return count;
  },
});
