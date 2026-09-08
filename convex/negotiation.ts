import { ConvexError, v } from "convex/values";

import {
  nextState,
  TransitionError,
  type Actor,
  type MatchTransition,
} from "../lib/rules/match-lifecycle";
import { slotTacitDeadline } from "../lib/rules/tacit";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { managedTeamIds, requireAdmin, requireUser } from "./authz";

type Ctx = QueryCtx | MutationCtx;

/** De quel côté du match se trouve l'appelant. */
type Sides = {
  user: Doc<"users">;
  isAdmin: boolean;
  isHome: boolean;
  isAway: boolean;
};

async function mustGetMatch(ctx: Ctx, matchId: Id<"matches">): Promise<Doc<"matches">> {
  const match = await ctx.db.get(matchId);
  if (match === null) {
    throw new ConvexError("Match inconnu.");
  }
  return match;
}

/**
 * Situe l'appelant par rapport au match.
 *
 * Un responsable étranger aux deux équipes est rejeté ici : ses droits viennent du
 * rattachement d'équipe, jamais du rôle seul.
 */
export async function sidesOf(ctx: Ctx, match: Doc<"matches">): Promise<Sides> {
  const user = await requireUser(ctx);
  if (user.role === "admin") {
    return { user, isAdmin: true, isHome: true, isAway: true };
  }
  const teamIds = new Set(await managedTeamIds(ctx, user._id));
  const isHome = teamIds.has(match.homeTeamId);
  const isAway = teamIds.has(match.awayTeamId);
  if (!isHome && !isAway) {
    throw new ConvexError("Vous n'êtes responsable d'aucune des deux équipes de ce match.");
  }
  return { user, isAdmin: false, isHome, isAway };
}

/** L'acteur à présenter au cycle de vie, selon le côté qui a la main pour cette action. */
export function actorFor(sides: Sides, expected: "home" | "away"): Actor {
  if (sides.isAdmin) {
    return "admin";
  }
  if (expected === "home") {
    return sides.isHome ? "home" : "away";
  }
  return sides.isAway ? "away" : "home";
}

/** Applique le cycle de vie en traduisant son erreur pour le client. */
export function transitionTo(
  transition: MatchTransition,
  from: Doc<"matches">["state"],
  actor: Actor,
) {
  try {
    return nextState(transition, from, actor);
  } catch (error) {
    if (error instanceof TransitionError) {
      throw new ConvexError(error.message);
    }
    throw error;
  }
}

/** Annule l'échéance tacite en cours, s'il y en a une. */
async function cancelTacit(ctx: MutationCtx, match: Doc<"matches">) {
  if (match.tacitJobId !== undefined) {
    await ctx.scheduler.cancel(match.tacitJobId);
  }
}

async function pendingProposal(ctx: Ctx, matchId: Id<"matches">) {
  const proposals = await ctx.db
    .query("slotProposals")
    .withIndex("by_match", (q) => q.eq("matchId", matchId))
    .collect();
  return proposals.find((proposal) => proposal.status === "pending") ?? null;
}

async function pendingPostponement(ctx: Ctx, matchId: Id<"matches">) {
  const requests = await ctx.db
    .query("postponementRequests")
    .withIndex("by_match", (q) => q.eq("matchId", matchId))
    .collect();
  return requests.find((request) => request.status === "pending") ?? null;
}

/**
 * Le receveur propose un créneau.
 *
 * Rend l'échéance de validation tacite, ou `null` quand le créneau est trop proche pour
 * qu'un silence vaille accord : la validation explicite du visiteur devient alors
 * obligatoire.
 */
export const proposeSlot = mutation({
  args: { matchId: v.id("matches"), at: v.number(), venue: v.string() },
  returns: v.object({ tacitDeadline: v.union(v.number(), v.null()) }),
  handler: async (ctx, args) => {
    const match = await mustGetMatch(ctx, args.matchId);
    const sides = await sidesOf(ctx, match);
    const to = transitionTo("proposeSlot", match.state, actorFor(sides, "home"));

    const matchday = await ctx.db.get(match.matchdayId);
    if (matchday === null) {
      throw new ConvexError("Journée inconnue.");
    }
    if (args.at < matchday.windowStart || args.at > matchday.windowEnd) {
      throw new ConvexError(
        "Le créneau doit tomber dans la fenêtre de dates de la journée.",
      );
    }
    const venue = args.venue.trim();
    if (venue === "") {
      throw new ConvexError("Le lieu du match est obligatoire.");
    }
    const now = Date.now();
    if (args.at <= now) {
      throw new ConvexError("Le créneau proposé est déjà passé.");
    }

    await cancelTacit(ctx, match);
    const deadline = slotTacitDeadline(now, args.at);
    const proposalId = await ctx.db.insert("slotProposals", {
      matchId: args.matchId,
      at: args.at,
      venue,
      proposedBy: sides.user._id,
      status: "pending",
      deadline: deadline ?? undefined,
    });
    const tacitJobId =
      deadline === null
        ? undefined
        : await ctx.scheduler.runAt(deadline, internal.negotiation.applyTacitSlot, {
            matchId: args.matchId,
            proposalId,
          });

    await ctx.db.patch(args.matchId, { state: to, tacitJobId });
    return { tacitDeadline: deadline };
  },
});

