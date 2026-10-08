# 03 — Exempts

**What to build:** l'administrateur déclare une équipe exempte pour un tour, ou annule
l'exemption.

**Blocked by:** 02

**Status:** done

- [x] Table `byes` (championnat, journée, équipe).
- [x] `byes.create` : admin ; refuse au-delà du nombre d'exempts exigé du groupe, une équipe déjà
      engagée dans le tour, un tour précédent non terminé.
- [x] `byes.remove` : refusé si l'équipe a déjà un match ou un exempt au tour suivant.
- [x] Un exempt compte comme une victoire dans le parcours.

## Comments

Livré dans `convex/bracket.ts` : `declareBye` et `cancelBye`, plutôt qu'un module `byes` à part, puisque toute la logique du tableau y vit.
