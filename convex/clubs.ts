import { ConvexError, v } from "convex/values";

import { rejectLogo } from "../lib/rules/logo";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireAdmin } from "./authz";

const club = v.object({
  _id: v.id("clubs"),
  _creationTime: v.number(),
  name: v.string(),
  defaultVenue: v.string(),
  logoUrl: v.union(v.string(), v.null()),
});

/** URL publique du logo d'un club, ou `null` s'il n'en a pas. */
async function logoUrl(ctx: QueryCtx, logoId: Id<"_storage"> | undefined) {
  return logoId === undefined ? null : await ctx.storage.getUrl(logoId);
}

/** Liste des clubs. Lecture publique : un club est une structure, pas une personne. */
export const list = query({
  args: {},
  returns: v.array(club),
  handler: async (ctx) => {
    const clubs = await ctx.db.query("clubs").withIndex("by_name").collect();
    return await Promise.all(
      clubs.map(async (club) => ({
        _id: club._id,
        _creationTime: club._creationTime,
        name: club.name,
        defaultVenue: club.defaultVenue,
        logoUrl: await logoUrl(ctx, club.logoId),
      })),
    );
  },
});

/**
 * Crée un club, avec son logo si un fichier a déjà été déposé.
 *
 * Rend l'identifiant du club et, le cas échéant, le **motif de refus du logo** : le club est
 * créé dans tous les cas, et un fichier refusé est supprimé. Lever une erreur aurait annulé
 * cette suppression avec le reste de la mutation (voir `setLogo`).
 */
