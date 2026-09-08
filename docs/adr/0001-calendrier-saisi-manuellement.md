# Le calendrier est saisi manuellement par l'administrateur

Les championnats UFOLEP 19 comptent peu d'équipes et l'administrateur doit pouvoir composer les
journées en tenant compte de contraintes qu'aucun algorithme ne connaît (disponibilité des
gymnases, vacances scolaires, ententes entre clubs). Nous n'implémentons donc **aucune génération
automatique de calendrier** : l'administrateur crée chaque match en désignant le receveur, le
visiteur et la journée.

## Considered Options

- **Round-robin aller/retour automatique** — chaque équipe reçoit une fois chaque adversaire.
  Rejeté : produit un calendrier théorique que l'administrateur devrait de toute façon retoucher,
  pour un volume de matchs qui se saisit à la main en quelques minutes.
- **Round-robin simple** — rejeté pour la même raison, avec en plus une inéquité domicile/extérieur
  à l'échelle d'une saison.

## Consequences

L'absence de générateur n'est pas un oubli : ne pas l'ajouter en croyant compléter le produit. En
contrepartie, la mutation de création de match porte les garde-fous que l'algorithme aurait donnés
gratuitement — une équipe ne se rencontre pas elle-même, les deux équipes appartiennent au même
championnat, et un doublon de paire avec le même receveur est signalé.
