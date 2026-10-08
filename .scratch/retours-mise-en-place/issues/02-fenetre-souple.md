# 02 — Créneau hors fenêtre : signalé, sans validation tacite

**What to build:** le receveur peut proposer un créneau hors de la fenêtre de la journée. Le
créneau est signalé aux deux responsables et à l'administrateur, et la proposition n'a pas
d'échéance tacite (ADR-0006).

**Blocked by:** —

**Status:** done

- [x] `proposeSlot` accepte un créneau hors fenêtre (il refuse toujours un créneau passé).
- [x] Une proposition hors fenêtre ne programme aucune échéance tacite ; `proposeSlot` le dit
      au receveur dans sa réponse, avec la raison.
- [x] La règle vit dans le module pur de validation tacite, testée.
- [x] Le match (vue des responsables et de l'admin) signale « hors fenêtre de la J… » pour une
      proposition en attente ou un créneau ferme hors fenêtre — recalculé à la lecture.
- [x] La query publique n'expose pas ce signalement.
- [x] Le sélecteur de date de proposition n'est plus borné à la fenêtre ; il annonce qu'un
      créneau hors fenêtre exigera la validation explicite du visiteur.

## Comments

Livré. Règle pure dans `lib/rules/window.ts`, appliquée par `slotTacitDeadline`. Le signalement est exposé par `negotiation.history` (`outsideWindow` par proposition, `slotOutsideWindow` pour le créneau ferme), réservée aux deux responsables et à l'admin. Vérifié à l'écran : avertissement au fil de la saisie, carte du visiteur, historique, badge sur le créneau confirmé.
