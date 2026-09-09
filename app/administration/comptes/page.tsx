"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";

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
import { roleLabels, type Role } from "@/lib/roles";

export default function AccountsPage() {
  const accounts = useQuery(api.users.list);
  const createAccount = useAction(api.admin.createUserAccount);
  const setRole = useMutation(api.users.setRole);
  const addManager = useMutation(api.teams.addManager);
  const removeManager = useMutation(api.teams.removeManager);
  const season = useQuery(api.seasons.current);
  const championships = useQuery(
    api.championships.listBySeason,
    season ? { seasonId: season._id } : "skip",
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [attachTo, setAttachTo] = useState<Record<string, string>>({});

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
      <h1 className="text-2xl font-semibold tracking-tight">Comptes et rôles</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Il n&apos;y a pas d&apos;inscription en ligne : tous les comptes sont créés ici. Un
        responsable ne gère que les équipes qui lui sont rattachées.
      </p>

      {error === null ? null : <p className="mt-4 text-sm text-red-600">{error}</p>}
      {notice === null ? null : <p className="mt-4 text-sm text-green-700">{notice}</p>}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Créer un compte</CardTitle>
          <CardDescription>
            Mot de passe de 8 caractères minimum, à transmettre à la personne concernée.
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
                const { mail } = await createAccount({
                  email: String(form.get("email")),
                  password: String(form.get("password")),
                  name: String(form.get("name")),
                  role: String(form.get("role")) as Role,
                });
                element.reset();
                setNotice(
                  mail.sent
                    ? "Compte créé, et ses identifiants lui ont été envoyés par e-mail."
                    : `Compte créé, mais le message n'est pas parti (${mail.error}) : ` +
                      "transmettez-lui son mot de passe vous-même.",
                );
              });
            }}
          >
            <div className="min-w-40 flex-1">
              <Label htmlFor="name">Nom</Label>
              <Input id="name" name="name" className="mt-2" required />
            </div>
            <div className="min-w-48 flex-1">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" name="email" type="email" className="mt-2" required />
            </div>
            <div>
              <Label htmlFor="password">Mot de passe</Label>
              <Input id="password" name="password" className="mt-2" required minLength={8} />
            </div>
            <div>
              <Label htmlFor="role">Rôle</Label>
              <Select id="role" name="role" className="mt-2" defaultValue="manager">
                <option value="player">{roleLabels.player}</option>
                <option value="manager">{roleLabels.manager}</option>
                <option value="admin">{roleLabels.admin}</option>
              </Select>
            </div>
            <Button type="submit">Créer</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Comptes existants</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead>Équipes gérées</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(accounts ?? []).map((row) => (
                <TableRow key={row._id}>
                  <TableCell className="font-medium">{row.name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{row.email ?? "—"}</TableCell>
                  <TableCell>
                    <Select
                      value={row.role}
                      onChange={(event) =>
                        guard(
                          () =>
                            setRole({ userId: row._id, role: event.target.value as Role }),
                          "Rôle modifié.",
                        )
                      }
                    >
                      <option value="player">{roleLabels.player}</option>
                      <option value="manager">{roleLabels.manager}</option>
                      <option value="admin">{roleLabels.admin}</option>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      {row.managedTeams.map((team) => (
                        <Badge key={team._id} variant="muted">
                          {team.name}
                          <button
                            type="button"
                            className="ml-1 cursor-pointer"
                            aria-label={`Détacher ${team.name}`}
                            onClick={() =>
                              guard(
                                () => removeManager({ teamId: team._id, userId: row._id }),
                                "Équipe détachée.",
                              )
                            }
                          >
                            ×
                          </button>
                        </Badge>
                      ))}
                      {row.role === "player" ? null : (
                        <ChampionshipTeamPicker
                          value={attachTo[row._id] ?? ""}
                          onChange={(value) =>
                            setAttachTo((previous) => ({ ...previous, [row._id]: value }))
                          }
                          championshipIds={(championships ?? []).map(
                            (championship) => championship._id,
                          )}
                          onAttach={(teamId) =>
                            guard(
                              () => addManager({ teamId, userId: row._id }),
                              "Équipe rattachée.",
                            )
                          }
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}

/** Sélecteur d'équipe parmi tous les championnats de la saison courante. */
function ChampionshipTeamPicker({
  value,
  onChange,
  championshipIds,
  onAttach,
}: {
  value: string;
  onChange: (value: string) => void;
  championshipIds: Id<"championships">[];
  onAttach: (teamId: Id<"teams">) => void;
}) {
  const first = useQuery(
    api.teams.listByChampionship,
    championshipIds[0] ? { championshipId: championshipIds[0] } : "skip",
  );
  const second = useQuery(
    api.teams.listByChampionship,
    championshipIds[1] ? { championshipId: championshipIds[1] } : "skip",
  );
  const teams = [...(first ?? []), ...(second ?? [])];

  if (teams.length === 0) {
    return null;
  }
  return (
    <span className="flex items-center gap-1">
      <Select
        className="h-8 w-40"
        value={value}
        aria-label="Rattacher une équipe"
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Rattacher…</option>
        {teams.map((team) => (
          <option key={team._id} value={team._id}>
            {team.name}
          </option>
        ))}
      </Select>
      <Button
        size="sm"
        variant="ghost"
        disabled={value === ""}
        onClick={() => onAttach(value as Id<"teams">)}
      >
        OK
      </Button>
    </span>
  );
}
