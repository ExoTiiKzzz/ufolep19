"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
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

export default function LicenseesPage() {
  const account = useQuery(api.users.me);
  const isAdmin = account?.role === "admin";
  const [term, setTerm] = useState("");
  const result = useQuery(api.players.search, isAdmin ? { term } : "skip");

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
            autoFocus
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
