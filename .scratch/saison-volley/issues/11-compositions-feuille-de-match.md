# 11 — Compositions sur la feuille de match

**What to build:** la feuille de match devient nominative. Le receveur transcrit la feuille unique
remplie au gymnase : il coche les joueurs alignés de son équipe **et** ceux du visiteur, choisis dans
l'effectif de chacune. Le visiteur valide score et compositions d'un seul geste. Une équipe venue à
cinq est enregistrée telle quelle : le sous-effectif est un désavantage sportif, pas un motif de
forfait.

Le receveur saisit donc la composition adverse — c'est volontaire, voir ADR-0003. Ne pas « corriger »
en laissant chaque responsable saisir la sienne : la validation tacite de la feuille clôturerait
alors des matchs à composition manquante.

**Blocked by:** 04, 10.

**Status:** ready-for-agent

- [x] La feuille de match ne peut plus être soumise sans les compositions des deux équipes.
- [x] Chaque joueur aligné appartient à l'effectif de son équipe pour la saison ; tout autre joueur
      est rejeté.
- [x] Au plus 12 joueurs par composition ; aucun minimum, une équipe à cinq ou à quatre est
      acceptée.
- [x] Une composition vide est refusée : c'est une feuille non remplie, pas un sous-effectif.
- [x] Le même joueur présent dans les deux compositions du même match est rejeté.
- [x] Le même joueur aligné pour deux équipes différentes dans la même journée est accepté, et
      rendu détectable par un index sans balayage de table.
- [x] Le visiteur valide ou conteste la feuille entière, score et compositions ensemble.
- [x] Les compositions ne sont lisibles que par un compte connecté.
- [x] Tests au seam principal : joueur hors effectif rejeté, plafond de 12, sous-effectif accepté,
      composition vide refusée, doublon intra-match rejeté, cumul inter-équipes accepté,
      invisibilité pour un visiteur anonyme.

## Comments

Livré avec le ticket 10 (voir ses commentaires). Toutes les règles de composition sont testées :
joueur hors effectif, plafond de 12, composition vide refusée, sous-effectif accepté, doublon
intra-composition, même joueur dans les deux compositions, cumul inter-équipes autorisé.

Le cumul est rendu détectable par un index `by_matchday` sur les compositions, sans balayage de
table — c'est ce que consomme la vue de contrôle du ticket 15.

Vérifié dans le navigateur : le receveur coche les joueurs des deux équipes, une équipe de trois
joueurs est acceptée, et le visiteur valide score et compositions d'un seul geste.
