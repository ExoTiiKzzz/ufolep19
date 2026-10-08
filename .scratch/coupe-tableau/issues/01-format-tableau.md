# 01 — Format tableau

**What to build:** troisième format de championnat, `tableau`, au score du standard.

**Blocked by:** —

**Status:** done

- [x] `format` accepte `tableau` ; libellé « Tableau — classement à la place, 3 sets gagnants ».
- [x] Les règles de score d'un match de tableau sont celles du standard (`scoreFormatOf`).
- [x] Les journées d'un tableau s'affichent « Tour N ».
- [x] La reprise en retour d'une journée est refusée dans un tableau.

## Comments

Livré. `ChampionshipFormat` / `scoreFormatOf` dans `lib/rules/score.ts` : un match de tableau se joue et se saisit comme un match standard. Libellé « Tour » via `matchdayNoun` (écran du match, calendrier, accueil, administration).
