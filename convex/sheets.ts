import { ConvexError, v } from "convex/values";

import {
  forfeitScore,
  scoreFormatOf,
  validateMatchScore,
  type MatchFormat,
  type SetScore,
} from "../lib/rules/score";
import { parisParts } from "../lib/rules/paris-time";
import { sheetTacitDeadline } from "../lib/rules/tacit";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireAdmin } from "./authz";
import { assertBracketResultEditable } from "./bracket";
import { licenseStatus, newLicenseCache, statusAt, type LicenseCache } from "./licenses";
import { actorFor, sidesOf, transitionTo } from "./negotiation";
import {
  assessTeamLineup,
  candidateFor,
  newChampionshipCache,
  reinforcementInfo,
} from "./reinforcements";
import { reinforcementQuota } from "./schema";

type Ctx = QueryCtx | MutationCtx;

export const MAX_LINEUP_SIZE = 12;

const setScore = v.object({ home: v.number(), away: v.number() });

async function mustGetMatch(ctx: Ctx, matchId: Id<"matches">): Promise<Doc<"matches">> {
  const match = await ctx.db.get(matchId);
  if (match === null) {
    throw new ConvexError("Match inconnu.");
  }
  return match;
}

async function sheetOf(ctx: Ctx, matchId: Id<"matches">) {
  return await ctx.db
    .query("matchSheets")
    .withIndex("by_match", (q) => q.eq("matchId", matchId))
    .unique();
}

/** Format du championnat d'un match : il décide des règles de score. */
async function formatOf(ctx: Ctx, match: Doc<"matches">): Promise<MatchFormat> {
  const championship = await ctx.db.get(match.championshipId);
  if (championship === null) {
    throw new ConvexError("Championnat inconnu.");
  }
  return scoreFormatOf(championship.format);
}

/**
 * Valide le score selon le format du championnat et rend le résultat orienté receveur /
 * visiteur. Un match nul — plateau seulement — n'a pas de vainqueur.
 */
function resultFrom(match: Doc<"matches">, sets: SetScore[], format: MatchFormat) {
  const validation = validateMatchScore(sets, format);
  if (!validation.ok) {
    throw new ConvexError(validation.error.message);
  }
  const { outcome } = validation;
  return {
    winnerTeamId:
      outcome.winner === "draw"
        ? undefined
        : outcome.winner === "home"
          ? match.homeTeamId
          : match.awayTeamId,
    homeSets: outcome.homeSets,
    awaySets: outcome.awaySets,
    homePoints: outcome.homePoints,
    awayPoints: outcome.awayPoints,
  };
}

/**
 * Vérifie une composition.
 *
 * Au plus 12 joueurs, **aucun minimum** : jouer en sous-effectif est un désavantage
 * sportif, pas un motif de forfait. Une composition vide est en revanche refusée : c'est
 * une feuille non remplie.
 *
 * Tout licencié **du club** de l'équipe peut être aligné : un joueur hors de sa feuille
 * verte est un renfort, **signalé** et jamais refusé (ADR-0005). Restent des rejets ce qui
 * n'est pas une question sportive — un joueur d'un autre club, une licence non valide.
 *
 * Chaque joueur doit être **licencié à la date du match**, `playedAt` — et non à l'instant
 * de la saisie. Une feuille transcrite trois jours plus tard ne peut pas rejeter un joueur
 * régulièrement licencié le jour où il a joué, et à l'inverse une licence renouvelée après
 * coup ne régularise pas un match déjà joué.
 */
