# 11 — Supprimer un compte

**What to build:** l'administrateur supprime un compte : identité de connexion, e-mail,
rattachements et lien vers la fiche Joueur disparaissent ; le nom reste dans l'historique des
matchs avec « (compte supprimé) ».

**Blocked by:** —

**Status:** done

- [x] `users.remove({ userId })` : admin ; refuse le dernier administrateur et son propre compte.
- [x] Supprime identifiants, sessions, rattachements d'équipe ; retire e-mail et `playerId`.
- [x] L'adresse libérée permet de recréer un compte.
- [x] Le compte supprimé disparaît de la liste des comptes et ne peut plus se connecter.
- [x] L'historique d'un match affiche « Nom (compte supprimé) ».
- [x] La fiche Joueur n'est pas touchée.

## Comments

Livré. La ligne du compte est remplacée par `{ name, role: "player", deletedAt }` : le rôle retombe pour ne pas fausser le garde-fou du dernier admin. `getCurrentUser` ignore un compte supprimé, un jeton encore valide n'ouvre donc plus rien. Vérifié à l'écran.