export const create = mutation({
  args: {
    name: v.string(),
    defaultVenue: v.string(),
    logoStorageId: v.optional(v.id("_storage")),
  },
  returns: v.object({
    clubId: v.id("clubs"),
    logoRejection: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const name = args.name.trim();
    if (name === "") {
      throw new ConvexError("Le nom du club est obligatoire.");
    }
    const existing = await ctx.db
      .query("clubs")
      .withIndex("by_name", (q) => q.eq("name", name))
      .unique();
    if (existing !== null) {
      throw new ConvexError(`Le club ${name} existe déjà.`);
    }

    let logoId: Id<"_storage"> | undefined;
    let logoRejection: string | null = null;
    if (args.logoStorageId !== undefined) {
      const file = await ctx.db.system.get(args.logoStorageId);
      const rejection =
        file === null
          ? "Fichier introuvable : l'envoi a échoué."
          : rejectLogo({ contentType: file.contentType, size: file.size });
      if (rejection === null) {
        logoId = args.logoStorageId;
      } else {
        logoRejection = rejection;
        if (file !== null) {
          await ctx.storage.delete(args.logoStorageId);
        }
      }
    }

    const clubId = await ctx.db.insert("clubs", {
      name,
      defaultVenue: args.defaultVenue.trim(),
      logoId,
    });
    return { clubId, logoRejection };
  },
});

export const update = mutation({
  args: {
    clubId: v.id("clubs"),
    name: v.optional(v.string()),
    defaultVenue: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { clubId, name, defaultVenue }) => {
    await requireAdmin(ctx);
    const existing = await ctx.db.get(clubId);
    if (existing === null) {
      throw new ConvexError("Club inconnu.");
    }
    const patch: { name?: string; defaultVenue?: string } = {};
    if (name !== undefined) {
      if (name.trim() === "") {
        throw new ConvexError("Le nom du club est obligatoire.");
      }
      patch.name = name.trim();
    }
    if (defaultVenue !== undefined) {
      patch.defaultVenue = defaultVenue.trim();
    }
    await ctx.db.patch(clubId, patch);
    return null;
  },
});

/**
 * Fiche d'un club : ses coordonnées et ses équipes, saison par saison.
 *
 * Lecture publique — un club est une structure, pas une personne. Ses licenciés, eux,
 * passent par `players.listByClub`, réservée aux comptes connectés.
 */
export const get = query({
  args: { clubId: v.id("clubs") },
  returns: v.union(
    v.object({
      _id: v.id("clubs"),
      name: v.string(),
      defaultVenue: v.string(),
      logoUrl: v.union(v.string(), v.null()),
      teams: v.array(
        v.object({
          _id: v.id("teams"),
          name: v.string(),
          seasonLabel: v.string(),
          isCurrentSeason: v.boolean(),
          championshipId: v.id("championships"),
          championshipName: v.string(),
        }),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, { clubId }) => {
    const club = await ctx.db.get(clubId);
    if (club === null) {
      return null;
    }
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_club_and_season", (q) => q.eq("clubId", clubId))
      .collect();

    const detailed = await Promise.all(
      teams.map(async (team) => {
        const [season, championship] = await Promise.all([
          ctx.db.get(team.seasonId),
          ctx.db.get(team.championshipId),
        ]);
        return {
          _id: team._id,
          name: team.name,
          seasonLabel: season?.label ?? "",
          isCurrentSeason: season?.isCurrent ?? false,
          championshipId: team.championshipId,
          championshipName: championship?.name ?? "",
        };
      }),
    );

    return {
      _id: club._id,
      name: club.name,
      defaultVenue: club.defaultVenue,
      logoUrl: await logoUrl(ctx, club.logoId),
      // Saison courante en tête, puis les plus récentes.
      teams: detailed.sort(
        (a, b) =>
          Number(b.isCurrentSeason) - Number(a.isCurrentSeason) ||
          b.seasonLabel.localeCompare(a.seasonLabel) ||
          a.name.localeCompare(b.name, "fr"),
      ),
    };
  },
});

/**
 * URL d'envoi d'un logo. L'administrateur y dépose le fichier directement, puis appelle
 * `setLogo` avec l'identifiant obtenu.
 */
export const generateLogoUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Attache un fichier déjà déposé comme logo du club.
 *
 * Rend `null` si le logo est attaché, ou le **motif du refus**. Elle ne lève pas d'erreur
 * pour un fichier refusé, et c'est volontaire : une mutation Convex qui échoue annule
 * toutes ses écritures, y compris la suppression du fichier refusé — qui resterait alors
 * orphelin dans le stockage. En rendant le motif, la mutation aboutit et le ménage est fait.
 *
 * Le fichier est vérifié ici, et non côté client : le dépôt se fait par une URL signée que
 * rien n'empêche d'utiliser avec un autre contenu.
 */
export const setLogo = mutation({
  args: { clubId: v.id("clubs"), storageId: v.id("_storage") },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, { clubId, storageId }) => {
    await requireAdmin(ctx);
    const club = await ctx.db.get(clubId);
    if (club === null) {
      await ctx.storage.delete(storageId);
      return "Club inconnu.";
    }

    const file = await ctx.db.system.get(storageId);
    if (file === null) {
      return "Fichier introuvable : l'envoi a échoué.";
    }
    const rejection = rejectLogo({ contentType: file.contentType, size: file.size });
    if (rejection !== null) {
      await ctx.storage.delete(storageId);
      return rejection;
    }

    await replaceLogo(ctx, clubId, club.logoId, storageId);
    return null;
  },
});

/** Retire le logo d'un club et supprime le fichier. */
export const removeLogo = mutation({
  args: { clubId: v.id("clubs") },
  returns: v.null(),
  handler: async (ctx, { clubId }) => {
    await requireAdmin(ctx);
    const club = await ctx.db.get(clubId);
    if (club === null) {
      throw new ConvexError("Club inconnu.");
    }
    await replaceLogo(ctx, clubId, club.logoId, undefined);
    return null;
  },
});

/** Pose le nouveau logo et supprime l'ancien fichier, qui n'a plus de référence. */
async function replaceLogo(
  ctx: MutationCtx,
  clubId: Id<"clubs">,
  previous: Id<"_storage"> | undefined,
  next: Id<"_storage"> | undefined,
) {
  await ctx.db.patch(clubId, { logoId: next });
  if (previous !== undefined && previous !== next) {
    await ctx.storage.delete(previous);
  }
}
