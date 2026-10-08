"use client";

import { useAction, useQuery } from "convex/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import { errorMessage } from "@/lib/errors";
import { roleLabels } from "@/lib/roles";
import { MIN_PASSWORD_LENGTH, passwordProblem } from "@/lib/rules/password";

/**
 * Mon compte : l'identité connectée, et le changement de mot de passe.
 *
 * C'est ce qui rend « provisoire » le mot de passe délivré par la plateforme : la personne
 * le remplace dès sa première connexion, et l'administrateur n'a rien à retenir.
 */
export default function MyAccountPage() {
  const account = useQuery(api.users.me);
  const changePassword = useAction(api.password.change);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (account === undefined) {
    return <main className="mx-auto max-w-md px-6 py-10 text-sm">Chargement…</main>;
  }
  if (account === null) {
    return (
      <main className="mx-auto max-w-md px-6 py-10 text-sm">
        Connectez-vous pour accéder à votre compte.
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Mon compte</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        {account.name ?? account.email} · {account.email} · {roleLabels[account.role]}
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Changer mon mot de passe</CardTitle>
          <CardDescription>
            Remplacez le mot de passe provisoire qui vous a été transmis. Vos autres sessions
            ouvertes seront fermées.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setError(null);
              setNotice(null);
              const element = event.currentTarget;
              const form = new FormData(element);
              const next = String(form.get("next"));
              const problem = passwordProblem(next);
              if (problem !== null) {
                setError(problem);
                return;
              }
              if (next !== String(form.get("confirm"))) {
                setError("Les deux saisies du nouveau mot de passe diffèrent.");
                return;
              }
              try {
                await changePassword({ current: String(form.get("current")), next });
                element.reset();
                setNotice("Mot de passe changé.");
              } catch (caught) {
                setError(errorMessage(caught, "Changement impossible."));
              }
            }}
          >
            <div>
              <Label htmlFor="current">Mot de passe actuel</Label>
              <Input
                id="current"
                name="current"
                type="password"
                autoComplete="current-password"
                className="mt-2"
                required
              />
            </div>
            <div>
              <Label htmlFor="next">Nouveau mot de passe</Label>
              <Input
                id="next"
                name="next"
                type="password"
                autoComplete="new-password"
                className="mt-2"
                required
                minLength={MIN_PASSWORD_LENGTH}
              />
              <p className="text-muted-foreground mt-1 text-xs">
                {MIN_PASSWORD_LENGTH} caractères au moins.
              </p>
            </div>
            <div>
              <Label htmlFor="confirm">Nouveau mot de passe, à nouveau</Label>
              <Input
                id="confirm"
                name="confirm"
                type="password"
                autoComplete="new-password"
                className="mt-2"
                required
              />
            </div>
            {error === null ? null : <p className="text-sm text-red-600">{error}</p>}
            {notice === null ? null : <p className="text-sm text-green-700">{notice}</p>}
            <Button type="submit">Changer le mot de passe</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
