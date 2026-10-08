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
Saison ──< Circuit ──< Championnat ──< Journée ──< Match >── Équipe >── Club ──< Joueur ──< Licence
                                                   │            │                 │
                                                   └──< Set     └──< Effectif >───┤
                                                   └──< Composition >─────────────┘
```

- **Saison** — cycle annuel (ex. 2025-2026). Regroupe les circuits et leurs championnats.
- **Circuit** — groupe de championnats d'une saison, créé par l'administrateur, à l'intérieur
  duquel un joueur ne figure que sur **une seule feuille verte**. Le circuit principal regroupe
  D1, D2, D3 et le mixte ; la coupe et le féminin ont chacun le leur, donc leurs propres
  feuilles vertes.
- **Club** — structure locale. Rattache des joueurs et une ou plusieurs équipes. **Traverse les
  saisons.** Porte une salle par défaut et, facultativement, un **logo** (voir « Fichiers »).
- **Joueur** — fiche d'un licencié rattaché à un club. **Traverse les saisons.** Existe sans compte
  utilisateur : c'est une donnée d'effectif, pas un utilisateur. Peut porter une **adresse e-mail**,
  qui déclenche la création d'un compte de consultation (voir « Comptes de licenciés »). La fiche
  ne porte **pas** de numéro de licence : voir « Licences ».
- **Licence** — un numéro et sa période de validité, rattachés à un joueur. Un joueur en accumule
  plusieurs au fil des saisons ; hors de sa période, une licence n'autorise plus à jouer.
- **Équipe** — appartient à un club et à **une seule saison**, engagée dans un championnat. Porte
  un effectif — la **feuille verte**, son libellé dans l'UI — et un ou plusieurs **responsables**.
  Une nouvelle saison = de nouvelles équipes, avec reprise possible de la feuille verte précédente.
- **Championnat** — compétition d'une saison regroupant N équipes. Porte le calendrier et le
  classement, et trois réglages **indépendants** : son **circuit** (unicité de la feuille
  verte), son **niveau** (1 = le plus fort ; « D1, D2, D3 », le mixte est de niveau 3) et son
  **format** (`standard` ou `plateau` : règles de score et de classement). Pas de case « coupe »
  ou « féminin » qui mêlerait ces axes. Un championnat peut porter un **quota de renforts**
  (le mixte, voir « Renforts »). Le format ne se change plus une fois des journées créées ; le
  circuit ne change que si l'unicité des feuilles vertes y survit.
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

Le créneau d'un match est attendu **dans la fenêtre de dates de sa journée**, mais la fenêtre est
une **borne souple** : un match avancé ou retardé par arrangement entre les deux équipes se joue
hors fenêtre. Un tel créneau est **signalé** aux responsables et à l'administrateur, jamais refusé,
et sa proposition n'a **pas de validation tacite** — le visiteur doit consentir explicitement.
Déplacer la fenêtre d'une journée (`matchdays.updateWindow`) ne touche donc aucun match :
[ADR-0006](./docs/adr/0006-fenetre-de-journee-borne-souple.md).

Une journée peut **reprendre en retour** une autre journée du même championnat
(`matches.mirrorMatchday`) : ses matchs y sont recréés, receveur et visiteur inversés, par les
mêmes garde-fous qu'une création à la main. Ce n'est pas une génération : voir l'addendum de
l'ADR-0001.

### Plateau

Dans un championnat au format **plateau** (le féminin), chaque journée est un **plateau** : une
date, une heure et une salle fixées par l'administrateur, communes à tous ses matchs. Une équipe
y joue autant de matchs que l'administrateur en programme.

- Les matchs naissent **Confirmés**, au créneau du plateau : ni proposition, ni validation
  tacite, ni report entre responsables (`negotiation` les refuse). Déplacer le plateau
  (`matchdays.updatePlateau`) déplace ses matchs non joués.
- C'est **l'administrateur** qui saisit score et compositions (`sheets.record`) : le match passe
  directement à **Terminé**, sans validation du visiteur. Le receveur n'a que le rôle de colonne
  sur la feuille. Les plateaux n'apparaissent pas dans « à traiter ».
- La composition d'une équipe est reprise par défaut de son match précédent du même plateau,
  et s'ajuste match par match.

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
2. **En attente** — le receveur a proposé un créneau (date, heure, lieu), en principe dans la
   fenêtre de la journée.
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
une heure pour refuser, ce qui revient à imposer la date. Même règle pour un créneau proposé **hors
de la fenêtre** de sa journée : un silence ne vaut pas accord pour un arrangement inhabituel.

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

Format **standard** :

- Match au **meilleur des 5 sets** : la première équipe à **3 sets gagnés** remporte le match.
- Les 4 premiers sets se jouent en **25 points**, le **tie-break** (5e set) en **15 points**.
- Un set se gagne avec **au moins 2 points d'écart**, avec **prolongation illimitée** (26-24,
  30-28, …). Il n'y a **pas de plafond de points**.
- Un match s'arrête dès qu'une équipe atteint 3 sets : les scores possibles sont **3-0, 3-1, 3-2**
  (et leurs symétriques). Aucun set supplémentaire ne peut être saisi.
- Le tie-break ne se joue qu'à 2 sets partout.

Format **plateau** :

- **2 sets secs** en 25 points, **joués tous les deux** même à 2-0. Pas de tie-break.
- Même règle de set : 2 points d'écart, prolongation illimitée.
- À un set partout, le vainqueur est celui qui a marqué **le plus de points** ; à égalité de
  points, le match est **nul** — un match terminé n'a alors pas de vainqueur
  (`result.winnerTeamId` absent). Voir
  [ADR-0005](./docs/adr/0005-renforts-signales-et-match-nul.md).

La validation de ces règles est implémentée **côté Convex**, dans une fonction pure et testée
(`validateMatchScore(sets, format)`), appelée par la mutation de saisie de la feuille de match. Un score invalide est rejeté avec un
message explicite, jamais silencieusement corrigé.

## Feuille de match et compositions

La feuille de match est **unique, nominative et obligatoire**. Le **receveur** transcrit le score
par set et les compositions des deux équipes ; le visiteur valide l'ensemble en un seul geste.
Pourquoi le receveur saisit la composition adverse :
[ADR-0003](./docs/adr/0003-feuille-de-match-transcrite-par-le-receveur.md).

Règles de validation d'une composition — ce qui est **rejeté** :

- un joueur d'un **autre club** que l'équipe : un renfort vient de son propre club ;
- une **licence** qui ne couvre pas la date du match (voir « Licences ») ;
- **plus de 12 joueurs** ; **aucun minimum** en revanche : jouer en sous-effectif (à 5, à 4)
  est permis — c'est un désavantage sportif, pas un motif de forfait. Le format de jeu (6x6,
  4x4) n'est donc **pas modélisé** ;
- une composition vide : c'est une feuille non remplie, pas un sous-effectif ;
- un même joueur deux fois sur la même feuille (les deux compositions d'un même match).

Tout le reste est **signalé, jamais rejeté** : un joueur du club absent de la feuille verte de
l'équipe est un **renfort** (voir ci-dessous). Un même joueur aligné pour deux équipes
différentes dans la même journée est autorisé, mais remonté dans une vue de contrôle de
l'administrateur.

## Feuilles vertes

La feuille verte est l'**effectif** d'une équipe (`rosterEntries`) ; « Feuille verte » est son
libellé dans l'UI. Un licencié figure sur **au plus une feuille verte par circuit et par
saison** — `roster.add` le refuse en nommant l'autre équipe, et la reprise de la feuille verte
précédente laisse de côté, en les listant, les joueurs déjà inscrits ailleurs. Il peut en
revanche avoir sa feuille verte en championnat, une autre en coupe, une autre au féminin.

L'inscription se fait en cherchant parmi les licenciés du club, par nom ou par numéro de licence
(périmé compris).

## Renforts

Un **renfort** est un joueur aligné dans une équipe de son club qui n'est pas celle de sa feuille
verte dans le circuit du match. Un renfort n'est **jamais refusé** : il est **signalé** sur la
feuille de match, et c'est aux équipes et au comité d'en juger —
[ADR-0005](./docs/adr/0005-renforts-signales-et-match-nul.md).

Le niveau d'origine d'un joueur est celui du championnat de sa feuille verte. Sont signalés :

- un joueur **sans feuille verte** dans le circuit ;
- une **descente** : un joueur d'un niveau plus fort aligné plus bas ;
- le **4ᵉ match et les suivants** joués au-dessus de son niveau d'origine, **tous niveaux
  supérieurs confondus** sur la saison. Le compteur suit l'ordre des **dates de match**, pas
  celui de la saisie, et compte les feuilles **soumises** (en attente, validées, en litige) :
  attendre la validation laisserait enchaîner les matchs sans un signalement ;
- dans un championnat à **quota** (le mixte : 2 joueurs, pour compléter à 6), les joueurs venus
  d'un niveau plus fort sont admis, mais signalés s'ils sont plus nombreux que le quota, ou si la
  composition dépasse le total qu'ils ne doivent que compléter.

Le saut de plusieurs niveaux est permis. Un renfort **au même niveau** (D3 ↔ mixte) est affiché,
mais ni signalé ni compté.

Les règles vivent dans un module pur (`lib/rules/reinforcement.ts`), utilisé par Convex et par
l'écran de composition, qui annonce les signalements au fil des cases cochées. Les signalements
sont **recalculés à la lecture** — un changement de niveau ou de quota s'y reflète aussitôt — et
relèvent du déroulé administratif : `sheets.get` (responsables des deux équipes, admin) et la
vue `adminViews.reinforcementFlags` les exposent, jamais la query publique.

## Licences

Un joueur ne porte pas *un* numéro de licence : il en porte une **suite**, chacune valable sur
une période bornée. Une licence ne se prolonge pas — on en **délivre une nouvelle**, au même
numéro ou à un autre, et la précédente reste dans l'historique avec ses dates.

- **Une licence valable jusqu'au 9 septembre couvre le 9 au soir, et plus rien le 10.**
  `validUntil` est le dernier *instant* de validité, pas le début du dernier jour.
- Les périodes d'un même joueur **ne se chevauchent pas** — sinon « la licence du 10 septembre »
  n'aurait pas de réponse unique. Elles peuvent en revanche laisser un **trou** : un licencié qui
  s'interrompt une saison puis revient, ça existe, et le modèle doit pouvoir le dire.
- Un numéro ne peut pas être porté par **deux joueurs différents**. Le même joueur peut en
  revanche le reprendre d'une saison sur l'autre : une reconduction au même numéro n'est pas un
  doublon.
- Un numéro est **alphanumérique** : il porte des lettres autant que des chiffres. Rien ne borne
  sa forme — pas de longueur imposée, pas de motif — parce que la fédération en change et qu'un
  format refusé à la saisie empêche d'enregistrer une carte pourtant valide.

La casse, en revanche, ne distingue rien : `ab1234` et `AB1234` sont la même carte. Les numéros
sont donc **rangés en majuscules** par `normalizeLicenseNumber`, par où passent toutes les
écritures. C'est une normalisation à l'écriture et non une comparaison sans casse à la lecture,
pour que l'index `by_number` reste utilisable — l'unicité se vérifie par égalité exacte, et sans
ça la même licence saisie différemment par deux clubs passerait pour deux numéros.

**La validité se juge à la date du match, jamais à celle de la saisie.** Une feuille transcrite
trois jours plus tard ne peut pas rejeter un joueur régulièrement licencié le jour où il a joué ;
à l'inverse, une licence renouvelée après coup ne régularise pas un match déjà disputé. C'est
`match.slot.at` qui fait foi dans `sheets.submit`.

Une licence périmée **n'exclut pas de l'effectif** : l'effectif est une donnée de rattachement,
qui survit à une licence à renouveler. Le refus intervient au moment d'aligner le joueur. L'écran
de composition le signale et décoche le joueur, mais c'est Convex qui refuse.

Une licence périmée est **affichée**, pas masquée : « 1234, expirée le 31 août » se corrige, un
tiret laisse croire que le licencié n'en a jamais eu.

La recherche de licenciés couvre **tous** les numéros, y compris périmés : un secrétaire de club
cherche avec la carte qu'il a sous les yeux, souvent celle de l'an dernier.

### Migration depuis le modèle à numéro unique

Les fiches portaient autrefois un `licenseNumber` sans dates. La reprise est explicite :

```bash
npx convex run licenses:migrate '{"validFrom":"2025-09-01","validUntil":"2026-08-31"}'
```

Les dates sont **obligatoires** : l'ancien modèle n'en portait aucune, et les deviner déciderait
à la place de l'utilisateur qui a le droit de jouer. La commande est rejouable — une fiche déjà
migrée n'a plus de numéro hérité et est ignorée.

## Forfaits

Un forfait est **prononcé par un administrateur** — jamais déduit automatiquement de la taille
d'une composition. Il termine le match sur un score conventionnel :

- **3-0 en sets**, chaque set à **25-0** (donc 75-0 en points marqués) — **2-0** en plateau ;
- **0 point de classement** pour l'équipe défaillante au premier forfait, puis une pénalité
  croissante (voir « Classement ») ; le vainqueur marque ses 3 points de victoire.

## Classement

Un classement est calculé **par championnat**, dérivé des matchs terminés (jamais stocké comme
état modifiable à la main). Il expose par équipe : matchs joués, victoires, nuls, défaites, sets
gagnés/perdus, points marqués/encaissés, et le total de points de classement. La colonne des nuls
n'est affichée qu'au format plateau.

Barème standard, propre à l'UFOLEP 19 — **ce n'est pas celui de la FIVB**, et il ne doit pas y
être ramené :

| Résultat | Points |
| --- | --- |
| Victoire, quel qu'en soit le score | **3** |
| Défaite 2-3 | **2** |
| Toute autre défaite | **1** |
| Forfait | **0** |
| 2ème forfait | **-1** |
| 3ème forfait et au-delà | **-2** |

Deux choses s'y lisent. **Toute victoire vaut pareil** : gagner 3-0 ou 3-2 ne change rien.
Et **une défaite rapporte toujours quelque chose** — l'équipe s'est déplacée et a joué ; c'est
le forfait, et lui seul, qui ne rapporte rien. La défaite en cinq sets vaut un point de plus
parce qu'elle s'est jouée à un set près.

Le forfait est donc le seul résultat qui **retire** des points, et sa pénalité s'aggrave d'un
forfait à l'autre. Elle plafonne à -2 : au-delà, le classement a déjà dit ce qu'il avait à dire.
Chaque forfait porte sa propre valeur et elles s'additionnent — trois forfaits font
`0 + (-1) + (-2) = -3`, et un total de points **peut être négatif**.

Le total ne dépend que du **nombre** de forfaits d'une équipe, jamais de leur ordre : les
valeurs étant attribuées par rang, la somme est la même quel que soit l'ordre de lecture des
matchs. C'est ce qui dispense `computeStandings` de trier par date, et un test protège cette
propriété — sans elle, le calcul dépendrait d'un ordre que rien ne garantit.

Barème plateau — **provisoire**, en attente de confirmation par l'UFOLEP 19 :

| Résultat | Points |
| --- | --- |
| Victoire 2-0 | **3** |
| Victoire 1-1 aux points | **2** |
| Match nul (1-1, points égaux) | **1** |
| Défaite 1-1 aux points | **1** |
| Défaite 0-2 | **0** |

Le forfait y garde la même pénalité croissante qu'au format standard.

La Coupe de Corrèze se joue pour l'instant comme un championnat standard, dans son propre
circuit, avec le classement classique — en attente de son règlement.

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
  rattachement club / équipe le cas échéant) depuis l'interface d'administration. Le mot de passe
  est **généré** par la plateforme, jamais choisi par l'administrateur (voir plus bas).
- **Suppression de comptes** : un administrateur supprime un compte (`users.remove`). Identifiants,
  sessions, adresse e-mail, rattachements d'équipe et lien vers la fiche Joueur disparaissent ;
  l'adresse est libérée. La ligne du compte reste, réduite à son nom, parce que l'historique des
  matchs y renvoie (qui a proposé, saisi, tranché) : il affiche « Nom (compte supprimé) ». La
  mutation refuse le dernier administrateur et le compte de l'appelant lui-même.
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

Ce mot de passe n'est jamais réaffiché. Tous les comptes créés depuis l'interface suivent ce
régime, licenciés ou non : seule la commande d'amorçage prend un mot de passe en argument.

- **Changer son mot de passe** : tout compte connecté remplace le sien en donnant l'actuel. C'est
  ce qui rend le mot de passe « provisoire » : l'administrateur n'a rien à retenir.
- **Mot de passe perdu** : l'administrateur en **réinitialise** un (`admin.resetPassword`) — un
  nouveau mot de passe provisoire, envoyé et affiché une fois, et les sessions ouvertes fermées. Il
  n'y a pas de réinitialisation en libre-service : c'est la contrepartie du choix d'envoyer le mot de
  passe plutôt qu'un lien de définition, et elle dépendrait entièrement de l'envoi d'e-mails.

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

Palette : les couleurs d'un **ballon Mikasa** — bleu roi, jaune d'or, blanc. Le bleu
(`#1B4FA0`) et le jaune (`#FFC61E`) sont repris des panneaux du ballon officiel ; le blanc est
le fond des pages.

