# La coupe se joue en tableau à places vides

La Coupe de Corrèze n'est pas un championnat aux points : c'est un **tableau de classement
intégral**. À chaque tour, chaque groupe se coupe en deux — ses vainqueurs disputent la moitié
haute de ses places, ses vaincus la moitié basse —, et chaque équipe joue à chaque tour jusqu'à
obtenir une place définitive, de 1 à 32. D'où un troisième **format** de championnat, `tableau`,
qui garde les règles de score du standard (3 sets gagnants, jamais de nul) et remplace le barème
aux points par la place obtenue.

Le règlement suppose 32 équipes. Quand il en manque, nous complétons le tableau à la puissance de
2 supérieure par des **places vides**, qui perdent toujours. Une équipe opposée à une place vide est
**exempte** : elle gagne par forfait de l'adversaire absent, 3-0. Les places vides finissent donc
en bas du tableau, et les équipes se classent de 1 au nombre d'engagés.

## Considered Options

- **Groupes à effectif réel, coupés en deux** — un groupe de *n* équipes joue pour *n* places, avec
  un exempt seulement quand *n* est impair. Plus de matchs joués, aucun calcul d'exempts. Rejeté
  par l'UFOLEP 19 au profit du tableau à places vides, fidèle à la forme du règlement : des blocs de
  places de taille fixe (1-16, 17-32, 1-8…), identiques d'une saison à l'autre quel que soit le
  nombre d'engagés.

## Consequences

- **Des exempts même avec un nombre pair d'équipes.** Avec 30 équipes, 2 équipes sont exemptes au
  tour 1, puis encore 2 dans le groupe des vaincus, etc. Ce n'est pas une anomalie : c'est le prix
  des blocs fixes.
- Le **nombre** d'exempts d'un groupe est imposé — *e* = min(places vides, équipes réelles), le reste
  se rencontre — parce que s'en écarter ferait gagner une place vide et laisserait un trou au
  classement. Le **choix** des équipes exemptes revient à l'administrateur, sans contrôle.
- Le tableau **se fige** au premier match ou exempt du tour 1 : sa taille dépend du nombre
  d'engagés, qu'on ne peut plus changer ensuite.
- Les rencontres restent formées à la main par l'administrateur
  ([ADR-0001](./0001-calendrier-saisi-manuellement.md)) ; l'application refuse seulement ce qui
  casserait le tableau (deux groupes mêlés, une équipe deux fois dans un tour, un tour précédent
  pas terminé).
