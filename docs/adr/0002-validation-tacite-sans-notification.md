# Validation tacite des créneaux et des scores, sans notification

Toute la planification repose sur une négociation asynchrone entre deux responsables bénévoles. Un
silence prolongé bloquait le match indéfiniment et, avec lui, le classement du championnat. Nous
avons donc retenu la **validation tacite** : une proposition de créneau ou un score resté sans
réponse est accepté automatiquement 7 jours après sa soumission, et au plus tard la veille du
créneau proposé. Il n'y a **aucune notification par e-mail** : les responsables découvrent ce qui
les attend sur leur tableau de bord.

## Consequences

Une équipe qui ne se connecte pas peut se retrouver engagée sur un créneau qu'elle n'a jamais vu.
Le risque a été identifié et accepté explicitement : la paralysie d'un championnat coûte plus cher
que ce cas de figure, et l'ajout d'e-mails reste possible plus tard sans toucher au modèle.

Le plafond « au plus tard la veille du créneau » n'est pas cosmétique : sans lui, une proposition
faite 3 jours avant la date se serait confirmée *après* que le match ait été joué.

Ce plafond a demandé un second garde-fou, découvert à l'implémentation : appliqué seul, il donnait à
une proposition faite la veille à midi une échéance à 23 h 59 le même jour, soit douze heures pour
réagir — c'est-à-dire un moyen pour le receveur d'imposer une date. Une échéance tacite n'est donc
programmée que si elle laisse **au moins 24 h** ; en dessous, la validation explicite du visiteur est
obligatoire.

L'échéance est programmée par `scheduler.runAfter` au moment de la proposition, et non par un cron
qui balaierait la base — la date d'échéance est connue dès la soumission.
