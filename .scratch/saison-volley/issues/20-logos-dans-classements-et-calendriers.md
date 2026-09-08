# 20 — Logos dans les classements, les calendriers et les matchs

**What to build:** le logo d'un club ne vit plus seulement sur sa fiche. On le retrouve partout où
une équipe apparaît : dans les lignes de classement, dans les lignes de calendrier, et sur la page
d'un match.

**Blocked by:** 19.

**Status:** ready-for-agent

- [x] Chaque ligne de classement porte le logo du club de l'équipe.
- [x] Chaque ligne de calendrier porte le logo des deux clubs, receveur puis visiteur.
- [x] La page d'un match affiche les deux logos en tête, à la taille du titre.
- [x] Les logos suivent partout où la ligne de match est réutilisée : accueil, page de championnat,
      fiche d'équipe, fiche joueur, tableau de bord, vues d'administration.
- [x] Un club sans logo affiche ses initiales, à la même taille : les colonnes restent alignées.
- [x] Une liste de matchs ne résout pas deux fois le même logo.

## Comments

Livré. Vert : `npm test` (211 tests, dont 2 nouveaux), `npm run typecheck` (avec
`--noUnusedLocals`), `npm run build`, push Convex.

Les logos passent par le **résumé de match** (`matchSummary`) et par les lignes de classement, ce qui
les fait apparaître d'un coup dans les huit endroits qui réutilisent ces deux formes — sans toucher
aux pages une par une.

Décision de performance : les listes de matchs partagent désormais un **cache d'équipes par
requête** (`newTeamCache`). Sans lui, un calendrier de 110 matchs relisait les deux équipes et les
deux clubs par ligne, et résolvait 220 URL de logo — pour une poignée de clubs distincts. Un test
vérifie qu'une même équipe n'est résolue qu'une fois sur six matchs. La convention est notée dans
AGENTS.md.

Le nom du club a été ajouté au résumé de match en même temps que le logo : il sert aux initiales de
repli, et évitait de les déduire du nom de l'équipe.

Vérifié dans le navigateur avec deux logos de couleurs différentes : accueil (classement et journée
en cours), page de championnat (classement et deux journées), et page de match.