Ce sont des couleurs **saturées** : le bleu porte du texte **blanc**, le jaune du texte
**sombre**. La couleur porte un sens et n'est pas décorative :

| Token | Usage |
| --- | --- |
| `primary` — bleu roi | état acquis, action principale, bandeau de navigation, tête de classement |
| `secondary` — jaune d'or | ce qui attend une action : créneau à valider, feuille en attente, fenêtre de journée qui se ferme, en-tête « À traiter » du tableau de bord |
| `destructive` — rouge | problème : litige, fenêtre de journée dépassée |
| `muted` — gris | information neutre : rôle d'un compte, saison archivée, match terminé |
| `win` / `loss` — vert et rouge tendres | issue sportive d'un match : colonnes de la grille de saisie, lignes de la feuille de match |

Quatre contraintes qui viennent de ce choix, chacune pour une raison mesurée :

- **Tous les couples texte/fond ont été vérifiés au ratio WCAG**, dans les deux thèmes. Le plus
  faible est à **4,7 pour un seuil de 4,5**. Ne pas modifier une valeur sans refaire ce calcul :
  l'œil se trompe, surtout sur le jaune.
- **Le jaune porte une bordure** (`--secondary-border`, un doré plus foncé). Sur une carte
  blanche, le jaune vif n'a qu'un rapport de 1,6 avec le fond : sans bordure, la pastille
  flotte, même si son texte est parfaitement lisible.
