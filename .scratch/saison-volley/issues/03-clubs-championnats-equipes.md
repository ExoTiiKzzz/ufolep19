# 03 — Clubs, championnats et équipes

**What to build:** l'administrateur met en place la structure d'une saison : il crée des clubs avec
leur salle par défaut, des championnats dans la saison, puis des équipes rattachées à un club et
engagées dans un championnat. Il voit ensuite la liste des équipes engagées de chaque championnat.

**Blocked by:** 02.

**Status:** ready-for-agent

- [x] L'administrateur crée, modifie et liste les clubs, avec le nom de la salle par défaut.
- [x] L'administrateur crée et liste les championnats d'une saison.
- [x] L'administrateur crée une équipe en la rattachant à un club, à une saison et à un
      championnat ; une équipe appartient à une seule saison.
- [x] Les index nécessaires existent : équipes par championnat, équipes par club et saison.
- [x] Toutes ces mutations sont réservées à l'administrateur et le revérifient côté serveur : un
      responsable et un joueur sont rejetés.
- [x] Tests au seam principal sur la création, le rejet des acteurs non autorisés, et la liste des
      équipes d'un championnat ; le helper de mise en place produit désormais un championnat avec
      deux équipes.

## Comments

Livré. La création de saison et la désignation de la saison courante sont livrées ici aussi : sans
elles, rien d'autre n'était atteignable. L'invariant « une seule saison courante » est tenu par la
mutation, qui bascule l'ancienne dans le même appel.

Décision : `teams.create` ne prend **pas** de `seasonId`. La saison est dérivée du championnat, de
sorte qu'une équipe ne puisse jamais être rattachée à une saison contredisant son championnat.

Vérifié dans le navigateur : création d'un club avec sa salle par défaut, d'un championnat, et
engagement de deux équipes.
