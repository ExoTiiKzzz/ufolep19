import { v } from "convex/values";

import {
  assessLineup,
  type LineupCandidate,
  type PlayerAssessment,
} from "../lib/rules/reinforcement";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { rosterTeamInCircuit } from "./circuits";

type Ctx = QueryCtx | MutationCtx;

/** Ce que la feuille de match expose d'un joueur aligné, au-delà de son nom. */
export const reinforcementInfo = v.object({
  kind: v.union(
    v.literal("own"),
    v.literal("sameLevel"),
    v.literal("upward"),
    v.literal("downward"),
    v.literal("noRoster"),
  ),
  flags: v.array(
    v.union(
      v.literal("noRoster"),
      v.literal("downward"),
      v.literal("upperLimit"),
      v.literal("quotaExceeded"),
    ),
  ),
  upperMatchNumber: v.number(),
  originTeamName: v.union(v.string(), v.null()),
});

/** Cache d'une requête : championnats relus à chaque match du joueur. */
export type ChampionshipCache = Map<Id<"championships">, Doc<"championships"> | null>;

export function newChampionshipCache(): ChampionshipCache {
  return new Map();
}

async function championshipOf(
  ctx: Ctx,
  championshipId: Id<"championships">,
  cache: ChampionshipCache,
) {
  if (!cache.has(championshipId)) {
    cache.set(championshipId, await ctx.db.get(championshipId));
  }
  return cache.get(championshipId) ?? null;
}

/**
 * Matchs qu'un joueur a déjà joués au-dessus de son niveau d'origine, **avant** le match
 * donné, dans le circuit.
 *
 * Compte les feuilles **soumises** (en attente, validées, en litige) : une composition
 * n'existe en base qu'une fois la feuille transcrite. Attendre la validation laisserait un
 * joueur enchaîner cinq matchs en une semaine sans un seul signalement.
 *
 * L'ordre est celui des **dates de match**, pas de la saisie : la feuille du 12 transcrite
 * après celle du 19 ne fait pas du 12 le 4ᵉ match. À date égale, l'ordre de création des
 * matchs départage.
 */
async function upperMatchesBefore(
  ctx: Ctx,
  playerId: Id<"players">,
  circuitId: Id<"circuits">,
  originLevel: number,
  match: Doc<"matches">,
  cache: ChampionshipCache,
): Promise<number> {
  const at = match.slot?.at ?? Number.POSITIVE_INFINITY;
  const entries = await ctx.db
    .query("lineupEntries")
    .withIndex("by_player_and_matchday", (q) => q.eq("playerId", playerId))
    .collect();
  let count = 0;
  for (const entry of entries) {
    if (entry.matchId === match._id) {
      continue;
    }
    const other = await ctx.db.get(entry.matchId);
    if (other === null || other.slot === undefined) {
      continue;
    }
    const earlier =
      other.slot.at < at || (other.slot.at === at && other._creationTime < match._creationTime);
    if (!earlier) {
      continue;
    }
    const championship = await championshipOf(ctx, other.championshipId, cache);
    if (
      championship !== null &&
      championship.circuitId === circuitId &&
      championship.level < originLevel
    ) {
      count++;
    }
  }
  return count;
}

/** Feuille verte d'un joueur dans un circuit, et de quoi le classer pour un match. */
export async function candidateFor(
  ctx: Ctx,
  playerId: Id<"players">,
  championship: Doc<"championships">,
  match: Doc<"matches">,
  cache: ChampionshipCache,
): Promise<LineupCandidate & { originTeamName: string | null }> {
  const origin = await rosterTeamInCircuit(ctx, playerId, championship.circuitId);
  if (origin === null) {
    return {
      playerId,
      originTeamId: null,
      originLevel: null,
      upperMatchesBefore: 0,
      originTeamName: null,
    };
  }
  const originLevel = origin.championship.level;
  return {
    playerId,
    originTeamId: origin.team._id,
    originLevel,
    originTeamName: origin.team.name,
    // Le compteur ne sert qu'à qui monte : inutile de relire ses matchs sinon.
    upperMatchesBefore:
      originLevel > championship.level
        ? await upperMatchesBefore(
            ctx,
            playerId,
            championship.circuitId,
            originLevel,
            match,
            cache,
          )
        : 0,
  };
}

/**
 * Classe chaque joueur d'une composition et pose ses signalements. Rien n'est refusé ici :
 * c'est l'affaire des équipes (ADR-0005).
 */
export async function assessTeamLineup(
  ctx: Ctx,
  match: Doc<"matches">,
  teamId: Id<"teams">,
  playerIds: Id<"players">[],
  cache: ChampionshipCache = newChampionshipCache(),
): Promise<Map<Id<"players">, PlayerAssessment & { originTeamName: string | null }>> {
  const championship = await championshipOf(ctx, match.championshipId, cache);
  const result = new Map<Id<"players">, PlayerAssessment & { originTeamName: string | null }>();
  if (championship === null) {
    return result;
  }
  const candidates = await Promise.all(
    playerIds.map((playerId) => candidateFor(ctx, playerId, championship, match, cache)),
  );
  const assessed = assessLineup(
    {
      teamId,
      level: championship.level,
      quota: championship.reinforcementQuota ?? null,
    },
    candidates,
  );
  for (const [index, assessment] of assessed.entries()) {
    result.set(playerIds[index], {
      ...assessment,
      originTeamName: candidates[index].originTeamName,
    });
  }
  return result;
}