- **Le bleu est éclairci en thème sombre.** Le bleu du ballon posé sur un fond sombre tombe à
  2,0 pour un seuil de 3 : il ne se détacherait pas. Éclairci juste assez pour passer le seuil
  tout en gardant du texte blanc.
- **Les contrôles posés sur le bandeau** expriment leurs couleurs relativement à
  `primary-foreground`, et non aux couleurs de page. Sans ça, un bouton `outline` devient
  illisible en thème sombre — fond de page sombre sur bandeau bleu.
- **`win` et `loss` sont des teintes de fond, pas des aplats.** Elles colorent un panneau
  derrière des champs de saisie ; `loss` ne réutilise pas `destructive`, qui reste réservé
  au problème (litige, fenêtre dépassée) — une défaite n'en est pas un. Et la couleur ne
  porte jamais seule : le compte de sets et le mot « vainqueur » ou « défaite » sont
  écrits, faute de quoi la grille serait illisible pour un daltonien.

Toute nouvelle couleur passe par un token, jamais par une classe Tailwind de couleur brute.

**Compteur « à traiter »** : le nombre de matchs qui attendent le compte connecté est porté
par le bandeau, à côté de « Tableau de bord », et l'en-tête de la carte « À traiter » passe au
**jaune** tant qu'il reste quelque chose — c'est bien ce qui attend une action.
[ADR-0002](./docs/adr/0002-validation-tacite-sans-notification.md) n'envoyant aucune
notification, ce compteur est le seul signal qu'un responsable reçoive.