async function checkLineup(
  ctx: MutationCtx,
  teamId: Id<"teams">,
  playerIds: Id<"players">[],
  label: string,
  playedAt: number,
  licenses: LicenseCache,
) {
  if (playerIds.length === 0) {
    throw new ConvexError(
      `Composition ${label} vide : une feuille non remplie n'est pas un sous-effectif.`,
    );
  }
  if (playerIds.length > MAX_LINEUP_SIZE) {
    throw new ConvexError(
      `Composition ${label} : ${MAX_LINEUP_SIZE} joueurs au maximum sur une feuille de match.`,
    );
  }
  if (new Set(playerIds).size !== playerIds.length) {
    throw new ConvexError(`Composition ${label} : un joueur y figure deux fois.`);
  }
  const team = await ctx.db.get(teamId);
  if (team === null) {
    throw new ConvexError("Équipe inconnue.");
  }
  for (const playerId of playerIds) {
    const player = await ctx.db.get(playerId);
    if (player === null) {
      throw new ConvexError(`Composition ${label} : joueur inconnu.`);
    }
    const who = `${player.firstName} ${player.lastName}`;

    if (player.clubId !== team.clubId) {
      throw new ConvexError(
        `${who} n'est pas licencié au club de ${team.name} : un renfort vient de son ` +
          `propre club (composition ${label}).`,
      );
    }

    const license = await statusAt(ctx, playerId, playedAt, licenses);
    if (!license.isValid) {
      throw new ConvexError(
        license.validUntil === null
          ? `${who} n'a aucune licence : il ne peut pas être aligné (composition ${label}).`
          : `La licence de ${who} ne couvre pas la date du match — elle expirait le ` +
            `${formatLicenseDate(license.validUntil)} (composition ${label}).`,
      );
    }
  }
}

/** Vérifie les deux compositions d'une feuille, et qu'aucun joueur ne figure des deux côtés. */
async function checkLineups(
  ctx: MutationCtx,
  match: Doc<"matches">,
  playedAt: number,
  homeLineup: Id<"players">[],
  awayLineup: Id<"players">[],
) {
  const licenses = newLicenseCache();
  await checkLineup(ctx, match.homeTeamId, homeLineup, "receveur", playedAt, licenses);
  await checkLineup(ctx, match.awayTeamId, awayLineup, "visiteur", playedAt, licenses);
  if (homeLineup.some((playerId) => awayLineup.includes(playerId))) {
    throw new ConvexError(
      "Un même joueur figure dans les deux compositions du match : c'est une erreur de saisie.",
    );
  }
}

/** Réécrit entièrement les compositions d'un match : la feuille est un tout. */
async function writeLineups(
  ctx: MutationCtx,
  match: Doc<"matches">,
  homeLineup: Id<"players">[],
  awayLineup: Id<"players">[],
) {
  const previous = await ctx.db
    .query("lineupEntries")
    .withIndex("by_match", (q) => q.eq("matchId", match._id))
    .collect();
  for (const entry of previous) {
    await ctx.db.delete(entry._id);
  }
  for (const [teamId, lineup] of [
    [match.homeTeamId, homeLineup],
    [match.awayTeamId, awayLineup],
  ] as const) {
    for (const playerId of lineup) {
      await ctx.db.insert("lineupEntries", {
        matchId: match._id,
        matchdayId: match.matchdayId,
        teamId,
        playerId,
      });
    }
  }
}

/** Date en clair dans un message d'erreur : « 9 septembre 2026 », en heure de Paris. */
function formatLicenseDate(at: number): string {
  const { year, month, day } = parisParts(at);
  return `${day}/${String(month).padStart(2, "0")}/${year}`;
}

/**
 * Le receveur transcrit la feuille de match : score par set et compositions des **deux**
 * équipes (ADR-0003). Le visiteur valide ensuite l'ensemble en un seul geste.
 */
