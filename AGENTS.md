# UFOLEP 19 — Gestion de saison de volley

Application de gestion d'une saison de championnats de volley-ball pour l'entité **UFOLEP 19** :
organisation des championnats, des équipes et des joueurs, planification concertée des matchs
entre responsables d'équipe, saisie des scores et classements automatiques.

Documents liés :

- [CONTEXT.md](./CONTEXT.md) — glossaire du domaine. Le vocabulaire qui y est fixé fait autorité :
  ne pas introduire de synonyme listé sous `_Avoid_`.
- [docs/adr/](./docs/adr/) — décisions d'architecture et leurs raisons.

## Stack technique

| Domaine | Choix |
| --- | --- |
| Backend / base de données | **Convex** (schéma, queries, mutations, actions, scheduler, temps réel) |
| Frontend | **Next.js** (App Router) + **React 19** |
| Styles | **Tailwind CSS** |
| Composants UI | **shadcn/ui** |
| Langage | TypeScript (strict) |

Principes :

- Convex est la **seule** source de vérité : toute règle métier (validation d'un score, calcul du
  classement, validation d'une proposition de match) vit dans une mutation/query Convex, jamais
  côté client.
- Le front consomme Convex via `useQuery` / `useMutation` et s'appuie sur la réactivité native
  (pas de cache client maison, pas de revalidation manuelle).
- Les composants shadcn sont ajoutés à la demande dans `components/ui` et adaptés, pas wrappés
  dans des surcouches inutiles.

## Modèle de domaine

```
Saison ──< Championnat ──< Journée ──< Match >── Équipe >── Club ──< Joueur
                                       │                              │
                                       └──< Set                       │
                                       └──< Composition >─────────────┘
```

- **Saison** — cycle annuel (ex. 2025-2026). Regroupe les championnats.
- **Club** — structure locale. Rattache des joueurs et une ou plusieurs équipes. **Traverse les
  saisons.**
- **Joueur** — fiche d'un licencié rattaché à un club. **Traverse les saisons.** Existe sans compte
  utilisateur : c'est une donnée d'effectif, pas un utilisateur.
- **Équipe** — appartient à un club et à **une seule saison**, engagée dans un championnat. Porte
  un effectif et un ou plusieurs **responsables**. Une nouvelle saison = de nouvelles équipes, avec
  reprise possible de l'effectif précédent.
- **Championnat** — compétition d'une saison regroupant N équipes. Porte le calendrier et le
  classement.
- **Journée** — regroupement numéroté de matchs, borné par une **fenêtre de dates**. Un match
  appartient à exactement une journée.
- **Match** — rencontre entre un **receveur** et un **visiteur** du même championnat. Porte le
  créneau négocié, puis la feuille de match.
- **Set** — une manche d'un match, avec le score des deux équipes.
- **Composition** — les joueurs d'une équipe alignés sur un match, sous-ensemble de son effectif.

### Receveur et visiteur

Le calendrier désigne l'équipe qui **reçoit**. C'est structurant :

- Le lieu par défaut du match est la salle du club receveur.
- Le receveur a **l'initiative** : c'est lui qui propose le créneau, et lui qui saisit la feuille
  de match.
- Le visiteur **valide ou refuse** — c'est son seul mode d'action sur le déroulé administratif.

## Calendrier

Le calendrier est **saisi manuellement** par l'administrateur : il crée chaque match en désignant
le receveur, le visiteur et la journée. Il n'existe **aucune génération automatique** — c'est un
choix, voir [ADR-0001](./docs/adr/0001-calendrier-saisi-manuellement.md).

La mutation de création de match rejette ou signale :

- une équipe contre elle-même (rejet) ;
- une équipe qui n'appartient pas au championnat visé (rejet) ;
- une paire d'équipes déjà programmée avec le même receveur (signalement, pas rejet — un
  championnat peut légitimement en compter deux).

Le créneau proposé pour un match doit tomber **dans la fenêtre de dates de sa journée**. La fenêtre
fait office de date butoir de négociation.

## Cycle de vie d'un match

```
Planifié ──proposition(receveur)──> En attente ──validation | tacite──> Confirmé
              ^                          │                                  │
              └──────refus───────────────┘                    report ───────┤
                                                                            v
Confirmé ──date atteinte, saisie score+compos(receveur)──> À valider ──validation | tacite──> Terminé
                                                                │
                                                          contestation
                                                                v
                                                             Litige ──arbitrage admin──> Terminé

Forfait (admin) ────────────────────────────────────────────────────────────> Terminé (3-0)
```

1. **Planifié** — le match existe (receveur, visiteur, journée), sans créneau.
2. **En attente** — le receveur a proposé un créneau (date, heure, lieu) dans la fenêtre de la
   journée.
3. **Confirmé** — le visiteur a validé, ou la validation tacite s'est appliquée. Le créneau est
   ferme.
   - Un **refus** ramène le match à l'étape 1. La proposition refusée reste dans l'historique.
   - Un **report** (voir plus bas) ramène un match confirmé à l'étape 1.
