import { createAccount } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { parisParts, parisWallClock } from "../lib/rules/paris-time";
import { forfeitScore, validateMatchScore, type SetScore } from "../lib/rules/score";
import { sheetTacitDeadline, slotTacitDeadline } from "../lib/rules/tacit";
import { internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, type MutationCtx } from "./_generated/server";

/**
 * Jeu de données de développement.
 *
 * ```bash
 * npx convex run seed:dev
 * ```
 *
 * Fonction `internal` : jamais exposée au client, elle ne s'exécute que depuis la CLI.
 * **À ne lancer que sur un déploiement de développement** : elle écrit des comptes dont le
 * mot de passe est en clair dans la sortie de la commande.
 *
 * Le jeu vise la **couverture** : chaque état du cycle de vie d'un match, chaque rôle,
 * chaque cas de licence et chaque vue de pilotage doit avoir au moins une donnée qui la
 * fasse parler. Un écran vide ne dit pas s'il est cassé.
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

/** Année de début de la saison en cours à l'instant donné : elle bascule en août. */
function seasonStartYear(at: number): number {
  const { year, month } = parisParts(at);
  return month >= 8 ? year : year - 1;
}

function seasonLabel(startYear: number): string {
  return `${startYear}-${startYear + 1}${DEV_SUFFIX}`;
}

// --- Clubs et licenciés -----------------------------------------------------------------
//
// Tulle porte douze licenciés là où les autres en portent huit : c'est le club qui engage
// deux équipes dans le même championnat, et il faut de quoi remplir deux effectifs qui se
// recouvrent — c'est ce recouvrement qui alimente la vue des cumuls de l'administrateur.

const CLUBS = [
  {
    key: "tulle",
    name: "Volley Tulle",
    prefix: "TUL",
    venue: "Gymnase Alexandre Jourdanne, Tulle",
    players: [
      ["Camille", "Arnaud"],
      ["Julien", "Bernard"],
      ["Sarah", "Chastagnol"],
      ["Thomas", "Delmas"],
      ["Léa", "Faure"],
      ["Nicolas", "Gimenez"],
      ["Marion", "Lavaud"],
      ["Antoine", "Peyrat"],
      ["Élise", "Roubinet"],
      ["Vincent", "Soulier"],
      ["Chloé", "Tavernier"],
      ["Bastien", "Vialle"],
    ],
  },
  {
    key: "brive",
    name: "Volley Brive",
    prefix: "BRI",
    venue: "Halle des sports Jean Mazet, Brive",
    players: [
      ["Hugo", "Bessette"],
      ["Claire", "Dumas"],
      ["Maxime", "Espinasse"],
      ["Anaïs", "Grandcoing"],
      ["Pierre", "Laborie"],
      ["Élodie", "Mounier"],
      ["Rémi", "Sarlandie"],
      ["Julie", "Vergne"],
    ],
  },
  {
    key: "ussel",
    name: "Volley Ussel",
    prefix: "USS",
    venue: "Gymnase du Bois Saint-Michel, Ussel",
    players: [
      ["Damien", "Aubert"],
      ["Noémie", "Chastang"],
      ["Florian", "Estager"],
      ["Laure", "Jarrige"],
      ["Mathieu", "Lascaux"],
      ["Sophie", "Monteil"],
      ["Kévin", "Reynal"],
      ["Amandine", "Treich"],
    ],
  },
  {
    key: "egletons",
    name: "Volley Égletons",
    prefix: "EGL",
    venue: "Salle omnisports de la Vergne, Égletons",
    players: [
      ["Bruno", "Cheyroux"],
      ["Manon", "Dubois"],
      ["Cédric", "Farges"],
      ["Aurélie", "Lachaud"],
      ["Olivier", "Mazeau"],
      ["Pauline", "Ribière"],
      ["Sébastien", "Tronche"],
      ["Céline", "Vaurs"],
    ],
  },
  {
    key: "objat",
    name: "Volley Objat",
    prefix: "OBJ",
    venue: "Gymnase du Parc, Objat",
    players: [
      ["Alexis", "Brousse"],
      ["Karine", "Delpy"],
      ["Guillaume", "Fressinaud"],
      ["Sandra", "Lagarde"],
      ["Fabien", "Puydebois"],
      ["Nadia", "Salviat"],
      ["Yann", "Terracher"],
      ["Virginie", "Ychard"],
    ],
  },
] as const;

type ClubKey = (typeof CLUBS)[number]["key"];

/**
 * Comptes `manager`.
 *
 * Un par club, plus deux écarts voulus :
 *
 * - **Tulle 2 a son propre responsable.** Les deux équipes de Tulle se rencontrent, et un
 *   responsable ne peut pas valider sa propre proposition : avec un seul compte, ce match
 *   serait indéboulonnable.
 * - **Brive 1 en a deux.** Une équipe peut avoir plusieurs responsables, et un seul par
 *   équipe ne le montrerait jamais.
 */
