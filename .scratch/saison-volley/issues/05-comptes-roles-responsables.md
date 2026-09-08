# 05 — Comptes : création, rôles et rattachement des responsables

**What to build:** l'administrateur gère les accès depuis l'application. Il crée un compte avec un
rôle initial, change le rôle d'un compte existant, et rattache un compte responsable à une ou
plusieurs équipes — de sorte qu'une même personne gère les deux équipes de son club. Il ne peut pas
se verrouiller dehors.

**Blocked by:** 03.

**Status:** ready-for-agent

- [x] L'administrateur crée un compte (e-mail, nom, rôle initial) depuis une interface
      d'administration ; le compte peut se connecter ensuite.
- [x] L'administrateur change le rôle d'un compte dans les deux sens.
- [x] La mutation de changement de rôle refuse de retirer le dernier compte administrateur, avec un
      message explicite.
- [x] L'administrateur rattache et détache un compte responsable d'une équipe ; un compte peut
      gérer plusieurs équipes.
- [x] Un compte responsable peut être rattaché à une fiche joueur, sans que ce soit obligatoire.
- [x] Toutes ces opérations sont réservées à l'administrateur et le revérifient côté serveur.
- [x] Tests au seam principal : création puis connexion, changement de rôle, refus sur le dernier
      administrateur, rattachement multiple, rejet d'un responsable qui tenterait ces opérations.

## Comments

Livré. `admin.createUserAccount` est une **action** et non une mutation : `createAccount` de Convex
Auth exige un contexte d'action pour hacher le mot de passe, et le rôle de l'appelant est donc
revérifié par une query interne.

Garde-fou ajouté au-delà du ticket : un compte de rôle `player` ne peut pas être rattaché comme
responsable d'équipe — il faut d'abord lui donner le rôle `manager`. Sans ça, un compte sans droits
apparaissait comme responsable d'une équipe.

Vérifié dans le navigateur : création d'un compte responsable, connexion avec ce compte, et
rattachement à une équipe.
