import { ConvexError, v } from "convex/values";

import {
  latestLicense,
  licenseCovering,
  normalizeLicenseNumber,
  validateLicense,
} from "../lib/rules/license";
import { parisWallClock } from "../lib/rules/paris-time";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireManagerOfClub, requireUser } from "./authz";

type Ctx = QueryCtx | MutationCtx;

export const license = v.object({
  _id: v.id("licenses"),
  _creationTime: v.number(),
  playerId: v.id("players"),
  number: v.string(),
  validFrom: v.number(),
  validUntil: v.number(),
});

/** Les licences d'un joueur, de la plus récente à la plus ancienne. */
export async function licensesOf(ctx: Ctx, playerId: Id<"players">): Promise<Doc<"licenses">[]> {
  const rows = await ctx.db
    .query("licenses")
    .withIndex("by_player", (q) => q.eq("playerId", playerId))
    .collect();
  return rows.sort((a, b) => b.validUntil - a.validUntil);
}

/**
 * Mémoire d'une seule requête, pour ne pas relire les licences du même joueur à chaque
 * ligne. Même motif que `newTeamCache` : une composition répète les mêmes joueurs entre la
 * vérification et l'affichage.
 */
export type LicenseCache = Map<Id<"players">, Doc<"licenses">[]>;

export function newLicenseCache(): LicenseCache {
  return new Map();
}

async function cachedLicensesOf(
  ctx: Ctx,
  playerId: Id<"players">,
  cache: LicenseCache,
): Promise<Doc<"licenses">[]> {
  const known = cache.get(playerId);
  if (known !== undefined) {
    return known;
  }
  const rows = await licensesOf(ctx, playerId);
  cache.set(playerId, rows);
  return rows;
}

/**
 * La licence qui autorise ce joueur à jouer à l'instant donné, ou `null`.
 *
 * L'instant est **celui du match**, jamais celui de la saisie : une feuille transcrite
 * trois jours plus tard ne doit pas rejeter un joueur régulièrement licencié le jour où il
 * a joué.
 */
export async function licenseAt(
  ctx: Ctx,
  playerId: Id<"players">,
  at: number,
  cache: LicenseCache = newLicenseCache(),
): Promise<Doc<"licenses"> | null> {
  return licenseCovering(await cachedLicensesOf(ctx, playerId, cache), at);
}

/** Ce qu'il faut pour afficher l'état de licence d'un joueur dans une liste. */
export type LicenseStatus = {
  number: string | null;
  validFrom: number | null;
  validUntil: number | null;
  /** Valide à la date de référence — aujourd'hui, ou la date d'un match. */
  isValid: boolean;
};

export const licenseStatus = v.object({
  number: v.union(v.string(), v.null()),
  validFrom: v.union(v.number(), v.null()),
  validUntil: v.union(v.number(), v.null()),
  isValid: v.boolean(),
});

/**
 * État de licence à une date : la licence qui couvre cette date, ou à défaut la plus
 * récente, signalée comme invalide.
 *
 * On montre la périmée plutôt que rien : « licence 1234, expirée le 31 août » se corrige,
 * un blanc laisse croire que la fiche n'a jamais eu de licence.
 */
export async function statusAt(
  ctx: Ctx,
  playerId: Id<"players">,
  at: number,
  cache: LicenseCache = newLicenseCache(),
): Promise<LicenseStatus> {
  const rows = await cachedLicensesOf(ctx, playerId, cache);
  const covering = licenseCovering(rows, at);
  const shown = covering ?? latestLicense(rows);
  if (shown === null) {
    return { number: null, validFrom: null, validUntil: null, isValid: false };
  }
  return {
    number: shown.number,
    validFrom: shown.validFrom,
    validUntil: shown.validUntil,
    isValid: covering !== null,
  };
}

/** Le club du joueur, pour les contrôles d'autorisation. */
async function playerOf(ctx: Ctx, playerId: Id<"players">): Promise<Doc<"players">> {
  const player = await ctx.db.get(playerId);
  if (player === null) {
    throw new ConvexError("Licencié inconnu.");
  }
  return player;
}

/**
 * Refuse un numéro déjà porté par un **autre** joueur.
 *
 * Le même joueur peut en revanche le reprendre d'une saison sur l'autre : une reconduction
 * sous le même numéro est le cas courant, et ce n'est pas un doublon.
 */
async function assertNumberFree(
  ctx: MutationCtx,
  number: string,
  playerId: Id<"players">,
  exceptLicenseId: Id<"licenses"> | null,
) {
  const rows = await ctx.db
    .query("licenses")
    .withIndex("by_number", (q) => q.eq("number", number))
    .collect();
  const clash = rows.find(
    (row) => row.playerId !== playerId && row._id !== exceptLicenseId,
  );
  if (clash !== undefined) {
    const other = await ctx.db.get(clash.playerId);
    const who = other === null ? "un autre licencié" : `${other.firstName} ${other.lastName}`;
    throw new ConvexError(`Le numéro de licence ${number} est déjà attribué à ${who}.`);
  }
}

/** Historique complet des licences d'un joueur. Nominatif : comptes connectés seulement. */
export const listByPlayer = query({
  args: { playerId: v.id("players") },
  returns: v.array(license),
  handler: async (ctx, { playerId }) => {
    await requireUser(ctx);
    return await licensesOf(ctx, playerId);
  },
});

