# La feuille de match est transcrite par le receveur pour les deux équipes

La feuille de match est nominative et obligatoire. Nous avons choisi que le **receveur saisisse les
compositions des deux équipes** — la sienne et celle du visiteur, choisie dans l'effectif adverse —
en même temps que le score, le visiteur validant score et compositions en un seul geste.

## Considered Options

- **Chaque responsable saisit sa propre composition** — plus fidèle à la répartition des
  responsabilités, mais incompatible avec la validation tacite du score (voir
  [ADR-0002](./0002-validation-tacite-sans-notification.md)) : un match se serait clos au bout de 7
  jours avec une composition manquante, produisant des statistiques définitivement fausses. La
  seule issue aurait été de rétablir des matchs bloqués en attente d'admin.

## Consequences

Un responsable peut donc écrire dans un objet qui « appartient » à l'équipe adverse. C'est
volontaire et calqué sur le papier : au gymnase, il n'y a qu'une feuille, remplie par les deux
capitaines et conservée par le receveur. Le contre-pouvoir est la validation du visiteur, qui porte
sur l'ensemble de la feuille et non sur le seul score.