/** Le visiteur valide la proposition : le créneau devient ferme. */
export const acceptSlot = mutation({
  args: { matchId: v.id("matches") },
  returns: v.null(),
  handler: async (ctx, { matchId }) => {
    const match = await mustGetMatch(ctx, matchId);
    const sides = await sidesOf(ctx, match);
    const to = transitionTo("acceptSlot", match.state, actorFor(sides, "away"));

    const proposal = await pendingProposal(ctx, matchId);
    if (proposal === null) {
      throw new ConvexError("Aucune proposition en attente.");
    }
    if (proposal.proposedBy === sides.user._id && !sides.isAdmin) {
      throw new ConvexError(
        "Vous ne pouvez pas valider votre propre proposition : elle revient à l'équipe adverse.",
      );
    }

    await cancelTacit(ctx, match);
    await ctx.db.patch(proposal._id, { status: "accepted", respondedAt: Date.now() });
    await ctx.db.patch(matchId, {
      state: to,
      slot: { at: proposal.at, venue: proposal.venue },
      tacitJobId: undefined,
    });
    return null;
  },
});

/** Le visiteur refuse : le match retourne en attente de proposition. */
export const rejectSlot = mutation({
  args: { matchId: v.id("matches") },
  returns: v.null(),
  handler: async (ctx, { matchId }) => {
    const match = await mustGetMatch(ctx, matchId);
    const sides = await sidesOf(ctx, match);
    const to = transitionTo("rejectSlot", match.state, actorFor(sides, "away"));

    const proposal = await pendingProposal(ctx, matchId);
    if (proposal === null) {
      throw new ConvexError("Aucune proposition en attente.");
    }
    if (proposal.proposedBy === sides.user._id && !sides.isAdmin) {
      throw new ConvexError("Vous ne pouvez pas répondre à votre propre proposition.");
    }

    await cancelTacit(ctx, match);
    await ctx.db.patch(proposal._id, { status: "rejected", respondedAt: Date.now() });
    await ctx.db.patch(matchId, { state: to, tacitJobId: undefined });
    return null;
  },
});

/**
 * Validation tacite d'une proposition, à l'échéance programmée.
 *
 * La tâche revérifie l'état et sa cible avant d'agir : une annulation manquée reste sans
 * effet. Elle refuse aussi d'agir après la date du match, ce qui ne devrait jamais
 * arriver puisque l'échéance est plafonnée à la veille — deuxième barrière.
 */
export const applyTacitSlot = internalMutation({
  args: { matchId: v.id("matches"), proposalId: v.id("slotProposals") },
  returns: v.null(),
  handler: async (ctx, { matchId, proposalId }) => {
    const match = await ctx.db.get(matchId);
    const proposal = await ctx.db.get(proposalId);
    if (match === null || proposal === null) {
      return null;
    }
    if (
      proposal.matchId !== matchId ||
      proposal.status !== "pending" ||
      match.state !== "awaitingSlot"
    ) {
      return null;
    }
    if (Date.now() >= proposal.at) {
      return null;
    }
    await ctx.db.patch(proposalId, { status: "tacit", respondedAt: Date.now() });
    await ctx.db.patch(matchId, {
      state: "confirmed",
      slot: { at: proposal.at, venue: proposal.venue },
      tacitJobId: undefined,
    });
    return null;
  },
});

/** Un responsable demande le report d'un match confirmé, avec un motif. */
export const requestPostponement = mutation({
  args: { matchId: v.id("matches"), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, { matchId, reason }) => {
    const match = await mustGetMatch(ctx, matchId);
    const sides = await sidesOf(ctx, match);
    if (match.state !== "confirmed") {
      throw new ConvexError("Seul un match dont le créneau est ferme peut être reporté.");
    }
    assertBeforeSlot(match);
    if (reason.trim() === "") {
      throw new ConvexError("Le motif du report est obligatoire.");
    }
    if ((await pendingPostponement(ctx, matchId)) !== null) {
      throw new ConvexError("Une demande de report est déjà en attente sur ce match.");
    }
    await ctx.db.insert("postponementRequests", {
      matchId,
      requestedBy: sides.user._id,
      reason: reason.trim(),
      status: "pending",
    });
    return null;
  },
});

