import { ConvexError, v } from "convex/values";

import { forfeitScore, validateMatchScore, type SetScore } from "../lib/rules/score";
import { sheetTacitDeadline } from "../lib/rules/tacit";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireAdmin } from "./authz";
import { actorFor, sidesOf, transitionTo } from "./negotiation";

type Ctx = QueryCtx | MutationCtx;

export const MAX_LINEUP_SIZE = 12;

const setScore = v.object({ home: v.number(), away: v.number() });

async function mustGetMatch(ctx: Ctx, matchId: Id<"matches">): Promise<Doc<"matches">> {
  const match = await ctx.db.get(matchId);
  if (match === null) {
    throw new ConvexError("Match inconnu.");
  }
  return match;
}

async function sheetOf(ctx: Ctx, matchId: Id<"matches">) {
  return await ctx.db
    .query("matchSheets")
    .withIndex("by_match", (q) => q.eq("matchId", matchId))
    .unique();
}

/** Valide le score et rend le résultat orienté receveur / visiteur. */
function resultFrom(match: Doc<"matches">, sets: SetScore[]) {
  const validation = validateMatchScore(sets);
  if (!validation.ok) {
    throw new ConvexError(validation.error.message);
  }
  const { outcome } = validation;
  return {
    winnerTeamId: outcome.winner === "home" ? match.homeTeamId : match.awayTeamId,
    homeSets: outcome.homeSets,
    awaySets: outcome.awaySets,
    homePoints: outcome.homePoints,
    awayPoints: outcome.awayPoints,
  };
}

/**
 * Vérifie une composition et rend la liste des joueurs alignés.
 *
 * Au plus 12 joueurs, **aucun minimum** : jouer en sous-effectif est un désavantage
 * sportif, pas un motif de forfait. Une composition vide est en revanche refusée : c'est
 * une feuille non remplie.
 */
async function checkLineup(
  ctx: MutationCtx,
  teamId: Id<"teams">,
  playerIds: Id<"players">[],
  label: string,
) {
  if (playerIds.length === 0) {
    throw new ConvexError(
      `Composition ${label} vide : une feuille non remplie n'est pas un sous-effectif.`,
    );
  }
  if (playerIds.length > MAX_LINEUP_SIZE) {
    throw new ConvexError(
      `Composition ${label} : ${MAX_LINEUP_SIZE} joueurs au maximum sur une feuille de match.`,
    );
  }
  if (new Set(playerIds).size !== playerIds.length) {
    throw new ConvexError(`Composition ${label} : un joueur y figure deux fois.`);
  }
  for (const playerId of playerIds) {
    const entry = await ctx.db
      .query("rosterEntries")
      .withIndex("by_team_and_player", (q) => q.eq("teamId", teamId).eq("playerId", playerId))
      .unique();
    if (entry === null) {
      const player = await ctx.db.get(playerId);
      const who =
        player === null ? "Ce joueur" : `${player.firstName} ${player.lastName}`;
      throw new ConvexError(
        `${who} n'appartient pas à l'effectif de l'équipe (composition ${label}).`,
      );
    }
  }
}

/**
 * Le receveur transcrit la feuille de match : score par set et compositions des **deux**
 * équipes (ADR-0003). Le visiteur valide ensuite l'ensemble en un seul geste.
 */
export const submit = mutation({
  args: {
    matchId: v.id("matches"),
    sets: v.array(setScore),
    homeLineup: v.array(v.id("players")),
    awayLineup: v.array(v.id("players")),
  },
  returns: v.object({ tacitDeadline: v.number() }),
  handler: async (ctx, args) => {
    const match = await mustGetMatch(ctx, args.matchId);
    const sides = await sidesOf(ctx, match);
    const to = transitionTo("submitSheet", match.state, actorFor(sides, "home"));

    if (match.slot === undefined) {
      throw new ConvexError("Ce match n'a pas de créneau confirmé.");
    }
    if (Date.now() < match.slot.at) {
      throw new ConvexError(
        "Le match n'a pas encore eu lieu : la saisie ouvre à l'heure du créneau.",
      );
    }

    // Le score est validé avant les compositions : c'est l'erreur la plus fréquente.
    const result = resultFrom(match, args.sets);

    await checkLineup(ctx, match.homeTeamId, args.homeLineup, "receveur");
    await checkLineup(ctx, match.awayTeamId, args.awayLineup, "visiteur");
    const both = args.homeLineup.filter((playerId) => args.awayLineup.includes(playerId));
    if (both.length > 0) {
      throw new ConvexError(
        "Un même joueur figure dans les deux compositions du match : c'est une erreur de saisie.",
      );
    }

    const deadline = sheetTacitDeadline(Date.now());
    const existing = await sheetOf(ctx, args.matchId);
    let sheetId: Id<"matchSheets">;
    if (existing === null) {
      sheetId = await ctx.db.insert("matchSheets", {
        matchId: args.matchId,
        sets: args.sets,
        submittedBy: sides.user._id,
        status: "pending",
        deadline,
      });
    } else {
      sheetId = existing._id;
      await ctx.db.patch(sheetId, {
        sets: args.sets,
        submittedBy: sides.user._id,
        status: "pending",
        deadline,
        disputeReason: undefined,
      });
    }

    // Les compositions sont réécrites entièrement : la feuille est un tout.
    const previous = await ctx.db
      .query("lineupEntries")
      .withIndex("by_match", (q) => q.eq("matchId", args.matchId))
      .collect();
    for (const entry of previous) {
      await ctx.db.delete(entry._id);
    }
    for (const [teamId, lineup] of [
      [match.homeTeamId, args.homeLineup],
      [match.awayTeamId, args.awayLineup],
    ] as const) {
      for (const playerId of lineup) {
        await ctx.db.insert("lineupEntries", {
          matchId: args.matchId,
          matchdayId: match.matchdayId,
          teamId,
          playerId,
        });
      }
    }

    if (match.tacitJobId !== undefined) {
      await ctx.scheduler.cancel(match.tacitJobId);
    }
    const tacitJobId = await ctx.scheduler.runAt(
      deadline,
      internal.sheets.applyTacitSheet,
      { matchId: args.matchId, sheetId },
    );
    await ctx.db.patch(args.matchId, { state: to, tacitJobId });
    // `result` est calculé ici pour rejeter tout de suite un score impossible, mais n'est
    // écrit qu'à la validation : un match n'entre au classement qu'une fois la feuille
    // acceptée.
    void result;
    return { tacitDeadline: deadline };
  },
});

