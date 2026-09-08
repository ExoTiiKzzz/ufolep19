# 02 — Authentification et amorçage de l'administrateur

**What to build:** l'installateur crée le premier compte administrateur en ligne de commande sur
une base vide, puis se connecte à l'application avec son e-mail et son mot de passe. Une fois
connecté, il voit qu'il est identifié et avec quel rôle. Aucun visiteur ne peut créer de compte.

**Blocked by:** 01.

**Status:** ready-for-agent

- [x] Convex Auth avec provider mot de passe ; aucune route ni écran d'inscription publique.
- [x] Le compte porte un rôle unique parmi joueur, responsable et administrateur.
- [x] Une commande CLI adossée à une fonction `internal` non exposée au client crée un compte
      administrateur (e-mail, mot de passe, nom) et échoue avec un message explicite si un compte
      existe déjà pour cet e-mail.
- [x] Un écran de connexion, une déconnexion, et l'affichage du compte courant avec son rôle.
- [x] Un helper d'autorisation côté serveur résout l'identité appelante en compte et rôle, et
      expose les prédicats dont les mutations ont besoin (`getCurrentUser`, `requireUser`,
      `requireAdmin`). **Partiel** : la résolution des « équipes gérées » attend la table de
      rattachement, livrée au ticket 05.
- [x] Tests au seam principal : la fonction d'amorçage refuse d'écraser un compte existant ; une
      query privée appelée sans identité échoue au lieu de renvoyer une réponse amputée ; le
      helper de mise en place sait désormais créer des comptes avec un rôle donné.

## Comments

Livré. Vert : `npm test` (12 tests), `npm run typecheck`, `npm run build`, `npx convex dev --once`.
Parcours vérifié dans le navigateur de bout en bout : amorçage CLI, connexion par le formulaire,
badge « Administrateur » affiché, déconnexion.

Décisions et découvertes :

1. **Fermeture de l'inscription publique.** Le provider `Password` de Convex Auth expose un flux
   `signUp` par sa mutation publique `signIn` : sans intervention, n'importe qui pouvait créer un
   compte. Le callback `profile` du provider est appelé pour *tous* les flux, ce qui permet de
   rejeter `signUp` côté serveur. Les comptes administrateur passent par `createAccount`, qui ne
   traverse pas ce callback. Un test couvre le refus.
2. **`createAccount` exige un contexte d'action**, pas de mutation : `admin:createAdmin` est donc
   un `internalAction`, et la création de comptes par l'administrateur (ticket 05) devra l'être
   aussi.
3. **Connexion testable sans secret dans le dépôt.** Convex Auth signe ses jetons en RS256 avec une
   clé lue dans l'environnement, absente en test : le test de connexion réelle échouait sur
   `Missing environment variable JWT_PRIVATE_KEY`. Une paire RSA éphémère est désormais générée par
   `vitest.config.mts` à chaque exécution, ce qui rend le parcours vérifiable plutôt que d'affaiblir
   le test.
4. **Next 16 déprécie `middleware.ts` au profit de `proxy.ts`.** Migré, avertissement disparu,
   parcours de connexion re-vérifié après migration.
5. **`Label` sans Radix** : un `<label>` natif stylé suffit, une dépendance de moins.

Écart de périmètre volontaire : `users.list` (query réservée aux administrateurs) est livrée ici
car elle est nécessaire pour prouver le helper d'autorisation en test. Son interface d'admin arrive
au ticket 05.

Un administrateur de développement a été créé sur le déploiement dev pour la vérification :
`comite@ufolep19.test` / `dev-ufolep19-2026`. À supprimer ou changer.
