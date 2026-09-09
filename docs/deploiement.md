# Déploiement en production

L'application a deux moitiés à déployer : le **backend Convex** (schéma, fonctions, données,
fichiers) et le **front Next.js**. Convex fournit son propre hébergement ; le front se pose sur
n'importe quel hébergeur Next, Vercel étant le chemin le plus court.

Le déploiement de développement (`dev:exciting-mallard-271`) et la production sont **deux bases
distinctes**. La production démarre vide : ni saisons, ni clubs, ni comptes. Les comptes et données
de démonstration du dev n'existent pas en prod, et il ne faut pas les y recréer.

## 1. Commiter et pousser

Le front est construit depuis le dépôt Git. Rien de ce qui n'est pas poussé ne sera déployé.

```bash
npm test && npm run typecheck && npm run build
git add -A && git commit -m "..." && git push
```

`convex/_generated/` est suivi par Git et doit le rester : sans lui, le typecheck du build échoue.
`.env.local` est ignoré, et c'est voulu — il contient le déploiement de développement.

## 2. Créer le déploiement Convex de production

```bash
npx convex deploy
```

Attention au comportement, contre-intuitif : lancée **en local**, cette commande cible la
**production** du projet, et non le déploiement de développement (c'est `npx convex dev` qui vise le
dev). Elle typecheck, régénère le code, puis pousse schéma et fonctions.

Notez l'URL de production affichée (`https://<nom>.convex.cloud`) : c'est elle qui alimentera le
front.

## 3. Poser les clés d'authentification sur la production

Convex Auth signe ses jetons avec une clé stockée **sur le déploiement**. La production a besoin de
la sienne, distincte du dev :

```bash
npx @convex-dev/auth --prod --web-server-url https://votre-domaine.fr
```

Elle renseigne trois variables sur le déploiement de production : `SITE_URL`, `JWT_PRIVATE_KEY` et
`JWKS`.

### Quelle URL donner à `--web-server-url`

Celle **que les gens tapent** : le domaine personnalisé s'il y en a un, sinon l'alias stable de
production de Vercel, du type `https://ufolep19.vercel.app`.

Surtout **pas** l'URL propre à un déploiement (`ufolep19-a1b2c3-votrecompte.vercel.app`) : elle
change à chaque mise en production.

`SITE_URL` sert à Convex Auth de base pour valider et construire les redirections d'après-connexion.
Ce n'est pas ce qui fait fonctionner les cookies de session — cela relève de `CONVEX_SITE_URL`, que
Convex renseigne tout seul. En l'état, la connexion par mot de passe de cette application ne passe
aucun `redirectTo` : une valeur inexacte ne casserait donc rien aujourd'hui, mais elle casserait
toute redirection ajoutée ensuite (réinitialisation de mot de passe par e-mail, fournisseur OAuth).
Autant la poser juste.

Une barre finale est tolérée, la bibliothèque la retire. Le schéma `https://` est obligatoire.

### L'ordre pratique

L'URL de production n'existe qu'une fois le projet Vercel créé : faites donc **l'étape 4 avant celle-
ci**, ou lancez cette commande deux fois. `SITE_URL` vit sur le déploiement Convex et non dans le
build du front : la changer ne demande **aucune reconstruction**, seulement de la corriger, soit en
relançant la commande, soit depuis le dashboard Convex (Settings → Environment Variables).

Un déploiement de prévisualisation Vercel a sa propre URL, qui ne correspondra pas à `SITE_URL` :
sans conséquence tant qu'aucun flux à redirection n'est utilisé.

## 4. Déployer le front

À faire **avant l'étape 3** si vous n'avez pas encore de domaine : c'est ce qui fait exister l'URL de
production.

Sur Vercel, en important le dépôt GitHub :

### Option A — la commande de build s'occupe de tout (recommandé)

| Réglage | Valeur |
| --- | --- |
| Framework | Next.js (détecté) |
| Build command | `npx convex deploy --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL --cmd 'npm run build'` |
| Variable d'environnement | `CONVEX_DEPLOY_KEY` = clé de déploiement **production**, générée depuis le dashboard Convex (Settings → Deploy keys) |

Cette commande fait les deux en un : elle pousse les fonctions Convex, puis construit le front en lui
injectant `NEXT_PUBLIC_CONVEX_URL`. Il n'y a donc **rien** à renseigner pour cette variable — la
commande la fournit au build, et une valeur saisie dans l'interface serait de toute façon écrasée.

C'est l'option à préférer : le backend et le front partent ensemble, ils ne peuvent pas diverger.

### Option B — vous renseignez l'URL vous-même

| Réglage | Valeur |
| --- | --- |
| Build command | celle par défaut (`next build`) |
| Variable d'environnement | `NEXT_PUBLIC_CONVEX_URL` = URL du déploiement Convex de **production**, du type `https://<nom>.convex.cloud` |

