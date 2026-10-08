# 04 — Garde-fous d'appariement

**What to build:** dans un tableau, la création et la correction d'un match vérifient le tableau.

**Blocked by:** 02, 03

**Status:** done

- [x] Refus : tour hors du tableau, équipes de groupes différents, équipe déjà engagée dans le
      tour, match du tour précédent non terminé (nommé), groupe qui a déjà tous ses matchs.
- [x] Même contrôle sur `matches.updatePlanned`.
- [x] Un match terminé dont l'issue est corrigée alors que le tour suivant est engagé : refusé.

## Comments

Livré : `assertBracketMatch` est appelé par `insertMatch` et `updatePlanned`, et `assertBracketResultEditable` par `sheets.correct`. Le refus d'un match en trop rappelle les exempts restant à désigner.