export const submit = mutation({
  args: {
    matchId: v.id("matches"),
    sets: v.array(setScore),
    homeLineup: v.array(v.id("players")),
    awayLineup: v.array(v.id("players")),
  },
  returns: v.object({ tacitDeadline: v.number() }),
  handler: async (ctx, args) => {
    const match = await mustGetMatch(ctx, args.matchId);
    const sides = await sidesOf(ctx, match);
    const to = transitionTo("submitSheet", match.state, actorFor(sides, "home"));

    const format = await formatOf(ctx, match);
    if (format === "plateau") {
      throw new ConvexError(
        "Sur un plateau, c'est l'administrateur qui saisit les résultats.",
      );
    }
    if (match.slot === undefined) {
      throw new ConvexError("Ce match n'a pas de créneau confirmé.");
    }
    if (Date.now() < match.slot.at) {
      throw new ConvexError(
        "Le match n'a pas encore eu lieu : la saisie ouvre à l'heure du créneau.",
      );
    }

    // Le score est validé avant les compositions : c'est l'erreur la plus fréquente.
    const result = resultFrom(match, args.sets, format);
    await checkLineups(ctx, match, match.slot.at, args.homeLineup, args.awayLineup);

    const deadline = sheetTacitDeadline(Date.now());
    const existing = await sheetOf(ctx, args.matchId);
    let sheetId: Id<"matchSheets">;
    if (existing === null) {
      sheetId = await ctx.db.insert("matchSheets", {
        matchId: args.matchId,
        sets: args.sets,
        submittedBy: sides.user._id,
        status: "pending",
        deadline,
      });
    } else {
      sheetId = existing._id;
      await ctx.db.patch(sheetId, {
        sets: args.sets,
        submittedBy: sides.user._id,
        status: "pending",
        deadline,
        disputeReason: undefined,
      });
    }

    await writeLineups(ctx, match, args.homeLineup, args.awayLineup);

    if (match.tacitJobId !== undefined) {
      await ctx.scheduler.cancel(match.tacitJobId);
    }
    const tacitJobId = await ctx.scheduler.runAt(
      deadline,
      internal.sheets.applyTacitSheet,
      { matchId: args.matchId, sheetId },
    );
    await ctx.db.patch(args.matchId, { state: to, tacitJobId });
    // `result` est calculé ici pour rejeter tout de suite un score impossible, mais n'est
    // écrit qu'à la validation : un match n'entre au classement qu'une fois la feuille
    // acceptée.
    void result;
    return { tacitDeadline: deadline };
  },
});

/** Le visiteur valide la feuille : le match est terminé et entre au classement. */
export const validate = mutation({
  args: { matchId: v.id("matches") },
  returns: v.null(),
  handler: async (ctx, { matchId }) => {
    const match = await mustGetMatch(ctx, matchId);
    const sides = await sidesOf(ctx, match);
    const to = transitionTo("validateSheet", match.state, actorFor(sides, "away"));

    const sheet = await sheetOf(ctx, matchId);
    if (sheet === null || sheet.status !== "pending") {
      throw new ConvexError("Aucune feuille de match en attente.");
    }
    if (sheet.submittedBy === sides.user._id && !sides.isAdmin) {
      throw new ConvexError(
        "Vous ne pouvez pas valider votre propre feuille : elle revient à l'équipe adverse.",
      );
    }

    if (match.tacitJobId !== undefined) {
      await ctx.scheduler.cancel(match.tacitJobId);
    }
    await ctx.db.patch(sheet._id, { status: "validated", deadline: undefined });
    await ctx.db.patch(matchId, {
      state: to,
      result: resultFrom(match, sheet.sets, await formatOf(ctx, match)),
      tacitJobId: undefined,
    });
    return null;
  },
});

/** Le visiteur conteste la feuille : le match passe en litige, l'administrateur tranchera. */
export const dispute = mutation({
  args: { matchId: v.id("matches"), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, { matchId, reason }) => {
    const match = await mustGetMatch(ctx, matchId);
    const sides = await sidesOf(ctx, match);
    const to = transitionTo("disputeSheet", match.state, actorFor(sides, "away"));

    const sheet = await sheetOf(ctx, matchId);
    if (sheet === null || sheet.status !== "pending") {
      throw new ConvexError("Aucune feuille de match en attente.");
    }
    if (sheet.submittedBy === sides.user._id && !sides.isAdmin) {
      throw new ConvexError("Vous ne pouvez pas contester votre propre feuille.");
    }
    if (reason.trim() === "") {
      throw new ConvexError("Le motif de contestation est obligatoire.");
    }

    if (match.tacitJobId !== undefined) {
      await ctx.scheduler.cancel(match.tacitJobId);
    }
    await ctx.db.patch(sheet._id, {
      status: "disputed",
      disputeReason: reason.trim(),
      deadline: undefined,
    });
    await ctx.db.patch(matchId, { state: to, tacitJobId: undefined });
    return null;
  },
});

