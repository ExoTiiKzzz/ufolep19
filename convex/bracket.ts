import { ConvexError, v } from "convex/values";

import {
  groupDemand,
  rangeAfter,
  rangeLabel,
  roundCount,
  type Outcome,
  type PlaceRange,
} from "../lib/rules/bracket";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireAdmin } from "./authz";

/**
 * Tableau de classement intégral — la coupe (ADR-0007).
 *
 * Les règles de calcul vivent dans `lib/rules/bracket.ts`. Ce module les applique aux données :
 * il reconstitue le parcours de chaque équipe à partir des matchs terminés et des exempts, et
 * refuse ce qui casserait le tableau — deux groupes mêlés, une équipe deux fois dans un tour,
 * un tour précédent pas terminé, plus d'exempts ou de matchs que le groupe n'en exige.
 *
 * Un tour est une journée : son numéro est celui de la journée.
 */

type Ctx = QueryCtx | MutationCtx;

/** Tout ce qu'il faut pour raisonner sur un tableau, lu une fois. */
type BracketState = {
  championship: Doc<"championships">;
  teams: Doc<"teams">[];
  teamCount: number;
  rounds: number;
  matchdays: Doc<"matchdays">[];
  matches: Doc<"matches">[];
  byes: Doc<"byes">[];
  /** Numéro de tour de chaque journée. */
  roundOf: Map<Id<"matchdays">, number>;
};

async function loadState(ctx: Ctx, championshipId: Id<"championships">): Promise<BracketState> {
  const championship = await ctx.db.get(championshipId);
  if (championship === null) {
    throw new ConvexError("Championnat inconnu.");
  }
  const [teams, matchdays, matches, byes] = await Promise.all([
    ctx.db
      .query("teams")
      .withIndex("by_championship", (q) => q.eq("championshipId", championshipId))
      .collect(),
    ctx.db
      .query("matchdays")
      .withIndex("by_championship", (q) => q.eq("championshipId", championshipId))
      .collect(),
    ctx.db
      .query("matches")
      .withIndex("by_championship", (q) => q.eq("championshipId", championshipId))
      .collect(),
    ctx.db
      .query("byes")
      .withIndex("by_championship", (q) => q.eq("championshipId", championshipId))
      .collect(),
  ]);
  return {
    championship,
    teams,
    teamCount: teams.length,
    rounds: roundCount(teams.length),
    matchdays,
    matches,
    byes,
    roundOf: new Map(matchdays.map((day) => [day._id, day.number])),
  };
}

/** Ce qui engage une équipe à un tour : un match, quel que soit son état, ou un exempt. */
type Engagement =
  | { kind: "match"; match: Doc<"matches"> }
  | { kind: "bye"; bye: Doc<"byes"> };

function engagementAt(
  state: BracketState,
  teamId: Id<"teams">,
  round: number,
  exclude?: Id<"matches">,
): Engagement | null {
  const match = state.matches.find(
    (row) =>
      row._id !== exclude &&
      state.roundOf.get(row.matchdayId) === round &&
      (row.homeTeamId === teamId || row.awayTeamId === teamId),
  );
  if (match !== undefined) {
    return { kind: "match", match };
  }
  const bye = state.byes.find(
    (row) => row.teamId === teamId && state.roundOf.get(row.matchdayId) === round,
  );
  return bye === undefined ? null : { kind: "bye", bye };
}

/** Issue d'une équipe à un tour, ou `null` tant qu'elle n'est pas acquise. */
function outcomeAt(state: BracketState, teamId: Id<"teams">, round: number): Outcome | null {
  const engagement = engagementAt(state, teamId, round);
  if (engagement === null) {
    return null;
  }
  if (engagement.kind === "bye") {
    return "bye";
  }
  const { match } = engagement;
  // Seul un match terminé fait avancer : un litige ne fait avancer personne.
  if (match.state !== "completed" || match.result === undefined) {
    return null;
  }
  return match.result.winnerTeamId === teamId ? "won" : "lost";
}

