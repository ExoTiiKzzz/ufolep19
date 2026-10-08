# 02 — Règles pures du tableau

**What to build:** `lib/rules/bracket.ts` : taille du tableau, nombre de tours, effectif réel de
chaque groupe, exempts et matchs exigés, fourchette de places d'une équipe d'après son parcours.

**Blocked by:** —

**Status:** done

- [x] Taille = puissance de 2 ≥ N ; tours = log2(taille).
- [x] Effectif réel d'un groupe calculé depuis N seul (les places vides perdent toujours).
- [x] Exempts exigés e = min(places vides, réelles) ; matchs = (réelles − e) / 2.
- [x] Fourchette d'une équipe d'après ses issues V / D / E.
- [x] Test de propriété : tout tableau joué selon ces comptes classe les équipes de 1 à N.

## Comments

Livré. Le test de propriété joue des tableaux de 2 à 40 équipes, avec des exempts et des vainqueurs tirés au hasard, et vérifie les places de 1 à N et l'effectif prédit de chaque groupe.
