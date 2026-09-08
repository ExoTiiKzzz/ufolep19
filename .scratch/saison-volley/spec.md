# Spec — Gestion d'une saison de volley UFOLEP 19 (MVP)

Status: ready-for-agent

Vocabulaire : celui de [CONTEXT.md](../../CONTEXT.md). Règles et décisions déjà arrêtées :
[CLAUDE.md](../../CLAUDE.md) et [docs/adr/](../../docs/adr/). Cette spec ne rouvre aucune de ces
décisions ; elle les traduit en comportement attendu.

## Problem Statement

Une saison UFOLEP 19 se gère aujourd'hui à coups de tableurs, de SMS et de coups de téléphone. Trois
douleurs concrètes :

- **Personne ne sait quand se joue un match.** Les responsables d'équipe s'accordent par téléphone
  sur une date, une heure et un gymnase. L'information vit dans un fil de messages, l'adversaire
  croit avoir dit oui, le gymnase n'est pas celui qu'on croyait. Les matchs se jouent en retard ou
  pas du tout.
- **Les résultats remontent mal et le classement est faux.** Les scores arrivent par messages, ils
  sont ressaisis à la main dans un tableur, les erreurs de frappe ne sont détectées par personne, et
  un score aberrant (3-2 avec un set à 12-25) entre au classement sans broncher.
- **Rien n'est consultable.** Un joueur, un parent ou un club adverse n'a aucun endroit où voir le
  calendrier, les résultats et le classement à jour. Chaque question remonte à l'administrateur du
  comité.

## Solution

Une application où la saison entière vit à un seul endroit, et où chaque geste est fait par la
personne qui détient l'information.

- **L'administrateur** met en place la structure : saison, clubs, championnats, équipes engagées,
  puis le calendrier journée par journée en désignant qui reçoit. Il ne saisit aucun score.
- **Les responsables d'équipe** organisent eux-mêmes leurs matchs. Le receveur propose un créneau
  dans la fenêtre de la journée, le visiteur valide ou refuse. Une fois le match joué, le receveur
  transcrit la feuille de match — score par set et composition des deux équipes — et le visiteur la
  valide ou la conteste. Un silence de 7 jours vaut acceptation, ce qui empêche un championnat de
  se figer sur une équipe injoignable.
- **Le système** refuse les scores impossibles au moment de la saisie, plutôt que de laisser
  l'erreur polluer le classement, et recalcule le classement à chaque match terminé.
- **Le public** consulte le calendrier, les résultats et les classements sans compte, sans qu'aucun
  nom de licencié soit exposé.

## User Stories

### Administrateur — structure de la saison

1. En tant qu'administrateur, je veux créer une saison, afin de séparer proprement une année de
   compétition de la précédente.
2. En tant qu'administrateur, je veux désigner la saison courante, afin que l'application affiche
   par défaut la saison en cours à tout le monde.
3. En tant qu'administrateur, je veux créer un club, afin de rattacher ses joueurs et ses équipes.
4. En tant qu'administrateur, je veux enregistrer la salle par défaut d'un club, afin que les
   propositions de créneau de ses équipes soient préremplies avec le bon gymnase.
5. En tant qu'administrateur, je veux créer un championnat dans une saison, afin d'y engager les
   équipes qui s'y affrontent.
6. En tant qu'administrateur, je veux créer une équipe rattachée à un club et à une saison, afin
   qu'un club puisse engager plusieurs équipes de niveaux différents.
7. En tant qu'administrateur, je veux engager une équipe dans un championnat, afin qu'elle apparaisse
   au calendrier et au classement.
8. En tant qu'administrateur, je veux reprendre l'effectif d'une équipe de la saison précédente en
   un geste, afin de ne pas ressaisir 12 licenciés chaque année.
9. En tant qu'administrateur, je veux consulter les saisons passées en lecture seule, afin de
   retrouver un classement ou un résultat d'il y a deux ans.

### Administrateur — calendrier

10. En tant qu'administrateur, je veux créer une journée numérotée avec une fenêtre de dates, afin
    de borner la période dans laquelle ses matchs doivent se jouer.
11. En tant qu'administrateur, je veux créer un match en désignant le receveur, le visiteur et la
    journée, afin de composer le calendrier selon les contraintes réelles des clubs.
