# 17 — Palette bleu pastel et page d'accueil centrée sur un championnat

**What to build:** l'application prend une identité visuelle, et la page d'accueil répond à la
question qu'on se pose en arrivant : où en est mon championnat, et qu'est-ce qui se joue en ce
moment.

- Une couleur principale bleu pastel et une secondaire qui s'accorde, appliquées partout.
- À l'arrivée, un championnat par défaut avec son classement, et un sélecteur pour en changer.
- En dessous, la journée en cours — ou la prochaine si on est entre deux journées.

**Blocked by:** 13, 14.

**Status:** ready-for-agent

- [x] Palette définie par tokens en thèmes clair et sombre : bleu pastel principal, abricot doux
      secondaire, rose doux pour les problèmes, gris pour le neutre.
- [x] La couleur porte un sens : abricot pour ce qui attend une action, rose pour un problème, gris
      pour du neutre, bleu pour un état acquis ou une action principale.
- [x] La couleur principale est visible sans être criarde : bandeau de navigation, boutons
      principaux, tête de classement.
- [x] Les contrôles posés sur le bandeau restent lisibles dans les deux thèmes.
- [x] La page d'accueil affiche un championnat par défaut, le premier de la saison courante.
- [x] Un sélecteur groupé par saison permet de changer de championnat, saisons passées incluses.
- [x] Le classement du championnat choisi est affiché sous le sélecteur.
- [x] La journée en cours est affichée avec ses matchs ; à défaut la prochaine ; à défaut la
      dernière, en annonçant lequel des trois cas s'applique.
- [x] Un championnat sans journée n'affiche pas un écran vide mais un message explicite.

## Comments

Livré. Vert : `npm test` (186 tests, dont 7 nouveaux sur les requêtes d'accueil), `npm run typecheck`
(y compris `--noUnusedLocals`), `npm run build`, push Convex.

Deux extractions au passage : le tableau de classement (`components/standings-table.tsx`) et la ligne
de match étaient dupliqués entre la page d'accueil et la page du championnat.

Décisions :

1. **Le sélecteur liste tous les championnats, groupés par saison** plutôt que ceux de la seule
   saison courante : sans ça, la nouvelle page d'accueil rendait les saisons passées inaccessibles.
2. **`matchdays.currentOrNext` renvoie un `status`** (`current`, `upcoming`, `past`) au lieu de
   laisser l'interface deviner. Saison finie, elle montre la dernière journée plutôt qu'un vide.
   Quand deux fenêtres se chevauchent, la journée au numéro le plus petit gagne.
3. **L'abricot est réservé aux attentes.** Il servait auparavant à tous les badges neutres (rôle
   d'un compte, saison archivée, responsables) : la couleur n'aurait plus rien voulu dire. Ces
   badges sont passés en `muted`.

Défaut trouvé en vérifiant le thème sombre, et corrigé : dans le bandeau bleu, le bouton
« Se déconnecter » s'affichait noir sur noir. Il héritait de `bg-background`, pensé pour un fond de
page. Les contrôles du bandeau sont désormais exprimés relativement à `primary-foreground`.

Vérifié dans le navigateur, thèmes clair et sombre : page d'accueil, page de championnat, et vue
d'administration où l'abricot (« Fenêtre bientôt fermée ») côtoie le bleu.
