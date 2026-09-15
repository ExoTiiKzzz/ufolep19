"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { LicenseBadge } from "@/components/license-badge";
import { LicenseFields, readLicenseFields } from "@/components/license-fields";
import { MatchRow } from "@/components/match-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { LICENSE_FIELDS_ERROR } from "@/lib/license-messages";

export default function PlayerPage() {
  const playerId = useParams<{ id: string }>().id as Id<"players">;
  const account = useQuery(api.users.me);
  const player = useQuery(api.players.get, account ? { playerId } : "skip");
  const addLicense = useMutation(api.licenses.add);
  const removeLicense = useMutation(api.licenses.remove);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  // La licence « en cours » est celle qui couvre aujourd'hui, pas la dernière saisie : une
  // licence de la saison prochaine, déjà enregistrée, ne l'est pas encore.
  const now = Date.now();
  const currentLicenseId =
    player.licenses.find((row) => row.validFrom <= now && now <= row.validUntil)?._id ?? null;

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
      <p className="mt-2 text-sm">
        <LicenseBadge license={player.license} />
      </p>

      {error === null ? null : <p className="mt-4 text-sm text-red-600">{error}</p>}
      {notice === null ? null : <p className="mt-4 text-sm text-green-700">{notice}</p>}

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-base">Licences</CardTitle>
          <CardDescription>
            Une licence n&apos;est pas prolongée : on en délivre une nouvelle, au même numéro
            ou à un autre. Les précédentes restent ici.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {player.licenses.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aucune licence enregistrée : ce joueur ne peut être aligné sur aucun match.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Numéro</TableHead>
                  <TableHead>Valide du</TableHead>
                  <TableHead>au</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {player.licenses.map((row) => {
                  const current = row._id === currentLicenseId;
                  return (
                    <TableRow key={row._id}>
                      <TableCell className="font-medium">
                        {row.number}{" "}
                        {current ? <Badge>en cours</Badge> : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(row.validFrom)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(row.validUntil)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            setError(null);
                            setNotice(null);
                            try {
                              await removeLicense({ licenseId: row._id });
                              setNotice("Licence supprimée.");
                            } catch (caught) {
                              setError(errorMessage(caught, "Suppression impossible."));
                            }
                          }}
                        >
                          Supprimer
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const element = event.currentTarget;
              setError(null);
              setNotice(null);
              const license = readLicenseFields(form);
              if (license === null || license === "invalid") {
                setError(LICENSE_FIELDS_ERROR);
                return;
              }
              try {
                await addLicense({ playerId, ...license });
                element.reset();
                setNotice("Licence enregistrée.");
              } catch (caught) {
                setError(
                  errorMessage(caught, "Enregistrement impossible."),
                );
              }
            }}
          >
            <LicenseFields required />
            <Button type="submit">Délivrer</Button>
          </form>
        </CardContent>
      </Card>

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
                <Badge variant={team.isCurrentSeason ? "default" : "muted"}>
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
