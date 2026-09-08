import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type Ctx = QueryCtx | MutationCtx;

/**
 * Le compte appelant, ou `null` si personne n'est connecté.
 *
 * Convex n'a pas de sécurité par ligne : chaque fonction publique doit revérifier le
 * rôle et le rattachement de l'appelant. L'UI masque ce qui n'est pas permis, mais ne
 * fait jamais autorité.
 */
export async function getCurrentUser(ctx: Ctx): Promise<Doc<"users"> | null> {
  const userId = await getAuthUserId(ctx);
  return userId === null ? null : await ctx.db.get(userId);
}

/** Le compte appelant, ou une erreur si personne n'est connecté. */
export async function requireUser(ctx: Ctx): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (user === null) {
    throw new ConvexError("Authentification requise.");
  }
  return user;
}

/** Le compte appelant s'il est administrateur, une erreur sinon. */
export async function requireAdmin(ctx: Ctx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin") {
    throw new ConvexError("Action réservée aux administrateurs.");
  }
  return user;
}

/** Les équipes qu'un compte responsable gère. Vide pour un joueur ou un administrateur. */
export async function managedTeamIds(ctx: Ctx, userId: Id<"users">): Promise<Id<"teams">[]> {
  const rows = await ctx.db
    .query("teamManagers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return rows.map((row) => row.teamId);
}

/**
 * Le compte appelant s'il gère cette équipe, ou s'il est administrateur.
 *
 * Les droits d'un responsable viennent de son **rattachement d'équipe**, jamais du seul
 * rôle : un compte `manager` non rattaché à l'équipe visée est rejeté comme un étranger.
 */
export async function requireManagerOfTeam(
  ctx: Ctx,
  teamId: Id<"teams">,
): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role === "admin") {
    return user;
  }
  const rattachement = await ctx.db
    .query("teamManagers")
    .withIndex("by_team_and_user", (q) => q.eq("teamId", teamId).eq("userId", user._id))
    .unique();
  if (rattachement === null) {
    throw new ConvexError("Vous ne gérez pas cette équipe.");
  }
  return user;
}

/** Le compte appelant s'il gère au moins une équipe de ce club, ou s'il est administrateur. */
export async function requireManagerOfClub(
  ctx: Ctx,
  clubId: Id<"clubs">,
): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role === "admin") {
    return user;
  }
  for (const teamId of await managedTeamIds(ctx, user._id)) {
    const team = await ctx.db.get(teamId);
    if (team !== null && team.clubId === clubId) {
      return user;
    }
  }
  throw new ConvexError("Vous ne gérez aucune équipe de ce club.");
}
