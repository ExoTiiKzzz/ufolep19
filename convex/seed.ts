import { createAccount } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { parisParts, parisWallClock } from "../lib/rules/paris-time";
import { internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { internalAction, internalMutation } from "./_generated/server";

/**
 * Jeu de données de développement.
 *
 * ```bash
 * npx convex run seed:dev
 * ```
 *
 * Fonction `internal` : jamais exposée au client, elle ne s'exécute que depuis la CLI.
 * **À ne lancer que sur un déploiement de développement** : elle écrit un compte
 * administrateur dont le mot de passe est en clair dans la sortie de la commande.
 *
 * Elle est **rejouable** : chaque exécution commence par supprimer le jeu précédent. Pour
 * que cette purge ne puisse pas mordre sur des données saisies à la main, tout ce qu'elle
 * crée est marqué :
 *
 * - saisons et clubs dont le nom finit par `(dev)` ;
 * - comptes sur le domaine `dev.ufolep19.test`, réservé par la RFC 2606 ;
 * - licences préfixées `DEV-`.
 *
 * Rien d'autre n'est touché — à une exception près, assumée : la saison du jeu devient la
 * **saison courante**, ce qui démet celle qui l'était. C'est le but, la page d'accueil
 * partant de la saison courante.
 */

const DEV_SUFFIX = " (dev)";
const EMAIL_DOMAIN = "dev.ufolep19.test";
const DEFAULT_PASSWORD = "ufolep19dev";

const DAY = 86_400_000;

/** Instant d'une heure murale parisienne, le jour où tombe `at`. */
function parisDayAt(at: number, hour = 0, minute = 0, second = 0): number {
  const { year, month, day } = parisParts(at);
  return parisWallClock(year, month, day, hour, minute, second);
}

/** Libellé de la saison en cours à l'instant donné : elle bascule en août. */
function seasonLabel(at: number): string {
  const { year, month } = parisParts(at);
  const start = month >= 8 ? year : year - 1;
  return `${start}-${start + 1}${DEV_SUFFIX}`;
}

const TULLE_PLAYERS = [
  ["Camille", "Arnaud"],
  ["Julien", "Bernard"],
  ["Sarah", "Chastagnol"],
  ["Thomas", "Delmas"],
  ["Léa", "Faure"],
  ["Nicolas", "Gimenez"],
  ["Marion", "Lavaud"],
  ["Antoine", "Peyrat"],
] as const;

const BRIVE_PLAYERS = [
  ["Hugo", "Bessette"],
  ["Claire", "Dumas"],
  ["Maxime", "Espinasse"],
  ["Anaïs", "Grandcoing"],
  ["Pierre", "Laborie"],
  ["Élodie", "Mounier"],
  ["Rémi", "Sarlandie"],
  ["Julie", "Vergne"],
] as const;

const accounts = {
  admin: { email: `admin@${EMAIL_DOMAIN}`, name: "Admin UFOLEP (dev)", role: "admin" },
  tulle: { email: `tulle@${EMAIL_DOMAIN}`, name: "Responsable Tulle (dev)", role: "manager" },
  brive: { email: `brive@${EMAIL_DOMAIN}`, name: "Responsable Brive (dev)", role: "manager" },
} as const;

/**
 * Supprime le jeu précédent. Idempotente : sur une base vierge, elle ne fait rien.
 *
 * L'ordre suit les dépendances, des feuilles vers les racines, pour qu'aucune ligne
 * conservée ne pointe un instant vers une ligne disparue.
 */
export const purge = internalMutation({
  args: {},
  returns: v.object({
    users: v.number(),
    seasons: v.number(),
    clubs: v.number(),
    matches: v.number(),
  }),
  handler: async (ctx) => {
    // --- Comptes, et tout ce que Convex Auth accroche derrière ---
    const users = (await ctx.db.query("users").collect()).filter((user) =>
      (user.email ?? "").endsWith(`@${EMAIL_DOMAIN}`),
    );
    for (const user of users) {
      const authAccounts = await ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (q) => q.eq("userId", user._id))
        .collect();
      for (const account of authAccounts) {
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
        .withIndex("userId", (q) => q.eq("userId", user._id))
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
      await ctx.db.delete(user._id);
    }

    // --- Saisons marquées, et toute la compétition qui en dépend ---
    const seasons = (await ctx.db.query("seasons").collect()).filter((season) =>
      season.label.endsWith(DEV_SUFFIX),
    );
    let matchCount = 0;
    for (const season of seasons) {
      const championships = await ctx.db
        .query("championships")
        .withIndex("by_season", (q) => q.eq("seasonId", season._id))
        .collect();
      for (const championship of championships) {
        const matchdays = await ctx.db
          .query("matchdays")
          .withIndex("by_championship", (q) => q.eq("championshipId", championship._id))
          .collect();
        for (const matchday of matchdays) {
          const matches = await ctx.db
            .query("matches")
            .withIndex("by_matchday", (q) => q.eq("matchdayId", matchday._id))
            .collect();
          for (const match of matches) {
            // Une échéance tacite encore programmée survivrait à son match.
            if (match.tacitJobId !== undefined) {
              await ctx.scheduler.cancel(match.tacitJobId);
            }
            for (const row of await ctx.db
              .query("slotProposals")
              .withIndex("by_match", (q) => q.eq("matchId", match._id))
              .collect()) {
              await ctx.db.delete(row._id);
            }
            for (const row of await ctx.db
              .query("postponementRequests")
              .withIndex("by_match", (q) => q.eq("matchId", match._id))
              .collect()) {
              await ctx.db.delete(row._id);
            }
            for (const row of await ctx.db
              .query("matchSheets")
              .withIndex("by_match", (q) => q.eq("matchId", match._id))
              .collect()) {
              await ctx.db.delete(row._id);
            }
            for (const row of await ctx.db
              .query("lineupEntries")
              .withIndex("by_match", (q) => q.eq("matchId", match._id))
              .collect()) {
              await ctx.db.delete(row._id);
            }
            await ctx.db.delete(match._id);
            matchCount++;
          }
          await ctx.db.delete(matchday._id);
        }
        const teams = await ctx.db
          .query("teams")
          .withIndex("by_championship", (q) => q.eq("championshipId", championship._id))
          .collect();
        for (const team of teams) {
          for (const row of await ctx.db
            .query("rosterEntries")
            .withIndex("by_team", (q) => q.eq("teamId", team._id))
            .collect()) {
            await ctx.db.delete(row._id);
          }
          for (const row of await ctx.db
            .query("teamManagers")
            .withIndex("by_team", (q) => q.eq("teamId", team._id))
            .collect()) {
            await ctx.db.delete(row._id);
          }
          await ctx.db.delete(team._id);
        }
        await ctx.db.delete(championship._id);
      }
      await ctx.db.delete(season._id);
    }

    // --- Clubs marqués et leurs licenciés ---
    const clubs = (await ctx.db.query("clubs").collect()).filter((club) =>
      club.name.endsWith(DEV_SUFFIX),
    );
    for (const club of clubs) {
      const players = await ctx.db
        .query("players")
        .withIndex("by_club", (q) => q.eq("clubId", club._id))
        .collect();
      for (const player of players) {
        for (const row of await ctx.db
          .query("licenses")
          .withIndex("by_player", (q) => q.eq("playerId", player._id))
          .collect()) {
          await ctx.db.delete(row._id);
        }
        await ctx.db.delete(player._id);
      }
      if (club.logoId !== undefined) {
        await ctx.storage.delete(club.logoId);
      }
      await ctx.db.delete(club._id);
    }

    return {
      users: users.length,
      seasons: seasons.length,
      clubs: clubs.length,
      matches: matchCount,
    };
  },
});

/**
 * Écrit la compétition. Les comptes sont créés par l'action appelante — `createAccount`
 * de Convex Auth exige un contexte d'action pour hacher le mot de passe.
 *
 * Écriture directe : les mutations du domaine exigent une identité d'administrateur, que
 * la CLI n'a pas. Les invariants qu'elles portent sont donc respectés à la main ici —
 * `seasonId` de l'équipe dérivé du championnat, créneau dans la fenêtre de sa journée,
 * proposition acceptée en regard du match confirmé.
 */
export const build = internalMutation({
  args: {
    tulleManagerId: v.id("users"),
    briveManagerId: v.id("users"),
  },
  returns: v.object({
    seasonLabel: v.string(),
    championshipId: v.id("championships"),
    tulleTeamId: v.id("teams"),
    briveTeamId: v.id("teams"),
    matchToPlanId: v.id("matches"),
    matchToScoreId: v.id("matches"),
    playedAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();

    // La saison du jeu devient la courante : la page d'accueil en part.
    for (const other of await ctx.db
      .query("seasons")
      .withIndex("by_current", (q) => q.eq("isCurrent", true))
      .collect()) {
      await ctx.db.patch(other._id, { isCurrent: false });
    }
    const label = seasonLabel(now);
    const seasonId = await ctx.db.insert("seasons", { label, isCurrent: true });
    const championshipId = await ctx.db.insert("championships", {
      seasonId,
      name: "Championnat Départemental (dev)",
    });

    const tulleClubId = await ctx.db.insert("clubs", {
      name: `Volley Tulle${DEV_SUFFIX}`,
      defaultVenue: "Gymnase Alexandre Jourdanne, Tulle",
    });
    const briveClubId = await ctx.db.insert("clubs", {
      name: `Volley Brive${DEV_SUFFIX}`,
      defaultVenue: "Halle des sports Jean Mazet, Brive",
    });

    const tulleTeamId = await ctx.db.insert("teams", {
      clubId: tulleClubId,
      seasonId,
      championshipId,
      name: "Tulle 1",
    });
    const briveTeamId = await ctx.db.insert("teams", {
      clubId: briveClubId,
      seasonId,
      championshipId,
      name: "Brive 1",
    });

    await ctx.db.insert("teamManagers", {
      teamId: tulleTeamId,
      userId: args.tulleManagerId,
    });
    await ctx.db.insert("teamManagers", {
      teamId: briveTeamId,
      userId: args.briveManagerId,
    });

    // Effectifs : de quoi remplir deux compositions sans toucher au plafond de 12.
    // Licences de la saison en cours. Le dernier licencié de chaque club en reçoit une
    // **close la veille du match de J1** : c'est le cas à vérifier, et il faut qu'il existe
    // dans le jeu sans trafiquer la base à la main.
    //
    // La veille du match, et non la veille d'aujourd'hui : la validité se juge à la date du
    // match. Une licence expirée depuis, mais bonne le jour J, laisse jouer — c'est voulu.
    const licenseFrom = parisDayAt(now - 200 * DAY);
    const licenseUntil = parisDayAt(now + 300 * DAY, 23, 59, 59);
    const expiredUntil = parisDayAt(now - 4 * DAY, 23, 59, 59);

    const enroll = async (
      clubId: Id<"clubs">,
      teamId: Id<"teams">,
      prefix: string,
      names: ReadonlyArray<readonly [string, string]>,
    ) => {
      for (const [index, [firstName, lastName]] of names.entries()) {
        const playerId = await ctx.db.insert("players", { clubId, firstName, lastName });
        const expired = index === names.length - 1;
        await ctx.db.insert("licenses", {
          playerId,
          number: `DEV-${prefix}-${String(index + 1).padStart(2, "0")}`,
          validFrom: licenseFrom,
          validUntil: expired ? expiredUntil : licenseUntil,
        });
        await ctx.db.insert("rosterEntries", { teamId, playerId });
      }
    };
    await enroll(tulleClubId, tulleTeamId, "TUL", TULLE_PLAYERS);
    await enroll(briveClubId, briveTeamId, "BRI", BRIVE_PLAYERS);

    // J1, fenêtre fermée : elle porte le match déjà joué.
    const playedMatchdayId = await ctx.db.insert("matchdays", {
      championshipId,
      number: 1,
      windowStart: parisDayAt(now - 14 * DAY),
      windowEnd: parisDayAt(now - 2 * DAY, 23, 59, 59),
    });
    // J2, fenêtre ouverte aujourd'hui : elle porte le match à planifier.
    const openMatchdayId = await ctx.db.insert("matchdays", {
      championshipId,
      number: 2,
      windowStart: parisDayAt(now - DAY),
      windowEnd: parisDayAt(now + 20 * DAY, 23, 59, 59),
    });

    // Match joué : Tulle reçoit, le créneau est passé, la feuille reste à transcrire.
    const playedAt = parisDayAt(now - 3 * DAY, 20, 30);
    const matchToScoreId = await ctx.db.insert("matches", {
      championshipId,
      matchdayId: playedMatchdayId,
      homeTeamId: tulleTeamId,
      awayTeamId: briveTeamId,
      state: "confirmed",
      slot: { at: playedAt, venue: "Gymnase Alexandre Jourdanne, Tulle" },
    });
    // La proposition qui a mené au créneau : sans elle, l'historique du match serait vide.
    await ctx.db.insert("slotProposals", {
      matchId: matchToScoreId,
      at: playedAt,
      venue: "Gymnase Alexandre Jourdanne, Tulle",
      proposedBy: args.tulleManagerId,
      status: "accepted",
      respondedAt: now - 6 * DAY,
    });

    // Match à planifier : Brive reçoit, aucun créneau proposé.
    const matchToPlanId = await ctx.db.insert("matches", {
      championshipId,
      matchdayId: openMatchdayId,
      homeTeamId: briveTeamId,
      awayTeamId: tulleTeamId,
      state: "planned",
    });

    return {
      seasonLabel: label,
      championshipId,
      tulleTeamId,
      briveTeamId,
      matchToPlanId,
      matchToScoreId,
      playedAt,
    };
  },
});

/** Ce que la commande affiche : les identifiants et les deux matchs à traiter. */
type DevSeedReport = {
  password: string;
  accounts: { email: string; role: string; team: string }[];
  seasonLabel: string;
  matchToPlan: { url: string; waitingOn: string };
  matchToScore: { url: string; waitingOn: string };
};

/** Purge puis reconstruit le jeu. Point d'entrée de `npx convex run seed:dev`. */
export const dev = internalAction({
  args: { password: v.optional(v.string()) },
  returns: v.object({
    password: v.string(),
    accounts: v.array(v.object({ email: v.string(), role: v.string(), team: v.string() })),
    seasonLabel: v.string(),
    matchToPlan: v.object({ url: v.string(), waitingOn: v.string() }),
    matchToScore: v.object({ url: v.string(), waitingOn: v.string() }),
  }),
  handler: async (ctx, args): Promise<DevSeedReport> => {
    const password = args.password ?? DEFAULT_PASSWORD;
    if (password.length < 8) {
      throw new Error("Le mot de passe doit faire au moins 8 caractères.");
    }

    await ctx.runMutation(internal.seed.purge, {});

    const created: Record<string, Id<"users">> = {};
    for (const [key, account] of Object.entries(accounts)) {
      const { user } = await createAccount<DataModel>(ctx, {
        provider: "password",
        account: { id: account.email, secret: password },
        profile: { email: account.email, name: account.name, role: account.role },
      });
      created[key] = user._id;
    }

    const built = await ctx.runMutation(internal.seed.build, {
      tulleManagerId: created.tulle,
      briveManagerId: created.brive,
    });

    return {
      password,
      accounts: [
        { email: accounts.admin.email, role: "admin", team: "—" },
        { email: accounts.tulle.email, role: "manager", team: "Tulle 1" },
        { email: accounts.brive.email, role: "manager", team: "Brive 1" },
      ],
      seasonLabel: built.seasonLabel,
      matchToPlan: {
        url: `/matchs/${built.matchToPlanId}`,
        waitingOn: `${accounts.brive.email} propose le créneau (J2), ${accounts.tulle.email} valide`,
      },
      matchToScore: {
        url: `/matchs/${built.matchToScoreId}`,
        waitingOn: `${accounts.tulle.email} saisit la feuille (joué le ${new Date(
          built.playedAt,
        ).toISOString()}), ${accounts.brive.email} valide`,
      },
    };
  },
});
