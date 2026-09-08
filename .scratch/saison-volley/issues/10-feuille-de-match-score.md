# 10 — Feuille de match : score par set

**What to build:** le match est joué, le résultat entre dans le système par la personne qui le
détient. À partir de l'heure du créneau, le receveur saisit le score set par set ; un score
impossible est refusé sur-le-champ avec un message nommant la règle et le set fautifs, plutôt que
d'aller polluer le classement. Le visiteur valide la feuille, ou la conteste avec un motif. Sans
réponse de sa part, la feuille est validée au bout de 7 jours et le match est terminé.

**Blocked by:** 07, 08.

**Status:** ready-for-agent

- [x] Un module pur, sans dépendance à Convex ni à React, valide un score de match et rend soit le
      vainqueur et les agrégats (sets et points de chaque équipe), soit une erreur nommant la règle
      violée et le set fautif.
- [x] Règles appliquées : meilleur des 5 sets, vainqueur au 3e set gagné, sets 1 à 4 en 25 points,
      tie-break en 15, écart minimum de 2, prolongation illimitée sans plafond, tie-break
      irrecevable hors 2 sets partout, scores de match limités à 3-0, 3-1, 3-2 et leurs
      symétriques.
- [x] Le receveur ne peut pas saisir avant l'heure du créneau, évaluée à l'horloge serveur.
- [x] Le visiteur valide la feuille, ou la conteste avec un motif : le match passe alors en litige.
- [x] Une feuille sans réponse est validée automatiquement 7 jours après sa soumission, en
      réutilisant le mécanisme d'échéance de la tranche 08.
- [x] Les agrégats sont calculés à la validation et stockés avec la feuille.
- [x] Le receveur ne valide pas sa propre feuille.
- [x] Tests au seam étroit : table de cas sur le module pur, chaque cas invalide vérifiant *quelle*
      règle est signalée. Tests au seam principal : saisie avant l'heure rejetée, validation,
      contestation, validation tacite, auto-validation refusée.

## Comments

Livré, mais **fusionné avec le ticket 11** : la mutation de saisie exige le score et les deux
compositions dès sa première version. Les découper aurait demandé de livrer une feuille sans
composition puis de la rendre obligatoire, c'est-à-dire d'écrire deux fois la même validation. Le
comportement final couvre les critères des deux tickets.

Écart assumé sur un critère : les agrégats (sets et points de chaque équipe) sont stockés dans le
`result` du **match** à la validation, et non « avec la feuille ». Le classement lit ainsi une seule
source, et il n'y a pas deux copies des mêmes totaux à garder cohérentes.

Le module pur `lib/rules/score.ts` est couvert par 29 cas de table, chaque cas invalide vérifiant
*quelle* règle est signalée et sur quel set.
