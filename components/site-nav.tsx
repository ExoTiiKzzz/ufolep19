"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { roleLabels } from "@/lib/roles";

/**
 * Les contrôles du bandeau ne peuvent pas hériter des couleurs de page : ils sont posés sur
 * la couleur principale, et non sur le fond. Tout y est exprimé relativement à
 * `primary-foreground`, ce qui les garde lisibles en thème clair comme en thème sombre.
 */
const onPrimary =
  "border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10";

export function SiteNav() {
  const account = useQuery(api.users.me);
  // Compteur de « à traiter ». Réservé aux comptes connectés : la query exige une identité.
  const todoCount = useQuery(
    api.matches.myTodoCount,
    account === undefined || account === null ? "skip" : {},
  );
  const { signOut } = useAuthActions();
  const router = useRouter();

  return (
    <header className="bg-primary text-primary-foreground border-b">
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3">
        <Link href="/" className="text-sm font-semibold">
          UFOLEP 19 — Volley
        </Link>

        {account !== undefined && account !== null ? (
          <>
            <Link
              href="/tableau-de-bord"
              className="text-primary-foreground/80 flex items-center gap-1.5 text-sm hover:underline"
            >
              Tableau de bord
              {todoCount === undefined || todoCount === 0 ? null : (
                <span
                  // Le bandeau est déjà bleu : le compteur s'exprime relativement à
                  // `primary-foreground`, sinon du bleu sur bleu ne se verrait pas.
                  className="bg-primary-foreground text-primary rounded-full px-1.5 text-xs font-semibold"
                  aria-label={`${todoCount} élément${todoCount > 1 ? "s" : ""} à traiter`}
                >
                  {todoCount}
                </span>
              )}
            </Link>
            {account.role === "admin" ? (
              <Link
                href="/administration"
                className="text-primary-foreground/80 text-sm hover:underline"
              >
                Administration
              </Link>
            ) : null}
          </>
        ) : null}

        <div className="ml-auto flex items-center gap-3">
          {account === undefined ? null : account === null ? (
            <Link
              href="/connexion"
              className={cn(
                "inline-flex h-8 shrink-0 items-center rounded-md border px-3 text-sm font-medium transition-colors",
                onPrimary,
              )}
            >
              Se connecter
            </Link>
          ) : (
            <>
              <span className="text-primary-foreground/80 hidden text-sm sm:inline">
                {account.name ?? account.email}
              </span>
              <span className="bg-primary-foreground/15 text-primary-foreground rounded-md px-2 py-0.5 text-xs font-medium">
                {roleLabels[account.role]}
              </span>
              <Button
                variant="outline"
                size="sm"
                className={onPrimary}
                onClick={async () => {
                  await signOut();
                  router.push("/");
                }}
              >
                Se déconnecter
              </Button>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
