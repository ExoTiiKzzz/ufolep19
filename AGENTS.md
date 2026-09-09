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
  saisons.** Porte une salle par défaut et, facultativement, un **logo** (voir « Fichiers »).
- **Joueur** — fiche d'un licencié rattaché à un club. **Traverse les saisons.** Existe sans compte
  utilisateur : c'est une donnée d'effectif, pas un utilisateur. Peut porter une **adresse e-mail**,
  qui déclenche la création d'un compte de consultation (voir « Comptes de licenciés »).
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

- **Lisible sans compte** : calendrier avec date, heure et lieu ; classements ; et, pour un match
  **terminé**, le score set par set et le nom des joueurs alignés.
- **Réservé aux comptes connectés** : les effectifs (les licenciés qui n'ont pas joué), les fiches
  joueur, et tout le déroulé administratif d'un match — propositions, motifs de report, motif de
  contestation, échéances.

Un nom de personne physique n'apparaît donc en accès libre que s'il figure sur une **feuille de
match validée**. Les listes restent anonymes : ni le calendrier, ni les résultats, ni les
classements, ni les fiches de club et d'équipe ne renvoient de nom. C'est un renversement assumé de
la décision initiale, avec ses raisons et son risque :
[ADR-0004](./docs/adr/0004-feuilles-de-match-publiques.md).

Deux limites tiennent la brèche étroite : seuls les matchs **terminés** sont exposés — un score
contesté peut encore changer — et la query publique ne renvoie rien du déroulé administratif.

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

### Comptes de licenciés

Créer un licencié **avec une adresse e-mail** crée en même temps son **compte de consultation**
(rôle `player`, aucun droit d'écriture), rattaché à sa fiche. Une adresse déjà titulaire d'un compte
est **rattachée** à la fiche plutôt que dupliquée ; une adresse déjà utilisée par un autre licencié
est refusée.

Un responsable d'équipe peut donc créer un compte, mais **seulement** de rôle `player` et
**seulement** pour un licencié de son club. Le reste de la gestion des comptes — rôles,
rattachements d'équipe — demeure réservé à l'administrateur.

Le compte reçoit un **mot de passe provisoire**, envoyé par e-mail à la personne (voir
« Envoi d'e-mails ») **et** affiché une seule fois à l'écran. Si l'envoi échoue, l'écran le dit et
donne le mot de passe à transmettre autrement.

Ce mot de passe n'est jamais réaffiché, et il n'existe **aucun parcours de réinitialisation** : un
compte dont le mot de passe est perdu se règle en recréant le compte. C'est la contrepartie du choix
d'envoyer le mot de passe plutôt qu'un lien de définition.

## Envoi d'e-mails

Seul cas d'envoi aujourd'hui : les identifiants d'un compte qui vient d'être créé. Il n'y a
**toujours aucune notification** sur le déroulé des matchs
([ADR-0002](./docs/adr/0002-validation-tacite-sans-notification.md)).

L'envoi passe par l'**API HTTP de Brevo** (`convex/mail.ts`). Pas de SMTP : les actions Convex
tournent dans un runtime JavaScript sans accès TCP brut. Trois variables sur le déploiement Convex :

| Variable | Rôle |
| --- | --- |
| `BREVO_API_KEY` | clé d'API transactionnelle |
| `MAIL_SENDER_EMAIL` | expéditeur, sur un domaine **vérifié** chez Brevo |
| `SITE_URL` | lien de connexion dans le message — déjà posée par l'outil de Convex Auth |

`MAIL_SENDER_NAME` est facultative. Si l'une des trois manque, l'envoi n'est pas tenté et le message
d'erreur **les nomme toutes**.

Deux règles de conception :

- **Un envoi qui échoue ne fait jamais échouer la création du compte.** `sendMail` ne lève pas : elle
  rend `{ sent, error }`, que l'appelant remonte à l'écran. Un compte créé sans message envoyé reste
  utilisable, mot de passe affiché.
- **Le motif de refus de Brevo est remonté tel quel** (clé invalide, expéditeur non vérifié, quota) :
  un « échec d'envoi » opaque coûte une demi-heure de diagnostic.

L'adresse d'un licencié est une **donnée personnelle** : elle ne sort d'aucune query publique — un
test le vérifie — et n'est lisible que par un compte connecté.
- Toutes ces opérations sont des mutations Convex qui **revérifient le rôle de l'appelant côté
  serveur**. L'UI masque ce qui n'est pas permis, mais ne fait jamais autorité.

## Interface

Palette : **bleu pastel** en couleur principale, **abricot doux** en secondaire, rose doux pour les
problèmes, gris pour le neutre. La couleur porte un sens et n'est pas décorative :

| Token | Usage |
| --- | --- |
| `primary` — bleu pastel | état acquis, action principale, bandeau de navigation, tête de classement |
| `secondary` — abricot | ce qui attend une action : créneau à valider, feuille en attente, fenêtre de journée qui se ferme |
| `destructive` — rose | problème : litige, fenêtre de journée dépassée |
| `muted` — gris | information neutre : rôle d'un compte, saison archivée, match terminé |

Deux contraintes qui viennent de ce choix :

- Le bleu pastel est **clair** : son texte est bleu profond (`primary-foreground`), jamais blanc.
- Les contrôles posés sur le bandeau principal expriment leurs couleurs **relativement à
  `primary-foreground`**, et non aux couleurs de page. Sans ça, un bouton `outline` devient
  illisible en thème sombre — fond de page sombre sur bandeau bleu.

Les deux thèmes sont définis : les tokens clairs sur `:root`, les tokens sombres sous
`prefers-color-scheme: dark`. Toute nouvelle couleur passe par un token, jamais par une classe
Tailwind de couleur brute.

**Page d'accueil** : elle montre un championnat par défaut — le premier de la saison courante — avec
son classement, puis la journée en cours, ou la prochaine si aucune fenêtre n'est ouverte, ou la
dernière si la saison est finie. Un sélecteur groupé par saison permet de changer de championnat
sans quitter la page.

## Fichiers

Le logo d'un club est stocké dans le **File Storage de Convex**. Le fichier part du navigateur vers
une URL signée, puis une mutation l'attache au club après vérification **côté serveur** : rien
n'empêche d'utiliser l'URL signée avec un autre contenu.

- Formats acceptés : PNG, JPEG, WebP, GIF. **SVG exclu** — un SVG peut embarquer du script, et un
  fichier déposé par un utilisateur n'a pas à être servi tel quel.
- 2 Mo au maximum.
- Les règles vivent dans un module pur (`lib/rules/logo.ts`), utilisé par la mutation et par le
  formulaire, qui évite ainsi un aller-retour inutile — sans jamais faire autorité.
- Remplacer ou retirer un logo **supprime l'ancien fichier** : pas d'orphelin dans le stockage.

**Piège Convex à connaître** : une mutation qui lève une erreur annule **toutes** ses écritures, y
compris un `storage.delete`. « Supprimer le fichier refusé puis lever une erreur » est donc
impossible — le fichier survivrait. C'est pourquoi `clubs.setLogo` **rend le motif du refus** au lieu
de le lever : la mutation aboutit, et le ménage est fait.

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
- Une liste de matchs partage un **cache d'équipes par requête** (`newTeamCache`) : sans lui, un
  calendrier complet relirait les deux clubs et résoudrait deux URL de logo à chaque ligne.

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
