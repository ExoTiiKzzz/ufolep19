"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { LicenseBadge } from "@/components/license-badge";
import { LicenseFields, readLicenseFields } from "@/components/license-fields";
import { errorMessage } from "@/lib/errors";
import { LICENSE_FIELDS_ERROR } from "@/lib/license-messages";
import { ClubLogo } from "@/components/club-logo";
import { MatchRow } from "@/components/match-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/convex/_generated/api";
import { accountNotice } from "@/lib/account-notice";
import { matchesPlayer } from "@/lib/rules/player-search";
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

  // Feuille verte, responsables et actions de gestion : réservés aux comptes connectés.
  const roster = useQuery(api.roster.listByTeam, account ? { teamId } : "skip");
  const managers = useQuery(api.teams.managers, account ? { teamId } : "skip");
  const myTeams = useQuery(api.teams.mine, account ? {} : "skip");
  const candidates = useQuery(api.roster.candidates, account ? { teamId } : "skip");
  const previous = useQuery(api.roster.previousSeasonTeam, account ? { teamId } : "skip");

  const createPlayer = useAction(api.players.create);
  const addToRoster = useMutation(api.roster.add);
  const removeFromRoster = useMutation(api.roster.remove);
  const copyRoster = useMutation(api.roster.copyFrom);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const canManage =
    account?.role === "admin" ||
    (myTeams ?? []).some((candidate) => candidate._id === teamId);
  // Recherche sur tous les licenciés du club, numéros périmés compris : on cherche avec la
  // carte qu'on a sous les yeux.
  //
  // Sans recherche, la liste montre les licenciés encore disponibles — sans feuille verte
  // dans le circuit — : elle se réduit à mesure qu'on remplit les feuilles vertes du club,
  // et le dernier licencié sans équipe saute aux yeux.
  const searching = search.trim() !== "";
  const found = (candidates ?? []).filter((player) =>
    searching
      ? !player.onThisTeam && matchesPlayer(player, search)
      : !player.onThisTeam && player.otherTeamName === null,
  );
  const rank = (standings ?? []).find((row) => row.teamId === teamId);

  async function guard(action: () => Promise<unknown>) {
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (caught) {
      setError(errorMessage(caught, "Action impossible."));
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
      {notice === null ? null : (
        <p className="mt-4 text-sm text-green-700" role="status">
          {notice}
        </p>
      )}

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
          La feuille verte et les responsables de l&apos;équipe ne sont visibles qu&apos;avec un
          compte.
        </p>
      ) : (
        <>
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Feuille verte</CardTitle>
              <CardDescription>
                {(roster ?? []).length} joueur(s). Aucun minimum : jouer en sous-effectif est
                permis. Un licencié n&apos;a qu&apos;une feuille verte par circuit.
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
                      <TableCell>
                        <LicenseBadge license={player.license} />
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
                <p className="text-muted-foreground text-sm">Feuille verte vide.</p>
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
                <CardTitle className="text-base">
                  Reprendre la feuille verte précédente
                </CardTitle>
                <CardDescription>
                  La même équipe existait en {previous.seasonLabel} avec {previous.playerCount}{" "}
                  joueurs. La reprise n&apos;introduit aucun doublon si vous la relancez, et laisse
                  de côté qui figure déjà sur une autre feuille verte du circuit.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  onClick={() =>
                    guard(async () => {
                      const { added, skipped } = await copyRoster({
                        teamId,
                        sourceTeamId: previous._id,
                      });
                      setNotice(
                        `${added} joueur(s) repris.` +
                          (skipped.length === 0
                            ? ""
                            : ` Laissés de côté, déjà sur une autre feuille verte : ${skipped.join(", ")}.`),
                      );
                    })
                  }
                >
                  Reprendre les {previous.playerCount} joueurs
                </Button>
              </CardContent>
            </Card>
          )}

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Inscrire un licencié du club</CardTitle>
              <CardDescription>
                Les licenciés du club sans feuille verte dans ce circuit sont listés ci-dessous.
                Cherchez par nom ou par numéro de licence, même périmé, pour retrouver les
                autres : un licencié déjà inscrit sur une autre feuille verte du circuit doit
                d&apos;abord en être retiré.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nom, prénom ou numéro de licence"
                aria-label="Chercher un licencié du club"
              />
              {candidates === undefined ? null : found.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {searching
                    ? "Aucun licencié du club trouvé."
                    : "Tous les licenciés du club ont déjà une feuille verte dans ce circuit."}
                </p>
              ) : (
                <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
                  {searching ? null : (
                    <p className="text-muted-foreground text-xs">
                      {found.length > 1
                        ? `${found.length} licenciés disponibles`
                        : "1 licencié disponible"}
                    </p>
                  )}
                  {found.map((player) => (
                    <div key={player._id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">
                        {player.lastName.toUpperCase()} {player.firstName}
                      </span>
                      <LicenseBadge license={player.license} />
                      {player.otherTeamName === null ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="ml-auto"
                          onClick={() =>
                            guard(async () => {
                              await addToRoster({ teamId, playerId: player._id });
                              setSearch("");
                            })
                          }
                        >
                          Inscrire
                        </Button>
                      ) : (
                        <Badge variant="muted" className="ml-auto">
                          déjà sur la feuille verte de {player.otherTeamName}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

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
                  const license = readLicenseFields(form);
                  if (license === "invalid") {
                    setError(LICENSE_FIELDS_ERROR);
                    return;
                  }
                  await guard(async () => {
                    const { playerId, account } = await createPlayer({
                      clubId: team.clubId,
                      firstName: String(form.get("firstName")),
                      lastName: String(form.get("lastName")),
                      license,
                      email: String(form.get("email")),
                    });
                    await addToRoster({ teamId, playerId });
                    element.reset();
                    setNotice(
                      accountNotice("Joueur créé et inscrit sur la feuille verte.", account),
                    );
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
                <LicenseFields />
                <div className="min-w-56 flex-1">
                  <Label htmlFor="email">E-mail (facultatif)</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    className="mt-2"
                    placeholder="crée un compte de consultation"
                  />
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
