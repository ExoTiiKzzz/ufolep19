# 22 — Palette aux couleurs d'un ballon Mikasa

**What to build:** l'application reprend les couleurs du ballon officiel — bleu roi en primaire,
jaune d'or en secondaire — à la place du bleu pastel et de l'abricot.

**Blocked by:** 17.

**Status:** ready-for-agent

- [x] Le bleu et le jaune du ballon Mikasa sont les couleurs primaire et secondaire.
- [x] Le sens de chaque couleur est conservé : bleu pour un état acquis, jaune pour une attente,
      rouge pour un problème, gris pour du neutre.
- [x] Tous les couples texte/fond respectent le ratio WCAG de 4,5, dans les deux thèmes.
- [x] Chaque élément coloré se détache de son fond (seuil 3), dans les deux thèmes.
- [x] Les deux thèmes sont vérifiés à l'écran, pas seulement calculés.

## Comments

Livré. Vert : `npm test` (241 tests), `npm run typecheck` (avec `--noUnusedLocals`),
`npm run build`.

Le refacto ne touche que les tokens et deux variantes de composant : aucune page n'a été modifiée,
puisque tout passait déjà par les tokens. C'est ce que la discipline « aucune couleur brute » avait
préparé.

**Les couleurs ont été converties et mesurées, pas estimées.** `#1B4FA0` → `oklch(0.442 0.143
259.4)` et `#FFC61E` → `oklch(0.854 0.17 86.8)`, conversion vérifiée par aller-retour. Puis dix
couples de contraste calculés par thème. Trois enseignements ont changé la palette :

1. **Le texte sur le bleu devait passer en blanc.** Le pastel précédent portait du texte bleu
   foncé ; sur le bleu du ballon, c'est illisible.
2. **Le bleu du ballon ne se détache pas d'un fond sombre** — rapport 2,0 pour un seuil de 3. Un
   balayage de luminosités a donné `L = 0.55` comme premier point satisfaisant *à la fois* le
   détachement (3,2) et le texte blanc (4,8). Le mode sombre a donc un bleu éclairci ; c'est la
   seule entorse à la fidélité de marque, et elle est motivée.
3. **Le jaune vif sur carte blanche n'a presque pas de frontière** — rapport 1,6. Plutôt que de
   ternir le jaune Mikasa, il reçoit une bordure dorée plus foncée (`--secondary-border`,
   3,2 contre le blanc). Le jaune reste exact.

Marge la plus faible de l'ensemble : 4,7 pour un seuil de 4,5. C'est noté dans AGENTS.md avec la
consigne de refaire le calcul avant de toucher une valeur.

Vérifié à l'écran dans les deux thèmes, sur la page d'accueil et sur la vue d'administration — la
seule qui montre le bleu et le jaune côte à côte.
