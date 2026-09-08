import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { managedTeamIds, requireAdmin, requireUser } from "./authz";
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
  state: matchState,
  slot: v.optional(slot),
  result: v.optional(matchResult),
  forfeitAgainst: v.optional(v.id("teams")),
});

/** Enrichit un match de ce qu'il faut pour l'afficher sans requête supplémentaire. */
export async function summarize(ctx: QueryCtx, match: Doc<"matches">) {
  const [matchday, homeTeam, awayTeam] = await Promise.all([
    ctx.db.get(match.matchdayId),
    ctx.db.get(match.homeTeamId),
    ctx.db.get(match.awayTeamId),
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
    homeTeamName: homeTeam?.name ?? "",
    awayTeamName: awayTeam?.name ?? "",
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
    const summaries = await Promise.all(matches.map((match) => summarize(ctx, match)));
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

/** Ce qui attend l'action du compte connecté, sur les équipes qu'il gère. */
export const myTodo = query({
  args: {},
  returns: v.array(
    v.object({
      match: matchSummary,
      action: v.union(
        v.literal("proposeSlot"),
        v.literal("respondSlot"),
        v.literal("respondPostponement"),
        v.literal("submitSheet"),
        v.literal("respondSheet"),
        v.literal("waiting"),
        v.literal("disputed"),
      ),
      deadline: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const teamIds = await managedTeamIds(ctx, user._id);
    if (teamIds.length === 0) {
      return [];
    }

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

    const now = Date.now();
    const managed = new Set(teamIds.map(String));
    const todo = [];

    for (const match of matches) {
      if (match.state === "completed") {
        continue;
      }
      const iAmHome = managed.has(String(match.homeTeamId));
      const iAmAway = managed.has(String(match.awayTeamId));

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

      let action:
        | "proposeSlot"
        | "respondSlot"
        | "respondPostponement"
        | "submitSheet"
        | "respondSheet"
        | "waiting"
        | "disputed" = "waiting";
      let deadline: number | null = null;

      if (pendingRequest !== undefined && pendingRequest.requestedBy !== user._id) {
        action = "respondPostponement";
      } else if (match.state === "planned" && iAmHome) {
        action = "proposeSlot";
      } else if (match.state === "awaitingSlot") {
        deadline = pendingProposal?.deadline ?? null;
        action =
          pendingProposal !== undefined && pendingProposal.proposedBy !== user._id
            ? "respondSlot"
            : "waiting";
      } else if (match.state === "confirmed") {
        action = iAmHome && match.slot !== undefined && now >= match.slot.at
          ? "submitSheet"
          : "waiting";
      } else if (match.state === "awaitingSheet") {
        deadline = sheet?.deadline ?? null;
        action = sheet !== null && sheet.submittedBy !== user._id ? "respondSheet" : "waiting";
      } else if (match.state === "disputed") {
        action = "disputed";
      }

      if (!iAmHome && !iAmAway) {
        continue;
      }
      todo.push({ match: await summarize(ctx, match), action, deadline });
    }

    const priority = {
      respondPostponement: 0,
      respondSheet: 1,
      respondSlot: 2,
      submitSheet: 3,
      proposeSlot: 4,
      disputed: 5,
      waiting: 6,
    } as const;
    return todo.sort(
      (a, b) =>
        priority[a.action] - priority[b.action] ||
        a.match.matchdayNumber - b.match.matchdayNumber,
    );
  },
});
