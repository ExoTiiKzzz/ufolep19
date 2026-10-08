# 04 — Renommer et supprimer une équipe

**What to build:** l'administrateur renomme une équipe engagée, et la supprime tant qu'aucun de
ses matchs n'a dépassé Planifié.

**Blocked by:** —

**Status:** done

- [x] `teams.rename` : admin, nom non vide, appliqué partout (le nom n'est jamais recopié).
- [x] `teams.removalImpact` : nombre de matchs, de joueurs sur la feuille verte et de
      responsables qu'emporterait la suppression, et matchs bloquants.
- [x] `teams.remove` : refusée en nommant les matchs dès qu'un match n'est plus Planifié ;
      sinon supprime l'équipe, ses matchs Planifiés, sa feuille verte, ses rattachements.
- [x] La confirmation à l'écran annonce les nombres.
- [x] Tests : refus avec un match en attente ; suppression en cascade sinon.

## Comments

Livré. Les matchs bloquants sont nommés dans l'ordre des journées. Vérifié à l'écran : refus sur Tulle 2 (matchs joués), renommage puis suppression d'une équipe sans match.
