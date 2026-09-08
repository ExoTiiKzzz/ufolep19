"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { MatchRow } from "@/components/match-row";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export default function PlayerPage() {
  const playerId = useParams<{ id: string }>().id as Id<"players">;
  const account = useQuery(api.users.me);
  const player = useQuery(api.players.get, account ? { playerId } : "skip");

  if (account === undefined) {
    return <main className="mx-auto max-w-3xl px-6 py-10 text-sm">Chargement…</main>;
  }
  if (account === null) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10 text-sm">
        <p>
          Une fiche joueur est nominative : elle demande un compte.{" "}
          <Link href="/connexion" className="underline">
            Se connecter
          </Link>
          .
        </p>
      </main>
    );
  }
  if (player === undefined) {
    return <main className="mx-auto max-w-3xl px-6 py-10 text-sm">Chargement…</main>;
  }
  if (player === null) {
    return <main className="mx-auto max-w-3xl px-6 py-10 text-sm">Fiche inconnue.</main>;
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <p className="text-muted-foreground text-sm">
        Licencié ·{" "}
        <Link href={`/clubs/${player.clubId}`} className="hover:underline">
          {player.clubName}
        </Link>
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">
        {player.lastName.toUpperCase()} {player.firstName}
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">
        {player.licenseNumber === ""
          ? "Aucun numéro de licence enregistré."
          : `Licence ${player.licenseNumber}`}
      </p>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-base">Équipes</CardTitle>
          <CardDescription>
            Un joueur peut appartenir à plusieurs équipes de son club.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 text-sm">
          {player.teams.length === 0 ? (
            <p className="text-muted-foreground">Cette fiche n&apos;est dans aucun effectif.</p>
          ) : (
            player.teams.map((team) => (
              <Link key={team._id} href={`/equipes/${team._id}`}>
                <Badge variant={team.isCurrentSeason ? "default" : "secondary"}>
                  {team.name} · {team.seasonLabel}
                </Badge>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Matchs joués</CardTitle>
          <CardDescription>
            {player.appearances.length} feuille(s) de match où ce joueur figure.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {player.appearances.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aucune apparition sur une feuille de match.
            </p>
          ) : (
            player.appearances.map((appearance) => (
              <MatchRow
                key={appearance.match._id}
                match={appearance.match}
                highlightTeamId={
                  player.teams.find((team) => team.name === appearance.teamName)?._id
                }
                showMatchday
              />
            ))
          )}
        </CardContent>
      </Card>
    </main>
  );
}
