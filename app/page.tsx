"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";

import { MatchRow } from "@/components/match-row";
import { StandingsTable } from "@/components/standings-table";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatWindow } from "@/lib/format";
import { matchdayStatusLabels } from "@/lib/labels";

export default function Home() {
  const championships = useQuery(api.championships.listAll);
  const [chosen, setChosen] = useState<Id<"championships"> | null>(null);

  // Le championnat par défaut est le premier de la saison courante ; le sélecteur ne fait
  // que déplacer ce choix, sans état à synchroniser.
  const championshipId = chosen ?? championships?.[0]?._id ?? null;
  const championship = championships?.find((row) => row._id === championshipId);

  const standings = useQuery(
    api.standings.byChampionship,
    championshipId ? { championshipId } : "skip",
  );
  const matchday = useQuery(
    api.matchdays.currentOrNext,
    championshipId ? { championshipId } : "skip",
  );

  const seasons = [...new Set((championships ?? []).map((row) => row.seasonLabel))];

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">UFOLEP 19 — Volley-ball</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Calendriers, résultats et classements des championnats départementaux.
      </p>

      {championships === undefined ? (
        <p className="text-muted-foreground mt-8 text-sm">Chargement…</p>
      ) : championships.length === 0 ? (
        <p className="text-muted-foreground mt-8 text-sm">
          Aucun championnat n&apos;est encore ouvert.
        </p>
      ) : (
        <>
          <div className="mt-8 flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1">
              <Label htmlFor="championship">Championnat</Label>
              <Select
                id="championship"
                className="mt-2"
                value={championshipId ?? ""}
                onChange={(event) => setChosen(event.target.value as Id<"championships">)}
              >
                {seasons.map((seasonLabel) => (
                  <optgroup key={seasonLabel} label={`Saison ${seasonLabel}`}>
                    {championships
                      .filter((row) => row.seasonLabel === seasonLabel)
                      .map((row) => (
                        <option key={row._id} value={row._id}>
                          {row.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </Select>
            </div>
            {championshipId === null ? null : (
              <Link
                href={`/championnats/${championshipId}`}
                className={buttonVariants()}
              >
                Calendrier complet
              </Link>
            )}
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">
                Classement
                {championship === undefined ? null : (
                  <span className="text-muted-foreground ml-2 text-sm font-normal">
                    {championship.name} · saison {championship.seasonLabel}
                  </span>
                )}
                {championship?.isCurrentSeason === false ? (
                  <Badge variant="muted" className="ml-2">
                    Saison archivée
                  </Badge>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {standings === undefined ? (
                <p className="text-muted-foreground text-sm">Chargement…</p>
              ) : (
                <StandingsTable rows={standings} />
              )}
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">
                {matchday === undefined || matchday === null
                  ? "Journée"
                  : `${matchdayStatusLabels[matchday.status]} — journée ${matchday.number}`}
                {matchday === undefined || matchday === null ? null : (
                  <span className="text-muted-foreground ml-2 text-sm font-normal">
                    {formatWindow(matchday.windowStart, matchday.windowEnd)}
                  </span>
                )}
              </CardTitle>
              {matchday?.status === "past" ? (
                <CardDescription>
                  Toutes les journées de ce championnat sont passées.
                </CardDescription>
              ) : null}
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {matchday === undefined ? (
                <p className="text-muted-foreground text-sm">Chargement…</p>
              ) : matchday === null ? (
                <p className="text-muted-foreground text-sm">
                  Aucune journée n&apos;est encore programmée dans ce championnat.
                </p>
              ) : matchday.matches.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Aucun match programmé dans cette journée.
                </p>
              ) : (
                matchday.matches.map((match) => <MatchRow key={match._id} match={match} />)
              )}
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