12. En tant qu'administrateur, je veux être empêché de programmer une équipe contre elle-même, afin
    de ne pas créer un match absurde par erreur de clic.
13. En tant qu'administrateur, je veux être empêché de programmer une équipe qui n'est pas engagée
    dans ce championnat, afin que le classement reste cohérent.
14. En tant qu'administrateur, je veux être averti quand je programme une paire d'équipes déjà
    programmée avec le même receveur, sans être bloqué, afin de repérer un doublon involontaire tout
    en gardant la main si c'est voulu.
15. En tant qu'administrateur, je veux voir les matchs dont la fenêtre de journée approche ou est
    dépassée sans créneau confirmé, afin de relancer les responsables concernés.
16. En tant qu'administrateur, je veux corriger le receveur, le visiteur ou la journée d'un match
    non encore confirmé, afin de rattraper une erreur de saisie du calendrier.

### Administrateur — arbitrage et contrôle

17. En tant qu'administrateur, je veux prononcer un forfait contre une équipe, afin de clore un
    match qu'elle n'a pas honoré.
18. En tant qu'administrateur, je veux trancher un litige en arrêtant le score définitif, afin qu'un
    désaccord entre deux responsables ne bloque pas le championnat.
19. En tant qu'administrateur, je veux imposer un report sur un match confirmé, afin de gérer une
    fermeture de gymnase que les deux équipes ne parviennent pas à régler entre elles.
20. En tant qu'administrateur, je veux voir la liste des joueurs alignés pour deux équipes
    différentes dans la même journée, afin de contrôler les cumuls sans les interdire.
21. En tant qu'administrateur, je veux consulter l'historique des propositions et refus d'un match,
    afin de comprendre pourquoi un match n'a jamais été joué.
22. En tant qu'administrateur, je veux corriger la feuille de match d'un match terminé, afin de
    réparer une erreur découverte après validation.

### Administrateur — comptes

23. En tant qu'administrateur, je veux créer un compte utilisateur avec un rôle initial, afin de
    donner accès à la plateforme sans ouvrir d'inscription publique.
24. En tant qu'administrateur, je veux modifier le rôle d'un compte, afin qu'un joueur devenu
    responsable d'équipe obtienne les droits correspondants.
25. En tant qu'administrateur, je veux rattacher un compte responsable à une ou plusieurs équipes,
    afin qu'une même personne puisse gérer les deux équipes de son club.
26. En tant qu'administrateur, je veux être empêché de retirer le dernier compte administrateur,
    afin de ne pas verrouiller définitivement la plateforme.
27. En tant qu'installateur de la plateforme, je veux créer le premier compte administrateur en
    ligne de commande, afin d'amorcer une base vide sans compte préexistant.

### Responsable d'équipe — effectif

28. En tant que responsable d'équipe, je veux ajouter une fiche joueur à mon effectif, afin de
    pouvoir l'aligner sur une feuille de match.
29. En tant que responsable d'équipe, je veux créer une fiche joueur sans adresse e-mail ni compte,
    afin d'inscrire un licencié qui ne se connectera jamais.
30. En tant que responsable d'équipe, je veux retirer un joueur de mon effectif, afin de refléter un
    départ en cours de saison.
31. En tant que responsable d'équipe, je veux voir l'effectif de mon équipe, afin de vérifier qui
    est disponible avant un match.

### Responsable d'équipe — organisation des matchs

32. En tant que responsable receveur, je veux proposer une date, une heure et un lieu pour un match,
    afin d'engager l'organisation sans passer par le téléphone.
33. En tant que responsable receveur, je veux que le lieu soit prérempli avec la salle de mon club,
    afin de ne pas resaisir le même gymnase à chaque match.
34. En tant que responsable receveur, je veux être empêché de proposer un créneau hors de la fenêtre
    de la journée, afin de ne pas décaler le championnat sans que personne ne le voie.
35. En tant que responsable visiteur, je veux valider une proposition de créneau, afin que la date
    devienne ferme pour les deux équipes.
36. En tant que responsable visiteur, je veux refuser une proposition de créneau, afin que le
    receveur en propose une autre quand la date ne nous convient pas.
