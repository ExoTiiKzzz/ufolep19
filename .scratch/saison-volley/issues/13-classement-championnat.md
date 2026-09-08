# 13 — Classement du championnat

**What to build:** le classement d'un championnat se met à jour de lui-même dès qu'un match est
terminé, sans ressaisie par le comité. Chaque équipe y lit ses matchs joués, ses victoires et
défaites, ses sets et ses points, et son total de points de classement. Deux équipes que rien ne
sépare sont affichées ex aequo, sans ordre arbitraire.

**Blocked by:** 10, 12.

**Status:** ready-for-agent

- [x] Un module pur prend les matchs terminés d'un championnat et rend le classement ordonné, chaque
      ligne portant ses agrégats et son rang.
- [x] Barème : 3 points pour une victoire 3-0 ou 3-1, 2 pour une victoire 3-2, 1 pour une défaite
      2-3, 0 pour une défaite 0-3 ou 1-3 ; vainqueur par forfait 3 points, équipe défaillante 0.
- [x] Départage dans l'ordre : points de classement, nombre de victoires, ratio de sets, ratio de
      points. Aucune confrontation directe.
- [x] Les ratios sont comparés par produit croisé, jamais par division : une équipe n'ayant perdu
      aucun set ne provoque pas de division par zéro.
- [x] Deux équipes que tous les critères laissent à égalité partagent le même rang, et le rang
      suivant saute d'autant.
- [x] Les matchs non terminés — en négociation, confirmés, en attente de validation, en litige —
      n'entrent pas au classement.
- [x] Le classement est dérivé à la lecture, jamais stocké comme état modifiable.
- [x] Le détail du calcul des points d'une équipe est consultable.
- [x] Tests au seam étroit : table de cas sur chaque ligne du barème, sur les quatre critères de
      départage pris un par un, sur le produit croisé face à un dénominateur nul, sur les ex aequo
      et le saut de rang, sur l'exclusion des matchs non terminés et l'homogénéité du forfait.

## Comments

Livré. Les ratios sont comparés par **produit croisé** : une équipe n'ayant perdu aucun set ne
provoque pas de division par zéro, cas qui serait arrivé dès le premier 3-0 de la saison.

Les ex aequo partagent le rang et le rang suivant saute d'autant. Le classement est dérivé à la
lecture des matchs terminés, jamais stocké.

Vérifié dans le navigateur : après validation d'un 3-1, le classement public affiche 3 points au
vainqueur, 0 au perdant, avec les ratios de sets et de points.
