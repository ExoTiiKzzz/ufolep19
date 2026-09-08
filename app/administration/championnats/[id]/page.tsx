"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { dateInputValue, formatDateTime, formatWindow, parisDayBounds } from "@/lib/format";
import { matchStateLabels, matchStateVariant } from "@/lib/labels";

export default function AdminChampionshipPage() {
  const championshipId = useParams<{ id: string }>().id as Id<"championships">;
  const championship = useQuery(api.championships.get, { championshipId });
  const clubs = useQuery(api.clubs.list);
  const teams = useQuery(api.teams.listByChampionship, { championshipId });
  const matchdays = useQuery(api.matchdays.listByChampionship, { championshipId });
  const matches = useQuery(api.matches.listByChampionship, { championshipId });
  const overlaps = useQuery(api.adminViews.playerOverlaps, { championshipId });

  const createTeam = useMutation(api.teams.create);
  const createMatchday = useMutation(api.matchdays.create);
  const createMatch = useMutation(api.matches.create);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function guard(action: () => Promise<unknown>, success?: string) {
    setError(null);
    setNotice(null);
    try {
      await action();
      if (success !== undefined) {
        setNotice(success);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action impossible.");
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <p className="text-muted-foreground text-sm">
        Saison {championship?.seasonLabel ?? "…"}
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">{championship?.name ?? "…"}</h1>

      {error === null ? null : <p className="mt-4 text-sm text-red-600">{error}</p>}
      {notice === null ? null : <p className="mt-4 text-sm text-green-700">{notice}</p>}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Équipes engagées</CardTitle>
          <CardDescription>
            La saison de l&apos;équipe est déduite du championnat : elle ne peut pas être
            contredite.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {(teams ?? []).length === 0 ? (
              <p className="text-muted-foreground text-sm">Aucune équipe engagée.</p>
            ) : (
              (teams ?? []).map((team) => (
                <Link key={team._id} href={`/equipes/${team._id}`}>
                  <Badge variant="secondary">
                    {team.name} · {team.clubName}
                  </Badge>
                </Link>
              ))
            )}
          </div>
          <form
            className="flex flex-wrap items-end gap-3 border-t pt-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const element = event.currentTarget;
              await guard(async () => {
                await createTeam({
                  clubId: String(form.get("clubId")) as Id<"clubs">,
                  championshipId,
                  name: String(form.get("name")),
                });
                element.reset();
              }, "Équipe engagée.");
            }}
          >
            <div className="min-w-40 flex-1">
              <Label htmlFor="clubId">Club</Label>
              <Select id="clubId" name="clubId" className="mt-2" required>
                <option value="">Choisir…</option>
                {(clubs ?? []).map((club) => (
                  <option key={club._id} value={club._id}>
                    {club.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="min-w-40 flex-1">
              <Label htmlFor="teamName">Nom de l&apos;équipe</Label>
              <Input id="teamName" name="name" className="mt-2" required placeholder="Club A 1" />
            </div>
            <Button type="submit">Engager</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Journées</CardTitle>
          <CardDescription>
            La fenêtre de dates borne le créneau des matchs de la journée, et sert de date butoir
            de négociation.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1 text-sm">
            {(matchdays ?? []).map((matchday) => (
              <p key={matchday._id}>
                <span className="font-medium">Journée {matchday.number}</span>{" "}
                <span className="text-muted-foreground">
                  {formatWindow(matchday.windowStart, matchday.windowEnd)}
                </span>
              </p>
            ))}
            {(matchdays ?? []).length === 0 ? (
              <p className="text-muted-foreground">Aucune journée créée.</p>
            ) : null}
          </div>
          <form
            className="flex flex-wrap items-end gap-3 border-t pt-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const element = event.currentTarget;
              const start = parisDayBounds(String(form.get("start")), "start");
              const end = parisDayBounds(String(form.get("end")), "end");
              if (start === null || end === null) {
                setError("Dates de fenêtre invalides.");
                return;
              }
              await guard(async () => {
                await createMatchday({
                  championshipId,
                  number: Number(form.get("number")),
                  windowStart: start,
                  windowEnd: end,
                });
                element.reset();
              }, "Journée créée.");
            }}
          >
            <div>
              <Label htmlFor="number">Numéro</Label>
              <Input
                id="number"
                name="number"
                type="number"
                min={1}
                className="mt-2 w-24"
                required
                defaultValue={((matchdays ?? []).length + 1).toString()}
              />
            </div>
            <div>
              <Label htmlFor="start">Début de fenêtre</Label>
              <Input
                id="start"
                name="start"
                type="date"
                className="mt-2"
                required
                defaultValue={dateInputValue(Date.now())}
              />
            </div>
            <div>
              <Label htmlFor="end">Fin de fenêtre</Label>
              <Input
                id="end"
                name="end"
                type="date"
                className="mt-2"
                required
                defaultValue={dateInputValue(Date.now() + 14 * 86_400_000)}
              />
            </div>
            <Button type="submit">Créer la journée</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Matchs</CardTitle>
          <CardDescription>
            Saisie manuelle : désignez qui reçoit. Un doublon d&apos;affiche est signalé sans être
            bloqué.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1 text-sm">
            {(matches ?? []).map((match) => (
              <Link
                key={match._id}
                href={`/matchs/${match._id}`}
                className="hover:bg-muted/50 flex flex-wrap items-center gap-2 rounded-md px-2 py-1"
              >
                <span className="text-muted-foreground w-16">J{match.matchdayNumber}</span>
                <span className="font-medium">
                  {match.homeTeamName} — {match.awayTeamName}
                </span>
                {match.slot === undefined ? null : (
                  <span className="text-muted-foreground">{formatDateTime(match.slot.at)}</span>
                )}
                <Badge variant={matchStateVariant[match.state]} className="ml-auto">
                  {matchStateLabels[match.state]}
                </Badge>
              </Link>
            ))}
            {(matches ?? []).length === 0 ? (
              <p className="text-muted-foreground">Aucun match programmé.</p>
            ) : null}
          </div>

          <form
            className="flex flex-wrap items-end gap-3 border-t pt-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              await guard(async () => {
                const result = await createMatch({
                  matchdayId: String(form.get("matchdayId")) as Id<"matchdays">,
                  homeTeamId: String(form.get("homeTeamId")) as Id<"teams">,
                  awayTeamId: String(form.get("awayTeamId")) as Id<"teams">,
                });
                setNotice(result.duplicateWarning ?? "Match créé.");
              });
            }}
          >
            <div>
              <Label htmlFor="matchdayId">Journée</Label>
              <Select id="matchdayId" name="matchdayId" className="mt-2" required>
                {(matchdays ?? []).map((matchday) => (
                  <option key={matchday._id} value={matchday._id}>
                    Journée {matchday.number}
                  </option>
                ))}
              </Select>
            </div>
            <div className="min-w-40 flex-1">
              <Label htmlFor="homeTeamId">Reçoit</Label>
              <Select id="homeTeamId" name="homeTeamId" className="mt-2" required>
                <option value="">Choisir…</option>
                {(teams ?? []).map((team) => (
                  <option key={team._id} value={team._id}>
                    {team.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="min-w-40 flex-1">
              <Label htmlFor="awayTeamId">Se déplace</Label>
              <Select id="awayTeamId" name="awayTeamId" className="mt-2" required>
                <option value="">Choisir…</option>
                {(teams ?? []).map((team) => (
                  <option key={team._id} value={team._id}>
                    {team.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit">Créer le match</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Cumuls de joueurs</CardTitle>
          <CardDescription>
            Un joueur aligné pour deux équipes la même journée est autorisé, mais signalé ici.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          {(overlaps ?? []).length === 0 ? (
            <p className="text-muted-foreground">Aucun cumul détecté.</p>
          ) : (
            (overlaps ?? []).map((row) => (
              <p key={`${row.playerId}-${row.matchdayNumber}`}>
                <span className="font-medium">{row.playerName}</span>{" "}
                <span className="text-muted-foreground">
                  journée {row.matchdayNumber} — {row.teams.join(" et ")}
                </span>
              </p>
            ))
          )}
        </CardContent>
      </Card>
    </main>
  );
}
