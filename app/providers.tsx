"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";

// `?.trim()` et non `=== undefined` : une variable renseignée mais vide — cas classique
// d'une saisie dans l'interface d'un hébergeur — doit compter comme absente.
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();

/**
 * Écran de diagnostic quand l'URL du backend manque.
 *
 * `NEXT_PUBLIC_CONVEX_URL` est remplacée à la construction : absente, elle ne fait pas
 * échouer le build — l'application se déploie et rend une page blanche dans le navigateur.
 * Autant afficher ce qui manque et comment le corriger.
 */
function MissingBackendUrl() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-xl font-semibold">Backend non configuré</h1>
      <p className="text-muted-foreground mt-3 text-sm">
        La variable <code>NEXT_PUBLIC_CONVEX_URL</code> n&apos;était pas renseignée au moment de
        la construction de cette application.
      </p>
      <ul className="text-muted-foreground mt-4 flex list-disc flex-col gap-2 pl-5 text-sm">
        <li>
          <strong>En local</strong> : lancez <code>npm run dev:convex</code>, qui renseigne{" "}
          <code>.env.local</code>.
        </li>
        <li>
          <strong>Au déploiement</strong> : soit la commande de build est{" "}
          <code>
            npx convex deploy --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL --cmd &apos;npm run
            build&apos;
          </code>
          , qui injecte l&apos;URL et pousse les fonctions ; soit vous renseignez la variable à la
          main avec l&apos;URL du déploiement Convex de <strong>production</strong>.
        </li>
      </ul>
      <p className="text-muted-foreground mt-4 text-sm">
        Voir <code>docs/deploiement.md</code>.
      </p>
    </main>
  );
}

const convex =
  convexUrl === undefined || convexUrl === "" ? null : new ConvexReactClient(convexUrl);

export function Providers({ children }: { children: ReactNode }) {
  if (convex === null) {
    return <MissingBackendUrl />;
  }
  return <ConvexAuthNextjsProvider client={convex}>{children}</ConvexAuthNextjsProvider>;
}