37. En tant que responsable receveur, je veux proposer un nouveau créneau après un refus, afin de
    converger vers une date acceptable.
38. En tant que responsable, je veux voir l'historique des propositions et refus d'un match, afin de
    ne pas reproposer une date déjà refusée.
39. En tant que responsable, je veux qu'une proposition sans réponse soit acceptée automatiquement
    au bout de 7 jours, afin qu'une équipe injoignable ne bloque pas mon championnat.
40. En tant que responsable, je veux qu'une proposition ne puisse jamais être acceptée
    automatiquement après la date du match, afin de ne jamais jouer sur un créneau non confirmé.
41. En tant que responsable, je veux voir le délai restant avant l'acceptation automatique, afin de
    savoir combien de temps il me reste pour refuser.
42. En tant que responsable, je veux demander le report d'un match confirmé avec un motif, afin de
    gérer un gymnase indisponible ou une équipe décimée.
43. En tant que responsable, je veux accepter ou refuser la demande de report de l'adversaire, afin
    qu'il ne puisse pas annuler seul un match qui m'arrange.
44. En tant que responsable, je veux qu'un report ramène le match en négociation de créneau, afin de
    reprendre l'organisation là où elle a commencé.
45. En tant que responsable, je veux un tableau de bord listant ce qui m'attend, afin de savoir en
    me connectant quelles propositions, feuilles et demandes de report requièrent mon action.

### Responsable d'équipe — feuille de match

46. En tant que responsable receveur, je veux saisir le score set par set à partir de l'heure du
    match, afin d'enregistrer le résultat une fois la rencontre jouée.
47. En tant que responsable receveur, je veux être empêché de saisir un score avant l'heure du
    match, afin de ne pas enregistrer un résultat inventé.
48. En tant que responsable receveur, je veux qu'un score impossible soit refusé avec un message
    clair, afin de corriger ma frappe plutôt que de fausser le classement.
49. En tant que responsable receveur, je veux saisir la composition de mon équipe en cochant des
    joueurs de mon effectif, afin d'aller vite sans risque de faute de frappe sur un nom.
50. En tant que responsable receveur, je veux saisir la composition du visiteur dans son effectif,
    afin de transcrire la feuille unique remplie au gymnase.
51. En tant que responsable receveur, je veux pouvoir aligner moins de joueurs que le format
    nominal, afin d'enregistrer un match joué en sous-effectif.
52. En tant que responsable receveur, je veux être empêché d'inscrire plus de 12 joueurs par équipe,
    afin de respecter la limite de la feuille.
53. En tant que responsable receveur, je veux être empêché d'inscrire le même joueur dans les deux
    compositions du même match, afin de bloquer une erreur de saisie évidente.
54. En tant que responsable visiteur, je veux valider la feuille de match en un seul geste, afin
    d'approuver score et compositions ensemble.
55. En tant que responsable visiteur, je veux contester la feuille de match avec un motif, afin
    qu'un administrateur tranche plutôt que de subir un score erroné.
56. En tant que responsable, je veux qu'une feuille sans réponse soit validée automatiquement au
    bout de 7 jours, afin que le classement ne dépende pas de la réactivité de l'adversaire.

### Joueur titulaire d'un compte

57. En tant que joueur, je veux voir les équipes auxquelles je suis rattaché, afin de retrouver mon
    calendrier sans chercher.
58. En tant que joueur, je veux voir les prochains matchs de mon équipe avec date, heure et lieu,
    afin de savoir où me rendre.
59. En tant que joueur, je veux voir les résultats et le classement de mon équipe, afin de suivre la
    saison.
60. En tant que joueur, je veux voir les matchs sur lesquels j'ai été aligné, afin de vérifier ma
    participation.
61. En tant que joueur, je veux ne pouvoir rien modifier, afin de ne pas altérer par erreur les
    données de mon équipe.

### Public sans compte

62. En tant que spectateur, je veux consulter le calendrier d'un championnat avec date, heure et
    lieu, afin de venir voir un match.
63. En tant que spectateur, je veux consulter les résultats set par set, afin de suivre la
    compétition.
64. En tant que spectateur, je veux consulter le classement d'un championnat, afin de connaître la
    hiérarchie du moment.
