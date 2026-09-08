# 18 — Score par set et joueurs alignés visibles sans compte

**What to build:** un visiteur sans compte, sur la page d'un match terminé, voit le score set par
set et le nom des joueurs qui y ont participé.

Cela **renverse** une décision antérieure — « aucun nom de personne physique en accès libre » — prise
lors de la conception et consignée dans AGENTS.md et la spec. Le renversement est demandé, son
risque a été énoncé, et il est tracé par
[ADR-0004](../../../docs/adr/0004-feuilles-de-match-publiques.md).

**Blocked by:** 11, 14.

**Status:** ready-for-agent

- [x] La page d'un match terminé affiche le score set par set sans compte.
- [x] Elle affiche les compositions des deux équipes, nominativement, sans compte.
- [x] Un match non terminé n'expose rien : ni un créneau confirmé, ni une feuille en attente de
      validation, ni une feuille contestée. Le score ne devient public qu'une fois arrêté.
- [x] La query publique ne renvoie rien du déroulé administratif : ni motif de contestation, ni
      auteur de la saisie, ni échéance.
- [x] Un forfait est publié avec son score conventionnel et sans composition.
- [x] Les listes restent anonymes : calendrier, résultats, classement, fiches de club et d'équipe.
- [x] Les effectifs et les fiches joueur exigent toujours un compte.
- [x] La documentation est mise en accord : AGENTS.md, la spec, et un ADR qui garde trace du
      renversement et de son risque.

## Comments

Livré. Vert : `npm test` (190 tests, dont 4 nouveaux), `npm run typecheck` (avec
`--noUnusedLocals`), `npm run build`, push Convex.

Une nouvelle query, `sheets.publicResult`, plutôt que d'ouvrir `sheets.get` au public : cette
dernière porte le motif de contestation, l'auteur de la saisie et l'échéance tacite, qui n'ont rien
à faire dehors. Deux limites la tiennent étroite — matchs terminés seulement, et rien du déroulé
administratif. Un test vérifie qu'un score contesté n'est pas publié avant arbitrage, et un autre
que le motif de contestation ne fuit pas.

Le bloc « Feuille de match » de la page match est sorti de la zone réservée aux responsables : il
était rendu à l'intérieur, ce qui le rendait invisible sans compte.

Le test qui garantissait « aucune query publique ne renvoie de nom » a été renommé en « les listes
publiques ne renvoient pas de nom » : il reste vrai et garde son intérêt, mais son ancien titre
aurait laissé croire à une contradiction.

Vérifié dans le navigateur, déconnecté : le score set par set et les six noms s'affichent, et le
bloc « Historique » (négociation) disparaît bien.
