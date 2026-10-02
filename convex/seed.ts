import { createAccount } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { parisParts, parisWallClock } from "../lib/rules/paris-time";
import { forfeitScore, validateMatchScore } from "../lib/rules/score";
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

/** Cinq clubs corréziens, six équipes : Tulle en engage deux. */
const CLUBS = [
  {
    key: "TUL",
    slug: "tulle",
    shortName: "Tulle",
    name: "Volley Tulle",
    venue: "Gymnase Alexandre Jourdanne, Tulle",
    teams: ["Tulle 1", "Tulle 2"],
  },
  {
    key: "BRI",
    slug: "brive",
    shortName: "Brive",
    name: "Volley Brive",
    venue: "Halle des sports Jean Mazet, Brive",
    teams: ["Brive 1"],
  },
  {
    key: "USS",
    slug: "ussel",
    shortName: "Ussel",
    name: "Volley Ussel",
    venue: "Gymnase de la Faucherie, Ussel",
    teams: ["Ussel 1"],
  },
  {
    key: "ARG",
    slug: "argentat",
    shortName: "Argentat",
    name: "Volley Argentat",
    venue: "Salle omnisports, Argentat",
    teams: ["Argentat 1"],
  },
  {
    key: "OBJ",
    slug: "objat",
    shortName: "Objat",
    name: "Volley Objat",
    venue: "Gymnase du Coiroux, Objat",
    teams: ["Objat 1"],
  },
] as const;

/** Effectif d'une équipe : assez pour composer une feuille sans frôler le plafond de 12. */
const SQUAD_SIZE = 8;
/** Joueurs alignés sur une feuille de match. */
const LINEUP_SIZE = 6;

const FIRST_NAMES = [
  "Camille", "Julien", "Sarah", "Thomas", "Léa", "Nicolas", "Marion", "Antoine",
  "Hugo", "Claire", "Maxime", "Anaïs", "Pierre", "Élodie", "Rémi", "Julie",
  "Océane", "Baptiste", "Inès", "Mathieu", "Chloé", "Vincent", "Amandine", "Lucas",
] as const;

const LAST_NAMES = [
  "Arnaud", "Bernard", "Chastagnol", "Delmas", "Faure", "Gimenez", "Lavaud", "Peyrat",
  "Bessette", "Dumas", "Espinasse", "Grandcoing", "Laborie", "Mounier", "Sarlandie", "Vergne",
  "Combes", "Lachaud", "Nespoulous", "Rebeyrotte", "Tourdias", "Vialle", "Bouyssou", "Marsal",
] as const;

/**
 * Scores complets et valides, un par forme de résultat.
 *
 * Écrits à la main plutôt que tirés au hasard : ils doivent passer `validateMatchScore`, et
 * un générateur aléatoire finirait tôt ou tard par produire un set impossible.
 */
const SCORE_PATTERNS: readonly (readonly (readonly [number, number])[])[] = [
  [[25, 20], [25, 18], [25, 22]], // 3-0
  [[25, 20], [18, 25], [25, 22], [25, 19]], // 3-1
  [[25, 23], [22, 25], [25, 19], [23, 25], [15, 12]], // 3-2
  [[20, 25], [18, 25], [22, 25]], // 0-3
  [[20, 25], [25, 18], [22, 25], [19, 25]], // 1-3
  [[25, 23], [22, 25], [25, 19], [23, 25], [12, 15]], // 2-3
  [[27, 25], [25, 19], [26, 24]], // 3-0 accroché, avec prolongations
  [[25, 17], [23, 25], [25, 21], [26, 24]], // 3-1
  [[25, 22], [19, 25], [23, 25], [21, 25]], // 1-3
];

/**
 * Calendrier en ronde à l'italienne (méthode du cercle) : chaque équipe en rencontre une
 * autre par journée, et toutes se rencontrent une fois sur `n - 1` journées.
 *
 * L'alternance du sens des paires évite qu'une équipe reçoive toutes ses rencontres.
 */
