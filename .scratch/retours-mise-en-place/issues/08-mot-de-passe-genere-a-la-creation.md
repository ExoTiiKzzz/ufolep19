# 08 — Mot de passe généré à la création d'un compte

**What to build:** l'écran Comptes ne demande plus de mot de passe : la plateforme en génère un
provisoire, l'envoie et l'affiche une fois, comme pour un licencié.

**Blocked by:** —

**Status:** done

- [x] `admin.createUserAccount` ne prend plus de mot de passe et rend celui qu'il a généré.
- [x] Même générateur que la création de licencié, même message d'après-création.
- [x] `admin:createAdmin` (CLI) garde son mot de passe en argument.

## Comments

Livré. `temporaryPassword` déplacé dans `lib/rules/password.ts`, partagé avec la création de licencié. Le message d'après-création passe par `accountNotice(…, "account")`.