4. **À valider** — à partir de la date/heure du créneau, le receveur saisit le score par set **et
   les compositions des deux équipes**.
5. **Terminé** — le visiteur a validé la feuille, ou la validation tacite s'est appliquée. Le match
   entre au classement.
   - Une **contestation** place le match en **Litige** : seul un administrateur peut le clore, en
     arrêtant le score définitif.

### Validation tacite

Une proposition ou une feuille de match restée sans réponse est acceptée automatiquement :

- **7 jours** après la soumission,
- et **au plus tard la veille du créneau** proposé — sans ce plafond, un créneau proposé 3 jours
  avant la date se confirmerait après le match.

Si ce calcul laisse **moins de 24 h** pour réagir, aucune échéance n'est programmée et la validation
explicite du visiteur devient obligatoire. Une proposition faite la veille au soir laisserait sinon
une heure pour refuser, ce qui revient à imposer la date.

L'échéance est programmée par `scheduler.runAfter` au moment de la soumission, pas par un cron qui
balaierait la base.

Il n'y a **aucune notification par e-mail** : les responsables voient ce qui les attend sur leur
tableau de bord « à traiter ». Le risque assumé et ses raisons :
[ADR-0002](./docs/adr/0002-validation-tacite-sans-notification.md).

### Report d'un match confirmé

Un report (salle indisponible, intempéries) est **demandé avec un motif** par l'un des deux
responsables et **accepté par l'autre** ; en cas de refus, le créneau tient. Un administrateur peut
imposer un report. Le match retourne à l'étape 1 et n'entre pas au classement.

**Après l'heure du créneau, plus de report possible** : soit une feuille de match est saisie, soit
l'administrateur prononce un forfait.

### Autorisations

- Seuls les responsables des deux équipes concernées (et un administrateur) agissent sur un match.
- Le receveur propose le créneau et saisit la feuille ; le visiteur valide, refuse ou conteste.
- Un responsable ne peut pas valider sa propre proposition ni sa propre feuille.
- Seul un administrateur prononce un forfait ou tranche un litige.

## Règles de score (volley)

- Match au **meilleur des 5 sets** : la première équipe à **3 sets gagnés** remporte le match.
- Les 4 premiers sets se jouent en **25 points**, le **tie-break** (5e set) en **15 points**.
- Un set se gagne avec **au moins 2 points d'écart**, avec **prolongation illimitée** (26-24,
  30-28, …). Il n'y a **pas de plafond de points**.
- Un match s'arrête dès qu'une équipe atteint 3 sets : les scores possibles sont **3-0, 3-1, 3-2**
  (et leurs symétriques). Aucun set supplémentaire ne peut être saisi.
- Le tie-break ne se joue qu'à 2 sets partout.

La validation de ces règles est implémentée **côté Convex**, dans une fonction pure et testée,
appelée par la mutation de saisie de la feuille de match. Un score invalide est rejeté avec un
message explicite, jamais silencieusement corrigé.

## Feuille de match et compositions

La feuille de match est **unique, nominative et obligatoire**. Le **receveur** transcrit le score
par set et les compositions des deux équipes ; le visiteur valide l'ensemble en un seul geste.
Pourquoi le receveur saisit la composition adverse :
[ADR-0003](./docs/adr/0003-feuille-de-match-transcrite-par-le-receveur.md).

Règles de validation d'une composition :

- Sous-ensemble de l'**effectif** de l'équipe pour la saison.
- **Au plus 12 joueurs**, et **aucun minimum** : jouer en sous-effectif (à 5, à 4) est permis —
  c'est un désavantage sportif, pas un motif de forfait. Le format de jeu (6x6, 4x4) n'est donc
  **pas modélisé**.
