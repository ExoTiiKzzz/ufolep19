# 09 — Réinitialiser un mot de passe (administrateur)

**What to build:** sur la ligne d'un compte, « Nouveau mot de passe » génère un mot de passe
provisoire, l'envoie et l'affiche une fois, et ferme les sessions ouvertes du compte.

**Blocked by:** 08

**Status:** done

- [x] Action admin `admin.resetPassword({ userId })`, rôle revérifié côté serveur.
- [x] L'ancien mot de passe ne permet plus de se connecter ; le nouveau, si.
- [x] Les sessions du compte sont supprimées.
- [x] Échec d'envoi : le mot de passe reste affiché, l'erreur Brevo remontée telle quelle.
- [x] Confirmation avant l'action (elle coupe l'accès de la personne).

## Comments

Livré. E-mail dédié (`kind: "reset"`). Vérifié à l'écran : nouveau mot de passe affiché, connexion réussie avec lui.