Deux points qui découlent des règles de palette :

- la pastille du bandeau est **posée sur le bleu**, où seul `primary-foreground` est lisible :
  elle est donc blanche à chiffre bleu, et non jaune comme l'en-tête de la carte ;
- l'en-tête jaune porte sa bordure `secondary-border`, comme tout aplat jaune.

Le compte vient de `matches.myTodoCount`, qui partage son classement avec `matches.myTodo` —
les deux nombres ne peuvent pas diverger, et un test le vérifie.

**Tableau de bord : deux rattachements, pas un.** La carte « À traiter » et le compteur partent des
équipes **gérées** (`teamManagers`) ; « Mon calendrier » et « Mes équipes » partent des équipes
**rattachées** — celles qu'on gère *et* celles dont la fiche Joueur du compte fait partie
(`rosterEntries` sur `users.playerId`). Sans cette seconde liste, un compte `player` n'aurait
strictement rien à l'écran, alors que son rôle est justement de consulter ses équipes, son
calendrier et ses résultats.

Les deux listes vivent dans `convex/authz.ts` sous deux noms distincts — `managedTeamIds` et
`attachedTeamIds` — et ce n'est pas de la cosmétique : substituer la seconde à la première dans un
chemin d'écriture donnerait à n'importe quel licencié la main sur la feuille de match de son
équipe. Un test vérifie qu'un compte à l'effectif d'une équipe dont un match attend un créneau a
bien un `myTodo` vide et un compteur à zéro.

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
  `championship`, `match`, `set`, `matchday`, `lineup`, `circuit`, `level`) — les identifiants
  de référence sont dans [CONTEXT.md](./CONTEXT.md).
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
