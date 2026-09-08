"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/convex/_generated/api";
import { formatCountdown, formatDateTime } from "@/lib/format";
import { todoLabels } from "@/lib/labels";

export default function DashboardPage() {
  useParams();
  const account = useQuery(api.users.me);
  const todo = useQuery(api.matches.myTodo, account === null ? "skip" : {});
  const teams = useQuery(api.teams.mine, account === null ? "skip" : {});

  if (account === undefined) {
    return <main className="mx-auto max-w-3xl px-6 py-10 text-sm">Chargement…</main>;
  }
  if (account === null) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10 text-sm">
        <p>
          Cette page demande un compte.{" "}
          <Link href="/connexion" className="underline">
            Se connecter
          </Link>
          .
        </p>
      </main>
    );
  }

  const actionable = (todo ?? []).filter((row) => row.action !== "waiting");
  const waiting = (todo ?? []).filter((row) => row.action === "waiting");

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Tableau de bord</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Aucune notification n&apos;est envoyée : c&apos;est ici que vous voyez ce qui attend votre
        action.
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-medium">À traiter</h2>
        <div className="mt-3 flex flex-col gap-2">
          {todo === undefined ? (
            <p className="text-muted-foreground text-sm">Chargement…</p>
          ) : actionable.length === 0 ? (
            <p className="text-muted-foreground text-sm">Rien ne vous attend.</p>
          ) : (
            actionable.map((row) => (
              <Link key={row.match._id} href={`/matchs/${row.match._id}`}>
                <Card className="hover:border-ring gap-3 py-4 transition-colors">
                  <CardHeader>
                    <CardTitle className="text-base">
                      {row.match.homeTeamName} — {row.match.awayTeamName}
                    </CardTitle>
                    <CardDescription>
                      Journée {row.match.matchdayNumber}
                      {row.match.slot === undefined
                        ? ""
                        : ` · ${formatDateTime(row.match.slot.at)}`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-center gap-2">
                    <Badge>{todoLabels[row.action]}</Badge>
                    {row.deadline === null ? null : (
                      <span className="text-muted-foreground text-xs">
                        Validation tacite {formatCountdown(row.deadline)}
                      </span>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </div>
      </section>

      {waiting.length === 0 ? null : (
        <section className="mt-8">
          <h2 className="text-sm font-medium">En attente de l&apos;adversaire</h2>
          <div className="mt-3 flex flex-col gap-1">
            {waiting.map((row) => (
              <Link
                key={row.match._id}
                href={`/matchs/${row.match._id}`}
                className="text-muted-foreground hover:bg-muted/50 rounded-md px-2 py-1 text-sm"
              >
                {row.match.homeTeamName} — {row.match.awayTeamName} (journée{" "}
                {row.match.matchdayNumber})
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-sm font-medium">Mes équipes</h2>
        <div className="mt-3 flex flex-col gap-2">
          {teams === undefined ? (
            <p className="text-muted-foreground text-sm">Chargement…</p>
          ) : teams.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aucune équipe ne vous est rattachée. Le comité s&apos;en charge.
            </p>
          ) : (
            teams.map((team) => (
              <Link key={team._id} href={`/equipes/${team._id}`}>
                <Card className="hover:border-ring gap-2 py-4 transition-colors">
                  <CardHeader>
                    <CardTitle className="text-base">{team.name}</CardTitle>
                    <CardDescription>
                      {team.championshipName} · saison {team.seasonLabel}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
