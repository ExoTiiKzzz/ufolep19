# 14 — Pages publiques : calendrier et résultats

**What to build:** un parent, un joueur ou un club adverse ouvre le site sans compte et trouve ce
qu'il cherche : le calendrier d'un championnat avec date, heure et gymnase de chaque match, et les
résultats set par set de ceux qui ont été joués. Aucun nom de licencié n'apparaît.

**Blocked by:** 06, 10.

**Status:** ready-for-agent

- [x] Le calendrier public d'un championnat affiche, par journée, les équipes, la date, l'heure et
      le lieu des matchs dont le créneau est ferme, et signale ceux qui n'en ont pas encore.
- [x] Les résultats publics affichent le score set par set des matchs terminés.
- [x] Les queries publiques ne renvoient jamais de nom de personne physique : ni effectif, ni
      composition, ni nom de responsable.
- [x] Les pages publiques sont accessibles sans être connecté, et le restent pour un compte
      connecté.
- [x] Navigation entre saisons et championnats, la saison courante par défaut ; les saisons passées
      sont consultables en lecture seule.
- [x] Tests au seam principal : contenu du calendrier public, résultats publics, et vérification
      qu'aucun nom de joueur ne figure dans les réponses des queries publiques.

## Comments

Livré. Un test vérifie qu'**aucune** query publique (saisons, championnats, équipes, journées,
matchs, classement) ne renvoie de nom de joueur : il compare les charges utiles au nom d'un licencié
réellement aligné.

Correction issue de la vérification navigateur : le calendrier public masquait la date des matchs
terminés (le score prenait sa place). Date, heure et gymnase sont désormais affichés dans tous les
cas, et l'absence de créneau est signalée explicitement.
