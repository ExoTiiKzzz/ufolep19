# 09 — Report d'un match confirmé

**What to build:** un gymnase ferme, une équipe est décimée. Un responsable demande le report du
match confirmé en indiquant un motif ; l'adversaire accepte, et le match retourne en négociation de
créneau, ou refuse, et le créneau tient. L'administrateur peut imposer un report quand les deux
équipes n'y arrivent pas. Passé l'heure du match, plus aucun report n'est possible.

**Blocked by:** 07.

**Status:** ready-for-agent

- [x] Un responsable demande le report d'un match confirmé avec un motif obligatoire.
- [x] L'adversaire accepte : le match retourne en attente de proposition, sans créneau.
- [x] L'adversaire refuse : le créneau confirmé tient, et la demande refusée est conservée.
- [x] L'administrateur impose un report sans accord de l'adversaire.
- [x] Le demandeur ne peut pas accepter sa propre demande.
- [x] Aucun report n'est possible après l'heure du créneau.
- [x] Un match reporté n'entre pas au classement.
- [x] Tests au seam principal : demande acceptée, demande refusée, report imposé par
      l'administrateur, auto-acceptation refusée, report tenté après l'heure du match.

## Comments

Livré. Demande motivée, réponse de l'adversaire, report imposé par l'administrateur, et refus après
l'heure du match — pour les responsables comme pour l'administrateur. Une demande refusée reste dans
l'historique.