- Une composition vide est refusée : c'est une feuille non remplie, pas un sous-effectif.
- Un même joueur deux fois sur la même feuille (les deux compositions d'un même match) est
  **rejeté**.
- Un même joueur aligné pour deux équipes différentes dans la même journée est **autorisé**, mais
  remonté dans une vue de contrôle de l'administrateur.

## Forfaits

Un forfait est **prononcé par un administrateur** — jamais déduit automatiquement de la taille
d'une composition. Il termine le match sur un score conventionnel :

- **3-0 en sets**, chaque set à **25-0** (donc 75-0 en points marqués) ;
- **0 point de classement** pour l'équipe défaillante, le barème normal s'appliquant au vainqueur
  (3 points).

## Classement

Un classement est calculé **par championnat**, dérivé des matchs terminés (jamais stocké comme
état modifiable à la main). Il expose par équipe : matchs joués, victoires, défaites, sets
gagnés/perdus, points marqués/encaissés, et le total de points de classement.

Barème :

| Résultat | Points |
| --- | --- |
| Victoire 3-0 ou 3-1 | **3** |
| Victoire 3-2 | **2** |
| Défaite 2-3 | **1** |
| Défaite 0-3 ou 1-3 | **0** |

Départage, dans cet ordre :

1. total de points de classement ;
2. nombre de victoires ;
3. ratio de sets (gagnés / perdus) ;
4. ratio de points (marqués / encaissés).

Si tous les critères s'épuisent, les équipes sont affichées **ex aequo** — pas d'ordre arbitraire
déguisé en classement. La confrontation directe n'est volontairement pas un critère : elle est
indéfinie dès que trois équipes sont à égalité, et tant que leurs matchs ne sont pas tous joués.

## Rôles

Trois rôles applicatifs, portés par le compte utilisateur (`role: "player" | "manager" | "admin"`),
plus la consultation publique sans compte.

- **`admin` — Administrateur (UFOLEP 19)** — crée les saisons, championnats, clubs ; engage les
  équipes ; saisit le calendrier ; prononce les forfaits et tranche les litiges. **Gère aussi les
  comptes** : crée les utilisateurs et modifie leur rôle.
- **`manager` — Responsable d'équipe** — gère l'effectif de son équipe, propose/valide les créneaux,
  saisit les feuilles de match. Un compte peut être responsable de **plusieurs** équipes.
- **`player` — Joueur** — consulte ses équipes, son calendrier et ses résultats. Aucun droit
  d'écriture sur les matchs.
- **Consultation publique** — voir « Périmètre public » ci-dessous.

Le rôle est un attribut unique du compte, pas un cumul. Les droits d'un responsable sur un match
découlent de son **rattachement d'équipe**, jamais du seul rôle.

Attention à ne pas confondre la **fiche Joueur** (donnée d'effectif, sans e-mail ni connexion) et
le **compte de rôle `player`**. Un compte `player` peut être rattaché à une fiche Joueur, mais une
fiche Joueur n'a pas besoin de compte — la plupart n'en auront jamais.

## Périmètre public

- **Lisible sans compte** : calendrier avec date, heure et lieu ; scores par set ; classements.
- **Réservé aux comptes connectés** : effectifs et compositions de feuille de match.

Aucun nom de personne physique n'est accessible en lecture libre.

## Authentification et gestion des comptes

Auth assurée par **Convex Auth** (`@convex-dev/auth`), avec un provider mot de passe.

- **Pas d'inscription publique** : aucun écran de création de compte côté visiteur. Tous les
  comptes sont créés par un administrateur depuis la plateforme.
- **Amorçage** : une commande CLI crée le premier compte administrateur, exécutée hors de
  l'application (donc sans compte préalable) via une fonction Convex `internal` non exposée au
  client :

  ```bash
  npx convex run admin:createAdmin '{"email":"...","password":"...","name":"..."}'
  ```

  Elle refuse d'écraser : si un compte existe déjà pour cet e-mail, elle échoue avec un message
  explicite et ne modifie rien. Elle refuse aussi un mot de passe de moins de 8 caractères.
- **Création de comptes** : un administrateur crée un compte (e-mail, nom, rôle initial,
  rattachement club / équipe le cas échéant) depuis l'interface d'administration.
- **Modification des rôles** : un administrateur peut faire passer un compte de `player` à
  `manager` ou `admin`, et inversement. Garde-fou : la mutation refuse de supprimer le dernier
  compte `admin` (protection contre le verrouillage total).
- Toutes ces opérations sont des mutations Convex qui **revérifient le rôle de l'appelant côté
  serveur**. L'UI masque ce qui n'est pas permis, mais ne fait jamais autorité.

## Organisation du code

```
app/                    # Next.js App Router (pages, layouts, route handlers)
components/             # composants applicatifs
components/ui/          # composants shadcn/ui
convex/                 # schéma + queries/mutations/actions Convex
convex/schema.ts        # définition des tables et index
lib/                    # helpers partagés front
lib/rules/              # règles métier pures, sans Convex ni React (score, classement, cycle de vie, temps)
proxy.ts                # convention Next 16 (ex-`middleware.ts`) : rafraîchit le jeton d'auth
docs/adr/               # décisions d'architecture
```

Conventions :

- Les règles métier pures (validation d'un score, calcul du classement, barème) sont isolées dans
  des modules sans dépendance à Convex ni à React, pour être testables directement.
- Nommage du domaine en français dans l'UI, en anglais dans le code (`team`, `club`, `player`,
  `championship`, `match`, `set`, `matchday`, `lineup`) — les identifiants de référence sont dans
  [CONTEXT.md](./CONTEXT.md).
- Chaque accès à une donnée passe par un index Convex explicite ; pas de `filter` sur table
  complète dans un chemin critique.

## Agent skills

### Issue tracker

Issues et specs en markdown local sous `.scratch/<feature>/` — pas de dépôt distant.
Voir [docs/agents/issue-tracker.md](./docs/agents/issue-tracker.md).

### Triage labels

Les cinq rôles canoniques, chaque label identique à son nom (`needs-triage`, `needs-info`,
`ready-for-agent`, `ready-for-human`, `wontfix`).
Voir [docs/agents/triage-labels.md](./docs/agents/triage-labels.md).

### Domain docs

Single-context : [CONTEXT.md](./CONTEXT.md) + [docs/adr/](./docs/adr/) à la racine.
Voir [docs/agents/domain.md](./docs/agents/domain.md).
