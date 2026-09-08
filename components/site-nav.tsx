"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { roleLabels } from "@/lib/roles";

export function SiteNav() {
  const account = useQuery(api.users.me);
  const { signOut } = useAuthActions();
  const router = useRouter();

  return (
    <header className="border-b">
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3">
        <Link href="/" className="text-sm font-semibold">
          UFOLEP 19 — Volley
        </Link>

        {account !== undefined && account !== null ? (
          <>
            <Link href="/tableau-de-bord" className="text-muted-foreground text-sm hover:underline">
              Tableau de bord
            </Link>
            {account.role === "admin" ? (
              <Link
                href="/administration"
                className="text-muted-foreground text-sm hover:underline"
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
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Se connecter
            </Link>
          ) : (
            <>
              <span className="text-muted-foreground hidden text-sm sm:inline">
                {account.name ?? account.email}
              </span>
              <Badge variant="secondary">{roleLabels[account.role]}</Badge>
              <Button
                variant="outline"
                size="sm"
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
