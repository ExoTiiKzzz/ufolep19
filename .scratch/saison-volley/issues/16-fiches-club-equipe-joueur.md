# 16 — Fiches club, équipe et joueur

**What to build:** trois fiches consultables, chacune rassemblant ce qu'on cherche sur son sujet.

- **Fiche club** : le nom, la salle par défaut, et ses équipes saison par saison. Un compte connecté
  y voit aussi les licenciés du club.
- **Fiche équipe** : le club, le championnat, la saison, la place au classement, et tous ses matchs
  avec créneau et résultat. Un compte connecté y voit l'effectif et les responsables ; celui qui
  gère l'équipe (ou un administrateur) y garde les actions d'effectif.
- **Fiche joueur** : le nom, la licence, le club, les équipes, et les matchs sur lesquels il a été
  aligné. Nominative, donc réservée aux comptes connectés.

Les fiches se renvoient les unes aux autres, et le classement et le calendrier renvoient vers les
fiches d'équipe.

**Blocked by:** 03, 04, 13, 14.

**Status:** ready-for-agent

- [x] Fiche club publique : nom, salle par défaut, équipes groupées par saison, la saison courante
      en premier.
- [x] Les licenciés d'un club n'apparaissent sur sa fiche que pour un compte connecté.
- [x] Fiche équipe publique : club, championnat, saison, rang et points au classement, liste des
      matchs avec créneau, score et état.
- [x] Effectif et responsables d'une équipe visibles seulement pour un compte connecté.
- [x] Les actions d'effectif (créer un joueur, ajouter, retirer, reprendre l'effectif précédent) ne
      s'affichent que pour le responsable de l'équipe ou un administrateur, et restent revérifiées
      côté serveur.
- [x] Fiche joueur réservée aux comptes connectés : identité, licence, club, équipes, et matchs où
      il a été aligné avec le score.
- [x] Aucune query publique nouvelle ne renvoie de nom de personne physique.
- [x] Navigation croisée : classement et calendrier renvoient vers la fiche d'équipe ; la fiche
      d'équipe renvoie vers le club et les fiches joueur ; la fiche joueur renvoie vers son club et
      ses équipes.

## Comments

Livré. Vert : `npm test` (179 tests, dont 7 nouveaux sur les fiches), `npm run typecheck`,
`npm run build` (13 routes), push Convex.

Trois nouvelles queries publiques (`clubs.get`, `teams.get`, `teams.matches`) et une query privée
(`players.get`). Un test compare les charges utiles des trois queries publiques au nom d'un licencié
réellement enregistré : aucune ne le contient.

La ligne de match est désormais un composant partagé (`components/match-row.tsx`), utilisé par le
calendrier d'un championnat, la fiche d'équipe et la fiche joueur — les trois affichaient la même
chose de trois façons différentes.

Décisions :

1. **La fiche d'équipe remplace l'ancienne page d'effectif.** Celle-ci n'était accessible qu'aux
   responsables et ne montrait que l'effectif. La fiche est publique pour ce qui n'est pas nominatif
   (club, championnat, rang, matchs), réserve l'effectif et les responsables aux comptes connectés,
   et n'affiche les actions de gestion qu'au responsable de l'équipe ou à un administrateur.
2. **`canManage` est calculé côté client** à partir de `teams.mine` et du rôle, uniquement pour
   masquer les boutons. Les mutations revérifient le rattachement côté serveur, comme partout.
3. **Les apparitions d'un joueur passent par l'index des compositions**, qui commence par le joueur :
   aucun balayage de table.

Vérifié dans le navigateur, connecté puis déconnecté : la chaîne classement → fiche équipe → fiche
club → fiche joueur, et le masquage de l'effectif, des responsables et de la fiche joueur pour un
visiteur anonyme.
