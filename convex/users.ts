import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
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
 * Nom d'un compte tel que l'historique d'un match l'affiche.
 *
 * Un compte supprimé garde son nom, suivi de la mention : l'historique ne perd pas son sens
 * — on sait toujours qui a saisi la feuille contestée.
 */
export async function accountName(ctx: QueryCtx, userId: Id<"users">): Promise<string> {
  const user = await ctx.db.get(userId);
  if (user === null) {
    return "Compte supprimé";
  }
  const name = user.name ?? user.email ?? "Compte sans nom";
  return user.deletedAt === undefined ? name : `${name} (compte supprimé)`;
}

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

/**
 * Tous les comptes, avec les équipes qu'ils gèrent. Réservé aux administrateurs.
 *
 * Les comptes supprimés n'y figurent pas : ils ne survivent que dans l'historique des matchs.
 */
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
    const users = (await ctx.db.query("users").collect()).filter(
      (user) => user.deletedAt === undefined,
    );
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

/**
 * Supprime un compte.
 *
 * Identifiants, sessions, adresse e-mail, rattachements d'équipe et lien vers la fiche
 * Joueur disparaissent : la personne ne peut plus se connecter, et l'adresse est libérée
 * pour un nouveau compte. La ligne reste, réduite à son nom, parce que l'historique des
 * matchs y renvoie — il affiche « Nom (compte supprimé) ». La fiche Joueur, donnée
 * d'effectif, n'est pas touchée.
 *
 * Garde-fous : ni son propre compte — un clic malheureux ne doit pas déconnecter
 * l'administrateur qui opère —, ni le dernier administrateur.
 */
export const remove = mutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const admin = await requireAdmin(ctx);
    const target = await ctx.db.get(userId);
    if (target === null || target.deletedAt !== undefined) {
      throw new ConvexError("Compte inconnu.");
    }
    if (target._id === admin._id) {
      throw new ConvexError("Vous ne pouvez pas supprimer votre propre compte.");
    }
    if (target.role === "admin") {
      const admins = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "admin"))
        .collect();
      if (admins.length <= 1) {
        throw new ConvexError(
          "Impossible de supprimer le dernier administrateur : la plateforme deviendrait ingérable.",
        );
      }
    }

    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect();
    for (const account of accounts) {
      const codes = await ctx.db
        .query("authVerificationCodes")
        .withIndex("accountId", (q) => q.eq("accountId", account._id))
        .collect();
      for (const code of codes) {
        await ctx.db.delete(code._id);
      }
      await ctx.db.delete(account._id);
    }
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect();
    for (const session of sessions) {
      const tokens = await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
        .collect();
      for (const token of tokens) {
        await ctx.db.delete(token._id);
      }
      await ctx.db.delete(session._id);
    }
    const managed = await ctx.db
      .query("teamManagers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const row of managed) {
      await ctx.db.delete(row._id);
    }

    // Le rôle retombe à `player` : une ligne supprimée ne doit pas compter parmi les
    // administrateurs du garde-fou.
    await ctx.db.replace(userId, {
      name: target.name ?? target.email ?? "Compte sans nom",
      role: "player",
      deletedAt: Date.now(),
    });
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

/** Adresse et nom d'un compte actif, pour les actions qui touchent à ses identifiants. */
export const credentialsOf = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(v.object({ email: v.string(), name: v.string() }), v.null()),
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (user === null || user.deletedAt !== undefined || user.email === undefined) {
      return null;
    }
    return { email: user.email, name: user.name ?? "" };
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
