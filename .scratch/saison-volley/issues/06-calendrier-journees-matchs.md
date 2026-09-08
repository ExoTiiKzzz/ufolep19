# 06 — Calendrier : journées, fenêtres et matchs

**What to build:** l'administrateur compose le calendrier d'un championnat à la main. Il crée des
journées numérotées, chacune bornée par une fenêtre de dates, puis crée les matchs en désignant qui
reçoit et qui se déplace. Le système l'empêche de créer un match absurde et l'avertit d'un doublon
sans le bloquer. Le calendrier du championnat est ensuite consultable, journée par journée.

Il n'existe aucune génération automatique de calendrier — c'est une décision, voir ADR-0001. Ne pas
en ajouter.

**Blocked by:** 03.

**Status:** ready-for-agent

- [x] L'administrateur crée et modifie des journées numérotées avec une fenêtre de dates (début et
      fin) dans un championnat.
- [x] L'administrateur crée un match en désignant le receveur, le visiteur et la journée ; le match
      naît sans créneau.
- [x] Une équipe programmée contre elle-même est rejetée.
- [x] Une équipe qui n'est pas engagée dans le championnat visé est rejetée.
- [x] Une paire d'équipes déjà programmée avec le même receveur est signalée sans être bloquée.
- [x] L'administrateur corrige le receveur, le visiteur ou la journée d'un match tant qu'aucun
      créneau n'est confirmé.
- [x] Le calendrier d'un championnat est lisible groupé par journée, avec les fenêtres de dates.
- [x] Tests au seam principal sur chaque garde-fou et sur la lecture du calendrier ; le helper de
      mise en place produit désormais un match prêt à négocier.

## Comments

Livré. Les trois garde-fous sont en place et testés : auto-rencontre rejetée, équipe hors
championnat rejetée, doublon de paire avec le même receveur **signalé sans bloquer** (la mutation
rend un `duplicateWarning` que l'interface affiche). Le match retour n'est pas considéré comme un
doublon.

`matches.updatePlanned` ne s'applique qu'à un match encore en état « planifié » : dès qu'une
négociation est engagée, la correction passe par un report.
