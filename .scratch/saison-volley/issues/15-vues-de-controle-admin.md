# 15 — Vues de contrôle de l'administrateur

**What to build:** l'administrateur pilote la saison sans avoir à fouiller championnat par
championnat. Il voit les matchs dont la fenêtre de journée approche ou est dépassée sans créneau
confirmé, pour relancer les responsables concernés — c'est le seul filet de sécurité, puisqu'aucune
notification n'est envoyée (ADR-0002). Il voit aussi les joueurs alignés pour deux équipes
différentes dans la même journée, pour contrôler les cumuls sans les interdire.

**Blocked by:** 06, 11, 13.

**Status:** ready-for-agent

- [x] Une vue liste les matchs sans créneau confirmé dont la fenêtre de journée est proche de sa fin
      ou déjà dépassée, avec les équipes et les responsables à relancer.
- [x] Une vue liste les matchs en attente d'action depuis longtemps : proposition sans réponse,
      feuille non saisie après la date du match, litige non tranché.
- [x] Une vue liste les joueurs alignés pour deux équipes différentes dans la même journée, avec les
      matchs concernés ; l'information est produite par index, sans balayage de table.
- [x] Un tableau de bord d'administration donne l'état d'avancement de chaque championnat : matchs
      terminés, en négociation, en litige.
- [x] Ces vues sont réservées à l'administrateur et le revérifient côté serveur.
- [x] Tests au seam principal : matchs en retard correctement listés, cumul de joueurs détecté sur
      une même journée et absent quand les journées diffèrent, rejet d'un responsable.

## Comments

Livré. Trois vues : matchs sans créneau dont la fenêtre se ferme (avec les responsables à relancer et
un drapeau « fenêtre dépassée »), matchs bloqués classés par motif (feuille non saisie, feuille en
attente, litige), et cumuls de joueurs par journée. Plus l'avancement chiffré de chaque championnat
de la saison courante.

Les cumuls passent par l'index `by_matchday` des compositions : aucun balayage de table.
