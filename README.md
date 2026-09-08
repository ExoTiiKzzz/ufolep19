# UFOLEP 19 — Gestion de saison de volley

Gestion d'une saison de championnats de volley-ball pour l'UFOLEP 19 : championnats, équipes,
effectifs, organisation concertée des matchs, feuilles de match et classements.

- **Règles, cycle de vie et décisions** : [AGENTS.md](./AGENTS.md) (alias `CLAUDE.md`)
- **Glossaire du domaine** : [CONTEXT.md](./CONTEXT.md) — le vocabulaire qui y est fixé fait autorité
- **Décisions d'architecture** : [docs/adr/](./docs/adr/)
- **Spec et tickets** : [.scratch/saison-volley/](./.scratch/saison-volley/)

## Stack

Next.js 16 (App Router) + React 19, Convex, Tailwind CSS 4, shadcn/ui, TypeScript strict,
Vitest + `convex-test`.

## Scripts

| Commande | Effet |
| --- | --- |
| `npm run dev` | Serveur de développement Next.js sur http://localhost:3000 |
| `npm run dev:convex` | Backend Convex en mode développement : pousse le schéma et les fonctions, régénère `convex/_generated/`, et surveille les changements |
| `npm test` | Suite de tests (Vitest, une passe) |
| `npm run test:watch` | Suite de tests en surveillance |
| `npm run typecheck` | Vérification TypeScript sans émission |
| `npm run build` | Build de production Next.js |

En développement, faire tourner `npm run dev:convex` **et** `npm run dev` en parallèle.

## Backend Convex

Le projet est rattaché à un déploiement de développement Convex ; `NEXT_PUBLIC_CONVEX_URL` et
`CONVEX_DEPLOYMENT` sont renseignés dans `.env.local` — voir [.env.example](./.env.example). Sur un
poste vierge, `npm run dev:convex` reconfigure le tout.

`npm run dev:convex` pousse le schéma et les fonctions, régénère `convex/_generated/` et surveille
les changements. **Les tests n'ont pas besoin du déploiement** : `convex-test` exécute une base en
mémoire.

Le dossier `convex/` a son propre `tsconfig.json`, utilisé par le typecheck de `convex dev`. Les
fichiers de test et le helper de test y sont exclus : ils ne sont pas des modules Convex et
utilisent des API Vite absentes du runtime Convex.

## Authentification

Convex Auth avec provider mot de passe, **sans inscription publique** : le flux `signUp` du
provider est fermé côté serveur, et tous les comptes sont créés par un administrateur.

Amorçage du premier administrateur sur une base sans compte :

```bash
npx convex run admin:createAdmin '{"email":"...","password":"...","name":"..."}'
```

La fonction est `internal` (inaccessible au client), refuse d'écraser un compte existant et exige
un mot de passe de 8 caractères minimum.

> Un administrateur de développement existe déjà sur le déploiement dev :
> `comite@ufolep19.test` / `dev-ufolep19-2026`. **À supprimer ou à changer** depuis le dashboard
> Convex ; il n'a servi qu'à vérifier le parcours de connexion.

Le rôle (`player`, `manager`, `admin`) est un attribut unique du compte. Chaque fonction Convex
revérifie le rôle de l'appelant via les helpers de `convex/authz.ts` — l'UI masque ce qui n'est pas
permis, mais ne fait jamais autorité.

## Structure

```
app/                    pages Next.js (public, responsable, administration)
components/             composants applicatifs
components/ui/          composants shadcn/ui
convex/                 schéma, queries, mutations, actions
lib/rules/              règles métier pures : score, classement, cycle de vie, calendrier
lib/                    helpers partagés (formatage, libellés)
proxy.ts                convention Next 16 (ex-`middleware.ts`) : rafraîchit le jeton d'auth
```

Les règles métier vivent dans `lib/rules/` sans dépendance à Convex ni à React, et sont importées
par les fonctions Convex. C'est ce qui rend leur combinatoire testable directement.

## Tests

Deux seams, et deux seulement :

- **Seam principal — les fonctions Convex publiques.** Tout le comportement observable (cycle de
  vie d'un match, autorisations, validation tacite, périmètre public) est testé en appelant les
  queries et mutations sur une base en mémoire, avec le schéma réel, via `convex-test` sous Vitest
  en environnement `edge-runtime`. Les identités sont simulées, le temps est contrôlé par les faux
  timers.
- **Seam étroit — les modules purs.** Seules les règles de set et le calcul du classement sont
  testés directement, par tables de cas, parce que leur combinatoire coûterait un scénario de base
  complet par cas.

Le helper de mise en place vit dans `convex/test.setup.ts` et grossit ticket après ticket jusqu'à
produire un championnat jouable. Un test nomme la règle qu'il protège, pas la fonction qu'il
appelle.