65. En tant que spectateur, je veux voir les équipes ex aequo affichées comme telles, afin de ne pas
    croire à un écart qui n'existe pas.
66. En tant que licencié, je veux que mon nom n'apparaisse pas en accès libre, afin que ma
    participation ne soit pas publiée sur le web.

### Classement

67. En tant que responsable, je veux que le classement se mette à jour dès qu'un match est terminé,
    afin de ne pas attendre une saisie manuelle du comité.
68. En tant que responsable, je veux voir le détail des points de classement de mon équipe, afin de
    comprendre comment mon total est calculé.
69. En tant qu'administrateur, je veux que le classement ignore les matchs non terminés, afin qu'un
    match en négociation ou en litige ne compte pas prématurément.
70. En tant qu'administrateur, je veux qu'un forfait produise un score conventionnel homogène, afin
    que les ratios de sets et de points restent comparables entre équipes.

## Implementation Decisions

### Modules

- **Règles de score** (module pur, sans Convex ni React) — valide une feuille de match : nombre de
  sets, points par set, écart, vainqueur. Rend soit une feuille validée avec le vainqueur et les
  agrégats (sets et points de chaque équipe), soit une erreur nommant la règle violée et le set
  fautif.
- **Classement** (module pur) — prend les résultats de matchs terminés d'un championnat et rend le
  classement ordonné, chaque ligne portant ses agrégats et son rang, avec les ex aequo marqués.
- **Cycle de vie du match** (module pur) — décide si une transition demandée est légale depuis
  l'état courant, pour un acteur donné. Les mutations Convex l'interrogent au lieu d'éparpiller les
  `if` d'état.
- **Autorisations** (helper Convex) — résout l'identité appelante en compte + rôle + équipes
  gérées, et expose les prédicats dont les mutations ont besoin (est admin, gère cette équipe, est
  receveur de ce match, est visiteur de ce match).
- **Fonctions Convex** — queries et mutations par domaine : saisons/championnats, clubs/équipes,
  effectifs, calendrier, matchs (proposition, validation, refus, report, feuille, contestation),
  arbitrage admin, comptes, classement, lectures publiques.

### Schéma

| Table | Champs clés | Index |
| --- | --- | --- |
| `seasons` | libellé, `isCurrent` | par `isCurrent` |
| `clubs` | nom, salle par défaut | — |
| `players` | `clubId`, nom, prénom, numéro de licence | par `clubId` |
| `championships` | `seasonId`, nom | par `seasonId` |
| `teams` | `clubId`, `seasonId`, `championshipId`, nom | par `championshipId`, par `clubId`+`seasonId` |
| `rosterEntries` | `teamId`, `playerId` | par `teamId`, par `playerId` |
| `teamManagers` | `teamId`, `userId` | par `teamId`, par `userId` |
| `matchdays` | `championshipId`, numéro, début et fin de fenêtre | par `championshipId` |
| `matches` | `championshipId`, `matchdayId`, `homeTeamId`, `awayTeamId`, `state`, créneau confirmé, résultat, `forfeitAgainst`, `scheduledTacitId` | par `championshipId`, par `matchdayId`, par `homeTeamId`, par `awayTeamId`, par `state` |
| `slotProposals` | `matchId`, créneau proposé, auteur, statut (en attente / acceptée / refusée / tacite), échéance | par `matchId` |
| `postponementRequests` | `matchId`, auteur, motif, statut | par `matchId` |
| `matchSheets` | `matchId`, sets, agrégats, auteur, statut, motif de contestation, échéance | par `matchId` |
| `lineupEntries` | `matchSheetId`, `teamId`, `playerId` | par `matchSheetId`, par `playerId`+`matchdayId` |
| `users` | (Convex Auth) + `role`, `playerId` facultatif | par `role` |

Décisions de schéma :

- **Les sets sont stockés dans la feuille de match**, pas dans une table à part : ils n'ont aucune
  existence hors d'une feuille et sont toujours lus ensemble.
- **`lineupEntries` porte une dénormalisation de `matchdayId`**, uniquement pour rendre indexable la
  détection des cumuls d'un joueur sur une même journée.
- **Le classement n'est pas une table.** Il est dérivé à la lecture depuis les matchs terminés du
  championnat. Volume attendu (au plus quelques centaines de matchs par championnat) : aucun cache
  nécessaire.