const MANAGER_ACCOUNTS = [
  { key: "tulle", email: `tulle@${EMAIL_DOMAIN}`, name: "Responsable Tulle (dev)" },
  { key: "tulle2", email: `tulle2@${EMAIL_DOMAIN}`, name: "Responsable Tulle 2 (dev)" },
  { key: "brive", email: `brive@${EMAIL_DOMAIN}`, name: "Responsable Brive (dev)" },
  {
    key: "briveAdjoint",
    email: `brive-adjoint@${EMAIL_DOMAIN}`,
    name: "Co-responsable Brive (dev)",
  },
  { key: "ussel", email: `ussel@${EMAIL_DOMAIN}`, name: "Responsable Ussel (dev)" },
  { key: "egletons", email: `egletons@${EMAIL_DOMAIN}`, name: "Responsable Égletons (dev)" },
  { key: "objat", email: `objat@${EMAIL_DOMAIN}`, name: "Responsable Objat (dev)" },
] as const;

type ManagerKey = (typeof MANAGER_ACCOUNTS)[number]["key"];

/**
 * Comptes `player` : la consultation sans droit d'écriture.
 *
 * Chacun est rattaché à une fiche Joueur, dont il renseigne du même coup l'adresse. C'est
 * exactement ce que produit la création d'un licencié avec e-mail, et le seul moyen de
 * vérifier qu'un compte joueur voit bien « ses » matchs sans pouvoir y toucher.
 */
const PLAYER_ACCOUNTS = [
  {
    clubKey: "tulle" as ClubKey,
    playerIndex: 0,
    email: `camille.arnaud@${EMAIL_DOMAIN}`,
    name: "Camille Arnaud (dev)",
  },
  {
    clubKey: "brive" as ClubKey,
    playerIndex: 1,
    email: `claire.dumas@${EMAIL_DOMAIN}`,
    name: "Claire Dumas (dev)",
  },
];

const ADMIN_ACCOUNT = {
  email: `admin@${EMAIL_DOMAIN}`,
  name: "Admin UFOLEP (dev)",
};

// --- Équipes ----------------------------------------------------------------------------
//
// `from`/`to` découpent l'effectif dans la liste des licenciés du club. Les tranches de
// Tulle se chevauchent volontairement : quatre licenciés appartiennent aux deux équipes.

// Le premier responsable de `managers` est celui qui agit quand l'équipe reçoit.

type TeamPlan = {
  clubKey: ClubKey;
  name: string;
  from: number;
  to: number;
  managers: ManagerKey[];
};

const DEPARTEMENTAL_TEAMS: TeamPlan[] = [
  { clubKey: "tulle", name: "Tulle 1", from: 0, to: 8, managers: ["tulle"] },
  { clubKey: "tulle", name: "Tulle 2", from: 4, to: 12, managers: ["tulle2"] },
  { clubKey: "brive", name: "Brive 1", from: 0, to: 8, managers: ["brive", "briveAdjoint"] },
  { clubKey: "ussel", name: "Ussel 1", from: 0, to: 8, managers: ["ussel"] },
  { clubKey: "egletons", name: "Égletons 1", from: 0, to: 8, managers: ["egletons"] },
  { clubKey: "objat", name: "Objat 1", from: 0, to: 8, managers: ["objat"] },
];

const LOISIRS_TEAMS: TeamPlan[] = [
  { clubKey: "tulle", name: "Tulle Loisirs", from: 0, to: 8, managers: ["tulle"] },
  { clubKey: "brive", name: "Brive Loisirs", from: 0, to: 8, managers: ["brive"] },
  { clubKey: "ussel", name: "Ussel Loisirs", from: 0, to: 8, managers: ["ussel"] },
  { clubKey: "objat", name: "Objat Loisirs", from: 0, to: 8, managers: ["objat"] },
];

const PAST_TEAMS: TeamPlan[] = [
  { clubKey: "tulle", name: "Tulle 1", from: 0, to: 8, managers: ["tulle"] },
  { clubKey: "brive", name: "Brive 1", from: 0, to: 8, managers: ["brive"] },
  { clubKey: "ussel", name: "Ussel 1", from: 0, to: 8, managers: ["ussel"] },
  { clubKey: "objat", name: "Objat 1", from: 0, to: 8, managers: ["objat"] },
];

// --- Scores -----------------------------------------------------------------------------
//
// Table fixe plutôt qu'un tirage : un classement reproductible se relit d'une exécution à
// l'autre, et chaque cas du barème (3-0, 3-1, 3-2 et leurs symétriques) y figure au moins
// une fois — sans quoi la moitié du barème ne serait jamais exercée.

const SCORE_PATTERNS: SetScore[][] = [
  [
    { home: 25, away: 18 },
    { home: 25, away: 22 },
    { home: 25, away: 20 },
  ],
  [
    { home: 25, away: 20 },
    { home: 23, away: 25 },
    { home: 25, away: 19 },
    { home: 25, away: 17 },
  ],
  [
    { home: 22, away: 25 },
    { home: 25, away: 23 },
    { home: 19, away: 25 },
    { home: 25, away: 21 },
    { home: 15, away: 12 },
  ],
  [
    { home: 18, away: 25 },
    { home: 20, away: 25 },
    { home: 22, away: 25 },
  ],
  [
    { home: 25, away: 27 },
    { home: 25, away: 20 },
    { home: 24, away: 26 },
    { home: 23, away: 25 },
  ],
  [
    { home: 25, away: 23 },
    { home: 21, away: 25 },
    { home: 25, away: 18 },
    { home: 20, away: 25 },
    { home: 13, away: 15 },
  ],
  [
    { home: 26, away: 24 },
    { home: 25, away: 21 },
    { home: 25, away: 23 },
  ],
];

