# 08 — Validation tacite du créneau

**What to build:** un championnat ne se fige plus sur une équipe injoignable. Une proposition de
créneau restée sans réponse est acceptée automatiquement au bout de 7 jours, et jamais après la date
du match. Le responsable voit combien de temps il lui reste pour refuser. Une réponse explicite
arrivée avant l'échéance annule l'acceptation automatique.

Cette tranche construit le mécanisme d'échéance que la tranche 10 réutilise pour la feuille de match.

**Blocked by:** 07.

**Status:** ready-for-agent

- [x] L'échéance d'une proposition est fixée à 7 jours après la soumission, plafonnée à la veille
      du créneau proposé, le fuseau de référence étant Europe/Paris.
- [x] Si ce plafond est déjà dépassé à la soumission — créneau proposé pour le lendemain ou le jour
      même — aucune échéance n'est programmée et la validation explicite du visiteur devient
      obligatoire.
- [x] L'échéance est programmée au moment de la soumission ; son identifiant est conservé sur le
      match et annulé dès qu'une réponse explicite arrive.
- [x] La tâche d'échéance revérifie l'état et sa cible avant d'agir : une annulation manquée n'a
      aucun effet.
- [x] Aucune confirmation tacite ne peut survenir après la date du match.
- [x] Le délai restant avant acceptation automatique est affiché au responsable concerné.
- [x] Tests au seam principal avec faux timers et déclenchement des tâches programmées :
      acceptation au bout de 7 jours, non-déclenchement après une réponse explicite, plafonnement
      à la veille, absence d'échéance à moins d'un jour du créneau.

## Comments

Livré, avec un **raffinement de la règle**. Le ticket disait « aucune échéance si le plafond est déjà
dépassé ». Pris au pied de la lettre, une proposition faite la veille à midi obtenait une échéance à
23:59 le même jour, soit douze heures pour réagir — ce qui revient à imposer la date. La règle
retenue est donc : une échéance tacite n'est programmée que si elle laisse **au moins 24 h** de
réaction ; en dessous, la validation explicite du visiteur est obligatoire.

Vérifié dans le navigateur : une proposition faite pour dans trois minutes affiche « Le créneau est
trop proche pour un accord tacite : le visiteur doit valider explicitement ».

Deux barrières indépendantes : l'échéance est plafonnée à la veille du créneau, **et** la tâche
programmée refuse d'agir si la date du match est passée. Une annulation manquée reste sans effet
puisque la tâche revérifie l'état et sa cible.
