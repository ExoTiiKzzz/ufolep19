# UFOLEP 19 — Saison de volley

Contexte unique : la gestion d'une saison de championnats de volley-ball pour l'entité UFOLEP 19,
de l'engagement des équipes jusqu'au classement final.

Le vocabulaire est en **français dans l'UI et dans ce glossaire**, en **anglais dans le code** ;
l'identifiant de code est indiqué entre parenthèses.

## Language

**Club** (`club`):
Structure locale affiliée à l'UFOLEP 19. Rattache des joueurs et une ou plusieurs équipes.
_Avoid_: association, section

**Joueur** (`player`):
Fiche d'un licencié rattaché à un club et affecté à une ou plusieurs équipes de ce club. Existe
sans compte utilisateur : c'est une donnée d'effectif, pas un utilisateur.
_Avoid_: licencié, membre, adhérent

**Compte** (`user`):
Identité de connexion, portant un rôle unique (`player`, `manager`, `admin`). Un compte de rôle
`player` peut être rattaché à une fiche Joueur, mais une fiche Joueur n'a pas besoin de compte.
_Avoid_: utilisateur, profil, login

**Équipe** (`team`):
Collectif appartenant à un club et engagé dans un championnat pour une saison donnée.
_Avoid_: formation, sélection

**Responsable d'équipe** (`manager`):
Compte utilisateur habilité à gérer une équipe : ses joueurs, ses créneaux et ses scores.
_Avoid_: capitaine, coach, entraîneur, gestionnaire

**Saison** (`season`):
Cycle annuel de compétition (ex. 2025-2026), qui regroupe des championnats. Club et joueur la
traversent ; une équipe appartient à une seule saison.
_Avoid_: année, exercice, millésime

**Championnat** (`championship`):
Compétition d'une saison regroupant N équipes, qui porte un calendrier et un classement.
_Avoid_: division, poule, compétition, ligue

**Match** (`match`):
Rencontre entre deux équipes d'un même championnat, issue du calendrier d'un championnat.
_Avoid_: rencontre, partie, confrontation

**Set** (`set`):
Manche d'un match, portant le score des deux équipes. Un match en compte de 3 à 5.
_Avoid_: manche, période

**Tie-break** (`tieBreak`):
Cinquième et dernier set d'un match, joué en 15 points au lieu de 25. Ne se joue qu'à 2 sets
partout.
_Avoid_: belle, set décisif, cinquième manche

## Organisation d'un match

**Journée** (`matchday`):
Regroupement numéroté de matchs d'un championnat, borné par une fenêtre de dates. Un match
appartient à exactement une journée.
_Avoid_: ronde, tour, étape, semaine

**Fenêtre** (`window`):
Intervalle de dates d'une journée, à l'intérieur duquel le créneau d'un match doit tomber. Elle
fait office de date butoir pour la négociation.
_Avoid_: période, plage, délai

**Receveur** (`homeTeam`):
Équipe désignée par le calendrier pour accueillir le match. Elle a l'initiative de la proposition
de créneau, et sa salle est le lieu par défaut.
_Avoid_: équipe à domicile, hôte, équipe A

**Visiteur** (`awayTeam`):
Équipe qui se déplace pour le match. Elle valide ou refuse la proposition du receveur.
_Avoid_: équipe extérieure, adversaire, équipe B

**Créneau** (`slot`):
Triplet date + heure + lieu sur lequel un match est joué. Proposé par le receveur, il ne devient
ferme qu'après validation du visiteur.
_Avoid_: rendez-vous, horaire, date du match

**Proposition** (`proposal`):
Créneau soumis par le receveur, en attente de la décision du visiteur. Une proposition refusée
est conservée dans l'historique du match.
_Avoid_: demande, suggestion, invitation

**Litige** (`dispute`):
État d'un match dont le score saisi par le receveur a été contesté par le visiteur. Seul un
administrateur peut en sortir le match, en arrêtant le score définitif.
_Avoid_: réclamation, conflit, contestation

**Validation tacite** (`tacitApproval`):
Acceptation automatique d'une proposition ou d'un score resté sans réponse. Elle intervient 7
jours après la soumission, et au plus tard la veille du créneau proposé. Elle n'est pas programmée
du tout s'il reste moins de 24 h pour réagir : la validation explicite devient alors obligatoire.
_Avoid_: accord implicite, auto-validation, expiration

**Forfait** (`forfeit`):
Match perdu par une équipe qui ne se présente pas ou renonce. Prononcé par un administrateur, il
termine le match sur un score conventionnel de 3-0 (25-0 par set).
_Avoid_: abandon, absence, walkover

**Report** (`postponement`):
Annulation du créneau d'un match confirmé sans qu'il soit joué (salle indisponible, intempéries).
Demandé avec un motif par l'un des deux responsables et accepté par l'autre, ou imposé par un
administrateur. Le match retourne en négociation de créneau et n'entre pas au classement.
_Avoid_: annulation, décalage, remise

**Feuille de match** (`matchSheet`):
Document unique d'un match, portant le score par set et la composition des deux équipes. Transcrite
par le receveur, elle est validée en bloc par le visiteur.
_Avoid_: fiche, rapport de match, PV

**Composition** (`lineup`):
Liste des joueurs d'une équipe effectivement alignés sur un match, choisis dans l'effectif de cette
équipe. Au plus 12 joueurs ; aucun minimum, jouer en sous-effectif est permis.
_Avoid_: compo, équipe alignée, joueurs présents

**Sous-effectif** (`shorthanded`):
Situation d'une équipe qui se présente avec moins de joueurs que le format nominal. Le match se
joue normalement : c'est un désavantage sportif, pas un motif de forfait.
_Avoid_: équipe incomplète, effectif insuffisant

**Effectif** (`roster`):
Ensemble des joueurs rattachés à une équipe pour la saison. La composition d'un match est
nécessairement un sous-ensemble de l'effectif.
_Avoid_: liste, groupe, contingent
