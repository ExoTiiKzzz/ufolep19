# 12 — Arbitrage administrateur : litige et forfait

**What to build:** deux situations que seul le comité peut dénouer. Quand une feuille est contestée,
l'administrateur arrête le score définitif et clôt le match, de sorte qu'un désaccord entre deux
responsables ne bloque plus un championnat. Quand une équipe n'honore pas un match, il prononce un
forfait contre elle : le match est terminé sur un score conventionnel.

**Blocked by:** 10.

**Status:** ready-for-agent

- [x] L'administrateur arrête le score d'un match en litige ; le match est terminé et entre au
      classement.
- [x] L'administrateur prononce un forfait contre une équipe, depuis n'importe quel état sauf un
      match déjà terminé.
- [x] Un forfait matérialise le score conventionnel — 3 sets à 0, chaque set à 25-0 — et enregistre
      l'équipe défaillante, sans créer d'état particulier : un match forfait est un match terminé.
- [x] Un responsable qui tente de prononcer un forfait ou de trancher un litige est rejeté.
- [x] L'administrateur corrige la feuille d'un match terminé, avec trace de la correction.
- [x] L'historique complet d'un match — propositions, refus, demandes de report, feuille,
      contestation, arbitrage — reste consultable et n'est jamais écrasé.
- [x] Tests au seam principal : arbitrage d'un litige, forfait depuis chaque état permis, forfait
      refusé sur un match terminé, rejet des responsables, correction d'une feuille validée.

## Comments

Livré. Un forfait est un match **terminé** portant l'équipe défaillante, avec le score conventionnel
matérialisé et orienté selon qui déclare forfait : le classement n'a aucun cas particulier à
connaître. Le forfait est possible depuis tout état sauf « terminé », et refusé aux responsables.

`sheets.correct` permet de corriger la feuille d'un match terminé ; la correction est tracée par
`settledBy` et remet le résultat à plat.