L'URL est celle qu'affiche `npx convex deploy` à l'étape 2, et qu'on retrouve dans le dashboard
Convex (Settings → URL & Deploy Key → Deployment URL).

**Ne mettez pas l'URL de développement** (celle qui est dans votre `.env.local`) : le site de
production écrirait dans la base de développement.

Contrepartie de cette option : Vercel ne déploie plus que le front. À chaque modification du schéma
ou des fonctions Convex, il faut penser à lancer `npx convex deploy` — sinon le front appelle des
fonctions qui n'existent pas encore en production.

Sur un autre hébergeur, le principe est identique dans les deux cas.

### Si l'URL manque, le déploiement ne casse pas — l'écran le dit

`NEXT_PUBLIC_CONVEX_URL` est remplacée à la construction. Absente, elle **ne fait pas échouer le
build** : l'application se déploie normalement. Plutôt que de rendre une page blanche, elle affiche
alors un écran « Backend non configuré » qui rappelle les deux options ci-dessus. Une variable
présente mais vide compte comme absente.

## 4 bis. Configurer l'envoi d'e-mails (Brevo)

Nécessaire pour que les identifiants d'un nouveau compte partent tout seuls. Sans ça, tout
fonctionne, mais chaque mot de passe doit être transmis à la main.

1. Créer un compte sur Brevo et **vérifier un domaine expéditeur** (ou au minimum une adresse) —
   sans quoi Brevo refuse les envois.
2. Générer une clé d'API transactionnelle.
3. Poser les variables sur le déploiement de production :

```bash
npx convex env set BREVO_API_KEY "xkeysib-..." --prod
npx convex env set MAIL_SENDER_EMAIL "volley@votre-domaine.fr" --prod
npx convex env set MAIL_SENDER_NAME "UFOLEP 19 — Volley" --prod
```

`SITE_URL` est déjà posée par l'étape 3. Si l'une des trois variables manque, l'application le dit
précisément à l'écran au moment de la création d'un compte, et donne le mot de passe à transmettre
autrement.

Pour vérifier : créez un compte de test depuis `/administration/comptes` avec une adresse à vous.
L'écran annonce soit l'envoi, soit le motif de refus de Brevo (expéditeur non vérifié, clé
invalide, quota).

## 5. Amorcer le premier administrateur

La production n'a aucun compte, et il n'y a pas d'inscription publique. Le premier administrateur se
crée en ligne de commande :

```bash
npx convex run --prod admin:createAdmin '{"email":"...","password":"...","name":"..."}'
```

Mot de passe de 8 caractères minimum. La commande refuse d'écraser un compte existant. Les comptes
suivants se créent ensuite depuis `/administration/comptes`.

## 6. Mettre la saison en place

Dans cet ordre, depuis l'interface d'administration :

1. **Saison** (`/administration/saisons`) — la première créée devient courante.
2. **Clubs** (`/administration/clubs`) — nom, salle par défaut, logo, licenciés.
3. **Championnat** (`/administration`), puis sur sa page : **équipes engagées**, **journées** avec
   leur fenêtre de dates, puis les **matchs**.
4. **Comptes responsables** (`/administration/comptes`) — créer le compte, puis le rattacher à son
   équipe. Un compte de rôle « joueur » ne peut pas être rattaché comme responsable.

Sans journée ni match, la page d'accueil affiche un championnat vide : c'est normal.

## 7. À savoir avant d'ouvrir au public

Deux conséquences de décisions prises en conception, qui pèsent sur l'exploitation :

- **Aucune notification n'est envoyée** ([ADR-0002](./adr/0002-validation-tacite-sans-notification.md)).
  Les responsables ne voient ce qui les attend qu'en se connectant, et une proposition de créneau
  sans réponse est acceptée tacitement au bout de 7 jours. La vue « Matchs sans créneau à relancer »
  de `/administration` est le **seul** filet de sécurité du comité : elle demande d'être consultée
  régulièrement en début de saison.
- **Les feuilles de match validées sont publiques, noms des joueurs compris**
  ([ADR-0004](./adr/0004-feuilles-de-match-publiques.md)). C'est un traitement de données
  personnelles sur des pages indexables, et une feuille peut comporter des mineurs : prévoyez
  l'information des licenciés, et la mention correspondante si le site en porte une. Le retour
  arrière est une ligne de code (remettre `sheets.publicResult` derrière `requireUser`).

## 8. Ensuite

- **Sauvegardes** : le dashboard Convex propose l'export des données ; à programmer avant la
  première saison réelle.
- **Intégration continue** (optionnel) : faire tourner `npm test` et `npm run typecheck` sur chaque
  push avant que Vercel ne construise. Le build échoue déjà sur une erreur de typage, mais pas sur un
  test rouge.
- **Déploiements de prévisualisation** : `npx convex deploy` sait créer un déploiement Convex par
  branche si la clé fournie est une clé de preview, ce qui permet de tester une modification de
  schéma sans toucher à la production.