/** Validation tacite de la feuille, à l'échéance programmée. */
export const applyTacitSheet = internalMutation({
  args: { matchId: v.id("matches"), sheetId: v.id("matchSheets") },
  returns: v.null(),
  handler: async (ctx, { matchId, sheetId }) => {
    const match = await ctx.db.get(matchId);
    const sheet = await ctx.db.get(sheetId);
    if (match === null || sheet === null) {
      return null;
    }
    if (
      sheet.matchId !== matchId ||
      sheet.status !== "pending" ||
      match.state !== "awaitingSheet"
    ) {
      return null;
    }
    await ctx.db.patch(sheetId, { status: "validated", deadline: undefined });
    await ctx.db.patch(matchId, {
      state: "completed",
      result: resultFrom(match, sheet.sets, await formatOf(ctx, match)),
      tacitJobId: undefined,
    });
    return null;
  },
});

/** L'administrateur arrête le score d'un match en litige. */
export const settleDispute = mutation({
  args: { matchId: v.id("matches"), sets: v.array(setScore) },
  returns: v.null(),
  handler: async (ctx, { matchId, sets }) => {
    const admin = await requireAdmin(ctx);
    const match = await mustGetMatch(ctx, matchId);
    const to = transitionTo("settleDispute", match.state, "admin");

    const sheet = await sheetOf(ctx, matchId);
    if (sheet === null) {
      throw new ConvexError("Aucune feuille de match à arbitrer.");
    }
    const result = resultFrom(match, sets, await formatOf(ctx, match));
    await ctx.db.patch(sheet._id, {
      sets,
      status: "validated",
      settledBy: admin._id,
      deadline: undefined,
    });
    await ctx.db.patch(matchId, { state: to, result, tacitJobId: undefined });
    return null;
  },
});

/**
 * L'administrateur prononce un forfait.
 *
 * Un match forfait est un match **terminé** portant l'équipe défaillante : le classement
 * n'a aucun cas particulier à connaître. Le score conventionnel est matérialisé (3 sets
 * à 25-0, 2 en plateau), de sorte que les ratios restent comparables entre équipes.
 */
export const forfeit = mutation({
  args: { matchId: v.id("matches"), forfeitingTeamId: v.id("teams") },
  returns: v.null(),
  handler: async (ctx, { matchId, forfeitingTeamId }) => {
    const admin = await requireAdmin(ctx);
    const match = await mustGetMatch(ctx, matchId);
    const to = transitionTo("forfeit", match.state, "admin");

    if (
      forfeitingTeamId !== match.homeTeamId &&
      forfeitingTeamId !== match.awayTeamId
    ) {
      throw new ConvexError("Cette équipe ne joue pas ce match.");
    }
    const homeForfeits = forfeitingTeamId === match.homeTeamId;
    const format = await formatOf(ctx, match);
    const sets = forfeitScore(format).map((set) =>
      homeForfeits ? { home: set.away, away: set.home } : set,
    );
    const result = resultFrom(match, sets, format);

    if (match.tacitJobId !== undefined) {
      await ctx.scheduler.cancel(match.tacitJobId);
    }
    const existing = await sheetOf(ctx, matchId);
    if (existing === null) {
      await ctx.db.insert("matchSheets", {
        matchId,
        sets,
        submittedBy: admin._id,
        status: "validated",
        settledBy: admin._id,
      });
    } else {
      await ctx.db.patch(existing._id, {
        sets,
        status: "validated",
        settledBy: admin._id,
        deadline: undefined,
      });
    }
    await ctx.db.patch(matchId, {
      state: to,
      result,
      forfeitAgainst: forfeitingTeamId,
      tacitJobId: undefined,
    });
    return null;
  },
});

