"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { ClubLogo } from "@/components/club-logo";
import { MatchRow } from "@/components/match-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
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

export default function TeamPage() {
  const teamId = useParams<{ id: string }>().id as Id<"teams">;
  const team = useQuery(api.teams.get, { teamId });
  const matches = useQuery(api.teams.matches, { teamId });
  const account = useQuery(api.users.me);
  const standings = useQuery(
    api.standings.byChampionship,
    team ? { championshipId: team.championshipId } : "skip",
  );

  // Effectif, responsables et actions de gestion : réservés aux comptes connectés.
  const roster = useQuery(api.roster.listByTeam, account ? { teamId } : "skip");
  const managers = useQuery(api.teams.managers, account ? { teamId } : "skip");
  const myTeams = useQuery(api.teams.mine, account ? {} : "skip");
  const clubPlayers = useQuery(
    api.players.listByClub,
    account && team ? { clubId: team.clubId } : "skip",
  );
  const previous = useQuery(api.roster.previousSeasonTeam, account ? { teamId } : "skip");

  const createPlayer = useMutation(api.players.create);
  const addToRoster = useMutation(api.roster.add);
  const removeFromRoster = useMutation(api.roster.remove);
  const copyRoster = useMutation(api.roster.copyFrom);

  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState("");

  const canManage =
    account?.role === "admin" ||
    (myTeams ?? []).some((candidate) => candidate._id === teamId);
  const rosterIds = new Set((roster ?? []).map((player) => String(player._id)));
  const available = (clubPlayers ?? []).filter((player) => !rosterIds.has(String(player._id)));
  const rank = (standings ?? []).find((row) => row.teamId === teamId);

  async function guard(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action impossible.");
    }
  }

  if (team === undefined) {
    return <main className="mx-auto max-w-3xl px-6 py-10 text-sm">Chargement…</main>;
  }
  if (team === null) {
    return <main className="mx-auto max-w-3xl px-6 py-10 text-sm">Équipe inconnue.</main>;
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center gap-4">
        <ClubLogo name={team.clubName} logoUrl={team.clubLogoUrl} size={56} />
        <div>
          <p className="text-muted-foreground text-sm">
            <Link href={`/clubs/${team.clubId}`} className="hover:underline">
              {team.clubName}
            </Link>
            {" · "}
            <Link href={`/championnats/${team.championshipId}`} className="hover:underline">
              {team.championshipName}
            </Link>
            {" · saison "}
            {team.seasonLabel}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{team.name}</h1>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        {team.isCurrentSeason ? (
          <Badge>Saison en cours</Badge>
        ) : (
          <Badge variant="muted">Saison archivée</Badge>
        )}
        {rank === undefined ? null : (
          <span className="text-muted-foreground">
            {rank.rank}
            <sup>{rank.rank === 1 ? "er" : "e"}</sup> au classement · {rank.points} point(s) ·{" "}
            {rank.wins} victoire(s) sur {rank.played} match(s)
          </span>
        )}
        {team.clubVenue === "" ? null : (
          <span className="text-muted-foreground">Salle : {team.clubVenue}</span>
        )}
      </div>

      {error === null ? null : <p className="mt-4 text-sm text-red-600">{error}</p>}

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-base">Matchs</CardTitle>
          <CardDescription>Réceptions et déplacements, dans l&apos;ordre des journées.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {matches === undefined ? (
            <p className="text-muted-foreground text-sm">Chargement…</p>
          ) : matches.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucun match programmé.</p>
          ) : (
            matches.map((match) => (
              <MatchRow key={match._id} match={match} highlightTeamId={teamId} showMatchday />
            ))
          )}
        </CardContent>
      </Card>

      {account === null ? (
        <p className="text-muted-foreground mt-6 text-sm">
          L&apos;effectif et les responsables de l&apos;équipe ne sont visibles qu&apos;avec un
          compte.
        </p>
      ) : (
        <>
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Effectif</CardTitle>
              <CardDescription>
                {(roster ?? []).length} joueur(s). Aucun minimum : jouer en sous-effectif est
                permis.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Licence</TableHead>
                    {canManage ? <TableHead /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(roster ?? []).map((player) => (
                    <TableRow key={player._id}>
                      <TableCell className="font-medium">
                        <Link href={`/joueurs/${player._id}`} className="hover:underline">
                          {player.lastName.toUpperCase()} {player.firstName}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {player.licenseNumber || "—"}
                      </TableCell>
                      {canManage ? (
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              guard(() => removeFromRoster({ teamId, playerId: player._id }))
                            }
                          >
                            Retirer
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {(roster ?? []).length === 0 ? (
                <p className="text-muted-foreground text-sm">Effectif vide.</p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Responsables</CardTitle>
              <CardDescription>
                Le rattachement d&apos;un responsable est géré par le comité.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2 text-sm">
              {(managers ?? []).length === 0 ? (
                <p className="text-muted-foreground">Aucun responsable rattaché.</p>
              ) : (
                (managers ?? []).map((manager) => (
                  <Badge key={manager._id} variant="muted">
                    {manager.name ?? manager.email}
                  </Badge>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}

      {!canManage ? null : (
        <>
          {previous === undefined || previous === null ? null : (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-base">Reprendre l&apos;effectif précédent</CardTitle>
                <CardDescription>
                  La même équipe existait en {previous.seasonLabel} avec {previous.playerCount}{" "}
                  joueurs. La reprise n&apos;introduit aucun doublon si vous la relancez.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  onClick={() => guard(() => copyRoster({ teamId, sourceTeamId: previous._id }))}
                >
                  Reprendre les {previous.playerCount} joueurs
                </Button>
              </CardContent>
            </Card>
          )}

          {available.length === 0 ? null : (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-base">Ajouter un licencié du club</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-end gap-3">
                <div className="min-w-56 flex-1">
                  <Label htmlFor="player">Licencié</Label>
                  <Select
                    id="player"
                    className="mt-2"
                    value={selected}
                    onChange={(event) => setSelected(event.target.value)}
                  >
                    <option value="">Choisir…</option>
                    {available.map((player) => (
                      <option key={player._id} value={player._id}>
                        {player.lastName.toUpperCase()} {player.firstName}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button
                  disabled={selected === ""}
                  onClick={() =>
                    guard(async () => {
                      await addToRoster({ teamId, playerId: selected as Id<"players"> });
                      setSelected("");
                    })
                  }
                >
                  Ajouter à l&apos;effectif
                </Button>
              </CardContent>
            </Card>
          )}

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Créer une fiche joueur</CardTitle>
              <CardDescription>
                Sans adresse e-mail ni compte : c&apos;est une donnée d&apos;effectif.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="flex flex-wrap items-end gap-3"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  const element = event.currentTarget;
                  await guard(async () => {
                    const playerId = await createPlayer({
                      clubId: team.clubId,
                      firstName: String(form.get("firstName")),
                      lastName: String(form.get("lastName")),
                      licenseNumber: String(form.get("licenseNumber")),
                    });
                    await addToRoster({ teamId, playerId });
                    element.reset();
                  });
                }}
              >
                <div>
                  <Label htmlFor="lastName">Nom</Label>
                  <Input id="lastName" name="lastName" className="mt-2" required />
                </div>
                <div>
                  <Label htmlFor="firstName">Prénom</Label>
                  <Input id="firstName" name="firstName" className="mt-2" required />
                </div>
                <div>
                  <Label htmlFor="licenseNumber">Licence</Label>
                  <Input id="licenseNumber" name="licenseNumber" className="mt-2" />
                </div>
                <Button type="submit">Créer et ajouter</Button>
              </form>
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
