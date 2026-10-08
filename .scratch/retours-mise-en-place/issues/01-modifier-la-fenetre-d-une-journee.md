# 01 — Modifier la fenêtre d'une journée

**What to build:** l'écran d'administration d'un championnat permet de modifier les dates de
la fenêtre d'une journée (hors plateau, qui a déjà son formulaire).

**Blocked by:** —

**Status:** done

- [x] Chaque journée non-plateau a une action « Modifier » qui ouvre ses dates, préremplies.
- [x] L'enregistrement passe par `matchdays.updateWindow`, réservée à l'administrateur.
- [x] Déplacer la fenêtre ne touche aucun match, quel que soit son état (ADR-0006).
- [x] Une fin de fenêtre antérieure au début est refusée avec un message explicite.
- [x] Un test vérifie qu'un match confirmé garde son créneau quand la fenêtre le laisse dehors.

## Comments

Livré. La fenêtre se modifie depuis le repli de chaque journée (écran du championnat). Vérifié à l'écran : J6 passée du 22 au 30 octobre, matchs intacts.
