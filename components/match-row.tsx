import type { FunctionReturnType } from "convex/server";
import Link from "next/link";

import { MatchTeams, sidesOf } from "@/components/match-teams";
import { Badge } from "@/components/ui/badge";
import type { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatDateTime, formatSets } from "@/lib/format";
import { matchStateLabels, matchStateVariant } from "@/lib/labels";

type Match = FunctionReturnType<typeof api.matches.listByChampionship>[number];

/**
 * Ligne de match, partagée par le calendrier d'un championnat et la fiche d'une équipe.
 *
 * `highlightTeamId` met en gras l'équipe dont on consulte la fiche, pour qu'on retrouve
 * d'un coup d'œil si elle recevait ou se déplaçait.
 */
export function MatchRow({
  match,
  highlightTeamId,
  showMatchday = false,
}: {
  match: Match;
  highlightTeamId?: Id<"teams">;
  showMatchday?: boolean;
}) {
  const emphasis = (teamId: Id<"teams">) =>
    teamId === highlightTeamId ? "font-semibold" : "font-medium";

  return (
    <Link
      href={`/matchs/${match._id}`}
      className="hover:bg-muted/50 flex flex-col gap-1 rounded-md px-2 py-2 text-sm"
    >
      {/* Affiche, score et état sur une ligne ; créneau toujours en dessous. */}
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {/* Sur un téléphone, la journée passe sur la ligne du créneau, faute de place. */}
        {showMatchday ? (
          <span className="text-muted-foreground hidden w-8 sm:inline">
            J{match.matchdayNumber}
          </span>
        ) : null}
        <MatchTeams
          home={{ ...sidesOf(match).home, emphasis: emphasis(match.homeTeamId) }}
          away={{ ...sidesOf(match).away, emphasis: emphasis(match.awayTeamId) }}
        />
        {match.result === undefined ? null : (
          <span className="font-semibold">
            {formatSets(match.result.homeSets, match.result.awaySets)}
            {match.forfeitAgainst !== undefined
              ? " (forfait)"
              : match.result.winnerTeamId === undefined
                ? " (nul)"
                : ""}
          </span>
        )}
        <Badge variant={matchStateVariant[match.state]} className="ml-auto">
          {matchStateLabels[match.state]}
        </Badge>
      </span>
      <span className={showMatchday ? "text-muted-foreground sm:pl-11" : "text-muted-foreground"}>
        {showMatchday ? <span className="sm:hidden">J{match.matchdayNumber} · </span> : null}
        {match.slot === undefined
          ? "créneau à fixer"
          : `${formatDateTime(match.slot.at)} · ${match.slot.venue}`}
      </span>
    </Link>
  );
}
