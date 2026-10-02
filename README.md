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

> **Base à réinitialiser.** Depuis l'introduction des circuits, un championnat porte
> obligatoirement un circuit, un niveau et un format : un déploiement qui contient des
> championnats de l'ancien modèle refusera le nouveau schéma au `convex dev` / `convex deploy`.
> Videz ses tables (dashboard Convex) avant de pousser, puis rejouez le seed ou l'import.

```bash
npm run seed:dev
```

Écrit une **saison entière en cours de route**, sur le déploiement pointé par
`CONVEX_DEPLOYMENT` : 5 clubs, deux circuits, 9 équipes, 66 licenciés, 12 journées et 36 matchs,
dont 15 déjà joués — le classement est donc rempli dès l'ouverture de la page d'accueil.

- **Circuit Championnat** : le championnat départemental (D1, format standard), 6 équipes, 10
  journées, 30 matchs dont 12 joués.
- **Circuit Féminin** : un championnat au format **plateau**, 3 équipes (Tulle F, Brive F,
  Ussel F) avec leurs propres feuilles vertes. Un plateau passé, résultats saisis par
  l'administrateur — un 2-0, un **match nul** et une victoire 1-1 aux points —, et un plateau à
  venir.
**À ne lancer qu'en développement** : le mot de passe des comptes est en clair dans la sortie de
la commande.

| Compte | Rôle | Équipes |
| --- | --- | --- |
| `admin@dev.ufolep19.test` | `admin` | — |
| `tulle@dev.ufolep19.test` | `manager` | Tulle 1, Tulle 2, Tulle F |
| `brive@dev.ufolep19.test` | `manager` | Brive 1, Brive F |
| `ussel@dev.ufolep19.test` | `manager` | Ussel 1, Ussel F |
| `argentat@dev.ufolep19.test` | `manager` | Argentat 1 |
| `objat@dev.ufolep19.test` | `manager` | Objat 1 |

Mot de passe commun `ufolep19dev`, remplaçable :
`npx convex run seed:dev '{"password":"..."}'`.

**Un responsable par club, donc un compte en face de chaque équipe** : toute négociation se joue
entre deux comptes distincts. Tulle en engage deux, ce qui couvre le cas du responsable
multi-équipes. Le calendrier est un aller-retour en ronde à l'italienne : chaque équipe joue une
fois par journée, et le duel Tulle 1 – Brive 1 est placé de sorte que l'aller porte la feuille à
saisir et le retour le créneau à proposer.

Les six états du cycle de vie sont représentés, plus le forfait :

| Où | État | Qui a la main |
| --- | --- | --- |
| J1–J4 | **terminés** (12 matchs, dont un **forfait**) | — |
| J5, fenêtre fermée | **confirmé**, créneau passé | Tulle saisit la feuille |
| J5 | **feuille à valider** | Ussel valide ou conteste |
| J5 | **litige** | l'administrateur arbitre |
| J6, fenêtre ouverte | **créneau proposé** | Objat accepte ou refuse |
| J6 à J10 | **planifiés** | le receveur propose |

Le dernier licencié de Tulle 1 et de Brive 1 porte une licence **close avant le match de J5** : le
cas « licence périmée, joueur non alignable » est dans le jeu, sans avoir à trafiquer la base. Les
compositions des matchs déjà joués n'utilisent que les premiers de chaque effectif, pour qu'aucune
feuille passée ne s'appuie sur une licence expirée.

La commande est **rejouable** : chaque exécution supprime d'abord le jeu précédent. Pour que cette
purge ne morde pas sur des données saisies à la main, tout ce qu'elle crée est marqué — saisons et
clubs suffixés `(dev)`, comptes sur le domaine réservé `dev.ufolep19.test`, licences préfixées
`DEV-`. Rien d'autre n'est touché, à une exception assumée : la saison du jeu devient la **saison
courante**, ce qui démet celle qui l'était.

### Retirer le jeu

```bash
npx convex run seed:purge          # ajouter --prod pour la production
```

Supprime le jeu sans le recréer, avec la même délimitation par marqueurs. **Elle ne restaure pas
la saison courante précédente** : si le jeu en avait démis une, il faut la redésigner depuis
l'écran d'administration des saisons.

### Sur la production

Le jeu peut être posé sur la production pour faire manipuler la plateforme avant le lancement :

```bash
npx convex deploy                                        # pousse schéma + fonctions en prod
npx convex run --prod seed:dev '{"password":"..."}'
```

Trois précautions, dans cet ordre d'importance :

1. **Toujours passer un mot de passe**, jamais le défaut. `ufolep19dev` est écrit dans ce dépôt :
   laissé en production, il ouvre un compte **administrateur** à qui sait lire le README.
2. La saison du jeu devient la saison courante, donc la page d'accueil. C'est voulu tant que la
   vraie saison n'existe pas ; à corriger le jour où elle est créée.
3. Les comptes sont sur `dev.ufolep19.test`, un domaine réservé par la RFC 2606 : **aucun e-mail
   ne leur parviendra jamais**. C'est volontaire — un jeu de démonstration n'a pas à écrire à de
   vraies adresses — mais il faut transmettre les identifiants de la main à la main.

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
