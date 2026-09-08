# 19 — Score en tableau et logo de club

**What to build:** deux améliorations d'affichage et de données.

- Le score d'un match se lit dans un **tableau** — une colonne par set, une ligne par équipe — au
  lieu d'une suite de scores en ligne.
- Un club peut porter un **logo**, envoyé par l'administrateur et affiché là où le club apparaît.

**Blocked by:** 03, 11, 16.

**Status:** ready-for-agent

- [x] Le score d'un match s'affiche en tableau : une colonne par set, une ligne par équipe, le
      gagnant de chaque set mis en évidence et le total de sets rappelé en fin de ligne.
- [x] La colonne du 5e set est identifiée comme le tie-break, dont la cible n'est pas la même.
- [x] Le tableau sert partout où un score apparaît : feuille publique, feuille à valider, et écran
      d'arbitrage d'un litige.
- [x] Un administrateur peut envoyer, remplacer et retirer le logo d'un club.
- [x] Le fichier est vérifié côté serveur : formats image seulement, SVG exclu, 2 Mo au maximum.
- [x] Un fichier refusé est supprimé du stockage, sans orphelin.
- [x] Remplacer ou retirer un logo supprime l'ancien fichier.
- [x] Le logo s'affiche sur la fiche du club, la fiche d'équipe et la liste d'administration ; à
      défaut, les initiales du club tiennent la même place.
- [x] Seul un administrateur gère les logos, revérifié côté serveur.

## Comments

Livré. Vert : `npm test` (209 tests, dont 19 nouveaux), `npm run typecheck` (avec
`--noUnusedLocals`), `npm run build`, push Convex.

Deux découvertes qui ont changé le code :

1. **Une mutation Convex qui lève une erreur annule aussi son `storage.delete`.** « Supprimer le
   fichier refusé puis lever une erreur » laissait donc l'orphelin en place — un test le montrait.
   `clubs.setLogo` **rend le motif du refus** au lieu de le lever : la mutation aboutit et le ménage
   est fait. Consigné dans AGENTS.md, section « Fichiers ».
2. **`ctx.storage.store` du harnais de test n'enregistre pas de type MIME**, alors que le vrai
   stockage le tient de l'en-tête de l'envoi. Un fichier créé en test est donc toujours refusé. La
   validation est sortie en module pur (`lib/rules/logo.ts`) et couverte par 12 cas de table ; les
   tests au seam Convex couvrent les autorisations, les refus et le ménage. L'hypothèse « le backend
   renseigne bien `contentType` » a été vérifiée sur le déploiement réel, qui rend `image/png`.

Décisions :

- **SVG refusé** : il peut embarquer du script, et un fichier déposé n'a pas à être servi tel quel.
- **Le module de règles sert aussi côté client**, pour éviter un envoi voué au refus — sans jamais
  faire autorité : le serveur revalide.
- **Un club sans logo affiche ses initiales**, à la même taille : une image manquante ne laisse pas
  de trou dans la mise en page.

Non vérifié par mes soins : la sélection de fichier dans le navigateur, que l'outil dont je dispose
ne sait pas piloter. Le reste de la chaîne l'est — dépôt réel dans le stockage Convex, métadonnées,
`getUrl`, et affichage du logo sur la fiche du club et la fiche d'équipe.