/**
 * Enregistre une licence : première délivrance comme renouvellement.
 *
 * Rien n'est réécrit — la précédente reste dans l'historique avec son numéro et ses dates.
 * C'est le sens de la table : on ne prolonge pas une licence, on en délivre une nouvelle.
 */
export const add = mutation({
  args: {
    playerId: v.id("players"),
    number: v.string(),
    validFrom: v.number(),
    validUntil: v.number(),
  },
  returns: v.id("licenses"),
  handler: async (ctx, args) => {
    const player = await playerOf(ctx, args.playerId);
    await requireManagerOfClub(ctx, player.clubId);

    const number = normalizeLicenseNumber(args.number);
    const others = await licensesOf(ctx, args.playerId);
    const error = validateLicense(
      { number, validFrom: args.validFrom, validUntil: args.validUntil },
      others,
    );
    if (error !== null) {
      throw new ConvexError(error);
    }
    await assertNumberFree(ctx, number, args.playerId, null);

    return await ctx.db.insert("licenses", {
      playerId: args.playerId,
      number,
      validFrom: args.validFrom,
      validUntil: args.validUntil,
    });
  },
});

/**
 * Corrige une licence existante : faute de frappe sur le numéro, date mal saisie.
 *
 * Distinct de `add`, qui délivre une licence de plus. Corriger reste nécessaire — une
 * licence saisie de travers ne doit pas encombrer l'historique d'une ligne fausse.
 */
export const update = mutation({
  args: {
    licenseId: v.id("licenses"),
    number: v.string(),
    validFrom: v.number(),
    validUntil: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.licenseId);
    if (existing === null) {
      throw new ConvexError("Licence inconnue.");
    }
    const player = await playerOf(ctx, existing.playerId);
    await requireManagerOfClub(ctx, player.clubId);

    const number = normalizeLicenseNumber(args.number);
    // La licence corrigée est exclue de la comparaison : elle se chevaucherait elle-même.
    const others = (await licensesOf(ctx, existing.playerId)).filter(
      (row) => row._id !== args.licenseId,
    );
    const error = validateLicense(
      { number, validFrom: args.validFrom, validUntil: args.validUntil },
      others,
    );
    if (error !== null) {
      throw new ConvexError(error);
    }
    await assertNumberFree(ctx, number, existing.playerId, args.licenseId);

    await ctx.db.patch(args.licenseId, {
      number,
      validFrom: args.validFrom,
      validUntil: args.validUntil,
    });
    return null;
  },
});

/** Supprime une licence saisie par erreur. L'historique n'est pas un journal comptable. */
export const remove = mutation({
  args: { licenseId: v.id("licenses") },
  returns: v.null(),
  handler: async (ctx, { licenseId }) => {
    const existing = await ctx.db.get(licenseId);
    if (existing === null) {
      return null;
    }
    const player = await playerOf(ctx, existing.playerId);
    await requireManagerOfClub(ctx, player.clubId);
    await ctx.db.delete(licenseId);
    return null;
  },
});

/**
 * Migration depuis le modèle à numéro unique porté par la fiche joueur.
 *
 * ```bash
 * npx convex run licenses:migrate '{"validFrom":"2025-09-01","validUntil":"2026-08-31"}'
 * ```
 *
 * Les dates sont **obligatoires et explicites** : l'ancien modèle n'en portait aucune, et
 * les deviner déciderait à la place de l'utilisateur qui a le droit de jouer. Chaque fiche
 * portant un numéro reçoit une licence sur cette période, puis le champ hérité est vidé.
 *
 * Rejouable : une fiche déjà migrée n'a plus de numéro hérité et est ignorée.
 */
export const migrate = internalMutation({
  args: { validFrom: v.string(), validUntil: v.string() },
  returns: v.object({ migrated: v.number(), skipped: v.number() }),
  handler: async (ctx, args) => {
    const parts = (value: string) => {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
      if (match === null) {
        throw new Error(`Date attendue au format AAAA-MM-JJ, reçu « ${value} ».`);
      }
      const [, year, month, day] = match.map(Number);
      return { year, month, day };
    };
    const from = parts(args.validFrom);
    const until = parts(args.validUntil);
    const validFrom = parisWallClock(from.year, from.month, from.day, 0, 0, 0, 0);
    const validUntil = parisWallClock(until.year, until.month, until.day, 23, 59, 59, 999);
    if (validUntil < validFrom) {
      throw new Error("La fin de validité ne peut pas précéder son début.");
    }

    let migrated = 0;
    let skipped = 0;
    for (const player of await ctx.db.query("players").collect()) {
      // Lu de façon défensive : le champ disparaîtra du schéma une fois la migration
      // passée partout, et cette fonction doit rester compilable après.
      const legacy = (player as { licenseNumber?: string }).licenseNumber;
      const number = normalizeLicenseNumber(legacy ?? "");
      if (number === "") {
        skipped++;
        continue;
      }
      await ctx.db.insert("licenses", {
        playerId: player._id,
        number,
        validFrom,
        validUntil,
      });
      // Le champ ne fait plus partie du schéma : le patch est typé librement, seule façon
      // de nettoyer les documents d'un déploiement pas encore migré.
      await ctx.db.patch(
        player._id,
        { licenseNumber: undefined } as unknown as Partial<Doc<"players">>,
      );
      migrated++;
    }
    return { migrated, skipped };
  },
});