/** L'administrateur corrige la feuille d'un match déjà terminé. */
export const correct = mutation({
  args: { matchId: v.id("matches"), sets: v.array(setScore) },
  returns: v.null(),
  handler: async (ctx, { matchId, sets }) => {
    const admin = await requireAdmin(ctx);
    const match = await mustGetMatch(ctx, matchId);
    if (match.state !== "completed") {
      throw new ConvexError("Seule la feuille d'un match terminé se corrige.");
    }
    const sheet = await sheetOf(ctx, matchId);
    if (sheet === null) {
      throw new ConvexError("Ce match n'a pas de feuille.");
    }
    const result = resultFrom(match, sets, await formatOf(ctx, match));
    await assertBracketResultEditable(ctx, match, result.winnerTeamId);
    await ctx.db.patch(sheet._id, { sets, settledBy: admin._id });
    await ctx.db.patch(matchId, { result, forfeitAgainst: undefined });
    return null;
  },
});

/**
 * L'administrateur saisit lui-même le score et les compositions, et le match est
 * **terminé** d'emblée — ni validation du visiteur, ni échéance tacite.
 *
 * C'est la règle sur un plateau. Ailleurs, c'est son droit : il saisit à la place du
 * receveur, remplace une feuille en attente de validation, ou **corrige** une feuille déjà
 * terminée — score et compositions. Un forfait corrigé en résultat joué cesse d'être un
 * forfait.
 *
 * Les règles de composition sont les mêmes qu'ailleurs : licence à la date du match,
 * joueurs du club, renforts signalés.
 */
