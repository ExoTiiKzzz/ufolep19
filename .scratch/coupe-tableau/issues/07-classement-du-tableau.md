# 07 — Classement du tableau et exempts au calendrier

**What to build:** le classement d'un tableau en fourchettes et parcours, public ; les exempts
dans le calendrier.

**Blocked by:** 02, 03

**Status:** done

- [x] Query publique `bracket.standings` : par équipe, fourchette (ou place), parcours V/D/E.
- [x] Pages championnat et accueil : ce classement à la place du classement aux points.
- [x] Calendrier du championnat : « Exempt : Brive 1 » sous le tour.

## Comments

Livré : `bracket.standings` et `bracket.byesByChampionship` (publics), composant `BracketStandings`. Parcours en lettres V/D/E, avec la teinte win/loss en complément. Vérifié sur la page publique.