/**
 * Calendrier toutes rondes (méthode du carrousel) : chaque équipe en rencontre une autre
 * exactement une fois, en `n - 1` journées de `n / 2` matchs. `n` doit être pair.
 *
 * Le receveur est inversé une journée sur deux, faute de quoi la première équipe recevrait
 * toute la saison — et les vues qui distinguent receveur et visiteur ne seraient jamais
 * exercées dans les deux sens.
 */
function roundRobin(n: number): Array<Array<[number, number]>> {
  const rotating = Array.from({ length: n - 1 }, (_, index) => index + 1);
  const rounds: Array<Array<[number, number]>> = [];
  for (let round = 0; round < n - 1; round++) {
    const order = [0, ...rotating];
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < n / 2; i++) {
      const home = order[i];
      const away = order[n - 1 - i];
      pairs.push(round % 2 === 0 ? [home, away] : [away, home]);
    }
    rounds.push(pairs);
    rotating.unshift(rotating.pop() as number);
  }
  return rounds;
}

/** Valide le score et rend le résultat orienté receveur / visiteur, comme `sheets`. */
function resultOf(sets: SetScore[], homeTeamId: Id<"teams">, awayTeamId: Id<"teams">) {
  const validation = validateMatchScore(sets);
  if (!validation.ok) {
    // Une table de scores fausse produirait un classement incohérent sans rien signaler.
    throw new Error(`Score de démonstration invalide : ${validation.error.message}`);
  }
  const { outcome } = validation;
  return {
    winnerTeamId: outcome.winner === "home" ? homeTeamId : awayTeamId,
    homeSets: outcome.homeSets,
    awaySets: outcome.awaySets,
    homePoints: outcome.homePoints,
    awayPoints: outcome.awayPoints,
  };
}

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

// --- Construction -----------------------------------------------------------------------

/** Un licencié écrit, avec les périodes de licence qui décident où il peut être aligné. */
type SeededPlayer = {
  id: Id<"players">;
  periods: { validFrom: number; validUntil: number }[];
};

type SeededTeam = {
  id: Id<"teams">;
  name: string;
  venue: string;
  roster: SeededPlayer[];
  managerId: Id<"users">;
};

/** Les six premiers licenciés régulièrement licenciés à la date du match. */
function lineupAt(team: SeededTeam, at: number, offset: number): Id<"players">[] {
  const eligible = team.roster.filter((player) =>
    player.periods.some((period) => period.validFrom <= at && at <= period.validUntil),
  );
  if (eligible.length === 0) {
    return [];
  }
  // Décalage par journée : sans lui, toutes les feuilles de la saison aligneraient les
  // six mêmes noms, et rien ne distinguerait un effectif d'une composition.
  return Array.from({ length: Math.min(6, eligible.length) }, (_, index) => {
    return eligible[(offset + index) % eligible.length].id;
  });
}

/**
 * Écrit la compétition. Les comptes sont créés par l'action appelante — `createAccount`
 * de Convex Auth exige un contexte d'action pour hacher le mot de passe.
 *
 * Écriture directe : les mutations du domaine exigent une identité d'administrateur, que
 * la CLI n'a pas. Les invariants qu'elles portent sont donc respectés à la main ici —
 * `seasonId` de l'équipe dérivé du championnat, créneau dans la fenêtre de sa journée,
 * proposition acceptée en regard du match confirmé, score validé par la règle réelle.
 */