/** Le visiteur valide la feuille : le match est terminé et entre au classement. */
export const validate = mutation({
  args: { matchId: v.id("matches") },
  returns: v.null(),
  handler: async (ctx, { matchId }) => {
    const match = await mustGetMatch(ctx, matchId);
    const sides = await sidesOf(ctx, match);
    const to = transitionTo("validateSheet", match.state, actorFor(sides, "away"));

    const sheet = await sheetOf(ctx, matchId);
    if (sheet === null || sheet.status !== "pending") {
      throw new ConvexError("Aucune feuille de match en attente.");
    }
    if (sheet.submittedBy === sides.user._id && !sides.isAdmin) {
      throw new ConvexError(
        "Vous ne pouvez pas valider votre propre feuille : elle revient à l'équipe adverse.",
      );
    }

    if (match.tacitJobId !== undefined) {
      await ctx.scheduler.cancel(match.tacitJobId);
    }
    await ctx.db.patch(sheet._id, { status: "validated", deadline: undefined });
    await ctx.db.patch(matchId, {
      state: to,
      result: resultFrom(match, sheet.sets),
      tacitJobId: undefined,
    });
    return null;
  },
});

/** Le visiteur conteste la feuille : le match passe en litige, l'administrateur tranchera. */
export const dispute = mutation({
  args: { matchId: v.id("matches"), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, { matchId, reason }) => {
    const match = await mustGetMatch(ctx, matchId);
    const sides = await sidesOf(ctx, match);
    const to = transitionTo("disputeSheet", match.state, actorFor(sides, "away"));

    const sheet = await sheetOf(ctx, matchId);
    if (sheet === null || sheet.status !== "pending") {
      throw new ConvexError("Aucune feuille de match en attente.");
    }
    if (sheet.submittedBy === sides.user._id && !sides.isAdmin) {
      throw new ConvexError("Vous ne pouvez pas contester votre propre feuille.");
    }
    if (reason.trim() === "") {
      throw new ConvexError("Le motif de contestation est obligatoire.");
    }

    if (match.tacitJobId !== undefined) {
      await ctx.scheduler.cancel(match.tacitJobId);
    }
    await ctx.db.patch(sheet._id, {
      status: "disputed",
      disputeReason: reason.trim(),
      deadline: undefined,
    });
    await ctx.db.patch(matchId, { state: to, tacitJobId: undefined });
    return null;
  },
});

/** Validation tacite de la feuille, à l'échéance programmée. */
export const applyTacitSheet = internalMutation({
  args: { matchId: v.id("matches"), sheetId: v.id("matchSheets") },
  returns: v.null(),
  handler: async (ctx, { matchId, sheetId }) => {
    const match = await ctx.db.get(matchId);
    const sheet = await ctx.db.get(sheetId);
    if (match === null || sheet === null) {
      return null;
    }
    if (
      sheet.matchId !== matchId ||
      sheet.status !== "pending" ||
      match.state !== "awaitingSheet"
    ) {
      return null;
    }
    await ctx.db.patch(sheetId, { status: "validated", deadline: undefined });
    await ctx.db.patch(matchId, {
      state: "completed",
      result: resultFrom(match, sheet.sets),
      tacitJobId: undefined,
    });
    return null;
  },
});

/** L'administrateur arrête le score d'un match en litige. */
export const settleDispute = mutation({
  args: { matchId: v.id("matches"), sets: v.array(setScore) },
  returns: v.null(),
  handler: async (ctx, { matchId, sets }) => {
    const admin = await requireAdmin(ctx);
    const match = await mustGetMatch(ctx, matchId);
    const to = transitionTo("settleDispute", match.state, "admin");

    const sheet = await sheetOf(ctx, matchId);
    if (sheet === null) {
      throw new ConvexError("Aucune feuille de match à arbitrer.");
    }
    const result = resultFrom(match, sets);
    await ctx.db.patch(sheet._id, {
      sets,
      status: "validated",
      settledBy: admin._id,
      deadline: undefined,
    });
    await ctx.db.patch(matchId, { state: to, result, tacitJobId: undefined });
    return null;
  },
});

