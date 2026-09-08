import type { FunctionReturnType } from "convex/server";
import Link from "next/link";

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
      className="hover:bg-muted/50 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-2 text-sm"
    >
      {showMatchday ? (
        <span className="text-muted-foreground w-10">J{match.matchdayNumber}</span>
      ) : null}
      <span>
        <span className={emphasis(match.homeTeamId)}>{match.homeTeamName}</span>
        <span className="text-muted-foreground"> — </span>
        <span className={emphasis(match.awayTeamId)}>{match.awayTeamName}</span>
      </span>
      {match.result === undefined ? null : (
        <span className="font-semibold">
          {formatSets(match.result.homeSets, match.result.awaySets)}
          {match.forfeitAgainst === undefined ? "" : " (forfait)"}
        </span>
      )}
      <span className="text-muted-foreground">
        {match.slot === undefined
          ? "créneau à fixer"
          : `${formatDateTime(match.slot.at)} · ${match.slot.venue}`}
      </span>
      <Badge variant={matchStateVariant[match.state]} className="ml-auto">
        {matchStateLabels[match.state]}
      </Badge>
    </Link>
  );
}