function roundRobin<T>(teams: T[]): [T, T][][] {
  const fixed = teams[0];
  let rotating = teams.slice(1);
  const rounds: [T, T][][] = [];
  for (let round = 0; round < teams.length - 1; round++) {
    const pairs: [T, T][] = [
      round % 2 === 0 ? [fixed, rotating[0]] : [rotating[0], fixed],
    ];
    for (let i = 1; i < teams.length / 2; i++) {
      const a = rotating[i];
      const b = rotating[rotating.length - i];
      pairs.push(i % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    rotating = [rotating[rotating.length - 1], ...rotating.slice(0, -1)];
  }
  return rounds;
}

/**
 * Un administrateur, et **un responsable par club**.
 *
 * Chaque équipe a donc un compte en face : toute négociation du jeu — proposer un créneau,
 * le valider, contester une feuille — se joue entre deux comptes distincts. Avec des
 * équipes orphelines, la moitié des cas n'auraient eu personne pour répondre.
 */
const ADMIN_ACCOUNT = {
  key: "admin",
  email: `admin@${EMAIL_DOMAIN}`,
  name: "Admin UFOLEP (dev)",
  role: "admin" as const,
};

const MANAGER_ACCOUNTS = CLUBS.map((club) => ({
  key: club.key,
  email: `${club.slug}@${EMAIL_DOMAIN}`,
  name: `Responsable ${club.shortName} (dev)`,
  role: "manager" as const,
}));

const accounts = [ADMIN_ACCOUNT, ...MANAGER_ACCOUNTS];

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
      for (const circuit of await ctx.db
        .query("circuits")
        .withIndex("by_season", (q) => q.eq("seasonId", season._id))
        .collect()) {
        await ctx.db.delete(circuit._id);
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
    adminId: v.id("users"),
    /** Un responsable par club, repéré par la clé de `CLUBS`. */
    managers: v.array(v.object({ key: v.string(), userId: v.id("users") })),
  },
  returns: v.object({
    seasonLabel: v.string(),
    championshipId: v.id("championships"),
    matchToPlanId: v.id("matches"),
    matchToScoreId: v.id("matches"),
    teamsByClub: v.array(v.object({ key: v.string(), teams: v.string() })),
    counts: v.object({
      teams: v.number(),
      players: v.number(),
      matchdays: v.number(),
      matches: v.number(),
      completed: v.number(),
    }),
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
    // Le circuit principal : celui de D1, D2, D3 et du mixte. Le féminin a le sien.
    const mainCircuitId = await ctx.db.insert("circuits", { seasonId, name: "Championnat" });
    const championshipId = await ctx.db.insert("championships", {
      seasonId,
      circuitId: mainCircuitId,
      name: "Championnat Départemental (dev)",
      level: 1,
      format: "standard",
    });

    // --- Clubs, équipes, effectifs ---
    const managerByClub = new Map(args.managers.map((row) => [row.key, row.userId]));

    type Squad = {
      teamId: Id<"teams">;
      name: string;
      venue: string;
      clubKey: string;
      managerId: Id<"users">;
      players: Id<"players">[];
    };
    const squads: Squad[] = [];
    const clubIdByKey = new Map<string, Id<"clubs">>();
    let licenseCounter = 0;
    let playerCount = 0;

    // Licences de la saison. Le dernier licencié de Tulle 1 et de Brive 1 en reçoit une
    // close avant le match « à saisir » : le cas « non alignable » est dans le jeu sans
    // avoir à trafiquer la base. Les compositions n'utilisent que les premiers de la liste,
    // pour qu'aucune feuille passée ne s'appuie sur une licence périmée.
    const licenseFrom = parisDayAt(now - 300 * DAY);
    const licenseUntil = parisDayAt(now + 300 * DAY, 23, 59, 59);

    for (const club of CLUBS) {
      const clubId = await ctx.db.insert("clubs", {
        name: `${club.name}${DEV_SUFFIX}`,
        defaultVenue: club.venue,
      });
      clubIdByKey.set(club.key, clubId);
      for (const [teamIndex, teamName] of club.teams.entries()) {
        const teamId = await ctx.db.insert("teams", {
          clubId,
          seasonId,
          championshipId,
          name: teamName,
        });
        const players: Id<"players">[] = [];
        for (let i = 0; i < SQUAD_SIZE; i++) {
          const seed = playerCount;
          const playerId = await ctx.db.insert("players", {
            clubId,
            firstName: FIRST_NAMES[seed % FIRST_NAMES.length],
            lastName: LAST_NAMES[(seed * 5 + teamIndex) % LAST_NAMES.length],
          });
          licenseCounter++;
          await ctx.db.insert("licenses", {
            playerId,
            number: `DEV-${club.key}-${String(licenseCounter).padStart(3, "0")}`,
            validFrom: licenseFrom,
            validUntil: licenseUntil,
          });
          await ctx.db.insert("rosterEntries", { teamId, playerId });
          players.push(playerId);
          playerCount++;
        }
        squads.push({
          teamId,
          name: teamName,
          venue: club.venue,
          clubKey: club.key,
          managerId: managerByClub.get(club.key) ?? args.adminId,
          players,
        });
      }
    }

    const teamByName = new Map(squads.map((squad) => [squad.name, squad]));
    const tulle1 = teamByName.get("Tulle 1")!;
    const tulle2 = teamByName.get("Tulle 2")!;
    const brive1 = teamByName.get("Brive 1")!;

    // Le responsable de Tulle gère ses deux équipes : un compte peut en gérer plusieurs.
    for (const squad of squads) {
      await ctx.db.insert("teamManagers", { teamId: squad.teamId, userId: squad.managerId });
    }

    // --- Calendrier : aller-retour sur 10 journées ---
    const first = roundRobin(squads);
    const isTulleBrive = (a: Squad, b: Squad) =>
      (a === tulle1 && b === brive1) || (a === brive1 && b === tulle1);
    // Le duel des deux responsables est orienté « Tulle reçoit » à l'aller : c'est ce match
    // qui portera la feuille à saisir, et son retour à Brive le créneau à proposer.
    const aller = first.map((round) =>
      round.map(([home, away]): [Squad, Squad] =>
        isTulleBrive(home, away) ? [tulle1, brive1] : [home, away],
      ),
    );
    const retour = aller.map((round) =>
      round.map(([home, away]): [Squad, Squad] => [away, home]),
    );
    const schedule = [...aller, ...retour];

    // La journée du duel aller ferme tout juste ; la suivante est celle qui est ouverte.
    const duelRound = aller.findIndex((round) =>
      round.some(([home, away]) => isTulleBrive(home, away)),
    );
    const openRound = duelRound + 1;

    const matchdayIds: Id<"matchdays">[] = [];
    for (let k = 0; k < schedule.length; k++) {
      const shift = (k - openRound) * 14 * DAY;
      matchdayIds.push(
        await ctx.db.insert("matchdays", {
          championshipId,
          number: k + 1,
          windowStart: parisDayAt(now + shift - 2 * DAY),
          windowEnd: parisDayAt(now + shift + 11 * DAY, 23, 59, 59),
        }),
      );
    }
    /** Créneau au cœur de la fenêtre : passé pour les journées écoulées, à venir sinon. */
    const slotOf = (k: number) =>
      parisDayAt(now + (k - openRound) * 14 * DAY + 6 * DAY, 20, 30);

    // --- Matchs ---
    let matchCount = 0;
    let completedCount = 0;

    /** Pose un créneau ferme et sa proposition acceptée : sans elle l'historique serait vide. */
    const confirm = async (matchId: Id<"matches">, home: Squad, at: number) => {
      await ctx.db.insert("slotProposals", {
        matchId,
        at,
        venue: home.venue,
        proposedBy: home.managerId,
        status: "accepted",
        respondedAt: at - 10 * DAY,
      });
      await ctx.db.patch(matchId, { state: "confirmed", slot: { at, venue: home.venue } });
    };

    /** Feuille de match complète : score, compositions, et le résultat si elle est validée. */
    const writeSheet = async (
      matchId: Id<"matches">,
      matchdayId: Id<"matchdays">,
      home: Squad,
      away: Squad,
      pattern: number,
      status: "validated" | "pending" | "disputed",
    ) => {
      const sets = SCORE_PATTERNS[pattern % SCORE_PATTERNS.length].map(([h, a]) => ({
        home: h,
        away: a,
      }));
      await ctx.db.insert("matchSheets", {
        matchId,
        sets,
        submittedBy: home.managerId,
        status,
        deadline: status === "pending" ? now + 4 * DAY : undefined,
        disputeReason:
          status === "disputed"
            ? "Le score du quatrième set ne correspond pas à notre feuille papier."
            : undefined,
      });
      for (const [teamId, players] of [
        [home.teamId, home.players],
        [away.teamId, away.players],
      ] as const) {
        for (const playerId of players.slice(0, LINEUP_SIZE)) {
          await ctx.db.insert("lineupEntries", { matchId, matchdayId, teamId, playerId });
        }
      }
      if (status !== "validated") {
        return;
      }
      const validation = validateMatchScore(sets);
      if (!validation.ok) {
        // Les motifs sont écrits à la main : un échec ici est un bug du jeu, pas une donnée.
        throw new Error(`Score de démonstration invalide : ${validation.error.message}`);
      }
      const { outcome } = validation;
      await ctx.db.patch(matchId, {
        state: "completed",
        result: {
          winnerTeamId: outcome.winner === "home" ? home.teamId : away.teamId,
          homeSets: outcome.homeSets,
          awaySets: outcome.awaySets,
          homePoints: outcome.homePoints,
          awayPoints: outcome.awayPoints,
        },
      });
      completedCount++;
    };

    let matchToScoreId: Id<"matches"> | null = null;
    let matchToPlanId: Id<"matches"> | null = null;
    /** Un forfait, une feuille à valider et un litige : une fois chacun. */
    let forfeitPlaced = false;
    let pendingSheetPlaced = false;

    for (let k = 0; k < schedule.length; k++) {
      const matchdayId = matchdayIds[k];
      const at = slotOf(k);
      const round = schedule[k];

      for (const [index, [home, away]] of round.entries()) {
        const matchId = await ctx.db.insert("matches", {
          championshipId,
          matchdayId,
          homeTeamId: home.teamId,
          awayTeamId: away.teamId,
          state: "planned",
        });
        matchCount++;

        if (k < duelRound) {
          // Journées écoulées : tout est joué et validé. Un forfait s'y glisse une fois.
          await confirm(matchId, home, at);
          if (!forfeitPlaced && k === 1 && index === 0) {
            forfeitPlaced = true;
            await ctx.db.patch(matchId, {
              state: "completed",
              forfeitAgainst: away.teamId,
              result: {
                winnerTeamId: home.teamId,
                homeSets: 3,
                awaySets: 0,
                homePoints: 75,
                awayPoints: 0,
              },
            });
            await ctx.db.insert("matchSheets", {
              matchId,
              sets: forfeitScore(),
              submittedBy: args.adminId,
              status: "validated",
              settledBy: args.adminId,
            });
            completedCount++;
          } else {
            await writeSheet(matchId, matchdayId, home, away, k * 7 + index * 5, "validated");
          }
        } else if (k === duelRound) {
          // La journée qui vient de fermer : c'est ici que les responsables ont la main.
          await confirm(matchId, home, at);
          if (isTulleBrive(home, away)) {
            matchToScoreId = matchId; // feuille à transcrire par le responsable de Tulle
          } else if (!pendingSheetPlaced) {
            // Feuille soumise par le receveur : le visiteur doit la valider ou la contester.
            pendingSheetPlaced = true;
            await ctx.db.patch(matchId, { state: "awaitingSheet" });
            await writeSheet(matchId, matchdayId, home, away, k * 7 + index * 5, "pending");
          } else {
            // Un litige à arbitrer, pour que l'écran d'administration ait de quoi travailler.
            await ctx.db.patch(matchId, { state: "disputed" });
            await writeSheet(matchId, matchdayId, home, away, k * 7 + index * 5, "disputed");
          }
        } else if (k === openRound) {
          // La journée ouverte : négociation des créneaux en cours.
          if (index === 0) {
            await confirm(matchId, home, at);
          } else if (index === 1) {
            await ctx.db.insert("slotProposals", {
              matchId,
              at,
              venue: home.venue,
              proposedBy: home.managerId,
              status: "pending",
              deadline: now + 5 * DAY,
            });
            await ctx.db.patch(matchId, { state: "awaitingSlot" });
          }
          // index 2 reste « planifié » : il faut bien un créneau à proposer.
        } else if (matchToPlanId === null && isTulleBrive(home, away)) {
          // Le retour du duel, dans une journée à venir : c'est Brive qui propose.
          matchToPlanId = matchId;
        }
      }
    }

    if (matchToScoreId === null || matchToPlanId === null) {
      throw new Error("Le calendrier généré ne contient pas les deux matchs de démonstration.");
    }

    // --- Féminin : un championnat au format plateau, dans son propre circuit ---
    // Ses feuilles vertes sont indépendantes de celles du championnat. Un plateau passé,
    // résultats saisis par l'administrateur (dont un match nul), et un plateau à venir.
    const womenCircuitId = await ctx.db.insert("circuits", { seasonId, name: "Féminin" });
    const womenId = await ctx.db.insert("championships", {
      seasonId,
      circuitId: womenCircuitId,
      name: "Féminin (dev)",
      level: 1,
      format: "plateau",
    });
    const women: Squad[] = [];
    for (const key of ["TUL", "BRI", "USS"] as const) {
      const club = CLUBS.find((candidate) => candidate.key === key)!;
      const clubId = clubIdByKey.get(key)!;
      const teamId = await ctx.db.insert("teams", {
        clubId,
        seasonId,
        championshipId: womenId,
        name: `${club.shortName} F`,
      });
      const players: Id<"players">[] = [];
      for (let i = 0; i < LINEUP_SIZE; i++) {
        const seed = playerCount;
        const playerId = await ctx.db.insert("players", {
          clubId,
          firstName: FIRST_NAMES[(seed * 7 + 3) % FIRST_NAMES.length],
          lastName: LAST_NAMES[(seed * 3 + 1) % LAST_NAMES.length],
        });
        licenseCounter++;
        await ctx.db.insert("licenses", {
          playerId,
          number: `DEV-${club.key}-${String(licenseCounter).padStart(3, "0")}`,
          validFrom: licenseFrom,
          validUntil: licenseUntil,
        });
        await ctx.db.insert("rosterEntries", { teamId, playerId });
        players.push(playerId);
        playerCount++;
      }
      const managerId = managerByClub.get(key) ?? args.adminId;
      await ctx.db.insert("teamManagers", { teamId, userId: managerId });
      women.push({ teamId, name: `${club.shortName} F`, venue: club.venue, clubKey: key, managerId, players });
    }

    const plateauPairs: [Squad, Squad][] = [
      [women[0], women[1]],
      [women[1], women[2]],
      [women[2], women[0]],
    ];
    /** 2-0, nul à un set partout, victoire 1-1 aux points. */
    const plateauScores = [
      [{ home: 25, away: 20 }, { home: 25, away: 18 }],
      [{ home: 25, away: 23 }, { home: 23, away: 25 }],
      [{ home: 25, away: 15 }, { home: 22, away: 25 }],
    ];
    for (const [number, offset, host] of [
      [1, -10, women[0]],
      [2, 18, women[1]],
    ] as const) {
      const plateau = { at: parisDayAt(now + offset * DAY, 14), venue: host.venue };
      const matchdayId = await ctx.db.insert("matchdays", {
        championshipId: womenId,
        number,
        windowStart: parisDayAt(plateau.at),
        windowEnd: parisDayAt(plateau.at, 23, 59, 59),
        plateau,
      });
      matchdayIds.push(matchdayId);
      for (const [index, [home, away]] of plateauPairs.entries()) {
        const matchId = await ctx.db.insert("matches", {
          championshipId: womenId,
          matchdayId,
          homeTeamId: home.teamId,
          awayTeamId: away.teamId,
          state: "confirmed",
          slot: plateau,
        });
        matchCount++;
        if (offset > 0) {
          continue;
        }
        const sets = plateauScores[index];
        const validation = validateMatchScore(sets, "plateau");
        if (!validation.ok) {
          throw new Error(`Score de plateau invalide : ${validation.error.message}`);
        }
        const { outcome } = validation;
        await ctx.db.insert("matchSheets", {
          matchId,
          sets,
          submittedBy: args.adminId,
          status: "validated",
          settledBy: args.adminId,
        });
        for (const [teamId, players] of [
          [home.teamId, home.players],
          [away.teamId, away.players],
        ] as const) {
          for (const playerId of players.slice(0, 5)) {
            await ctx.db.insert("lineupEntries", { matchId, matchdayId, teamId, playerId });
          }
        }
        await ctx.db.patch(matchId, {
          state: "completed",
          result: {
            winnerTeamId:
              outcome.winner === "draw"
                ? undefined
                : outcome.winner === "home"
                  ? home.teamId
                  : away.teamId,
            homeSets: outcome.homeSets,
            awaySets: outcome.awaySets,
            homePoints: outcome.homePoints,
            awayPoints: outcome.awayPoints,
          },
        });
        completedCount++;
      }
    }
    squads.push(...women);

    return {
      seasonLabel: label,
      championshipId,
      matchToPlanId,
      matchToScoreId,
      teamsByClub: CLUBS.map((club) => ({
        key: club.key,
        teams: squads
          .filter((squad) => squad.clubKey === club.key)
          .map((squad) => squad.name)
          .join(", "),
      })),
      counts: {
        teams: squads.length,
        players: playerCount,
        matchdays: matchdayIds.length,
        matches: matchCount,
        completed: completedCount,
      },
    };
  },
});

/** Ce que la commande affiche : les identifiants et les deux matchs à traiter. */
type DevSeedReport = {
  password: string;
  accounts: { email: string; role: string; teams: string }[];
  seasonLabel: string;
  counts: {
    teams: number;
    players: number;
    matchdays: number;
    matches: number;
    completed: number;
  };
  matchToPlan: { url: string; waitingOn: string };
  matchToScore: { url: string; waitingOn: string };
};

/** Purge puis reconstruit le jeu. Point d'entrée de `npx convex run seed:dev`. */
export const dev = internalAction({
  args: { password: v.optional(v.string()) },
  returns: v.object({
    password: v.string(),
    accounts: v.array(v.object({ email: v.string(), role: v.string(), teams: v.string() })),
    seasonLabel: v.string(),
    counts: v.object({
      teams: v.number(),
      players: v.number(),
      matchdays: v.number(),
      matches: v.number(),
      completed: v.number(),
    }),
    matchToPlan: v.object({ url: v.string(), waitingOn: v.string() }),
    matchToScore: v.object({ url: v.string(), waitingOn: v.string() }),
  }),
  handler: async (ctx, args): Promise<DevSeedReport> => {
    const password = args.password ?? DEFAULT_PASSWORD;
    if (password.length < 8) {
      throw new Error("Le mot de passe doit faire au moins 8 caractères.");
    }

    await ctx.runMutation(internal.seed.purge, {});

    const created = new Map<string, Id<"users">>();
    for (const account of accounts) {
      const { user } = await createAccount<DataModel>(ctx, {
        provider: "password",
        account: { id: account.email, secret: password },
        profile: { email: account.email, name: account.name, role: account.role },
      });
      created.set(account.key, user._id);
    }
    const adminId = created.get(ADMIN_ACCOUNT.key)!;

    const built = await ctx.runMutation(internal.seed.build, {
      adminId,
      managers: MANAGER_ACCOUNTS.map((account) => ({
        key: account.key,
        userId: created.get(account.key)!,
      })),
    });

    const tulleEmail = `tulle@${EMAIL_DOMAIN}`;
    const briveEmail = `brive@${EMAIL_DOMAIN}`;
    return {
      password,
      accounts: [
        { email: ADMIN_ACCOUNT.email, role: "admin", teams: "—" },
        ...MANAGER_ACCOUNTS.map((account) => ({
          email: account.email,
          role: "manager",
          teams: built.teamsByClub.find((row) => row.key === account.key)?.teams ?? "—",
        })),
      ],
      seasonLabel: built.seasonLabel,
      counts: built.counts,
      matchToPlan: {
        url: `/matchs/${built.matchToPlanId}`,
        waitingOn: `${briveEmail} propose le créneau, ${tulleEmail} valide`,
      },
      matchToScore: {
        url: `/matchs/${built.matchToScoreId}`,
        waitingOn: `${tulleEmail} saisit la feuille, ${briveEmail} valide`,
      },
    };
  },
});