/**
 * L'administrateur prononce un forfait.
 *
 * Un match forfait est un match **terminé** portant l'équipe défaillante : le classement
 * n'a aucun cas particulier à connaître. Le score conventionnel est matérialisé (3 sets
 * à 25-0), de sorte que les ratios restent comparables entre équipes.
 */
export const forfeit = mutation({
  args: { matchId: v.id("matches"), forfeitingTeamId: v.id("teams") },
  returns: v.null(),
  handler: async (ctx, { matchId, forfeitingTeamId }) => {
    const admin = await requireAdmin(ctx);
    const match = await mustGetMatch(ctx, matchId);
    const to = transitionTo("forfeit", match.state, "admin");

    if (
      forfeitingTeamId !== match.homeTeamId &&
      forfeitingTeamId !== match.awayTeamId
    ) {
      throw new ConvexError("Cette équipe ne joue pas ce match.");
    }
    const homeForfeits = forfeitingTeamId === match.homeTeamId;
    const sets = forfeitScore().map((set) =>
      homeForfeits ? { home: set.away, away: set.home } : set,
    );
    const result = resultFrom(match, sets);

    if (match.tacitJobId !== undefined) {
      await ctx.scheduler.cancel(match.tacitJobId);
    }
    const existing = await sheetOf(ctx, matchId);
    if (existing === null) {
      await ctx.db.insert("matchSheets", {
        matchId,
        sets,
        submittedBy: admin._id,
        status: "validated",
        settledBy: admin._id,
      });
    } else {
      await ctx.db.patch(existing._id, {
        sets,
        status: "validated",
        settledBy: admin._id,
        deadline: undefined,
      });
    }
    await ctx.db.patch(matchId, {
      state: to,
      result,
      forfeitAgainst: forfeitingTeamId,
      tacitJobId: undefined,
    });
    return null;
  },
});

/** L'administrateur corrige la feuille d'un match déjà terminé. */
export const correct = mutation({
  args: { matchId: v.id("matches"), sets: v.array(setScore) },
  returns: v.null(),
  handler: async (ctx, { matchId, sets }) => {
    const admin = await requireAdmin(ctx);
    const match = await mustGetMatch(ctx, matchId);
    if (match.state !== "completed") {
      throw new ConvexError("Seule la feuille d'un match terminé se corrige.");
    }
    const sheet = await sheetOf(ctx, matchId);
    if (sheet === null) {
      throw new ConvexError("Ce match n'a pas de feuille.");
    }
    const result = resultFrom(match, sets);
    await ctx.db.patch(sheet._id, { sets, settledBy: admin._id });
    await ctx.db.patch(matchId, { result, forfeitAgainst: undefined });
    return null;
  },
});

/**
 * Feuille de match d'un match, compositions incluses.
 *
 * Nominatif : réservé aux comptes connectés. Les scores publics passent par les queries
 * de calendrier et de résultats.
 */
export const get = query({
  args: { matchId: v.id("matches") },
  returns: v.union(
    v.object({
      sets: v.array(setScore),
      status: v.union(v.literal("pending"), v.literal("validated"), v.literal("disputed")),
      deadline: v.union(v.number(), v.null()),
      disputeReason: v.union(v.string(), v.null()),
      submittedByMe: v.boolean(),
      homeLineup: v.array(v.object({ _id: v.id("players"), name: v.string() })),
      awayLineup: v.array(v.object({ _id: v.id("players"), name: v.string() })),
    }),
    v.null(),
  ),
  handler: async (ctx, { matchId }) => {
    const match = await mustGetMatch(ctx, matchId);
    const sides = await sidesOf(ctx, match);
    const sheet = await sheetOf(ctx, matchId);
    if (sheet === null) {
      return null;
    }
    const entries = await ctx.db
      .query("lineupEntries")
      .withIndex("by_match", (q) => q.eq("matchId", matchId))
      .collect();
    const named = await Promise.all(
      entries.map(async (entry) => {
        const player = await ctx.db.get(entry.playerId);
        return {
          teamId: entry.teamId,
          _id: entry.playerId,
          name: player === null ? "Joueur supprimé" : `${player.firstName} ${player.lastName}`,
        };
      }),
    );
    const forTeam = (teamId: Id<"teams">) =>
      named
        .filter((entry) => entry.teamId === teamId)
        .map(({ _id, name }) => ({ _id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, "fr"));

    return {
      sets: sheet.sets,
      status: sheet.status,
      deadline: sheet.deadline ?? null,
      disputeReason: sheet.disputeReason ?? null,
      submittedByMe: sheet.submittedBy === sides.user._id,
      homeLineup: forTeam(match.homeTeamId),
      awayLineup: forTeam(match.awayTeamId),
    };
  },
});
