# 04 — Fiches joueurs, effectifs et reprise d'effectif

**What to build:** un responsable d'équipe constitue son effectif : il crée des fiches joueurs — nom,
prénom, numéro de licence, sans adresse e-mail ni compte — et les ajoute à son équipe, ou en retire.
En début de saison, il reprend en un geste l'effectif de la même équipe la saison précédente au lieu
de ressaisir douze licenciés.

**Blocked by:** 03.

**Status:** ready-for-agent

- [x] Une fiche joueur est rattachée à un club et existe sans compte utilisateur.
- [x] Un responsable ajoute et retire des joueurs de l'effectif de son équipe ; l'administrateur
      peut le faire pour toute équipe.
- [x] Un responsable ne peut pas toucher à l'effectif d'une équipe qu'il ne gère pas.
- [x] Un joueur peut appartenir à l'effectif de plusieurs équipes de son club.
- [x] Une action reprend l'effectif de l'équipe correspondante de la saison précédente ; elle est
      idempotente et n'introduit aucun doublon.
- [x] L'effectif d'une équipe n'est lisible que par un compte connecté.
- [x] Tests au seam principal : constitution d'effectif, retrait, rejet d'un responsable étranger,
      reprise d'effectif jouée deux fois de suite sans doublon, invisibilité pour un visiteur
      anonyme.

## Comments

Livré. La reprise d'effectif prend une **équipe source explicite** plutôt que de deviner : une query
`roster.previousSeasonTeam` propose l'équipe correspondante (même club, même nom, saison antérieure
la plus récente) et l'interface l'offre en un clic. Deviner silencieusement aurait recopié le mauvais
effectif sans que personne ne le voie.

`roster.add` et `roster.copyFrom` sont idempotentes. Un joueur ne peut rejoindre que des équipes de
son club — refus explicite sinon.