export const build = internalMutation({
  args: {
    adminId: v.id("users"),
    managers: v.array(v.object({ key: v.string(), userId: v.id("users") })),
    players: v.array(v.object({ email: v.string(), userId: v.id("users") })),
  },
  returns: v.object({
    seasonLabel: v.string(),
    pastSeasonLabel: v.string(),
    championships: v.array(
      v.object({ name: v.string(), season: v.string(), teams: v.number(), matches: v.number() }),
    ),
    highlights: v.array(
      v.object({ label: v.string(), url: v.string(), waitingOn: v.string() }),
    ),
    counts: v.object({
      clubs: v.number(),
      players: v.number(),
      licenses: v.number(),
      teams: v.number(),
      matches: v.number(),
      completed: v.number(),
    }),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const managerOf = new Map(args.managers.map((row) => [row.key, row.userId]));
    const accountOfEmail = new Map(args.players.map((row) => [row.email, row.userId]));

    const counts = {
      clubs: 0,
      players: 0,
      licenses: 0,
      teams: 0,
      matches: 0,
      completed: 0,
    };

    // --- Saisons ---
    // La saison du jeu devient la courante : la page d'accueil en part.
    for (const other of await ctx.db
      .query("seasons")
      .withIndex("by_current", (q) => q.eq("isCurrent", true))
      .collect()) {
      await ctx.db.patch(other._id, { isCurrent: false });
    }
    const startYear = seasonStartYear(now);
    const currentLabel = seasonLabel(startYear);
    const pastLabel = seasonLabel(startYear - 1);
    const seasonId = await ctx.db.insert("seasons", { label: currentLabel, isCurrent: true });
    const pastSeasonId = await ctx.db.insert("seasons", { label: pastLabel, isCurrent: false });

    // --- Licences ---
    // Deux périodes par licencié, séparées par un trou : le modèle autorise l'interruption,
    // et une suite continue ne le montrerait pas. La période ancienne couvre la saison
    // archivée — sans quoi ses feuilles aligneraient des joueurs non licenciés ce jour-là.
    const pastFrom = parisDayAt(now - 600 * DAY);
    const pastUntil = parisDayAt(now - 230 * DAY, 23, 59, 59);
    const currentFrom = parisDayAt(now - 200 * DAY);
    const currentUntil = parisDayAt(now + 300 * DAY, 23, 59, 59);
    // Périmée depuis dix jours : assez tôt pour avoir couvert les premières journées,
    // assez tard pour interdire la composition d'aujourd'hui.
    const expiredUntil = parisDayAt(now - 10 * DAY, 23, 59, 59);

    /**
     * Le dernier licencié de chaque club porte une licence périmée, et Tulle porte en plus
     * une fiche sans aucune licence. Les deux cas s'affichent différemment et doivent tous
     * deux exister : « expirée le … » se corrige, une fiche sans licence se délivre.
     */
    const licenseStatus = (clubKey: string, index: number, total: number) => {
      if (clubKey === "tulle" && index === total - 1) {
        return "none" as const;
      }
      if (index === total - 1 || (clubKey === "tulle" && index === total - 2)) {
        return "expired" as const;
      }
      return "valid" as const;
    };

    // --- Clubs et licenciés ---
    const clubs = new Map<string, { id: Id<"clubs">; venue: string; players: SeededPlayer[] }>();
    for (const club of CLUBS) {
      const clubId = await ctx.db.insert("clubs", {
        name: `${club.name}${DEV_SUFFIX}`,
        defaultVenue: club.venue,
      });
      counts.clubs++;

      const players: SeededPlayer[] = [];
      for (const [index, [firstName, lastName]] of club.players.entries()) {
        const account = PLAYER_ACCOUNTS.find(
          (row) => row.clubKey === club.key && row.playerIndex === index,
        );
        const playerId = await ctx.db.insert("players", {
          clubId,
          firstName,
          lastName,
          email: account?.email,
        });
        counts.players++;

        // Le compte de consultation pointe la fiche : c'est ce rattachement qui lui donne
        // « ses » matchs, pas son rôle.
        if (account !== undefined) {
          const userId = accountOfEmail.get(account.email);
          if (userId !== undefined) {
            await ctx.db.patch(userId, { playerId });
          }
        }

        const status = licenseStatus(club.key, index, club.players.length);
        const number = `DEV-${club.prefix}-${String(index + 1).padStart(2, "0")}`;
        const periods: SeededPlayer["periods"] = [];
        if (status !== "none") {
          periods.push({ validFrom: pastFrom, validUntil: pastUntil });
          await ctx.db.insert("licenses", {
            playerId,
            number: `${number}-A`,
            validFrom: pastFrom,
            validUntil: pastUntil,
          });
          counts.licenses++;

          const validUntil = status === "expired" ? expiredUntil : currentUntil;
          periods.push({ validFrom: currentFrom, validUntil });
          await ctx.db.insert("licenses", {
            playerId,
            number,
            validFrom: currentFrom,
            validUntil,
          });
          counts.licenses++;
        }
        players.push({ id: playerId, periods });
      }
      clubs.set(club.key, { id: clubId, venue: club.venue, players });
    }

    /** Engage les équipes d'un championnat : effectif et responsable compris. */
    const engage = async (
      championshipId: Id<"championships">,
      forSeasonId: Id<"seasons">,
      plans: TeamPlan[],
    ): Promise<SeededTeam[]> => {
      const teams: SeededTeam[] = [];
      for (const plan of plans) {
        const club = clubs.get(plan.clubKey);
        if (club === undefined) {
          throw new Error(`Club de démonstration inconnu : ${plan.clubKey}`);
        }
        const managerIds = plan.managers.map((key) => {
          const userId = managerOf.get(key);
          if (userId === undefined) {
            throw new Error(`Responsable de démonstration inconnu : ${key}`);
          }
          return userId;
        });
        const teamId = await ctx.db.insert("teams", {
          clubId: club.id,
          seasonId: forSeasonId,
          championshipId,
          name: plan.name,
        });
        counts.teams++;
        for (const userId of managerIds) {
          await ctx.db.insert("teamManagers", { teamId, userId });
        }

        const roster = club.players.slice(plan.from, plan.to);
        for (const player of roster) {
          await ctx.db.insert("rosterEntries", { teamId, playerId: player.id });
        }
        teams.push({
          id: teamId,
          name: plan.name,
          venue: club.venue,
          roster,
          managerId: managerIds[0],
        });
      }
      return teams;
    };

    /** Match terminé : créneau, proposition acceptée, feuille validée et compositions. */
    const completed = async (opts: {
      championshipId: Id<"championships">;
      matchdayId: Id<"matchdays">;
      home: SeededTeam;
      away: SeededTeam;
      at: number;
      sets: SetScore[];
      offset: number;
    }) => {
      const { championshipId, matchdayId, home, away, at, sets, offset } = opts;
      const result = resultOf(sets, home.id, away.id);
      const matchId = await ctx.db.insert("matches", {
        championshipId,
        matchdayId,
        homeTeamId: home.id,
        awayTeamId: away.id,
        state: "completed",
        slot: { at, venue: home.venue },
        result,
      });
      counts.matches++;
      counts.completed++;
      await ctx.db.insert("slotProposals", {
        matchId,
        at,
        venue: home.venue,
        proposedBy: home.managerId,
        status: "accepted",
        respondedAt: at - 10 * DAY,
      });
      await ctx.db.insert("matchSheets", {
        matchId,
        sets,
        submittedBy: home.managerId,
        status: "validated",
      });
      for (const team of [home, away]) {
        for (const playerId of lineupAt(team, at, offset)) {
          await ctx.db.insert("lineupEntries", {
            matchId,
            matchdayId,
            teamId: team.id,
            playerId,
          });
        }
      }
      return matchId;
    };

    // --- Saison archivée -------------------------------------------------------------
    // Une saison entièrement jouée : elle donne un classement final, et vérifie que le
    // sélecteur de la page d'accueil groupe bien par saison.
    const pastChampionshipId = await ctx.db.insert("championships", {
      seasonId: pastSeasonId,
      name: "Championnat Départemental (dev)",
    });
    const pastTeams = await engage(pastChampionshipId, pastSeasonId, PAST_TEAMS);
    let pastMatches = 0;
    for (const [round, pairs] of roundRobin(pastTeams.length).entries()) {
      const matchdayId = await ctx.db.insert("matchdays", {
        championshipId: pastChampionshipId,
        number: round + 1,
        windowStart: parisDayAt(now - (500 - round * 20) * DAY),
        windowEnd: parisDayAt(now - (486 - round * 20) * DAY, 23, 59, 59),
      });
      for (const [index, [homeIndex, awayIndex]] of pairs.entries()) {
        await completed({
          championshipId: pastChampionshipId,
          matchdayId,
          home: pastTeams[homeIndex],
          away: pastTeams[awayIndex],
          at: parisDayAt(now - (495 - round * 20 - index) * DAY, 20, 30),
          sets: SCORE_PATTERNS[(round * 2 + index) % SCORE_PATTERNS.length],
          offset: round,
        });
        pastMatches++;
      }
    }

    // --- Championnat départemental, saison courante ------------------------------------
    const championshipId = await ctx.db.insert("championships", {
      seasonId,
      name: "Championnat Départemental (dev)",
    });
    const teams = await engage(championshipId, seasonId, DEPARTEMENTAL_TEAMS);
    const rounds = roundRobin(teams.length);

    // Fenêtres des cinq journées, en jours autour d'aujourd'hui. Les trois premières sont
    // fermées, la quatrième vient de se fermer — c'est elle qui porte les blocages — et la
    // cinquième est ouverte : c'est la seule où l'on puisse encore négocier.
    //
    // La fenêtre de J5 se referme dans six jours, sous la semaine que guette la vue de
    // relance de l'administrateur : une fenêtre confortable la laisserait vide, et on ne
    // saurait pas si elle est cassée ou simplement au calme.
    const windows = [
      { start: -75, end: -61, play: -70 },
      { start: -60, end: -46, play: -55 },
      { start: -45, end: -31, play: -40 },
      { start: -30, end: -3, play: -10 },
      { start: -2, end: 6, play: 2 },
    ];
    const matchdayIds: Id<"matchdays">[] = [];
    for (const [round, window] of windows.entries()) {
      matchdayIds.push(
        await ctx.db.insert("matchdays", {
          championshipId,
          number: round + 1,
          windowStart: parisDayAt(now + window.start * DAY),
          windowEnd: parisDayAt(now + window.end * DAY, 23, 59, 59),
        }),
      );
    }
    const playedAt = (round: number, index: number) =>
      parisDayAt(now + (windows[round].play + index) * DAY, 20, 30);

    // Journées 1 à 3 : jouées. La dernière rencontre de J3 est un forfait — le classement
    // n'a aucun cas particulier à connaître, mais l'écran doit savoir l'afficher.
    for (const round of [0, 1, 2]) {
      for (const [index, [homeIndex, awayIndex]] of rounds[round].entries()) {
        const home = teams[homeIndex];
        const away = teams[awayIndex];
        const at = playedAt(round, index);
        const isForfeit = round === 2 && index === rounds[round].length - 1;
        if (!isForfeit) {
          await completed({
            championshipId,
            matchdayId: matchdayIds[round],
            home,
            away,
            at,
            sets: SCORE_PATTERNS[(round * 3 + index) % SCORE_PATTERNS.length],
            offset: round,
          });
          continue;
        }
        // Forfait du visiteur : score conventionnel 3-0, 25-0 par set, aucune composition.
        const sets = forfeitScore();
        const matchId = await ctx.db.insert("matches", {
          championshipId,
          matchdayId: matchdayIds[round],
          homeTeamId: home.id,
          awayTeamId: away.id,
          state: "completed",
          slot: { at, venue: home.venue },
          result: resultOf(sets, home.id, away.id),
          forfeitAgainst: away.id,
        });
        counts.matches++;
        counts.completed++;
        await ctx.db.insert("matchSheets", {
          matchId,
          sets,
          submittedBy: args.adminId,
          status: "validated",
          settledBy: args.adminId,
        });
      }
    }

    // Journée 4, fenêtre fermée : les trois matchs sont bloqués, chacun à sa manière.
    const [sheetMissingPair, sheetPendingPair, disputedPair] = rounds[3];

    // (a) Confirmé, créneau passé : le receveur doit saisir la feuille.
    const sheetMissingHome = teams[sheetMissingPair[0]];
    const sheetMissingAway = teams[sheetMissingPair[1]];
    const sheetMissingAt = playedAt(3, 0);
    const matchToScoreId = await ctx.db.insert("matches", {
      championshipId,
      matchdayId: matchdayIds[3],
      homeTeamId: sheetMissingHome.id,
      awayTeamId: sheetMissingAway.id,
      state: "confirmed",
      slot: { at: sheetMissingAt, venue: sheetMissingHome.venue },
    });
    counts.matches++;
    await ctx.db.insert("slotProposals", {
      matchId: matchToScoreId,
      at: sheetMissingAt,
      venue: sheetMissingHome.venue,
      proposedBy: sheetMissingHome.managerId,
      status: "accepted",
      respondedAt: sheetMissingAt - 8 * DAY,
    });

    // (b) Feuille soumise : le visiteur doit la valider, ou la contester avant l'échéance.
    const sheetPendingHome = teams[sheetPendingPair[0]];
    const sheetPendingAway = teams[sheetPendingPair[1]];
    const sheetPendingAt = playedAt(3, 1);
    const sheetPendingSets = SCORE_PATTERNS[2];
    const matchToValidateId = await ctx.db.insert("matches", {
      championshipId,
      matchdayId: matchdayIds[3],
      homeTeamId: sheetPendingHome.id,
      awayTeamId: sheetPendingAway.id,
      state: "awaitingSheet",
      slot: { at: sheetPendingAt, venue: sheetPendingHome.venue },
    });
    counts.matches++;
    await ctx.db.insert("slotProposals", {
      matchId: matchToValidateId,
      at: sheetPendingAt,
      venue: sheetPendingHome.venue,
      proposedBy: sheetPendingHome.managerId,
      status: "accepted",
      respondedAt: sheetPendingAt - 8 * DAY,
    });
    const sheetDeadline = sheetTacitDeadline(now);
    const pendingSheetId = await ctx.db.insert("matchSheets", {
      matchId: matchToValidateId,
      sets: sheetPendingSets,
      submittedBy: sheetPendingHome.managerId,
      status: "pending",
      deadline: sheetDeadline,
    });
    for (const team of [sheetPendingHome, sheetPendingAway]) {
      for (const playerId of lineupAt(team, sheetPendingAt, 1)) {
        await ctx.db.insert("lineupEntries", {
          matchId: matchToValidateId,
          matchdayId: matchdayIds[3],
          teamId: team.id,
          playerId,
        });
      }
    }
    // L'échéance est programmée, comme le ferait `sheets.submit` : sans elle, la validation
    // tacite du jeu de test ne serait qu'une date affichée.
    await ctx.db.patch(matchToValidateId, {
      tacitJobId: await ctx.scheduler.runAt(sheetDeadline, internal.sheets.applyTacitSheet, {
        matchId: matchToValidateId,
        sheetId: pendingSheetId,
      }),
    });

    // (c) Litige : seul un administrateur peut le clore.
    const disputedHome = teams[disputedPair[0]];
    const disputedAway = teams[disputedPair[1]];
    const disputedAt = playedAt(3, 2);
    const disputedSets = SCORE_PATTERNS[5];
    const disputedMatchId = await ctx.db.insert("matches", {
      championshipId,
      matchdayId: matchdayIds[3],
      homeTeamId: disputedHome.id,
      awayTeamId: disputedAway.id,
      state: "disputed",
      slot: { at: disputedAt, venue: disputedHome.venue },
    });
    counts.matches++;
    await ctx.db.insert("slotProposals", {
      matchId: disputedMatchId,
      at: disputedAt,
      venue: disputedHome.venue,
      proposedBy: disputedHome.managerId,
      status: "accepted",
      respondedAt: disputedAt - 8 * DAY,
    });
    await ctx.db.insert("matchSheets", {
      matchId: disputedMatchId,
      sets: disputedSets,
      submittedBy: disputedHome.managerId,
      status: "disputed",
      disputeReason:
        "Le tie-break s'est arrêté à 15-13, pas 15-13 en notre défaveur : la feuille papier dit l'inverse.",
    });
    for (const team of [disputedHome, disputedAway]) {
      for (const playerId of lineupAt(team, disputedAt, 2)) {
        await ctx.db.insert("lineupEntries", {
          matchId: disputedMatchId,
          matchdayId: matchdayIds[3],
          teamId: team.id,
          playerId,
        });
      }
    }

    // Journée 5, fenêtre ouverte : les trois étapes de la négociation d'un créneau.
    const [plannedPair, awaitingPair, confirmedPair] = rounds[4];

    // (a) Planifié : le receveur doit proposer. Une proposition refusée traîne dans
    //     l'historique — c'est elle qui explique pourquoi le match est revenu à zéro.
    const plannedHome = teams[plannedPair[0]];
    const plannedAway = teams[plannedPair[1]];
    const matchToPlanId = await ctx.db.insert("matches", {
      championshipId,
      matchdayId: matchdayIds[4],
      homeTeamId: plannedHome.id,
      awayTeamId: plannedAway.id,
      state: "planned",
    });
    counts.matches++;
    await ctx.db.insert("slotProposals", {
      matchId: matchToPlanId,
      at: playedAt(4, 0),
      venue: plannedHome.venue,
      proposedBy: plannedHome.managerId,
      status: "rejected",
      respondedAt: now - 2 * DAY,
    });

    // (b) En attente : proposition soumise, le visiteur doit répondre avant l'échéance.
    const awaitingHome = teams[awaitingPair[0]];
    const awaitingAway = teams[awaitingPair[1]];
    const awaitingAt = playedAt(4, 1);
    const matchToAnswerId = await ctx.db.insert("matches", {
      championshipId,
      matchdayId: matchdayIds[4],
      homeTeamId: awaitingHome.id,
      awayTeamId: awaitingAway.id,
      state: "awaitingSlot",
    });
    counts.matches++;
    const slotDeadline = slotTacitDeadline(now, awaitingAt);
    const pendingProposalId = await ctx.db.insert("slotProposals", {
      matchId: matchToAnswerId,
      at: awaitingAt,
      venue: awaitingHome.venue,
      proposedBy: awaitingHome.managerId,
      status: "pending",
      deadline: slotDeadline ?? undefined,
    });
    if (slotDeadline !== null) {
      await ctx.db.patch(matchToAnswerId, {
        tacitJobId: await ctx.scheduler.runAt(
          slotDeadline,
          internal.negotiation.applyTacitSlot,
          { matchId: matchToAnswerId, proposalId: pendingProposalId },
        ),
      });
    }

    // (c) Confirmé, à venir, avec une demande de report en attente de réponse.
    const postponedHome = teams[confirmedPair[0]];
    const postponedAway = teams[confirmedPair[1]];
    const postponedAt = playedAt(4, 2);
    const matchToPostponeId = await ctx.db.insert("matches", {
      championshipId,
      matchdayId: matchdayIds[4],
      homeTeamId: postponedHome.id,
      awayTeamId: postponedAway.id,
      state: "confirmed",
      slot: { at: postponedAt, venue: postponedHome.venue },
    });
    counts.matches++;
    await ctx.db.insert("slotProposals", {
      matchId: matchToPostponeId,
      at: postponedAt,
      venue: postponedHome.venue,
      proposedBy: postponedHome.managerId,
      status: "accepted",
      respondedAt: now - 3 * DAY,
    });
    await ctx.db.insert("postponementRequests", {
      matchId: matchToPostponeId,
      requestedBy: postponedHome.managerId,
      reason: "Gymnase réquisitionné ce soir-là pour le tournoi scolaire du département.",
      status: "pending",
    });

    // --- Championnat loisirs, saison courante ------------------------------------------
    // Un second championnat, plus court : il fait vivre le sélecteur de la page d'accueil
    // et vérifie qu'un responsable qui gère deux équipes les voit toutes les deux.
    const loisirsId = await ctx.db.insert("championships", {
      seasonId,
      name: "Championnat Loisirs (dev)",
    });
    const loisirsTeams = await engage(loisirsId, seasonId, LOISIRS_TEAMS);
    // La dernière journée du loisirs est **en retard** : sa fenêtre s'est refermée il y a
    // deux jours sur des matchs sans créneau. C'est le cas rouge de la vue de relance, que
    // rien d'autre ne produit — une fenêtre dépassée n'arrive pas toute seule.
    const loisirsWindows = [
      { start: -70, end: -56, play: -65 },
      { start: -55, end: -41, play: -50 },
      { start: -20, end: -2, play: -10 },
    ];
    let loisirsMatches = 0;
    for (const [round, pairs] of roundRobin(loisirsTeams.length).entries()) {
      const window = loisirsWindows[round];
      const matchdayId = await ctx.db.insert("matchdays", {
        championshipId: loisirsId,
        number: round + 1,
        windowStart: parisDayAt(now + window.start * DAY),
        windowEnd: parisDayAt(now + window.end * DAY, 23, 59, 59),
      });
      for (const [index, [homeIndex, awayIndex]] of pairs.entries()) {
        const home = loisirsTeams[homeIndex];
        const away = loisirsTeams[awayIndex];
        const at = parisDayAt(now + (window.play + index) * DAY, 20, 0);
        if (round < 2) {
          await completed({
            championshipId: loisirsId,
            matchdayId,
            home,
            away,
            at,
            sets: SCORE_PATTERNS[(round * 2 + index + 3) % SCORE_PATTERNS.length],
            offset: round + 1,
          });
        } else {
          await ctx.db.insert("matches", {
            championshipId: loisirsId,
            matchdayId,
            homeTeamId: home.id,
            awayTeamId: away.id,
            state: "planned",
          });
          counts.matches++;
        }
        loisirsMatches++;
      }
    }

    return {
      seasonLabel: currentLabel,
      pastSeasonLabel: pastLabel,
      championships: [
        {
          name: "Championnat Départemental (dev)",
          season: currentLabel,
          teams: teams.length,
          matches: rounds.length * rounds[0].length,
        },
        {
          name: "Championnat Loisirs (dev)",
          season: currentLabel,
          teams: loisirsTeams.length,
          matches: loisirsMatches,
        },
        {
          name: "Championnat Départemental (dev)",
          season: pastLabel,
          teams: pastTeams.length,
          matches: pastMatches,
        },
      ],
      highlights: [
        {
          label: "Feuille de match à saisir",
          url: `/matchs/${matchToScoreId}`,
          waitingOn: `${sheetMissingHome.name} (receveur) saisit le score et les compositions`,
        },
        {
          label: "Feuille de match à valider",
          url: `/matchs/${matchToValidateId}`,
          waitingOn: `${sheetPendingAway.name} (visiteur) valide ou conteste`,
        },
        {
          label: "Litige à arbitrer",
          url: `/matchs/${disputedMatchId}`,
          waitingOn: "l'administrateur arrête le score définitif",
        },
        {
          label: "Créneau à proposer",
          url: `/matchs/${matchToPlanId}`,
          waitingOn: `${plannedHome.name} (receveur) propose, après un premier refus`,
        },
        {
          label: "Créneau à valider",
          url: `/matchs/${matchToAnswerId}`,
          waitingOn: `${awaitingAway.name} (visiteur) accepte ou refuse`,
        },
        {
          label: "Report à accepter",
          url: `/matchs/${matchToPostponeId}`,
          waitingOn: `${postponedAway.name} répond à la demande de ${postponedHome.name}`,
        },
      ],
      counts,
    };
  },
});

/** Ce que la commande affiche : les identifiants et de quoi savoir où regarder. */
type DevSeedReport = {
  password: string;
  accounts: { email: string; role: string; teams: string }[];
  seasonLabel: string;
  pastSeasonLabel: string;
  championships: { name: string; season: string; teams: number; matches: number }[];
  highlights: { label: string; url: string; waitingOn: string }[];
  counts: {
    clubs: number;
    players: number;
    licenses: number;
    teams: number;
    matches: number;
    completed: number;
  };
};

/** Équipes gérées par chaque responsable dans la saison courante, pour le rapport. */
const TEAMS_OF: Record<string, string> = Object.fromEntries(
  MANAGER_ACCOUNTS.map((account) => [
    account.key,
    [...DEPARTEMENTAL_TEAMS, ...LOISIRS_TEAMS]
      .filter((team) => (team.managers as string[]).includes(account.key))
      .map((team) => team.name)
      .join(", "),
  ]),
);

/** Purge puis reconstruit le jeu. Point d'entrée de `npx convex run seed:dev`. */
export const dev = internalAction({
  args: { password: v.optional(v.string()) },
  returns: v.object({
    password: v.string(),
    accounts: v.array(v.object({ email: v.string(), role: v.string(), teams: v.string() })),
    seasonLabel: v.string(),
    pastSeasonLabel: v.string(),
    championships: v.array(
      v.object({ name: v.string(), season: v.string(), teams: v.number(), matches: v.number() }),
    ),
    highlights: v.array(
      v.object({ label: v.string(), url: v.string(), waitingOn: v.string() }),
    ),
    counts: v.object({
      clubs: v.number(),
      players: v.number(),
      licenses: v.number(),
      teams: v.number(),
      matches: v.number(),
      completed: v.number(),
    }),
  }),
  handler: async (ctx, args): Promise<DevSeedReport> => {
    const password = args.password ?? DEFAULT_PASSWORD;
    if (password.length < 8) {
      throw new Error("Le mot de passe doit faire au moins 8 caractères.");
    }

    await ctx.runMutation(internal.seed.purge, {});

    const create = async (
      email: string,
      name: string,
      role: "player" | "manager" | "admin",
    ) => {
      const { user } = await createAccount<DataModel>(ctx, {
        provider: "password",
        account: { id: email, secret: password },
        profile: { email, name, role },
      });
      return user._id;
    };

    const adminId = await create(ADMIN_ACCOUNT.email, ADMIN_ACCOUNT.name, "admin");
    const managers = [];
    for (const account of MANAGER_ACCOUNTS) {
      managers.push({
        key: account.key,
        userId: await create(account.email, account.name, "manager"),
      });
    }
    const players = [];
    for (const account of PLAYER_ACCOUNTS) {
      players.push({
        email: account.email,
        userId: await create(account.email, account.name, "player"),
      });
    }

    const built = await ctx.runMutation(internal.seed.build, { adminId, managers, players });

    return {
      password,
      accounts: [
        { email: ADMIN_ACCOUNT.email, role: "admin", teams: "— (tous les championnats)" },
        ...MANAGER_ACCOUNTS.map((account) => ({
          email: account.email,
          role: "manager",
          teams: TEAMS_OF[account.key] ?? "—",
        })),
        ...PLAYER_ACCOUNTS.map((account) => ({
          email: account.email,
          role: "player",
          teams: "consultation seule",
        })),
      ],
      seasonLabel: built.seasonLabel,
      pastSeasonLabel: built.pastSeasonLabel,
      championships: built.championships,
      highlights: built.highlights,
      counts: built.counts,
    };
  },
});