- **Un forfait est un match terminé** portant `forfeitAgainst`, avec le score conventionnel
  matérialisé (3 sets à 25-0). Aucun état distinct : le classement n'a pas à connaître le cas
  particulier.
- **Les fiches `players` et les comptes `users` sont deux tables distinctes**, reliées par un champ
  facultatif. Créer une fiche joueur ne crée jamais de compte.

### Machine à états du match

| Depuis | Transition | Acteur | Vers |
| --- | --- | --- | --- |
| `planned` | proposer un créneau | receveur | `awaitingSlot` |
| `awaitingSlot` | valider | visiteur | `confirmed` |
| `awaitingSlot` | validation tacite | système | `confirmed` |
| `awaitingSlot` | refuser | visiteur | `planned` |
| `confirmed` | report accepté ou imposé | visiteur ou admin | `planned` |
| `confirmed` | saisir la feuille (créneau atteint) | receveur | `awaitingSheet` |
| `awaitingSheet` | valider | visiteur | `completed` |
| `awaitingSheet` | validation tacite | système | `completed` |
| `awaitingSheet` | contester | visiteur | `disputed` |
| `disputed` | arrêter le score | admin | `completed` |
| tout état sauf `completed` | prononcer un forfait | admin | `completed` |

Contraintes transversales :

- Un responsable ne valide jamais ce qu'il a lui-même soumis, même s'il gère les deux équipes du
  match : dans ce cas la validation revient à l'administrateur.
- Aucun report après l'heure du créneau : seule la saisie de feuille ou le forfait admin restent
  possibles.
- Une proposition refusée et une demande de report refusée restent en base : l'historique d'un match
  est append-only.

### Validation tacite

- L'échéance d'une proposition est `min(soumission + 7 jours, veille du créneau proposé à 23h59
  Europe/Paris)`.
- **Cas non couvert par les décisions prises, tranché ici puis affiné à l'implémentation** : si ce
  calcul laisse **moins de 24 h** pour réagir, **aucune échéance n'est programmée** et la proposition
  exige une validation explicite du visiteur. Le seuil de 24 h a remplacé la formulation initiale
  (« échéance déjà passée »), qui laissait passer une proposition faite la veille à midi avec douze
  heures pour refuser — soit un moyen, pour le receveur, de fixer une date sans l'accord de personne.
- L'échéance d'une feuille de match est `soumission + 7 jours`, sans plafond.
- L'échéance est programmée par `scheduler.runAfter` à la soumission, et son identifiant est stocké
  sur le match. Une réponse explicite annule la tâche programmée ; par sécurité, la tâche vérifie
  aussi que l'état et la cible n'ont pas changé avant d'agir, de sorte qu'une annulation manquée
  n'a aucun effet.
- Le fuseau de référence est **Europe/Paris** pour tout calcul de « veille », de « jour du match » et
  de fenêtre de journée. Les instants sont stockés en millisecondes UTC.
- Le franchissement de l'heure du match (« la saisie devient possible ») est évalué avec l'horloge
  **serveur**, jamais avec celle du client.

### Règles de score

- Meilleur des 5 sets, vainqueur au 3e set gagné. Scores de sets recevables : 3-0, 3-1, 3-2.
- Sets 1 à 4 en 25 points, tie-break en 15 points, écart minimum de 2, **prolongation illimitée**.
- Le tie-break n'est recevable qu'à 2 sets partout.
- Un set en trop, un set perdant supérieur à la cible, un écart insuffisant, un score négatif : la
  feuille est refusée en nommant le set fautif.
- Les agrégats (sets gagnés/perdus, points marqués/encaissés) sont calculés au moment de la
  validation de la feuille et stockés avec elle, pour que le classement n'ait pas à réadditionner
  les sets à chaque lecture.

### Classement

- Barème : 3 points pour une victoire 3-0 ou 3-1, 2 pour une victoire 3-2, 1 pour une défaite 2-3, 0
  pour une défaite 0-3 ou 1-3. Le vainqueur par forfait marque 3 points, l'équipe défaillante 0.
