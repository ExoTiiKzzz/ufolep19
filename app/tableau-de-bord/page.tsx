"use client";

import { useQuery } from "convex/react";
import Link from "next/link";

import { ClubLogo } from "@/components/club-logo";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/convex/_generated/api";
import { formatCountdown, formatDateTime } from "@/lib/format";
import { todoLabels } from "@/lib/labels";

export default function DashboardPage() {
  const account = useQuery(api.users.me);
  const todo = useQuery(api.matches.myTodo, account === null ? "skip" : {});
  const teams = useQuery(api.teams.mine, account === null ? "skip" : {});

  if (account === undefined) {
    return <main className="mx-auto max-w-3xl px-6 py-10 text-sm">Chargement…</main>;
  }
  if (account === null) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10 text-sm">
        <p>
          Cette page demande un compte.{" "}
          <Link href="/connexion" className="underline">
            Se connecter
          </Link>
          .
        </p>
      </main>
    );
  }

  const actionable = (todo ?? []).filter((row) => row.action !== "waiting");
  const waiting = (todo ?? []).filter((row) => row.action === "waiting");

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Tableau de bord</h1>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">À traiter</CardTitle>
          <CardDescription>
            Aucune notification n&apos;est envoyée : c&apos;est ici que vous voyez ce qui attend
            votre action.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {todo === undefined ? (
            <p className="text-muted-foreground text-sm">Chargement…</p>
          ) : actionable.length === 0 ? (
            <p className="text-muted-foreground text-sm">Rien ne vous attend.</p>
          ) : (
            actionable.map((row) => (
              <Link
                key={row.match._id}
                href={`/matchs/${row.match._id}`}
                className="hover:bg-muted/50 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <ClubLogo
                    name={row.match.homeClubName}
                    logoUrl={row.match.homeClubLogoUrl}
                    size={20}
                  />
                  <span className="font-medium">{row.match.homeTeamName}</span>
                  <span className="text-muted-foreground">—</span>
                  <ClubLogo
                    name={row.match.awayClubName}
                    logoUrl={row.match.awayClubLogoUrl}
                    size={20}
                  />
                  <span className="font-medium">{row.match.awayTeamName}</span>
                </span>
                <span className="text-muted-foreground">
                  journée {row.match.matchdayNumber}
                  {row.match.slot === undefined
                    ? ""
                    : ` · ${formatDateTime(row.match.slot.at)}`}
                </span>
                <Badge className="ml-auto">{todoLabels[row.action]}</Badge>
                {row.deadline === null ? null : (
                  <span className="text-muted-foreground text-xs">
                    tacite {formatCountdown(row.deadline)}
                  </span>
                )}
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      {waiting.length === 0 ? null : (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">En attente de l&apos;adversaire</CardTitle>
            <CardDescription>
              Rien à faire de votre côté : la main est à l&apos;autre équipe.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {waiting.map((row) => (
              <Link
                key={row.match._id}
                href={`/matchs/${row.match._id}`}
                className="text-muted-foreground hover:bg-muted/50 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <ClubLogo
                    name={row.match.homeClubName}
                    logoUrl={row.match.homeClubLogoUrl}
                    size={20}
                  />
                  {row.match.homeTeamName}
                  <span>—</span>
                  <ClubLogo
                    name={row.match.awayClubName}
                    logoUrl={row.match.awayClubLogoUrl}
                    size={20}
                  />
                  {row.match.awayTeamName}
                </span>
                <span>journée {row.match.matchdayNumber}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Mes équipes</CardTitle>
          <CardDescription>
            Les équipes qui vous sont rattachées. Le comité gère ces rattachements.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {teams === undefined ? (
            <p className="text-muted-foreground text-sm">Chargement…</p>
          ) : teams.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aucune équipe ne vous est rattachée.
            </p>
          ) : (
            teams.map((team) => (
              <Link
                key={team._id}
                href={`/equipes/${team._id}`}
                className="hover:bg-muted/50 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-2 text-sm"
              >
                <span className="font-medium">{team.name}</span>
                <span className="text-muted-foreground">
                  {team.championshipName} · saison {team.seasonLabel}
                </span>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </main>
  );
}
