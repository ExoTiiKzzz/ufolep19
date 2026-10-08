# 07 — Rattacher un responsable à n'importe quelle équipe de la saison

**What to build:** corriger le sélecteur de l'écran Comptes, qui ne lisait que les deux premiers
championnats, et grouper les équipes par championnat.

**Blocked by:** —

**Status:** done

- [x] Toutes les équipes de la saison courante sont proposées, quel que soit le nombre de
      championnats.
- [x] Les équipes sont groupées par championnat (`<optgroup>`).
- [x] Une seule query côté Convex, par index, plutôt qu'une par championnat.

## Comments

Livré. `teams.listBySeason` (index `by_season`), testé avec cinq championnats.
