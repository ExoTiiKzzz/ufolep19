# 03 — Reprendre en retour une journée

**What to build:** sur une journée cible, l'administrateur choisit une journée source du même
championnat ; tous ses matchs sont recréés dans la cible, receveur et visiteur inversés
(ADR-0001, addendum).

**Blocked by:** —

**Status:** done

- [x] Mutation admin `matches.mirrorMatchday({ sourceMatchdayId, targetMatchdayId })`.
- [x] Source et cible appartiennent au même championnat, et sont distinctes.
- [x] Les matchs créés passent par les mêmes garde-fous que `matches.create` (plateau : nés
      Confirmés au créneau du plateau).
- [x] La copie est refusée si un match inversé de la source existe déjà dans la cible —
      relancer deux fois ne duplique rien.
- [x] Une source sans match est refusée avec un message explicite.
- [x] L'écran du championnat propose « Reprendre en retour la journée… » sur chaque journée.

## Comments

Livré. `insertMatch` factorise les garde-fous de `matches.create` ; la reprise y passe. Vérifié à l'écran : J1 reprise en J6 (3 matchs inversés), relance refusée en nommant les matchs.
