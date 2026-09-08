"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";

export default function SeasonsPage() {
  const seasons = useQuery(api.seasons.list);
  const create = useMutation(api.seasons.create);
  const setCurrent = useMutation(api.seasons.setCurrent);
  const [error, setError] = useState<string | null>(null);

  async function guard(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action impossible.");
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Saisons</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Une seule saison est courante à la fois. Les équipes appartiennent à une saison ; clubs et
        licenciés la traversent.
      </p>

      {error === null ? null : <p className="mt-4 text-sm text-red-600">{error}</p>}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Nouvelle saison</CardTitle>
          <CardDescription>La première saison créée devient courante d&apos;office.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const element = event.currentTarget;
              await guard(async () => {
                await create({ label: String(form.get("label")) });
                element.reset();
              });
            }}
          >
            <div className="min-w-48 flex-1">
              <Label htmlFor="label">Libellé</Label>
              <Input id="label" name="label" className="mt-2" required placeholder="2026-2027" />
            </div>
            <Button type="submit">Créer</Button>
          </form>
        </CardContent>
      </Card>

      <div className="mt-6 flex flex-col gap-2">
        {(seasons ?? []).map((season) => (
          <div
            key={season._id}
            className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
          >
            <span className="font-medium">{season.label}</span>
            {season.isCurrent ? <Badge>Courante</Badge> : null}
            {season.isCurrent ? null : (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => guard(() => setCurrent({ seasonId: season._id }))}
              >
                Désigner comme courante
              </Button>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