/** Le parcours acquis d'une équipe : ses issues consécutives depuis le tour 1. */
function pathOf(state: BracketState, teamId: Id<"teams">): Outcome[] {
  const path: Outcome[] = [];
  for (let round = 1; round <= state.rounds; round++) {
    const outcome = outcomeAt(state, teamId, round);
    if (outcome === null) {
      break;
    }
    path.push(outcome);
  }
  return path;
}

function teamName(state: BracketState, teamId: Id<"teams">): string {
  return state.teams.find((team) => team._id === teamId)?.name ?? "?";
}

/**
 * Le groupe d'une équipe au tour `round` — son bloc de places —, ou une erreur qui dit
 * pourquoi on ne le connaît pas encore.
 */
function groupAt(state: BracketState, teamId: Id<"teams">, round: number): PlaceRange {
  const path = pathOf(state, teamId);
  if (path.length < round - 1) {
    const missing = path.length + 1;
    const engagement = engagementAt(state, teamId, missing);
    const name = teamName(state, teamId);
    throw new ConvexError(
      engagement === null
        ? `${name} n'a encore ni match ni exempt au tour ${missing} : son groupe au tour ${round} n'est pas connu.`
        : `Le match du tour ${missing} de ${name} n'est pas terminé : son groupe au tour ${round} n'est pas connu.`,
    );
  }
  return rangeAfter(path.slice(0, round - 1), state.teamCount);
}

function sameRange(a: PlaceRange, b: PlaceRange): boolean {
  return a.from === b.from && a.to === b.to;
}

/** Tour d'une journée de tableau, refusé s'il sort du tableau. */
function roundOfMatchday(state: BracketState, matchday: Doc<"matchdays">): number {
  if (matchday.number < 1 || matchday.number > state.rounds) {
    throw new ConvexError(
      `Un tableau de ${state.teamCount} équipes se joue en ${state.rounds} tours : ` +
        `la journée ${matchday.number} n'en est pas un.`,
    );
  }
  return matchday.number;
}

/** Ce que le groupe a déjà : ses matchs et ses exempts au tour. */
function groupContent(state: BracketState, range: PlaceRange, round: number, exclude?: Id<"matches">) {
  const inGroup = (teamId: Id<"teams">) => {
    try {
      return sameRange(groupAt(state, teamId, round), range);
    } catch {
      return false;
    }
  };
  return {
    matches: state.matches.filter(
      (match) =>
        match._id !== exclude &&
        state.roundOf.get(match.matchdayId) === round &&
        inGroup(match.homeTeamId),
    ),
    byes: state.byes.filter(
      (bye) => state.roundOf.get(bye.matchdayId) === round && inGroup(bye.teamId),
    ),
  };
}

/** Une équipe ne s'engage qu'une fois par tour. */
function assertFree(
  state: BracketState,
  teamId: Id<"teams">,
  round: number,
  exclude?: Id<"matches">,
) {
  if (engagementAt(state, teamId, round, exclude) !== null) {
    throw new ConvexError(`${teamName(state, teamId)} est déjà engagée au tour ${round}.`);
  }
}

/**
 * Contrôle un match de tableau avant sa création ou sa correction : même groupe, tour
 * précédent terminé, personne deux fois dans le tour, et pas plus de matchs que le groupe
 * n'en exige.
 */
export async function assertBracketMatch(
  ctx: Ctx,
  matchday: Doc<"matchdays">,
  homeTeamId: Id<"teams">,
  awayTeamId: Id<"teams">,
  exclude?: Id<"matches">,
) {
  const state = await loadState(ctx, matchday.championshipId);
  const round = roundOfMatchday(state, matchday);
  const homeRange = groupAt(state, homeTeamId, round);
  const awayRange = groupAt(state, awayTeamId, round);
  if (!sameRange(homeRange, awayRange)) {
    throw new ConvexError(
      `${teamName(state, homeTeamId)} dispute les ${rangeLabel(homeRange)}, ` +
        `${teamName(state, awayTeamId)} les ${rangeLabel(awayRange)} : ` +
        "elles ne sont pas du même groupe.",
    );
  }
  assertFree(state, homeTeamId, round, exclude);
  assertFree(state, awayTeamId, round, exclude);
  const demand = groupDemand(homeRange, state.teamCount);
  const content = groupContent(state, homeRange, round, exclude);
  if (content.matches.length >= demand.matches) {
    throw new ConvexError(
      `Le groupe des ${rangeLabel(homeRange)} a déjà ses ${demand.matches} match(s) au tour ${round}` +
        (demand.byes > content.byes.length
          ? ` : il lui reste ${demand.byes - content.byes.length} exempt(s) à désigner.`
          : "."),
    );
  }
}

