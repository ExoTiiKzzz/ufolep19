"use client";

import { useQuery } from "convex/react";
import { useParams } from "next/navigation";

import { MatchRow } from "@/components/match-row";
import { StandingsTable } from "@/components/standings-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatWindow } from "@/lib/format";

export default function ChampionshipPage() {
  const championshipId = useParams<{ id: string }>().id as Id<"championships">;
  const championship = useQuery(api.championships.get, { championshipId });
  const matchdays = useQuery(api.matchdays.listByChampionship, { championshipId });
  const matches = useQuery(api.matches.listByChampionship, { championshipId });
  const standings = useQuery(api.standings.byChampionship, { championshipId });

  if (championship === undefined || matches === undefined || matchdays === undefined) {
    return <main className="mx-auto max-w-4xl px-6 py-10 text-sm">Chargement…</main>;
  }
  if (championship === null) {
    return <main className="mx-auto max-w-4xl px-6 py-10 text-sm">Championnat inconnu.</main>;
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <p className="text-muted-foreground text-sm">Saison {championship.seasonLabel}</p>
      <h1 className="text-2xl font-semibold tracking-tight">{championship.name}</h1>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Classement</CardTitle>
        </CardHeader>
        <CardContent>
          {standings === undefined ? (
            <p className="text-muted-foreground text-sm">Chargement…</p>
          ) : (
            <StandingsTable rows={standings} />
          )}
        </CardContent>
      </Card>

      <h2 className="mt-10 text-sm font-medium">Calendrier et résultats</h2>
      <div className="mt-3 flex flex-col gap-4">
        {matchdays.map((matchday) => {
          const dayMatches = matches.filter((match) => match.matchdayId === matchday._id);
          return (
            <Card key={matchday._id}>
              <CardHeader>
                <CardTitle className="text-base">
                  Journée {matchday.number}
                  <span className="text-muted-foreground ml-2 text-sm font-normal">
                    {formatWindow(matchday.windowStart, matchday.windowEnd)}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {dayMatches.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Aucun match programmé.</p>
                ) : (
                  dayMatches.map((match) => <MatchRow key={match._id} match={match} />)
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
