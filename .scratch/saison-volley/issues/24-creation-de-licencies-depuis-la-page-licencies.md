# 24 — Créer un licencié depuis la page Licenciés

**What to build:** la page Licenciés permet de créer une fiche et de la rattacher à un club
existant, sans passer par la page Clubs.

**Blocked by:** 21, 23.

**Status:** ready-for-agent

- [x] Un formulaire de création figure sur la page Licenciés : club, nom, prénom, licence,
      e-mail facultatif.
- [x] Le club se choisit parmi les clubs existants.
- [x] Une adresse e-mail ouvre un compte de consultation et envoie les identifiants, comme
      ailleurs.
- [x] La table se met à jour sans rechargement après la création.
- [x] Sans aucun club enregistré, le formulaire explique qu'il faut d'abord créer un club.
- [x] Le message d'après-création est identique à celui des autres écrans.

## Comments

Livré. Vert : `npm test` (273 tests, dont 6 nouveaux), `npm run typecheck` (avec
`--noUnusedLocals`), `npm run build`. Vérifié à l'écran : création d'un licencié rattaché à VB
Coiroux, message « Licencié créé. », et table passée de 6 à 7 fiches sans rechargement.

**Refacto déclenché par la troisième occurrence.** Le message d'après-création — qui combine le
compte, l'envoi du mail et le mot de passe provisoire en quatre cas — était écrit en double dans la
page des clubs et la fiche d'équipe. Ce troisième écran l'a sorti dans `lib/account-notice.ts`, avec
ses propres tests. Un mot de passe qui ne s'affiche qu'une seule fois ne supporte pas d'être annoncé
différemment selon l'écran d'où on vient.

Détail corrigé au passage : le champ de recherche avait un `autoFocus` qui, le formulaire de
création venant maintenant avant lui, faisait sauter le focus au milieu de la page au chargement.

## Manques constatés, non demandés

Deux besoins voisins que cette page rend visibles et qui n'existent pas :

- **Supprimer ou désactiver un licencié.** Aucune fonction ne le permet ; une fiche saisie par
  erreur reste. À traiter probablement comme une désactivation plutôt qu'une suppression, les
  compositions de feuilles de match passées y faisant référence.
- **Changer le club d'un licencié.** Le club est fixé à la création, alors qu'un licencié qui
  change de club en cours de saison est courant.
