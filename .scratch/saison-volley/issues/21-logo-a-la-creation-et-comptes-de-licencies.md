# 21 — Logo à la création d'un club, et compte pour un licencié qui a un e-mail

**What to build:** deux ajouts dans l'administration.

- Le formulaire de création d'un club accepte un **logo**, en plus du nom et de la salle : plus
  besoin de créer le club puis de revenir y ajouter l'image.
- Un licencié peut porter une **adresse e-mail**. Renseignée, elle lui ouvre un **compte de
  consultation** rattaché à sa fiche.

**Blocked by:** 19.

**Status:** ready-for-agent

- [x] Le formulaire de création d'un club a un champ fichier facultatif.
- [x] Un logo refusé n'empêche pas la création du club : celui-ci est créé, le fichier supprimé, et
      le motif affiché.
- [x] La fiche d'un licencié porte une adresse e-mail facultative.
- [x] Une adresse renseignée crée un compte de rôle `player` rattaché à la fiche.
- [x] Une adresse déjà titulaire d'un compte est rattachée à la fiche, sans doublon de compte.
- [x] Une adresse déjà rattachée à un autre licencié est refusée.
- [x] Une adresse invraisemblable est refusée avant toute création.
- [x] Le mot de passe provisoire est envoyé par e-mail à la personne, et affiché une seule fois.
- [x] Un envoi qui échoue ne fait pas échouer la création du compte : l'écran donne le motif et le
      mot de passe à transmettre autrement.
- [x] Un responsable ne peut créer de licencié que dans son club, et le compte créé n'a aucun droit
      d'écriture.
- [x] L'adresse d'un licencié ne sort d'aucune query publique.

## Comments

Livré. Vert : `npm test` (233 tests, dont 12 nouveaux), `npm run typecheck` (avec
`--noUnusedLocals`), `npm run build`, push Convex.

**Envoi d'e-mails livré** après arbitrage : fournisseur **Brevo** (hébergement UE), et **mot de
passe transmis dans le message** plutôt qu'un lien de définition. Le second point a été signalé
comme moins sûr — un mot de passe reste lisible dans la boîte de réception, et rien n'oblige à le
changer — et maintenu. Conséquence assumée, notée dans AGENTS.md : il n'existe aucun parcours de
réinitialisation, un mot de passe perdu se règle en recréant le compte.

Trois variables à poser sur le déploiement (`BREVO_API_KEY`, `MAIL_SENDER_EMAIL`, et `SITE_URL`
déjà posée par Convex Auth) ; la procédure est dans `docs/deploiement.md`. Sans elles, rien n'est
tenté et le message d'erreur les nomme toutes.

Décisions :

1. **`players.create` est devenue une action.** `createAccount` de Convex Auth exige un contexte
   d'action ; la fiche est insérée par une mutation interne qui reçoit l'identité de l'appelant
   **explicitement**, plutôt que de compter sur sa propagation. TypeScript a listé les sept
   appelants à corriger, tests compris.
2. **Un responsable peut créer un compte**, contrairement à la règle « seul l'administrateur gère
   les comptes ». Périmètre volontairement étroit : rôle `player` seulement, licencié de son club
   seulement, aucun droit d'écriture. À restreindre si le comité préfère.
3. **Une adresse existante est rattachée, pas dupliquée** : deux comptes pour la même personne
   seraient ingérables.
4. **Le club est créé même si son logo est refusé.** Lever une erreur aurait annulé la suppression du
   fichier refusé, laissant un orphelin — même piège transactionnel que `setLogo`, déjà consigné.
5. **La normalisation d'adresse est un module pur** (`lib/rules/email.ts`) : deux écritures d'une
   même adresse créeraient deux comptes.
6. **Un envoi raté ne fait jamais échouer la création du compte.** `sendMail` ne lève pas, elle rend
   `{ sent, error }` que l'appelant affiche. Un compte créé sans message reste utilisable.
7. **Le motif de refus de Brevo est remonté tel quel** (expéditeur non vérifié, clé invalide,
   quota) : un « échec d'envoi » opaque coûte une demi-heure de diagnostic.
8. **Pas de SMTP.** Les actions Convex n'ont pas d'accès TCP brut : seule une API HTTP est possible,
   ce qui exclut la boîte mail existante du comité.

La requête envoyée à Brevo est vérifiée par un test qui remplace `fetch` : URL, en-tête `api-key`,
expéditeur, destinataire, et présence du mot de passe et du lien de connexion dans le corps. Un
autre test vérifie qu'un refus 400 de Brevo est remonté avec son motif sans perdre le compte.
