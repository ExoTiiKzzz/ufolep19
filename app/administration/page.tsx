"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import { formatDateTime } from "@/lib/format";
import { stalledReasonLabels } from "@/lib/labels";

export default function AdminPage() {
  const account = useQuery(api.users.me);
  const isAdmin = account?.role === "admin";
  const season = useQuery(api.seasons.current);
  const championships = useQuery(
    api.championships.listBySeason,
    season ? { seasonId: season._id } : "skip",
  );
  const progress = useQuery(api.adminViews.progress, isAdmin ? {} : "skip");
  const overdue = useQuery(api.adminViews.overdueSlots, isAdmin ? {} : "skip");
  const stalled = useQuery(api.adminViews.stalled, isAdmin ? {} : "skip");
  const createChampionship = useMutation(api.championships.create);
  const [error, setError] = useState<string | null>(null);

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
      <h1 className="text-2xl font-semibold tracking-tight">Administration</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Saison courante : {season === null ? "aucune" : (season?.label ?? "…")}
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/administration/saisons" className={buttonVariants({ variant: "outline" })}>
          Saisons
        </Link>
        <Link href="/administration/clubs" className={buttonVariants({ variant: "outline" })}>
          Clubs
        </Link>
        <Link
          href="/administration/licencies"
          className={buttonVariants({ variant: "outline" })}
        >
          Licenciés
        </Link>
        <Link href="/administration/comptes" className={buttonVariants({ variant: "outline" })}>
          Comptes et rôles
        </Link>
      </div>

      {error === null ? null : <p className="mt-4 text-sm text-red-600">{error}</p>}

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-base">Championnats de la saison</CardTitle>
          <CardDescription>
            Le calendrier est saisi à la main : il n&apos;y a pas de génération automatique.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {season === undefined ? (
            <p className="text-muted-foreground text-sm">Chargement…</p>
          ) : season === null ? (
            <p className="text-muted-foreground text-sm">
              Créez d&apos;abord une saison et désignez-la comme courante.
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                {(championships ?? []).length === 0 ? (
                  <p className="text-muted-foreground text-sm">Aucun championnat.</p>
                ) : (
                  (championships ?? []).map((championship) => {
                    const stats = (progress ?? []).find(
                      (row) => row.championshipId === championship._id,
                    );
                    return (
                      <Link
                        key={championship._id}
                        href={`/administration/championnats/${championship._id}`}
                        className="hover:bg-muted/50 flex flex-wrap items-center gap-3 rounded-md px-2 py-2 text-sm"
                      >
                        <span className="font-medium">{championship.name}</span>
                        {stats === undefined ? null : (
                          <span className="text-muted-foreground">
                            {stats.completed}/{stats.total} matchs terminés · {stats.negotiating} en
                            négociation · {stats.confirmed} à jouer
                            {stats.disputed > 0 ? ` · ${stats.disputed} litige(s)` : ""}
                          </span>
                        )}
                      </Link>
                    );
                  })
                )}
              </div>

              <form
                className="flex flex-wrap items-end gap-3 border-t pt-4"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  const element = event.currentTarget;
                  setError(null);
                  try {
                    await createChampionship({
                      seasonId: season._id,
                      name: String(form.get("name")),
                    });
                    element.reset();
                  } catch (caught) {
                    setError(caught instanceof Error ? caught.message : "Action impossible.");
                  }
                }}
              >
                <div className="min-w-56 flex-1">
                  <Label htmlFor="championship">Nouveau championnat</Label>
                  <Input
                    id="championship"
                    name="name"
                    className="mt-2"
                    required
                    placeholder="Départemental mixte"
                  />
                </div>
                <Button type="submit">Créer</Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Matchs sans créneau à relancer</CardTitle>
          <CardDescription>
            Aucune notification n&apos;est envoyée : cette vue est le filet de sécurité du
            comité.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {(overdue ?? []).length === 0 ? (
            <p className="text-muted-foreground">Rien à relancer.</p>
          ) : (
            (overdue ?? []).map((row) => (
              <Link
                key={row.match._id}
                href={`/matchs/${row.match._id}`}
                className="hover:bg-muted/50 flex flex-wrap items-center gap-3 rounded-md px-2 py-2"
              >
                <span className="font-medium">
                  {row.match.homeTeamName} — {row.match.awayTeamName}
                </span>
                <span className="text-muted-foreground">journée {row.match.matchdayNumber}</span>
                {row.windowClosed ? (
                  <Badge variant="destructive">Fenêtre dépassée</Badge>
                ) : (
                  <Badge variant="secondary">Fenêtre bientôt fermée</Badge>
                )}
                <span className="text-muted-foreground">{row.managers.join(", ")}</span>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Matchs bloqués</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {(stalled ?? []).length === 0 ? (
            <p className="text-muted-foreground">Aucun match bloqué.</p>
          ) : (
            (stalled ?? []).map((row) => (
              <Link
                key={`${row.match._id}-${row.reason}`}
                href={`/matchs/${row.match._id}`}
                className="hover:bg-muted/50 flex flex-wrap items-center gap-3 rounded-md px-2 py-2"
              >
                <span className="font-medium">
                  {row.match.homeTeamName} — {row.match.awayTeamName}
                </span>
                {row.match.slot === undefined ? null : (
                  <span className="text-muted-foreground">
                    {formatDateTime(row.match.slot.at)}
                  </span>
                )}
                <Badge variant="secondary">{stalledReasonLabels[row.reason]}</Badge>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </main>
  );
}