- Départage : points de classement, puis nombre de victoires, puis ratio de sets, puis ratio de
  points. Les ratios sont comparés **par produit croisé**, jamais par division, afin qu'une équipe
  n'ayant perdu aucun set ne provoque pas de division par zéro.
- Deux équipes que tous les critères laissent à égalité sont **ex aequo** : même rang, et le rang
  suivant saute d'autant. Aucun ordre arbitraire.
- La confrontation directe n'est pas un critère (indéfinie à trois équipes, et avant que leurs
  matchs soient joués).

### Autorisations et périmètre public

- Convex n'a pas de sécurité par ligne : **chaque fonction revérifie le rôle et le rattachement de
  l'appelant**. L'UI masque ce qui n'est pas permis mais ne fait jamais autorité.
- Les lectures publiques sont des **queries distinctes** qui ne renvoient jamais de nom de personne
  physique : calendrier (date, heure, lieu, équipes), résultats set par set, classement.
- Effectifs, compositions et tableaux de bord exigent un compte. Une query privée appelée sans
  identité échoue au lieu de renvoyer une version amputée.

### Comptes

- Convex Auth avec provider mot de passe, **sans inscription publique** : aucune route de création
  de compte exposée au visiteur.
- L'amorçage du premier administrateur est une fonction `internal` lancée en CLI, refusant d'écraser
  un compte existant.
- Le changement de rôle refuse de supprimer le dernier compte administrateur.
- Le rôle est un attribut unique du compte ; les droits d'un responsable sur un match viennent de
  son rattachement d'équipe.

## Testing Decisions

### Ce qu'est un bon test ici

Un test décrit un comportement observable par un acteur du domaine, dans le vocabulaire de
[CONTEXT.md](../../CONTEXT.md) : « une proposition sans réponse est confirmée au bout de 7 jours »,
« le visiteur ne peut pas valider sa propre feuille », « une victoire 3-2 rapporte 2 points ». Il
n'observe ni la forme des tables, ni le découpage interne des modules, ni l'ordre des appels. Un
refactor qui préserve le comportement ne doit casser aucun test.

Chaque test nomme la règle qu'il protège, pas la fonction qu'il appelle.

### Seam principal — les fonctions Convex publiques

Toutes les règles de cycle de vie, d'autorisation et de visibilité sont testées en appelant les
queries et mutations publiques sur une base en mémoire, avec le schéma réel, via `convex-test` sous
Vitest en environnement `edge-runtime`. Les identités sont simulées (`withIdentity`) pour incarner
tour à tour l'administrateur, le responsable receveur, le responsable visiteur et le visiteur
anonyme. Le temps est contrôlé par les faux timers de Vitest, et les échéances programmées sont
déclenchées par l'API de finalisation des tâches planifiées de `convex-test` — c'est ce qui rend la
validation tacite testable sans attendre 7 jours.

Comportements couverts à ce seam :

- Le parcours nominal complet : calendrier → proposition → validation → saisie de feuille →
  validation → apparition au classement.
- Refus de proposition, reproposition, historique conservé.
- Validation tacite d'une proposition et d'une feuille ; **non**-déclenchement quand une réponse
  explicite est arrivée avant l'échéance ; absence d'échéance quand le créneau est à moins d'un
  jour ; jamais de confirmation tacite après la date du match.
- Report : demandé et accepté, demandé et refusé, imposé par l'admin, impossible après l'heure du
  match.
- Contestation d'une feuille et arbitrage administrateur.
- Forfait prononcé par l'admin, refusé à un responsable.
- Autorisations : un responsable qui ne valide pas sa propre soumission, un responsable étranger au
  match rejeté, un compte `player` sans droit d'écriture, l'admin qui passe partout.
- Garde-fous du calendrier : auto-rencontre rejetée, équipe hors championnat rejetée, doublon de
  paire signalé sans blocage, créneau hors fenêtre de journée rejeté.
- Compositions : sous-ensemble de l'effectif, plafond de 12, composition vide refusée,
  sous-effectif accepté, même joueur dans les deux compositions rejeté, cumul inter-équipes accepté
  et remonté dans la vue de contrôle.
- Saisie de feuille avant l'heure du match rejetée.
- Périmètre public : les queries publiques ne renvoient aucun nom de joueur, les queries privées
  échouent sans identité.
