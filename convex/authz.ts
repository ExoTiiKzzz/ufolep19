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
 * Les équipes dont le compte fait partie **à l'effectif**, via la fiche Joueur qu'il porte.
 *
 * Vide pour un compte sans `playerId` : la plupart des licenciés n'ont pas de compte, et la
 * plupart des comptes ne sont pas des licenciés.
 */
export async function rosterTeamIds(ctx: Ctx, user: Doc<"users">): Promise<Id<"teams">[]> {
  const playerId = user.playerId;
  if (playerId === undefined) {
    return [];
  }
  const rows = await ctx.db
    .query("rosterEntries")
    .withIndex("by_player", (q) => q.eq("playerId", playerId))
    .collect();
  return rows.map((row) => row.teamId);
}

/**
 * Les équipes qu'un compte **voit comme siennes** : celles qu'il gère, et celles dont sa
 * fiche fait partie.
 *
 * À ne jamais substituer à `managedTeamIds` dans un chemin d'écriture. Les deux listes
 * répondent à deux questions distinctes — *ce que je vois* et *ce sur quoi j'agis* — et les
 * confondre donnerait à un licencié la main sur la feuille de match de son équipe. C'est
 * précisément la confusion que le modèle tient à distance en séparant la fiche Joueur du
 * compte de rôle `player`.
 */
export async function attachedTeamIds(ctx: Ctx, user: Doc<"users">): Promise<Id<"teams">[]> {
  const seen = new Set<string>();
  const teamIds: Id<"teams">[] = [];
  for (const teamId of [
    ...(await managedTeamIds(ctx, user._id)),
    ...(await rosterTeamIds(ctx, user)),
  ]) {
    // Un responsable peut aussi figurer à l'effectif de son équipe : il ne la voit qu'une fois.
    if (!seen.has(teamId)) {
      seen.add(teamId);
      teamIds.push(teamId);
    }
  }
  return teamIds;
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

/** Vrai si ce compte administre, ou gère au moins une équipe de ce club. */
async function managesClub(ctx: Ctx, user: Doc<"users">, clubId: Id<"clubs">) {
  if (user.role === "admin") {
    return true;
  }
  for (const teamId of await managedTeamIds(ctx, user._id)) {
    const team = await ctx.db.get(teamId);
    if (team !== null && team.clubId === clubId) {
      return true;
    }
  }
  return false;
}

/** Le compte appelant s'il gère au moins une équipe de ce club, ou s'il est administrateur. */
export async function requireManagerOfClub(
  ctx: Ctx,
  clubId: Id<"clubs">,
): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (await managesClub(ctx, user, clubId)) {
    return user;
  }
  throw new ConvexError("Vous ne gérez aucune équipe de ce club.");
}

/**
 * Même contrôle, mais sur un compte désigné explicitement.
 *
 * Utilisé depuis les actions : elles n'ont pas accès à la base, et on préfère leur faire
 * résoudre l'identité elles-mêmes plutôt que de compter sur sa propagation.
 */
export async function requireManagerOfClubById(
  ctx: Ctx,
  userId: Id<"users"> | null,
  clubId: Id<"clubs">,
): Promise<Doc<"users">> {
  if (userId === null) {
    throw new ConvexError("Authentification requise.");
  }
  const user = await ctx.db.get(userId);
  if (user === null) {
    throw new ConvexError("Authentification requise.");
  }
  if (await managesClub(ctx, user, clubId)) {
    return user;
  }
  throw new ConvexError("Vous ne gérez aucune équipe de ce club.");
}