/** Le tableau est figé dès son premier match ou exempt : sa taille ne bouge plus. */
export async function isBracketFrozen(
  ctx: Ctx,
  championshipId: Id<"championships">,
): Promise<boolean> {
  const [match, bye] = await Promise.all([
    ctx.db
      .query("matches")
      .withIndex("by_championship", (q) => q.eq("championshipId", championshipId))
      .first(),
    ctx.db
      .query("byes")
      .withIndex("by_championship", (q) => q.eq("championshipId", championshipId))
      .first(),
  ]);
  return match !== null || bye !== null;
}

/**
 * Un résultat de tableau ne change plus de vainqueur une fois le tour suivant engagé pour
 * l'une des deux équipes : leurs rencontres suivantes reposent sur lui.
 */
export async function assertBracketResultEditable(
  ctx: Ctx,
  match: Doc<"matches">,
  nextWinner: Id<"teams"> | undefined,
) {
  const championship = await ctx.db.get(match.championshipId);
  if (championship?.format !== "tableau" || match.result?.winnerTeamId === nextWinner) {
    return;
  }
  const state = await loadState(ctx, match.championshipId);
  const round = state.roundOf.get(match.matchdayId) ?? 0;
  for (const teamId of [match.homeTeamId, match.awayTeamId]) {
    if (engagementAt(state, teamId, round + 1) !== null) {
      throw new ConvexError(
        `${teamName(state, teamId)} est déjà engagée au tour ${round + 1} sur ce résultat : ` +
          "changer de vainqueur casserait le tableau. Retirez d'abord ses engagements du tour suivant.",
      );
    }
  }
}

/** Un match de tableau ne se supprime plus une fois le tour suivant engagé sur lui. */
export async function assertBracketMatchRemovable(ctx: Ctx, match: Doc<"matches">) {
  const championship = await ctx.db.get(match.championshipId);
  if (championship?.format !== "tableau") {
    return;
  }
  const state = await loadState(ctx, match.championshipId);
  const round = state.roundOf.get(match.matchdayId) ?? 0;
  for (const teamId of [match.homeTeamId, match.awayTeamId]) {
    if (engagementAt(state, teamId, round + 1) !== null) {
      throw new ConvexError(
        `${teamName(state, teamId)} est déjà engagée au tour ${round + 1} sur ce match : ` +
          "retirez d'abord ses engagements du tour suivant.",
      );
    }
  }
}

async function mustGetTableauMatchday(ctx: Ctx, matchdayId: Id<"matchdays">) {
  const matchday = await ctx.db.get(matchdayId);
  if (matchday === null) {
    throw new ConvexError("Tour inconnu.");
  }
  const championship = await ctx.db.get(matchday.championshipId);
  if (championship?.format !== "tableau") {
    throw new ConvexError("Seul un championnat au format tableau a des exempts.");
  }
  return matchday;
}

/**
 * Déclare une équipe exempte pour un tour : elle gagne par forfait de la place vide qui lui
 * est opposée. Le **choix** de l'équipe revient à l'administrateur ; seul le **nombre**
 * d'exempts du groupe est contrôlé, parce qu'il découle des places vides (ADR-0007).
 */
