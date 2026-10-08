# 10 — Changer mon mot de passe

**What to build:** tout compte connecté peut remplacer son mot de passe, en donnant l'actuel.

**Blocked by:** —

**Status:** done

- [x] Écran accessible depuis la navigation pour tout compte connecté.
- [x] Mot de passe actuel vérifié ; nouveau de 8 caractères au moins, saisi deux fois.
- [x] Action Convex qui revérifie l'identité de l'appelant.
- [x] Un mot de passe actuel faux est refusé avec un message explicite.

## Comments

Livré : `password.change`, page `/mon-compte`, accessible en cliquant sur son nom dans le bandeau. La session en cours reste ouverte, les autres sont fermées. Vérifié à l'écran : refus d'un mot de passe actuel faux, puis changement.
