"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { ClubLogo } from "@/components/club-logo";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export default function ClubPage() {
  const clubId = useParams<{ id: string }>().id as Id<"clubs">;
  const club = useQuery(api.clubs.get, { clubId });
  const account = useQuery(api.users.me);
  // Les licenciés sont nominatifs : on ne les demande qu'avec un compte.
  const players = useQuery(api.players.listByClub, account ? { clubId } : "skip");

  if (club === undefined) {
    return <main className="mx-auto max-w-3xl px-6 py-10 text-sm">Chargement…</main>;
  }
  if (club === null) {
    return <main className="mx-auto max-w-3xl px-6 py-10 text-sm">Club inconnu.</main>;
  }

  const seasons = [...new Set(club.teams.map((team) => team.seasonLabel))];

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center gap-4">
        <ClubLogo name={club.name} logoUrl={club.logoUrl} size={64} />
        <div>
          <p className="text-muted-foreground text-sm">Club</p>
          <h1 className="text-2xl font-semibold tracking-tight">{club.name}</h1>
        </div>
      </div>
      <p className="text-muted-foreground mt-3 text-sm">
        {club.defaultVenue === ""
          ? "Aucune salle par défaut renseignée."
          : `Salle par défaut : ${club.defaultVenue}`}
      </p>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-base">Équipes</CardTitle>
          <CardDescription>
            Une équipe appartient à une seule saison : celles des saisons passées restent
            consultables.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {club.teams.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucune équipe engagée.</p>
          ) : (
            seasons.map((seasonLabel) => (
              <div key={seasonLabel}>
                <p className="text-sm font-medium">
                  Saison {seasonLabel}
                  {club.teams.find((team) => team.seasonLabel === seasonLabel)
                    ?.isCurrentSeason ? (
                    <Badge className="ml-2">En cours</Badge>
                  ) : null}
                </p>
                <div className="mt-2 flex flex-col gap-1">
                  {club.teams
                    .filter((team) => team.seasonLabel === seasonLabel)
                    .map((team) => (
                      <Link
                        key={team._id}
                        href={`/equipes/${team._id}`}
                        className="hover:bg-muted/50 flex flex-wrap items-center gap-2 rounded-md px-2 py-1 text-sm"
                      >
                        <span className="font-medium">{team.name}</span>
                        <span className="text-muted-foreground">
                          {team.championshipName}
                        </span>
                      </Link>
                    ))}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {account === null ? (
        <p className="text-muted-foreground mt-6 text-sm">
          Les licenciés du club ne sont visibles qu&apos;avec un compte.
        </p>
      ) : (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Licenciés</CardTitle>
            <CardDescription>
              {(players ?? []).length} fiche(s). Une fiche joueur existe sans compte utilisateur.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Licence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(players ?? []).map((player) => (
                  <TableRow key={player._id}>
                    <TableCell className="font-medium">
                      <Link href={`/joueurs/${player._id}`} className="hover:underline">
                        {player.lastName.toUpperCase()} {player.firstName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {player.licenseNumber || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {(players ?? []).length === 0 ? (
              <p className="text-muted-foreground text-sm">Aucun licencié enregistré.</p>
            ) : null}
          </CardContent>
        </Card>
      )}
    </main>
  );
}
