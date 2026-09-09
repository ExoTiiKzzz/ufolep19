import { createAccount, getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";

import { isPlausibleEmail, normalizeEmail } from "../lib/rules/email";
import { internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { action, internalMutation, query } from "./_generated/server";
import { requireManagerOfClubById, requireUser } from "./authz";
import { sendAccountCreated } from "./mail";
import { matchSummary, newTeamCache, summarize } from "./matches";

const player = v.object({
  _id: v.id("players"),
  _creationTime: v.number(),
  clubId: v.id("clubs"),
  firstName: v.string(),
  lastName: v.string(),
  licenseNumber: v.string(),
  email: v.union(v.string(), v.null()),
});

/**
 * Licenciés d'un club.
 *
 * Donnée nominative : réservée aux comptes connectés, jamais exposée au public.
 */
export const listByClub = query({
  args: { clubId: v.id("clubs") },
  returns: v.array(player),
  handler: async (ctx, { clubId }) => {
    await requireUser(ctx);
    const players = await ctx.db
      .query("players")
      .withIndex("by_club", (q) => q.eq("clubId", clubId))
      .collect();
    return players.map((player) => ({ ...player, email: player.email ?? null }));
  },
});

/**
 * Insère la fiche. `callerId` est fourni explicitement pour que l'appel depuis une action
 * ne dépende pas de la propagation de l'identité.
 */
export const insert = internalMutation({
  args: {
    callerId: v.union(v.id("users"), v.null()),
    clubId: v.id("clubs"),
    firstName: v.string(),
    lastName: v.string(),
    licenseNumber: v.string(),
    email: v.union(v.string(), v.null()),
  },
  returns: v.id("players"),
  handler: async (ctx, args) => {
    await requireManagerOfClubById(ctx, args.callerId, args.clubId);
    const firstName = args.firstName.trim();
    const lastName = args.lastName.trim();
    const licenseNumber = args.licenseNumber.trim();
    if (firstName === "" || lastName === "") {
      throw new ConvexError("Le nom et le prénom du joueur sont obligatoires.");
    }
    if (licenseNumber !== "") {
      const existing = await ctx.db
        .query("players")
        .withIndex("by_license", (q) => q.eq("licenseNumber", licenseNumber))
        .first();
      if (existing !== null) {
        throw new ConvexError(`Le numéro de licence ${licenseNumber} est déjà enregistré.`);
      }
    }
    if (args.email !== null) {
      const existing = await ctx.db
        .query("players")
        .withIndex("by_email", (q) => q.eq("email", args.email ?? undefined))
        .first();
      if (existing !== null) {
        throw new ConvexError(`L'adresse ${args.email} est déjà rattachée à un licencié.`);
      }
    }
    return await ctx.db.insert("players", {
      clubId: args.clubId,
      firstName,
      lastName,
      licenseNumber,
      email: args.email ?? undefined,
    });
  },
});

/** Rattache un compte existant à une fiche joueur. */
export const linkExistingAccount = internalMutation({
  args: { userId: v.id("users"), playerId: v.id("players") },
  returns: v.null(),
  handler: async (ctx, { userId, playerId }) => {
    await ctx.db.patch(userId, { playerId });
    return null;
  },
});

/**
 * Mot de passe provisoire lisible : quatre groupes de quatre caractères, sans les glyphes
 * qu'on confond en le recopiant (0/O, 1/l/I).
 */
function temporaryPassword(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const chars = [...bytes].map((byte) => alphabet[byte % alphabet.length]);
  return [0, 4, 8, 12].map((start) => chars.slice(start, start + 4).join("")).join("-");
}

/**
 * Crée une fiche joueur et, si une adresse e-mail est renseignée, le **compte de
 * consultation** correspondant.
 *
 * C'est une action et non une mutation : `createAccount` de Convex Auth exige un contexte
 * d'action pour hacher le mot de passe.
 *
 * Le compte créé a le rôle `player` — aucun droit d'écriture. Un compte existant sur cette
 * adresse est **rattaché** plutôt que dupliqué.
 *
 * Aucun e-mail n'est envoyé : la plateforme n'a pas de fournisseur d'envoi. Le mot de passe
 * provisoire est rendu **une seule fois**, à charge pour l'administrateur de le transmettre.
 */
export const create = action({
  args: {
    clubId: v.id("clubs"),
    firstName: v.string(),
    lastName: v.string(),
    licenseNumber: v.string(),
    email: v.optional(v.string()),
  },
  returns: v.object({
    playerId: v.id("players"),
    account: v.union(
      v.object({
        email: v.string(),
        temporaryPassword: v.union(v.string(), v.null()),
        linkedExisting: v.boolean(),
        // `null` quand il n'y avait rien à envoyer (compte déjà existant).
        mail: v.union(v.object({ sent: v.boolean(), error: v.union(v.string(), v.null()) }), v.null()),
      }),
      v.null(),
    ),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    playerId: Id<"players">;
    account: {
      email: string;
      temporaryPassword: string | null;
      linkedExisting: boolean;
      mail: { sent: boolean; error: string | null } | null;
    } | null;
  }> => {
    const callerId = await getAuthUserId(ctx);
    const email = normalizeEmail(args.email);
    if (email !== null && !isPlausibleEmail(email)) {
      throw new ConvexError(`L'adresse ${email} ne ressemble pas à une adresse e-mail.`);
    }

    const playerId = await ctx.runMutation(internal.players.insert, {
      callerId,
      clubId: args.clubId,
      firstName: args.firstName,
      lastName: args.lastName,
      licenseNumber: args.licenseNumber,
      email,
    });

    if (email === null) {
      return { playerId, account: null };
    }

    const existingAccount = await ctx.runQuery(internal.users.byEmail, { email });
    if (existingAccount !== null) {
      await ctx.runMutation(internal.players.linkExistingAccount, {
        userId: existingAccount,
        playerId,
      });
      // Compte déjà existant : pas de mot de passe à transmettre, donc rien à envoyer.
      return {
        playerId,
        account: { email, temporaryPassword: null, linkedExisting: true, mail: null },
      };
    }

    const password = temporaryPassword();
    const fullName = `${args.firstName.trim()} ${args.lastName.trim()}`;
    await createAccount<DataModel>(ctx, {
      provider: "password",
      account: { id: email, secret: password },
      profile: { email, name: fullName, role: "player", playerId },
    });

    // L'envoi ne conditionne pas la création : s'il échoue, le compte existe et l'écran
    // affiche le mot de passe à transmettre autrement.
    const mail = await sendAccountCreated({ to: email, name: fullName, password });
    return {
      playerId,
      account: { email, temporaryPassword: password, linkedExisting: false, mail },
    };
  },
});

/**
 * Fiche d'un licencié : son club, ses équipes, et les matchs sur lesquels il a été aligné.
 *
 * Nominative de bout en bout : réservée aux comptes connectés, jamais exposée au public.
 */
export const get = query({
  args: { playerId: v.id("players") },
  returns: v.union(
    v.object({
      _id: v.id("players"),
      firstName: v.string(),
      lastName: v.string(),
      licenseNumber: v.string(),
      email: v.union(v.string(), v.null()),
      clubId: v.id("clubs"),
      clubName: v.string(),
      teams: v.array(
        v.object({
          _id: v.id("teams"),
          name: v.string(),
          seasonLabel: v.string(),
          isCurrentSeason: v.boolean(),
        }),
      ),
      appearances: v.array(v.object({ match: matchSummary, teamName: v.string() })),
    }),
    v.null(),
  ),
  handler: async (ctx, { playerId }) => {
    await requireUser(ctx);
    const player = await ctx.db.get(playerId);
    if (player === null) {
      return null;
    }
    const club = await ctx.db.get(player.clubId);

    const rosterEntries = await ctx.db
      .query("rosterEntries")
      .withIndex("by_player", (q) => q.eq("playerId", playerId))
      .collect();
    const teams = await Promise.all(
      rosterEntries.map(async (entry) => {
        const team = await ctx.db.get(entry.teamId);
        if (team === null) {
          return null;
        }
        const season = await ctx.db.get(team.seasonId);
        return {
          _id: team._id,
          name: team.name,
          seasonLabel: season?.label ?? "",
          isCurrentSeason: season?.isCurrent ?? false,
        };
      }),
    );

    // L'index des compositions commence par le joueur : ses apparitions se lisent sans
    // balayage de table.
    const lineups = await ctx.db
      .query("lineupEntries")
      .withIndex("by_player_and_matchday", (q) => q.eq("playerId", playerId))
      .collect();
    const cache = newTeamCache();
    const appearances = await Promise.all(
      lineups.map(async (entry) => {
        const match = await ctx.db.get(entry.matchId);
        if (match === null) {
          return null;
        }
        const team = await ctx.db.get(entry.teamId);
        return { match: await summarize(ctx, match, cache), teamName: team?.name ?? "" };
      }),
    );

    return {
      _id: player._id,
      firstName: player.firstName,
      lastName: player.lastName,
      licenseNumber: player.licenseNumber,
      email: player.email ?? null,
      clubId: player.clubId,
      clubName: club?.name ?? "",
      teams: teams
        .filter((team): team is NonNullable<typeof team> => team !== null)
        .sort(
          (a, b) =>
            Number(b.isCurrentSeason) - Number(a.isCurrentSeason) ||
            b.seasonLabel.localeCompare(a.seasonLabel),
        ),
      appearances: appearances
        .filter((row): row is NonNullable<typeof row> => row !== null)
        .sort((a, b) => a.match.matchdayNumber - b.match.matchdayNumber),
    };
  },
});