- Comptes : création par l'admin seulement, changement de rôle, refus de supprimer le dernier admin,
  amorçage refusant d'écraser un compte existant.

### Seam étroit — les modules purs

Deux modules sont testés directement, par tables de cas, parce que leur combinatoire est le cœur du
produit et coûterait un scénario de base complet par cas au seam principal :

- **Règles de score** : les scores de match recevables et leurs symétriques, les cibles 25 et 15,
  l'écart de 2, la prolongation illimitée, le tie-break interdit hors 2-2, le set en trop, les
  valeurs négatives. Chaque cas invalide vérifie *quelle* règle est signalée, pas seulement que ça
  échoue.
- **Classement** : chaque ligne du barème, l'ordre des quatre critères de départage pris un par un,
  le produit croisé face à un zéro au dénominateur, les ex aequo et le saut de rang, l'exclusion des
  matchs non terminés, l'homogénéité du forfait.

Le module de cycle de vie n'a **pas** de tests propres : son comportement est entièrement observable
au seam principal, et le tester deux fois figerait un détail d'implémentation.

### Prior art

Aucune. Le repo ne contient pas encore de code : cette spec **établit** les conventions de test du
projet. Le premier ticket implémenté fixe donc aussi la forme des tests (nommage en français des
cas, helpers de mise en place d'un championnat jouable) et sert de référence aux suivants.

Un helper de mise en place est attendu au seam principal : construire en un appel une saison, un
championnat, deux équipes avec leurs effectifs et leurs responsables, une journée et un match prêt
à négocier. Sans lui, chaque test noiera sa règle dans vingt lignes de préparation.

## Out of Scope

- **Notifications e-mail ou push.** Décision explicite, voir
  [ADR-0002](../../docs/adr/0002-validation-tacite-sans-notification.md). Le tableau de bord « à
  traiter » est le seul canal.
- **Génération automatique de calendrier.** Décision explicite, voir
  [ADR-0001](../../docs/adr/0001-calendrier-saisi-manuellement.md). Ne pas l'ajouter en croyant
  compléter le produit.
- **Tests de composants React et tests E2E navigateur.** Le câblage front n'est pas couvert par des
  tests automatisés dans ce MVP.
- **Statistiques individuelles de joueurs.** Les compositions sont enregistrées, mais aucune page ne
  les agrège en statistiques.
- **Formats de jeu modélisés (6x6, 4x4).** Sans minimum de joueurs, le format n'a aucun effet sur le
  système.
- **Confrontation directe au départage**, exclue volontairement.
- **Arbitres et officiels**, **gestion des licences et des paiements**, **exports PDF de feuilles de
  match**, **application mobile**, **mode hors ligne**.
- **Inscription publique de comptes** et récupération de mot de passe en libre-service : dans ce
  MVP, l'administrateur crée et répare les comptes.
- **Multi-contexte.** Le repo reste single-context ; ne pas introduire de `CONTEXT-MAP.md`.

## Further Notes

- **Découpage.** Cette spec couvre le MVP entier et n'est pas un ticket. `/to-tickets` doit la
  découper ; l'ordre naturel est : socle (projet, schéma, auth, amorçage admin) → structure
  (saisons, clubs, équipes, effectifs) → calendrier → négociation de créneau → feuille de match et
  règles de score → classement → tableaux de bord et pages publiques → vues de contrôle admin.
- **Le seul point à faire confirmer** était la règle tranchée dans cette spec : une échéance tacite
  n'est programmée que si elle laisse au moins 24 h pour réagir. Implémentée telle quelle, elle est
  couverte par des tests et consignée dans l'ADR-0002.
- **Risque assumé.** Sans notification, une équipe qui ne se connecte pas peut se retrouver engagée
  sur un créneau qu'elle n'a pas vu. Accepté deux fois en connaissance de cause. Si le problème se
  manifeste en saison, le correctif le moins coûteux est l'e-mail sur événement, pas la suppression
  du tacite.
- **Piège de vocabulaire à surveiller en revue.** « Joueur » désigne une fiche d'effectif, pas un
  compte ; « équipe à domicile » et « équipe A » sont proscrits au profit de `Receveur`. Le glossaire
  fait autorité.