export const declareBye = mutation({
  args: { matchdayId: v.id("matchdays"), teamId: v.id("teams") },
  returns: v.id("byes"),
  handler: async (ctx, { matchdayId, teamId }) => {
    await requireAdmin(ctx);
    const matchday = await mustGetTableauMatchday(ctx, matchdayId);
    const team = await ctx.db.get(teamId);
    if (team === null || team.championshipId !== matchday.championshipId) {
      throw new ConvexError("Cette équipe n'est pas engagée dans ce tableau.");
    }
    const state = await loadState(ctx, matchday.championshipId);
    const round = roundOfMatchday(state, matchday);
    const range = groupAt(state, teamId, round);
    assertFree(state, teamId, round);
    const demand = groupDemand(range, state.teamCount);
    const content = groupContent(state, range, round);
    if (content.byes.length >= demand.byes) {
      throw new ConvexError(
        demand.byes === 0
          ? `Le groupe des ${rangeLabel(range)} n'a aucune place vide au tour ${round} : personne n'y est exempt.`
          : `Le groupe des ${rangeLabel(range)} a déjà ses ${demand.byes} exempt(s) au tour ${round}.`,
      );
    }
    return await ctx.db.insert("byes", {
      championshipId: matchday.championshipId,
      matchdayId,
      teamId,
    });
  },
});

/** Annule une exemption, tant que l'équipe n'est pas engagée au tour suivant. */
export const cancelBye = mutation({
  args: { byeId: v.id("byes") },
  returns: v.null(),
  handler: async (ctx, { byeId }) => {
    await requireAdmin(ctx);
    const bye = await ctx.db.get(byeId);
    if (bye === null) {
      throw new ConvexError("Exemption inconnue.");
    }
    const state = await loadState(ctx, bye.championshipId);
    const round = state.roundOf.get(bye.matchdayId) ?? 0;
    if (engagementAt(state, bye.teamId, round + 1) !== null) {
      throw new ConvexError(
        `${teamName(state, bye.teamId)} est déjà engagée au tour ${round + 1} sur cette exemption.`,
      );
    }
    await ctx.db.delete(byeId);
    return null;
  },
});

const teamRef = v.object({ _id: v.id("teams"), name: v.string(), clubName: v.string() });

async function teamRefs(ctx: Ctx, teams: Doc<"teams">[]) {
  const clubs = new Map<string, string>();
  return await Promise.all(
    teams.map(async (team) => {
      if (!clubs.has(team.clubId)) {
        clubs.set(team.clubId, (await ctx.db.get(team.clubId))?.name ?? "");
      }
      return { _id: team._id, name: team.name, clubName: clubs.get(team.clubId) ?? "" };
    }),
  );
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "fr");

/**
 * Plan d'un tour, pour l'administrateur qui forme les rencontres : groupe par groupe, ce
 * qu'il exige (exempts et matchs), ce qui est déjà fait, et les équipes qui restent à
 * apparier. Les équipes dont le tour précédent n'est pas terminé sont listées à part : leur
 * groupe n'est pas encore connu.
 */
export const tourPlan = query({
  args: { matchdayId: v.id("matchdays") },
  returns: v.object({
    round: v.number(),
    rounds: v.number(),
    bracketSize: v.number(),
    teamCount: v.number(),
    groups: v.array(
      v.object({
        from: v.number(),
        to: v.number(),
        label: v.string(),
        real: v.number(),
        byesRequired: v.number(),
        matchesRequired: v.number(),
        byes: v.array(v.object({ _id: v.id("byes"), team: teamRef })),
        matches: v.array(
          v.object({ _id: v.id("matches"), home: teamRef, away: teamRef, state: v.string() }),
        ),
        available: v.array(teamRef),
        waiting: v.number(),
      }),
    ),
    waiting: v.array(teamRef),
  }),
  handler: async (ctx, { matchdayId }) => {
    await requireAdmin(ctx);
    const matchday = await mustGetTableauMatchday(ctx, matchdayId);
    const state = await loadState(ctx, matchday.championshipId);
    const round = roundOfMatchday(state, matchday);
    const refs = new Map(
      (await teamRefs(ctx, state.teams)).map((ref) => [ref._id as string, ref]),
    );
    const ref = (teamId: Id<"teams">) => refs.get(teamId)!;

    const groups = new Map<number, { range: PlaceRange; teams: Id<"teams">[] }>();
    const waiting: Id<"teams">[] = [];
    for (const team of state.teams) {
      const path = pathOf(state, team._id);
      if (path.length < round - 1) {
        waiting.push(team._id);
        continue;
      }
      const range = rangeAfter(path.slice(0, round - 1), state.teamCount);
      const group = groups.get(range.from) ?? { range, teams: [] };
      group.teams.push(team._id);
      groups.set(range.from, group);
    }

    return {
      round,
      rounds: state.rounds,
      bracketSize: 2 ** state.rounds,
      teamCount: state.teamCount,
      groups: [...groups.values()]
        .sort((a, b) => a.range.from - b.range.from)
        .map(({ range, teams }) => {
          const demand = groupDemand(range, state.teamCount);
          const content = groupContent(state, range, round);
          return {
            from: range.from,
            to: range.to,
            label: rangeLabel(range),
            real: demand.real,
            byesRequired: demand.byes,
            matchesRequired: demand.matches,
            byes: content.byes.map((bye) => ({ _id: bye._id, team: ref(bye.teamId) })),
            matches: content.matches.map((match) => ({
              _id: match._id,
              home: ref(match.homeTeamId),
              away: ref(match.awayTeamId),
              state: match.state,
            })),
            available: teams
              .filter((teamId) => engagementAt(state, teamId, round) === null)
              .map(ref)
              .sort(byName),
            // Équipes du groupe dont le tour précédent n'est pas encore acquis.
            waiting: demand.real - teams.length,
          };
        }),
      waiting: waiting.map(ref).sort(byName),
    };
  },
});

