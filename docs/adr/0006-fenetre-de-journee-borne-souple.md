# La fenêtre d'une journée est une borne souple

La fenêtre d'une journée était une **date butoir** : `proposeSlot` refusait tout créneau qui en
sortait, et personne — administrateur compris — ne pouvait fixer un match ailleurs. L'UFOLEP 19
nous a appris que c'est faux sur le terrain : des matchs sont **avancés ou retardés** par
arrangement entre les deux équipes, et se jouent hors de la fenêtre de leur journée. Le modèle
rendait ces matchs impossibles à enregistrer.

La fenêtre devient donc une **borne souple** : le receveur peut proposer un créneau hors fenêtre,
qui est **signalé** (« hors fenêtre de la J3 ») aux deux responsables et à l'administrateur, et
jamais refusé — comme un renfort ([ADR-0005](./0005-renforts-signales-et-match-nul.md)).

L'argument qui tient la souplesse est le **consentement du visiteur** : un arrangement est accepté
par les deux équipes. D'où la contrepartie : une proposition hors fenêtre **n'a pas de validation
tacite**. Sans elle, un receveur pourrait reporter seul un match de six semaines en comptant sur
le silence d'un visiteur qui ne passe pas sur son tableau de bord — risque déjà assumé par
[ADR-0002](./0002-validation-tacite-sans-notification.md) pour les créneaux ordinaires, pas pour
ceux-là.

## Considered Options

- **Borne stricte, avec dérogation par l'administrateur** — rejeté : chaque arrangement entre deux
  clubs passerait par le comité, qui deviendrait un guichet pour une décision qui ne lui revient
  pas.
- **Borne stricte, sans exception** (l'existant) — rejeté : la feuille de match ne reflèterait plus
  le terrain, ou le match ne serait jamais enregistré.

## Consequences

- Déplacer la fenêtre d'une journée (`matchdays.updateWindow`) **ne touche aucun match**, joué ou
  non : les créneaux qui en sortent deviennent simplement signalés.
- La fenêtre reste la référence : c'est elle qui désigne la journée « en cours » de la page
  d'accueil, et elle reste affichée au calendrier.
- Le signalement relève du déroulé administratif : il ne sort pas de la query publique
  ([ADR-0004](./0004-feuilles-de-match-publiques.md)).
- Un plateau n'est pas concerné : sa date est fixée par l'administrateur et sa fenêtre est le jour
  du plateau.
