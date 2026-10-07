"use client";

import { useQuery } from "convex/react";
import Link from "next/link";

import { ClubLogo } from "@/components/club-logo";
import { MatchRow } from "@/components/match-row";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/convex/_generated/api";
import { formatCountdown, formatDateTime } from "@/lib/format";
import { todoLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";

/**
 * Combien de matchs joués la carte rappelle. Un licencié qui traverse les saisons en
 * accumule des dizaines : les dérouler tous ferait du tableau de bord une archive.
 * Le compte est écrit dans la carte — une liste tronquée en silence se lit comme complète.
 */
const LATEST_RESULTS = 5;

export default function DashboardPage() {
  const account = useQuery(api.users.me);
  const todo = useQuery(api.matches.myTodo, account === null ? "skip" : {});
  const teams = useQuery(api.teams.mine, account === null ? "skip" : {});
  const calendar = useQuery(api.matches.mine, account === null ? "skip" : {});

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

  // `matches.mine` rend le calendrier du plus ancien au plus récent : les matchs à venir
  // se lisent dans cet ordre, les résultats à l'envers — le dernier joué d'abord.
  const upcoming = (calendar ?? []).filter((match) => match.state !== "completed");
  const results = (calendar ?? [])
    .filter((match) => match.state === "completed")
    .reverse()
    .slice(0, LATEST_RESULTS);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Tableau de bord</h1>

      <Card className="mt-6 overflow-hidden">
        {/*
         * L'en-tête passe au jaune tant qu'il reste quelque chose à faire : sans
         * notification par e-mail (ADR-0002), c'est le seul signal qu'on ait, et le jaune
         * est justement la couleur de ce qui attend une action. Il porte sa bordure, comme
         * tout aplat jaune : sur une carte blanche il n'a qu'un rapport de 1,6 avec le fond.
         */}
        <CardHeader
          className={cn(
            "-mt-6 py-4",
            actionable.length === 0
              ? null
              : "bg-secondary text-secondary-foreground border-secondary-border border-b",
          )}
        >
          <CardTitle className="flex items-center gap-2 text-base">
            À traiter
            {actionable.length === 0 ? null : (
              <span className="bg-secondary-foreground text-secondary rounded-full px-2 text-sm font-semibold">
                {actionable.length}
              </span>
            )}
          </CardTitle>
          <CardDescription
            className={actionable.length === 0 ? undefined : "text-secondary-foreground"}
          >
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

      {/*
       * Le calendrier personnel : la seule chose que voie un compte de rôle joueur, qui n'a
       * aucune action à mener et dont les deux cartes précédentes resteraient donc vides.
       */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Mon calendrier</CardTitle>
          <CardDescription>
            Les matchs de vos équipes, à venir puis les {LATEST_RESULTS} derniers résultats.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {calendar === undefined ? (
            <p className="text-muted-foreground text-sm">Chargement…</p>
          ) : upcoming.length === 0 && results.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucun match à votre calendrier.</p>
          ) : (
            <>
              {upcoming.length === 0 ? (
                <p className="text-muted-foreground text-sm">Plus aucun match à venir.</p>
              ) : (
                upcoming.map((match) => <MatchRow key={match._id} match={match} showMatchday />)
              )}
              {results.length === 0 ? null : (
                <>
                  <p className="text-muted-foreground mt-4 px-2 text-xs font-medium uppercase">
                    Derniers résultats
                  </p>
                  {results.map((match) => (
                    <MatchRow key={match._id} match={match} showMatchday />
                  ))}
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Mes équipes</CardTitle>
          <CardDescription>
            Les équipes que vous gérez et celles dont vous faites partie. Le comité gère ces
            rattachements.
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
                {/* Une saison close est une information neutre, pas une alerte : gris. */}
                {team.isCurrentSeason ? null : (
                  <Badge variant="muted" className="ml-auto">
                    Saison archivée
                  </Badge>
                )}
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </main>
  );
}