export const record = mutation({
  args: {
    matchId: v.id("matches"),
    sets: v.array(setScore),
    homeLineup: v.array(v.id("players")),
    awayLineup: v.array(v.id("players")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const match = await mustGetMatch(ctx, args.matchId);
    const format = await formatOf(ctx, match);
    const to = transitionTo("recordResult", match.state, "admin");
    if (match.slot === undefined) {
      throw new ConvexError("Ce match n'a pas de créneau : fixez-le d'abord.");
    }
    if (Date.now() < match.slot.at) {
      throw new ConvexError(
        "Le match n'a pas encore eu lieu : la saisie ouvre à l'heure du créneau.",
      );
    }

    const result = resultFrom(match, args.sets, format);
    await checkLineups(ctx, match, match.slot.at, args.homeLineup, args.awayLineup);
    if (match.state === "completed") {
      await assertBracketResultEditable(ctx, match, result.winnerTeamId);
    }
    if (match.tacitJobId !== undefined) {
      await ctx.scheduler.cancel(match.tacitJobId);
    }

    const existing = await sheetOf(ctx, args.matchId);
    const sheet = {
      sets: args.sets,
      submittedBy: admin._id,
      status: "validated" as const,
      settledBy: admin._id,
      deadline: undefined,
      disputeReason: undefined,
    };
    if (existing === null) {
      await ctx.db.insert("matchSheets", { matchId: args.matchId, ...sheet });
    } else {
      await ctx.db.patch(existing._id, sheet);
    }
    await writeLineups(ctx, match, args.homeLineup, args.awayLineup);
    await ctx.db.patch(args.matchId, {
      state: to,
      result,
      tacitJobId: undefined,
      forfeitAgainst: undefined,
    });
    return null;
  },
});

const lineupPlayer = v.object({
  _id: v.id("players"),
  name: v.string(),
  reinforcement: reinforcementInfo,
});

/**
 * Feuille de match d'un match, compositions incluses, avec la situation de chaque joueur
 * vis-à-vis de sa feuille verte et les **signalements** de renfort.
 *
 * Nominatif, et les signalements relèvent du déroulé administratif : réservé aux
 * responsables des deux équipes et aux administrateurs. Les scores publics passent par
 * `publicResult`, qui ne renvoie aucun signalement.
 */
export const get = query({
  args: { matchId: v.id("matches") },
  returns: v.union(
    v.object({
      sets: v.array(setScore),
      status: v.union(v.literal("pending"), v.literal("validated"), v.literal("disputed")),
      deadline: v.union(v.number(), v.null()),
      disputeReason: v.union(v.string(), v.null()),
      submittedByMe: v.boolean(),
      homeLineup: v.array(lineupPlayer),
      awayLineup: v.array(lineupPlayer),
      quota: v.union(reinforcementQuota, v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, { matchId }) => {
    const match = await mustGetMatch(ctx, matchId);
    const sides = await sidesOf(ctx, match);
    const sheet = await sheetOf(ctx, matchId);
    if (sheet === null) {
      return null;
    }
    const championship = await ctx.db.get(match.championshipId);
    const entries = await ctx.db
      .query("lineupEntries")
      .withIndex("by_match", (q) => q.eq("matchId", matchId))
      .collect();
    const cache = newChampionshipCache();

    const forTeam = async (teamId: Id<"teams">) => {
      const playerIds = entries
        .filter((entry) => entry.teamId === teamId)
        .map((entry) => entry.playerId);
      const assessed = await assessTeamLineup(ctx, match, teamId, playerIds, cache);
      const rows = await Promise.all(
        playerIds.map(async (playerId) => {
          const player = await ctx.db.get(playerId);
          const assessment = assessed.get(playerId);
          return {
            _id: playerId,
            name: player === null ? "Joueur supprimé" : `${player.firstName} ${player.lastName}`,
            reinforcement: {
              kind: assessment?.kind ?? ("own" as const),
              flags: assessment?.flags ?? [],
              upperMatchNumber: assessment?.upperMatchNumber ?? 0,
              originTeamName: assessment?.originTeamName ?? null,
            },
          };
        }),
      );
      return rows.sort((a, b) => a.name.localeCompare(b.name, "fr"));
    };

    return {
      sets: sheet.sets,
      status: sheet.status,
      deadline: sheet.deadline ?? null,
      disputeReason: sheet.disputeReason ?? null,
      submittedByMe: sheet.submittedBy === sides.user._id,
      homeLineup: await forTeam(match.homeTeamId),
      awayLineup: await forTeam(match.awayTeamId),
      quota: championship?.reinforcementQuota ?? null,
    };
  },
});

/**
 * Les licenciés alignables par une équipe sur un match : **tout son club**, avec pour
 * chacun la licence à la date du match et de quoi le classer comme renfort.
 *
 * L'écran de composition s'en sert pour annoncer les signalements au fil des cases cochées
 * — le classement final dépend de toute la composition (le quota du mixte), il est donc
 * recalculé côté client par la même fonction pure que côté serveur. Convex reste seul juge
 * des rejets, et seul auteur des signalements enregistrés.
 *
 * `previousOnMatchday` : la composition de l'équipe sur son dernier match saisi de la même
 * journée, pour reprendre par défaut celle du plateau.
 */
export const lineupCandidates = query({
  args: { matchId: v.id("matches"), teamId: v.id("teams") },
  returns: v.object({
    context: v.object({
      teamId: v.id("teams"),
      level: v.number(),
      quota: v.union(reinforcementQuota, v.null()),
    }),
    players: v.array(
      v.object({
        _id: v.id("players"),
        firstName: v.string(),
        lastName: v.string(),
        license: licenseStatus,
        originTeamId: v.union(v.id("teams"), v.null()),
        originTeamName: v.union(v.string(), v.null()),
        originLevel: v.union(v.number(), v.null()),
        upperMatchesBefore: v.number(),
      }),
    ),
    previousOnMatchday: v.array(v.id("players")),
  }),
  handler: async (ctx, { matchId, teamId }) => {
    const match = await mustGetMatch(ctx, matchId);
    await sidesOf(ctx, match);
    if (teamId !== match.homeTeamId && teamId !== match.awayTeamId) {
      throw new ConvexError("Cette équipe ne joue pas ce match.");
    }
    const team = await ctx.db.get(teamId);
    const championship = await ctx.db.get(match.championshipId);
    if (team === null || championship === null) {
      throw new ConvexError("Équipe ou championnat inconnu.");
    }

    const players = await ctx.db
      .query("players")
      .withIndex("by_club", (q) => q.eq("clubId", team.clubId))
      .collect();
    const at = match.slot?.at ?? Date.now();
    const licenses = newLicenseCache();
    const cache = newChampionshipCache();
    const rows = await Promise.all(
      players.map(async (player) => {
        const candidate = await candidateFor(ctx, player._id, championship, match, cache);
        return {
          _id: player._id,
          firstName: player.firstName,
          lastName: player.lastName,
          license: await statusAt(ctx, player._id, at, licenses),
          originTeamId: candidate.originTeamId as Id<"teams"> | null,
          originTeamName: candidate.originTeamName,
          originLevel: candidate.originLevel,
          upperMatchesBefore: candidate.upperMatchesBefore,
        };
      }),
    );

    // Dernière composition de l'équipe sur un autre match de la même journée.
    const sameDay = await ctx.db
      .query("lineupEntries")
      .withIndex("by_matchday", (q) => q.eq("matchdayId", match.matchdayId))
      .collect();
    const ofTeam = sameDay.filter(
      (entry) => entry.teamId === teamId && entry.matchId !== matchId,
    );
    const latestMatchId = ofTeam.reduce<Doc<"lineupEntries"> | null>(
      (latest, entry) =>
        latest === null || entry._creationTime > latest._creationTime ? entry : latest,
      null,
    )?.matchId;
    const previousOnMatchday = ofTeam
      .filter((entry) => entry.matchId === latestMatchId)
      .map((entry) => entry.playerId);

    // Feuille verte d'abord, puis renforts, chacun par ordre alphabétique.
    rows.sort(
      (a, b) =>
        Number(b.originTeamId === teamId) - Number(a.originTeamId === teamId) ||
        a.lastName.localeCompare(b.lastName, "fr") ||
        a.firstName.localeCompare(b.firstName, "fr"),
    );

    return {
      context: {
        teamId,
        level: championship.level,
        quota: championship.reinforcementQuota ?? null,
      },
      players: rows,
      previousOnMatchday,
    };
  },
});

/**
 * Score set par set et compositions d'un match **terminé**, en lecture publique.
 *
 * C'est la seule query publique qui renvoie des noms de personnes physiques : décision
 * assumée, voir [ADR-0004](../docs/adr/0004-feuilles-de-match-publiques.md).
 *
 * Deux restrictions volontaires :
 *
 * - seul un match terminé est exposé — publier un score encore en attente de validation ou
 *   contesté afficherait un résultat susceptible de changer ;
 * - rien du déroulé administratif ne sort ici (motif de contestation, auteur de la saisie,
 *   échéance) : ça reste réservé aux responsables via `sheets.get`.
 */
export const publicResult = query({
  args: { matchId: v.id("matches") },
  returns: v.union(
    v.object({
      sets: v.array(setScore),
      isForfeit: v.boolean(),
      homeLineup: v.array(v.object({ _id: v.id("players"), name: v.string() })),
      awayLineup: v.array(v.object({ _id: v.id("players"), name: v.string() })),
    }),
    v.null(),
  ),
  handler: async (ctx, { matchId }) => {
    const match = await ctx.db.get(matchId);
    if (match === null || match.state !== "completed") {
      return null;
    }
    const sheet = await sheetOf(ctx, matchId);
    if (sheet === null || sheet.status !== "validated") {
      return null;
    }

    const entries = await ctx.db
      .query("lineupEntries")
      .withIndex("by_match", (q) => q.eq("matchId", matchId))
      .collect();
    const named = await Promise.all(
      entries.map(async (entry) => {
        const player = await ctx.db.get(entry.playerId);
        return {
          teamId: entry.teamId,
          _id: entry.playerId,
          name:
            player === null ? "Joueur supprimé" : `${player.firstName} ${player.lastName}`,
        };
      }),
    );
    const forTeam = (teamId: Id<"teams">) =>
      named
        .filter((entry) => entry.teamId === teamId)
        .map(({ _id, name }) => ({ _id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, "fr"));

    return {
      sets: sheet.sets,
      isForfeit: match.forfeitAgainst !== undefined,
      homeLineup: forTeam(match.homeTeamId),
      awayLineup: forTeam(match.awayTeamId),
    };
  },
});