/**
 * Classement d'un tableau : pour chaque équipe, son parcours tour par tour et le bloc de
 * places qu'elle dispute encore — sa place, une fois tous ses tours joués. Une équipe avance
 * dès que **son** match est terminé. Lecture publique : rien de nominatif.
 */
export const standings = query({
  args: { championshipId: v.id("championships") },
  returns: v.object({
    rounds: v.number(),
    rows: v.array(
      v.object({
        team: teamRef,
        clubLogoUrl: v.union(v.string(), v.null()),
        path: v.array(v.union(v.literal("won"), v.literal("lost"), v.literal("bye"))),
        from: v.number(),
        to: v.number(),
        label: v.string(),
        final: v.boolean(),
      }),
    ),
  }),
  handler: async (ctx, { championshipId }) => {
    const state = await loadState(ctx, championshipId);
    const refs = await teamRefs(ctx, state.teams);
    const logos = new Map<string, string | null>();
    for (const team of state.teams) {
      if (!logos.has(team.clubId)) {
        const club = await ctx.db.get(team.clubId);
        logos.set(
          team.clubId,
          club?.logoId === undefined ? null : await ctx.storage.getUrl(club.logoId),
        );
      }
    }
    const rows = state.teams.map((team, index) => {
      const path = pathOf(state, team._id);
      const range = rangeAfter(path, state.teamCount);
      return {
        team: refs[index],
        clubLogoUrl: logos.get(team.clubId) ?? null,
        path,
        from: range.from,
        to: range.to,
        label: rangeLabel(range),
        final: range.from === range.to,
      };
    });
    return {
      rounds: state.rounds,
      rows: rows.sort(
        (a, b) => a.from - b.from || a.to - b.to || a.team.name.localeCompare(b.team.name, "fr"),
      ),
    };
  },
});

/** Exempts d'un championnat, pour le calendrier. Lecture publique. */
export const byesByChampionship = query({
  args: { championshipId: v.id("championships") },
  returns: v.array(v.object({ matchdayId: v.id("matchdays"), team: teamRef })),
  handler: async (ctx, { championshipId }) => {
    const byes = await ctx.db
      .query("byes")
      .withIndex("by_championship", (q) => q.eq("championshipId", championshipId))
      .collect();
    const teams = (await Promise.all(byes.map((bye) => ctx.db.get(bye.teamId)))).filter(
      (team): team is Doc<"teams"> => team !== null,
    );
    const refs = new Map((await teamRefs(ctx, teams)).map((ref) => [ref._id as string, ref]));
    return byes
      .filter((bye) => refs.has(bye.teamId))
      .map((bye) => ({ matchdayId: bye.matchdayId, team: refs.get(bye.teamId)! }))
      .sort((a, b) => byName(a.team, b.team));
  },
});
