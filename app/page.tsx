"use client";

import { useQuery } from "convex/react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/convex/_generated/api";

export default function Home() {
  const seasons = useQuery(api.seasons.list);
  const current = useQuery(api.seasons.current);
  const championships = useQuery(
    api.championships.listBySeason,
    current === undefined || current === null ? "skip" : { seasonId: current._id },
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">UFOLEP 19 — Volley-ball</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Calendriers, résultats et classements des championnats départementaux.
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-medium">
          Championnats {current === null ? "" : (current?.label ?? "")}
        </h2>
        <div className="mt-3 flex flex-col gap-3">
          {current === null ? (
            <p className="text-muted-foreground text-sm">Aucune saison en cours.</p>
          ) : championships === undefined ? (
            <p className="text-muted-foreground text-sm">Chargement…</p>
          ) : championships.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aucun championnat n&apos;est encore ouvert pour cette saison.
            </p>
          ) : (
            championships.map((championship) => (
              <Link key={championship._id} href={`/championnats/${championship._id}`}>
                <Card className="hover:border-ring transition-colors">
                  <CardHeader>
                    <CardTitle>{championship.name}</CardTitle>
                    <CardDescription>Calendrier, résultats et classement</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))
          )}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-medium">Saisons</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {seasons === undefined ? (
            <p className="text-muted-foreground text-sm">Chargement…</p>
          ) : (
            seasons.map((season) => (
              <Badge key={season._id} variant={season.isCurrent ? "default" : "secondary"}>
                {season.label}
                {season.isCurrent ? " — en cours" : ""}
              </Badge>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
