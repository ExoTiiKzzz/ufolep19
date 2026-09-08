# 07 — Négociation du créneau : proposition, validation, refus

**What to build:** deux responsables organisent leur match sans se téléphoner. Le receveur propose
une date, une heure et un lieu — le lieu prérempli avec la salle de son club — dans la fenêtre de la
journée. Le visiteur voit la proposition sur son tableau de bord et la valide, ce qui rend le créneau
ferme, ou la refuse, ce qui renvoie le receveur à une nouvelle proposition. L'historique des
propositions et des refus reste consultable.

Cette tranche introduit le module pur de cycle de vie du match, que les tranches 08 à 12 étendent :
c'est lui qui décide si une transition est légale depuis l'état courant et pour l'acteur appelant.

**Blocked by:** 05, 06.

**Status:** ready-for-agent

- [x] Le receveur propose un créneau ; le lieu est prérempli avec la salle par défaut de son club
      et reste modifiable.
- [x] Un créneau hors de la fenêtre de dates de la journée est rejeté.
- [x] Le visiteur valide la proposition : le créneau devient ferme.
- [x] Le visiteur refuse la proposition : le match retourne en attente de proposition, et la
      proposition refusée est conservée.
- [x] Le receveur propose un nouveau créneau après un refus.
- [x] L'historique des propositions et des refus d'un match est lisible par les deux responsables
      et par l'administrateur.
- [x] Seuls les responsables des deux équipes et l'administrateur agissent sur le match ; un
      responsable ne valide jamais sa propre proposition, même s'il gère les deux équipes — dans ce
      cas la validation revient à l'administrateur.
- [x] Chaque responsable dispose d'un tableau de bord listant ce qui attend son action.
- [x] Tests au seam principal : parcours nominal, refus puis reproposition, créneau hors fenêtre,
      auto-validation refusée, responsable étranger au match rejeté, compte joueur sans droit
      d'écriture.

## Comments

Livré. Le module pur de cycle de vie (`lib/rules/match-lifecycle.ts`) porte la table des transitions
et l'acteur autorisé pour chacune ; les mutations l'interrogent au lieu d'éparpiller des `if`
d'état. Les tickets 08 à 12 s'y branchent.

Un responsable qui gère les **deux** équipes du match est vu comme receveur ou visiteur selon
l'action, et la règle « on ne valide pas sa propre soumission » reprend la main : la validation
revient alors à l'administrateur. Testé dans les deux sens.

Vérifié dans le navigateur : tableau de bord du responsable, proposition de créneau avec la salle du
club préremplie, validation par le comité, historique conservé.