/** L'adversaire accepte ou refuse la demande de report. */
export const respondToPostponement = mutation({
  args: { matchId: v.id("matches"), accept: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { matchId, accept }) => {
    const match = await mustGetMatch(ctx, matchId);
    const sides = await sidesOf(ctx, match);
    const request = await pendingPostponement(ctx, matchId);
    if (request === null) {
      throw new ConvexError("Aucune demande de report en attente.");
    }
    if (request.requestedBy === sides.user._id && !sides.isAdmin) {
      throw new ConvexError("Vous ne pouvez pas accepter votre propre demande de report.");
    }
    assertBeforeSlot(match);

    if (!accept) {
      await ctx.db.patch(request._id, { status: "rejected" });
      return null;
    }
    const actor = sides.isAdmin ? "admin" : sides.isHome ? "home" : "away";
    const to = transitionTo("postpone", match.state, actor);
    await cancelTacit(ctx, match);
    await ctx.db.patch(request._id, { status: "accepted" });
    await ctx.db.patch(matchId, { state: to, slot: undefined, tacitJobId: undefined });
    return null;
  },
});

/** L'administrateur impose un report, sans accord de l'adversaire. */
export const imposePostponement = mutation({
  args: { matchId: v.id("matches"), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, { matchId, reason }) => {
    const admin = await requireAdmin(ctx);
    const match = await mustGetMatch(ctx, matchId);
    const to = transitionTo("postpone", match.state, "admin");
    assertBeforeSlot(match);

    const request = await pendingPostponement(ctx, matchId);
    if (request !== null) {
      await ctx.db.patch(request._id, { status: "accepted" });
    }
    await ctx.db.insert("postponementRequests", {
      matchId,
      requestedBy: admin._id,
      reason: reason.trim() === "" ? "Report imposé par le comité." : reason.trim(),
      status: "imposed",
    });
    await cancelTacit(ctx, match);
    await ctx.db.patch(matchId, { state: to, slot: undefined, tacitJobId: undefined });
    return null;
  },
});

/**
 * Passé l'heure du créneau, plus de report : soit une feuille de match est saisie, soit
 * l'administrateur prononce un forfait.
 */
function assertBeforeSlot(match: Doc<"matches">) {
  if (match.slot !== undefined && Date.now() >= match.slot.at) {
    throw new ConvexError(
      "L'heure du match est passée : un report n'est plus possible, il faut saisir la feuille ou prononcer un forfait.",
    );
  }
}

/** Salle par défaut du club receveur. */
async function homeVenue(ctx: Ctx, match: Doc<"matches">): Promise<string> {
  const team = await ctx.db.get(match.homeTeamId);
  if (team === null) {
    return "";
  }
  return (await ctx.db.get(team.clubId))?.defaultVenue ?? "";
}

/** Historique de négociation d'un match. Réservé aux deux responsables et à l'administrateur. */
export const history = query({
  args: { matchId: v.id("matches") },
  returns: v.object({
    proposals: v.array(
      v.object({
        _id: v.id("slotProposals"),
        at: v.number(),
        venue: v.string(),
        proposedByName: v.string(),
        status: v.union(
          v.literal("pending"),
          v.literal("accepted"),
          v.literal("tacit"),
          v.literal("rejected"),
          v.literal("cancelled"),
        ),
        deadline: v.union(v.number(), v.null()),
      }),
    ),
    postponements: v.array(
      v.object({
        _id: v.id("postponementRequests"),
        requestedByName: v.string(),
        reason: v.string(),
        status: v.union(
          v.literal("pending"),
          v.literal("accepted"),
          v.literal("rejected"),
          v.literal("imposed"),
        ),
        requestedByMe: v.boolean(),
      }),
    ),
    iAmHome: v.boolean(),
    iAmAway: v.boolean(),
    iAmAdmin: v.boolean(),
    // Salle par défaut du club receveur, pour préremplir la proposition de créneau.
    defaultVenue: v.string(),
  }),
  handler: async (ctx, { matchId }) => {
    const match = await mustGetMatch(ctx, matchId);
    const sides = await sidesOf(ctx, match);

    const proposals = await ctx.db
      .query("slotProposals")
      .withIndex("by_match", (q) => q.eq("matchId", matchId))
      .collect();
    const postponements = await ctx.db
      .query("postponementRequests")
      .withIndex("by_match", (q) => q.eq("matchId", matchId))
      .collect();

    const nameOf = async (userId: Id<"users">) => {
      const user = await ctx.db.get(userId);
      return user?.name ?? user?.email ?? "Compte supprimé";
    };

    return {
      proposals: await Promise.all(
        proposals
          .sort((a, b) => b._creationTime - a._creationTime)
          .map(async (proposal) => ({
            _id: proposal._id,
            at: proposal.at,
            venue: proposal.venue,
            proposedByName: await nameOf(proposal.proposedBy),
            status: proposal.status,
            deadline: proposal.deadline ?? null,
          })),
      ),
      postponements: await Promise.all(
        postponements
          .sort((a, b) => b._creationTime - a._creationTime)
          .map(async (request) => ({
            _id: request._id,
            requestedByName: await nameOf(request.requestedBy),
            reason: request.reason,
            status: request.status,
            requestedByMe: request.requestedBy === sides.user._id,
          })),
      ),
      iAmHome: sides.isHome,
      iAmAway: sides.isAway,
      iAmAdmin: sides.isAdmin,
      defaultVenue: await homeVenue(ctx, match),
    };
  },
});
