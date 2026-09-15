# UFOLEP 19 — Gestion de saison de volley

Gestion d'une saison de championnats de volley-ball pour l'UFOLEP 19 : championnats, équipes,
effectifs, organisation concertée des matchs, feuilles de match et classements.

- **Règles, cycle de vie et décisions** : [AGENTS.md](./AGENTS.md) (alias `CLAUDE.md`)
- **Glossaire du domaine** : [CONTEXT.md](./CONTEXT.md) — le vocabulaire qui y est fixé fait autorité
- **Décisions d'architecture** : [docs/adr/](./docs/adr/)
- **Spec et tickets** : [.scratch/saison-volley/](./.scratch/saison-volley/)
- **Déploiement en production** : [docs/deploiement.md](./docs/deploiement.md)

## Stack

Next.js 16 (App Router) + React 19, Convex, Tailwind CSS 4, shadcn/ui, TypeScript strict,
Vitest + `convex-test`.

## Scripts

| Commande | Effet |
| --- | --- |
| `npm run dev` | Serveur de développement Next.js sur http://localhost:3000 |
| `npm run dev:convex` | Backend Convex en mode développement : pousse le schéma et les fonctions, régénère `convex/_generated/`, et surveille les changements |
| `npm run seed:dev` | Jeu de données de développement : purge le précédent, recrée comptes, championnat et matchs (voir « Jeu de données de développement ») |
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

## Jeu de données de développement

```bash
npm run seed:dev
```

Écrit de quoi parcourir le cycle de vie d'un match à deux comptes, sur le déploiement pointé par
`CONVEX_DEPLOYMENT`. **À ne lancer qu'en développement** : le mot de passe des comptes est en clair
dans la sortie de la commande.

| Compte | Rôle | Équipe |
| --- | --- | --- |
| `admin@dev.ufolep19.test` | `admin` | — |
| `tulle@dev.ufolep19.test` | `manager` | Tulle 1 |
| `brive@dev.ufolep19.test` | `manager` | Brive 1 |

Mot de passe commun `ufolep19dev`, remplaçable :
`npx convex run seed:dev '{"password":"..."}'`.

Les deux équipes s'affrontent deux fois, dans un championnat de la saison courante, avec huit
licenciés chacune à l'effectif :

- **Journée 1**, fenêtre fermée — Tulle reçoit, le créneau est passé : le responsable de Tulle doit
  **saisir la feuille de match**, celui de Brive la validera.
- **Journée 2**, fenêtre ouverte aujourd'hui — Brive reçoit, aucun créneau : le responsable de
  Brive doit **proposer un créneau**, celui de Tulle l'acceptera ou le refusera.

La commande est **rejouable** : chaque exécution supprime d'abord le jeu précédent. Pour que cette
purge ne morde pas sur des données saisies à la main, tout ce qu'elle crée est marqué — saisons et
clubs suffixés `(dev)`, comptes sur le domaine réservé `dev.ufolep19.test`, licences préfixées
`DEV-`. Rien d'autre n'est touché, à une exception assumée : la saison du jeu devient la **saison
courante**, ce qui démet celle qui l'était.

## Migration des licences

Les fiches licenciés portaient un numéro unique sans dates. Le modèle est désormais une
**suite de licences** par joueur, chacune valable sur une période (voir « Licences » dans
[AGENTS.md](./AGENTS.md)). La reprise des données existantes est explicite :

```bash
npx convex run licenses:migrate '{"validFrom":"2025-09-01","validUntil":"2026-08-31"}'
```

Les dates sont **obligatoires** : l'ancien modèle n'en portait aucune, et les deviner
déciderait à la place de l'utilisateur qui a le droit de jouer. La commande est rejouable, et
une fiche déjà migrée est ignorée. Le déploiement de développement a été migré le
15 septembre 2026 sur la saison 2026-2027.

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
