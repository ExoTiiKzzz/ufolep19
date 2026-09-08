import { ConvexError, v } from "convex/values";

import { internalQuery, mutation, query } from "./_generated/server";
import { getCurrentUser, managedTeamIds, requireAdmin } from "./authz";
import { role } from "./schema";

const account = v.object({
  _id: v.id("users"),
  _creationTime: v.number(),
  name: v.optional(v.string()),
  email: v.optional(v.string()),
  role,
  // `null` plutôt qu'absent : le client n'a pas à distinguer « champ manquant » de
  // « aucune fiche joueur rattachée ».
  playerId: v.union(v.id("players"), v.null()),
});

/**
 * Le compte connecté, ou `null`. Sert à l'affichage de l'identité courante ;
 * l'absence de compte n'est pas une erreur, c'est l'état d'un visiteur public.
 */
export const me = query({
  args: {},
  returns: v.union(account, v.null()),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (user === null) {
      return null;
    }
    return {
      _id: user._id,
      _creationTime: user._creationTime,
      name: user.name,
      email: user.email,
      role: user.role,
      playerId: user.playerId ?? null,
    };
  },
});

/** Tous les comptes, avec les équipes qu'ils gèrent. Réservé aux administrateurs. */
export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("users"),
      _creationTime: v.number(),
      name: v.optional(v.string()),
      email: v.optional(v.string()),
      role,
      managedTeams: v.array(v.object({ _id: v.id("teams"), name: v.string() })),
    }),
  ),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").collect();
    return await Promise.all(
      users.map(async (user) => {
        const teamIds = await managedTeamIds(ctx, user._id);
        const teams = await Promise.all(teamIds.map((teamId) => ctx.db.get(teamId)));
        return {
          _id: user._id,
          _creationTime: user._creationTime,
          name: user.name,
          email: user.email,
          role: user.role,
          managedTeams: teams
            .filter((team): team is NonNullable<typeof team> => team !== null)
            .map((team) => ({ _id: team._id, name: team.name })),
        };
      }),
    );
  },
});

/**
 * Change le rôle d'un compte.
 *
 * Garde-fou : la mutation refuse de retirer le **dernier** administrateur, ce qui
 * verrouillerait définitivement la plateforme.
 */
export const setRole = mutation({
  args: { userId: v.id("users"), role },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const target = await ctx.db.get(args.userId);
    if (target === null) {
      throw new ConvexError("Compte inconnu.");
    }
    if (target.role === "admin" && args.role !== "admin") {
      const admins = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "admin"))
        .collect();
      if (admins.length <= 1) {
        throw new ConvexError(
          "Impossible de retirer le dernier administrateur : la plateforme deviendrait ingérable.",
        );
      }
    }
    await ctx.db.patch(args.userId, { role: args.role });
    return null;
  },
});

/** Rattache un compte à une fiche joueur, ou le détache. Facultatif. */
export const linkPlayer = mutation({
  args: { userId: v.id("users"), playerId: v.union(v.id("players"), v.null()) },
  returns: v.null(),
  handler: async (ctx, { userId, playerId }) => {
    await requireAdmin(ctx);
    if ((await ctx.db.get(userId)) === null) {
      throw new ConvexError("Compte inconnu.");
    }
    if (playerId !== null && (await ctx.db.get(playerId)) === null) {
      throw new ConvexError("Fiche joueur inconnue.");
    }
    await ctx.db.patch(userId, { playerId: playerId ?? undefined });
    return null;
  },
});

/** Vérifie qu'un compte est administrateur. Utilisé depuis les actions. */
export const assertAdmin = internalQuery({
  args: { userId: v.union(v.id("users"), v.null()) },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    if (userId === null) {
      throw new ConvexError("Authentification requise.");
    }
    const user = await ctx.db.get(userId);
    if (user === null || user.role !== "admin") {
      throw new ConvexError("Action réservée aux administrateurs.");
    }
    return null;
  },
});

/** Recherche par e-mail, pour l'amorçage en ligne de commande. */
export const byEmail = internalQuery({
  args: { email: v.string() },
  returns: v.union(v.id("users"), v.null()),
  handler: async (ctx, { email }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();
    return user?._id ?? null;
  },
});
