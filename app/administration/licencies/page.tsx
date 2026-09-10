"use client";

import { useAction, useQuery } from "convex/react";
import Link from "next/link";
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
import { accountNotice } from "@/lib/account-notice";

export default function LicenseesPage() {
  const account = useQuery(api.users.me);
  const isAdmin = account?.role === "admin";
  const [term, setTerm] = useState("");
  const result = useQuery(api.players.search, isAdmin ? { term } : "skip");
  const clubs = useQuery(api.clubs.list, isAdmin ? {} : "skip");
  const createPlayer = useAction(api.players.create);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (account === undefined) {
    return <main className="mx-auto max-w-4xl px-6 py-10 text-sm">Chargement…</main>;
  }
  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10 text-sm">
        Cette page est réservée aux administrateurs.
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Licenciés</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Tous les licenciés du département, tous clubs confondus.
      </p>

      {error === null ? null : <p className="mt-4 text-sm text-red-600">{error}</p>}
      {notice === null ? null : (
        <p className="mt-4 text-sm text-green-700" role="status">
          {notice}
        </p>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Nouveau licencié</CardTitle>
          <CardDescription>
            Rattaché au club choisi. Une adresse e-mail lui ouvre un compte de consultation et
            lui envoie ses identifiants.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {clubs === undefined ? (
            <p className="text-muted-foreground text-sm">Chargement…</p>
          ) : clubs.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Créez d&apos;abord un club depuis la page Clubs : un licencié est toujours
              rattaché à un club.
            </p>
          ) : (
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const element = event.currentTarget;
                setError(null);
                setNotice(null);
                try {
                  const { account } = await createPlayer({
                    clubId: String(form.get("clubId")) as Id<"clubs">,
                    firstName: String(form.get("firstName")),
                    lastName: String(form.get("lastName")),
                    licenseNumber: String(form.get("licenseNumber")),
                    email: String(form.get("email")),
                  });
                  element.reset();
                  setNotice(accountNotice("Licencié créé.", account));
                } catch (caught) {
                  setError(
                    caught instanceof Error ? caught.message : "Création impossible.",
                  );
                }
              }}
            >
              <div className="min-w-40 flex-1">
                <Label htmlFor="clubId">Club</Label>
                <Select id="clubId" name="clubId" className="mt-2" required>
                  <option value="">Choisir…</option>
                  {clubs.map((club) => (
                    <option key={club._id} value={club._id}>
                      {club.name}
                    </option>
                  ))}
                </Select>
              </div>
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
              <div className="min-w-52 flex-1">
                <Label htmlFor="email">E-mail (facultatif)</Label>
                <Input id="email" name="email" type="email" className="mt-2" />
              </div>
              <Button type="submit">Créer</Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Rechercher</CardTitle>
          <CardDescription>
            Par nom, prénom, numéro de licence, adresse e-mail ou club. Les accents et la casse
            n&apos;ont pas d&apos;importance, et les mots peuvent être saisis dans n&apos;importe
            quel ordre.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Label htmlFor="term" className="sr-only">
            Rechercher un licencié
          </Label>
          <Input
            id="term"
            type="search"
            value={term}
            placeholder="Durand, L0042, Coiroux…"
            onChange={(event) => setTerm(event.target.value)}
          />
          <p className="text-muted-foreground mt-3 text-sm">
            {result === undefined
              ? "Chargement…"
              : result.total === 0
                ? "Aucun licencié ne correspond."
                : `${result.total} licencié(s)` +
                  (result.truncated ? ` — les ${result.players.length} premiers sont affichés.` : "")}
          </p>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Fiches</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Club</TableHead>
                <TableHead>Licence</TableHead>
                <TableHead>Équipes</TableHead>
                <TableHead>Compte</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(result?.players ?? []).map((player) => (
                <TableRow key={player._id}>
                  <TableCell className="font-medium">
                    <Link href={`/joueurs/${player._id}`} className="hover:underline">
                      {player.lastName.toUpperCase()} {player.firstName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/clubs/${player.clubId}`}
                      className="text-muted-foreground hover:underline"
                    >
                      {player.clubName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {player.licenseNumber || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {player.teamNames.length === 0 ? "—" : player.teamNames.join(", ")}
                  </TableCell>
                  <TableCell>
                    {player.email === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-muted-foreground">{player.email}</span>
                        {player.hasAccount ? <Badge variant="muted">compte</Badge> : null}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {result !== undefined && result.players.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {term.trim() === ""
                ? "Aucun licencié enregistré."
                : "Aucun licencié ne correspond à cette recherche."}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
