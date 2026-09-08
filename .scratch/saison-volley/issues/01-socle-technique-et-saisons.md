# 01 — Socle technique et tranche publique « saisons »

**What to build:** un visiteur ouvre l'application et voit la liste des saisons de l'UFOLEP 19,
la saison courante mise en évidence. Rien d'autre n'est visible. Cette tranche existe pour faire
traverser une donnée réelle de la base jusqu'à l'écran, et pour poser les conventions que toutes
les tranches suivantes réutilisent : structure du projet, forme des tests aux deux seams, helper
de mise en place d'un jeu de données.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] Next.js (App Router) avec React 19, Tailwind et shadcn/ui installés et fonctionnels.
- [x] Convex configuré, schéma déclaré, table des saisons avec un index sur la saison courante.
- [x] Une query Convex publique renvoie les saisons ; la page d'accueil les affiche avec un
      composant shadcn, la saison courante distinguée visuellement.
- [x] Vitest en environnement `edge-runtime` et `convex-test` opérationnels : un test appelle la
      query publique sur une base en mémoire et vérifie l'ordre et le marquage de la saison
      courante.
- [x] Un helper de mise en place est amorcé : il crée une saison et sera étendu par les tranches
      suivantes jusqu'à produire un championnat jouable.
- [x] TypeScript en mode strict ; `npm test` et le build passent.
- [x] Les scripts de développement, de test et de build sont documentés dans le README.

## Comments

Livré. Vert : `npm test` (4 tests), `npm run typecheck`, `npm run build`, et la page d'accueil rend
correctement (Tailwind actif, état de chargement) vérifiée dans le navigateur.

Deux obstacles rencontrés, et ce qui a été fait :

1. **`convex codegen` exige un déploiement configuré.** Le socle a d'abord été construit sans
   déploiement : le codegen en mode self-hosted écrit `convex/_generated/` avant d'échouer sur la
   connexion, mais son `api.d.ts` est une variante dégradée qui type toute l'API en `any`. Il a été
   remplacé par le gabarit canonique typé, vérifié par une sonde `@ts-expect-error`. **Résolu
   depuis** : le déploiement de développement a été provisionné et `npm run dev:convex` a régénéré
   un `api.d.ts` typé identique. Aucune maintenance manuelle n'est nécessaire.

   Au passage, `convex dev` typecheck `convex/` avec son propre `tsconfig.json`, où
   `import.meta.glob` n'existe pas : les fichiers de test et le helper de test y sont désormais
   exclus, et le helper référence explicitement les types `vite/client`.
2. **Le motif `import.meta.glob` documenté par `convex-test` ne fonctionne plus.**
   `./**/!(*.*.)*.*s` renvoie zéro module avec la version de Vite embarquée par Vitest 5 :
   l'extglob n'y est pas interprété, et les tests échouaient sur « Could not find the _generated
   directory ». Remplacé par la forme tableau avec exclusions négatives (`!./**/*.d.ts`,
   `!./**/*.test.ts`, `!./**/*.setup.ts`).

Deux écarts de version assumés : **TypeScript 5.9.3** plutôt que 7.0.2 (chaîne Convex + Next la
mieux éprouvée) et **Next 16.3.4** (dernière stable, React 19 en pair).

Vérifié en bout de chaîne après provisionnement du déploiement : le schéma et la query sont poussés,
et la page affiche des saisons réelles avec la saison courante marquée.
