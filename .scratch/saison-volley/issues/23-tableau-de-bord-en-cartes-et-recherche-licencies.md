# 23 — Tableau de bord en cartes, bouton « + » pour les logos, table de licenciés cherchable

**What to build:** trois retouches d'interface.

- Le tableau de bord présente ses sections en **cartes**, comme la page d'administration, au lieu
  de simples titres.
- Le choix d'un logo de club se fait par un **bouton « + »**, et non par le sélecteur de fichier
  natif « Parcourir… ».
- L'administration gagne une **table de tous les licenciés du département**, avec un champ de
  recherche.

**Blocked by:** 07, 21.

**Status:** ready-for-agent

- [x] Les trois sections du tableau de bord sont des cartes avec titre et description.
- [x] Les lignes de match du tableau de bord portent les logos des deux clubs.
- [x] Le choix d'un logo passe par un bouton « + », dans la création d'un club comme sur un club
      existant.
- [x] Le logo choisi à la création s'affiche en aperçu avant l'enregistrement, et peut être retiré.
- [x] Une page liste tous les licenciés : nom, club, licence, équipes, compte.
- [x] La recherche porte sur le nom, le prénom, la licence, l'adresse e-mail et le club.
- [x] Elle est insensible à la casse et aux accents, et accepte les mots dans n'importe quel ordre.
- [x] Au-delà de 100 résultats, la table le signale plutôt que de tout charger.
- [x] La page est réservée à l'administrateur : c'est la seule vue qui traverse tous les clubs.

## Comments

Livré. Vert : `npm test` (267 tests, dont 26 nouveaux), `npm run typecheck` (avec
`--noUnusedLocals`), `npm run build`. Vérifié à l'écran : tableau de bord côté responsable (carte
« En attente de l'adversaire » peuplée, logos compris), bouton « + » dans les deux formulaires de
logo, et recherche de licenciés filtrant sur un nom de club.

**Un défaut trouvé en testant la recherche à l'écran, et corrigé.** Chercher « club b » remontait
**tous** les licenciés, y compris ceux du Club A : la correspondance se faisait par sous-chaîne, et
le « b » isolé se trouvait dans le mot « club » lui-même. La recherche découpe désormais les deux
côtés en mots — sur tout ce qui n'est pas alphanumérique, ce qui rend une adresse cherchable
morceau par morceau — et exige que chaque mot cherché **commence** un mot de la fiche. Un test
enferme précisément ce faux positif.

Décisions :

1. **La recherche couvre le nom du club**, ajouté après coup : la table affiche une colonne Club, et
   un administrateur qui tape un nom de club s'attend à filtrer dessus. Les clubs sont résolus avant
   le filtrage — ils sont trop peu nombreux pour que ça pèse.
2. **La table des licenciés est lue en entier, sans index.** C'est assumé et commenté : elle contient
   les licenciés d'un seul département, et cette page d'administration n'est pas un chemin critique.
   Le jour où le volume change, un index de recherche Convex prendra le relais.
3. **Le sélecteur de fichier est un `<label>`, pas un `<button>`.** Cliquer un label associé à un
   `<input type="file">` ouvre le sélecteur nativement : pas de JavaScript, et le champ reste
   accessible au clavier et aux lecteurs d'écran. L'input est masqué visuellement, pas retiré de
   l'arbre.
4. **Pas de cartes imbriquées dans le tableau de bord** : les sections sont des cartes, leur contenu
   des lignes simples — le motif déjà utilisé par la page d'administration.
5. **La page des clubs s'intitule désormais « Clubs »**, le hub distinguant « Clubs » et
   « Licenciés » : garder « Clubs et licenciés » aurait laissé croire à deux chemins pour la même
   chose.
