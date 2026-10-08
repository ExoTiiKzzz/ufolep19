"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { KeyRound, Trash2 } from "lucide-react";
import { Fragment, useState } from "react";

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
import { Tooltip } from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accountNotice } from "@/lib/account-notice";
import { errorMessage } from "@/lib/errors";
import { roleLabels, type Role } from "@/lib/roles";

export default function AccountsPage() {
  const accounts = useQuery(api.users.list);
  const createAccount = useAction(api.admin.createUserAccount);
  const setRole = useMutation(api.users.setRole);
  const addManager = useMutation(api.teams.addManager);
  const removeManager = useMutation(api.teams.removeManager);
  const resetPassword = useAction(api.admin.resetPassword);
  const removeAccount = useMutation(api.users.remove);
  const me = useQuery(api.users.me);
  const season = useQuery(api.seasons.current);
  const seasonTeams = useQuery(
    api.teams.listBySeason,
    season ? { seasonId: season._id } : "skip",
  );
  // Une seule ligne à la fois en attente de confirmation : réinitialiser ou supprimer coupe
  // l'accès de quelqu'un.
  const [pending, setPending] = useState<{ userId: string; action: "reset" | "remove" } | null>(
    null,
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
      setError(errorMessage(caught, "Action impossible."));
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
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
            Le mot de passe est généré et envoyé à la personne. S&apos;il ne part pas, il
            s&apos;affiche ici une seule fois : transmettez-le-lui. Elle le remplace ensuite
            depuis « Mon compte ».
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
                const { account } = await createAccount({
                  email: String(form.get("email")),
                  name: String(form.get("name")),
                  role: String(form.get("role")) as Role,
                });
                element.reset();
                setNotice(accountNotice("Compte créé.", account, "account"));
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
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(accounts ?? []).map((row) => (
                <Fragment key={row._id}>
                  <TableRow>
                    <TableCell className="font-medium">{row.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{row.email ?? "—"}</TableCell>
                    <TableCell>
                      <Select
                        className="min-w-36"
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
                          <SeasonTeamPicker
                            value={attachTo[row._id] ?? ""}
                            onChange={(value) =>
                              setAttachTo((previous) => ({ ...previous, [row._id]: value }))
                            }
                            teams={seasonTeams ?? []}
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
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Tooltip label="Nouveau mot de passe" align="end">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Nouveau mot de passe pour ${row.name ?? row.email}`}
                            aria-pressed={pending?.userId === row._id && pending.action === "reset"}
                            onClick={() => setPending({ userId: row._id, action: "reset" })}
                          >
                            <KeyRound className="size-4" />
                          </Button>
                        </Tooltip>
                        {row._id === me?._id ? (
                          // Pas de suppression de son propre compte : l'emplacement reste,
                          // pour que les icônes restent alignées d'une ligne à l'autre.
                          <span className="size-8" />
                        ) : (
                          <Tooltip label="Supprimer le compte" align="end">
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Supprimer le compte de ${row.name ?? row.email}`}
                              aria-pressed={
                                pending?.userId === row._id && pending.action === "remove"
                              }
                              onClick={() => setPending({ userId: row._id, action: "remove" })}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  {pending?.userId !== row._id ? null : (
                    // Confirmation sur une ligne à part : réinitialiser ou supprimer coupe l'accès
                    // de quelqu'un, et la colonne d'icônes n'a pas la place de l'expliquer.
                    <TableRow className="bg-muted/50">
                      <TableCell colSpan={5}>
                        <div className="flex flex-wrap items-center justify-end gap-3">
                          <p className="text-sm">
                            {pending.action === "reset"
                              ? `Attribuer un nouveau mot de passe à ${row.name ?? row.email} ? L'actuel cessera de fonctionner et ses sessions seront fermées.`
                              : `Supprimer le compte de ${row.name ?? row.email} ? Plus aucune connexion, adresse libérée ; son nom reste dans l'historique des matchs.`}
                          </p>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() =>
                                guard(async () => {
                                  setPending(null);
                                  if (pending.action === "reset") {
                                    const account = await resetPassword({ userId: row._id });
                                    setNotice(
                                      accountNotice(
                                        `Nouveau mot de passe attribué à ${row.name ?? account.email}.`,
                                        account,
                                        "account",
                                      ),
                                    );
                                  } else {
                                    await removeAccount({ userId: row._id });
                                    setNotice(`Compte de ${row.name ?? row.email} supprimé.`);
                                  }
                                })
                              }
                            >
                              {pending.action === "reset" ? "Confirmer" : "Supprimer"}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setPending(null)}>
                              Annuler
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}

/**
 * Sélecteur d'équipe parmi toutes celles de la saison courante, groupées par championnat :
 * un même club a souvent une équipe en D1 et une au mixte, et une liste à plat les
 * confondrait.
 */
function SeasonTeamPicker({
  value,
  onChange,
  teams,
  onAttach,
}: {
  value: string;
  onChange: (value: string) => void;
  teams: { _id: Id<"teams">; name: string; championshipId: string; championshipName: string }[];
  onAttach: (teamId: Id<"teams">) => void;
}) {
  if (teams.length === 0) {
    return null;
  }
  // `listBySeason` trie déjà par championnat : il suffit de couper aux changements.
  const groups: { name: string; teams: typeof teams }[] = [];
  for (const team of teams) {
    const last = groups.at(-1);
    if (last !== undefined && last.name === team.championshipName) {
      last.teams.push(team);
    } else {
      groups.push({ name: team.championshipName, teams: [team] });
    }
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
        {groups.map((group) => (
          <optgroup key={group.name} label={group.name}>
            {group.teams.map((team) => (
              <option key={team._id} value={team._id}>
                {team.name}
              </option>
            ))}
          </optgroup>
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
