import { v } from "convex/values";

import { computeStandings, type MatchOutcome } from "../lib/rules/standings";
import { query } from "./_generated/server";

/**
 * Classement d'un championnat.
 *
 * Dérivé à la lecture des matchs terminés, jamais stocké comme état modifiable à la main.
 * Lecture publique : aucune donnée nominative.
 */
export const byChampionship = query({
  args: { championshipId: v.id("championships") },
  returns: v.array(
    v.object({
      teamId: v.id("teams"),
      teamName: v.string(),
      clubName: v.string(),
      clubLogoUrl: v.union(v.string(), v.null()),
      rank: v.number(),
      played: v.number(),
      wins: v.number(),
      losses: v.number(),
      setsWon: v.number(),
      setsLost: v.number(),
      pointsFor: v.number(),
      pointsAgainst: v.number(),
      points: v.number(),
    }),
  ),
  handler: async (ctx, { championshipId }) => {
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_championship", (q) => q.eq("championshipId", championshipId))
      .collect();
    const completed = await ctx.db
      .query("matches")
      .withIndex("by_championship_and_state", (q) =>
        q.eq("championshipId", championshipId).eq("state", "completed"),
      )
      .collect();

    const outcomes: MatchOutcome[] = completed.flatMap((match) =>
      match.result === undefined
        ? []
        : [
            {
              homeTeamId: match.homeTeamId,
              awayTeamId: match.awayTeamId,
              homeSets: match.result.homeSets,
              awaySets: match.result.awaySets,
              homePoints: match.result.homePoints,
              awayPoints: match.result.awayPoints,
            },
          ],
    );

    const rows = computeStandings(
      teams.map((team) => team._id),
      outcomes,
    );
    // Un club engage parfois plusieurs équipes : on ne le relit qu'une fois.
    const clubs = new Map<string, { name: string; logoUrl: string | null }>();
    for (const team of teams) {
      if (!clubs.has(team.clubId)) {
        const club = await ctx.db.get(team.clubId);
        clubs.set(team.clubId, {
          name: club?.name ?? "",
          logoUrl:
            club === null || club.logoId === undefined
              ? null
              : await ctx.storage.getUrl(club.logoId),
        });
      }
    }
    const teamsById = new Map(teams.map((team) => [String(team._id), team]));

    return rows.map((row) => {
      const team = teamsById.get(row.teamId);
      return {
        ...row,
        teamId: row.teamId as typeof teams[number]["_id"],
        teamName: team?.name ?? "",
        clubName: team === undefined ? "" : (clubs.get(team.clubId)?.name ?? ""),
        clubLogoUrl: team === undefined ? null : (clubs.get(team.clubId)?.logoUrl ?? null),
      };
    });
  },
});
