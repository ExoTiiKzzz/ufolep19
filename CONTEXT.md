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
Fiche d'un licencié rattaché à un club et affecté à des équipes de ce club — au plus une par
circuit et par saison. Existe sans compte utilisateur : c'est une donnée d'effectif, pas un utilisateur.
_Avoid_: licencié, membre, adhérent

**Licence** (`license`):
Numéro délivré à un joueur, valable sur une période bornée. Un joueur en accumule une par
saison, parfois sous un numéro différent : la liste est un historique, jamais réécrit. Hors de
sa période de validité, une licence n'autorise plus à être aligné sur un match.
_Avoid_: carte, adhésion, affiliation, numéro de licencié

**Compte** (`user`):
Identité de connexion, portant un rôle unique (`player`, `manager`, `admin`). Un compte de rôle
`player` peut être rattaché à une fiche Joueur, mais une fiche Joueur n'a pas besoin de compte.
Un compte supprimé ne permet plus de se connecter et libère son adresse, mais son nom reste
attaché aux actes qu'il a posés dans l'historique des matchs.
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
Compétition d'une saison regroupant N équipes, qui porte un calendrier et un classement. Il
appartient à un circuit, a un niveau et un format, réglés indépendamment.
_Avoid_: division, poule, compétition, ligue

**Circuit** (`circuit`):
Groupe de championnats d'une saison à l'intérieur duquel un joueur ne figure que sur une seule
feuille verte. Le circuit principal regroupe D1, D2, D3 et le mixte ; la coupe et le féminin
forment chacun un circuit à part, où un joueur peut avoir sa propre feuille verte.
_Avoid_: filière, compétition, catégorie

**Niveau** (`level`):
Rang d'un championnat dans son circuit, 1 étant le plus fort. « D1 », « D2 », « D3 » désignent
les championnats de niveau 1, 2, 3 du circuit principal ; le mixte est de niveau 3.
_Avoid_: division, catégorie, rang

**Quota de renforts** (`reinforcementQuota`):
Règle d'un championnat qui admet des joueurs venus d'un niveau plus fort, en nombre limité et
seulement pour compléter sa composition : au mixte, 2 joueurs de D1/D2 au plus, pour compléter
à 6.
_Avoid_: dérogation, joker, exception

**Format** (`format`):
Ensemble des règles de score et de classement d'un championnat, indépendant de son circuit :
*standard* (meilleur des 5 sets) ou *plateau* (2 sets secs).
_Avoid_: type, règlement, mode

**Match** (`match`):
Rencontre entre deux équipes d'un même championnat, issue du calendrier d'un championnat.
_Avoid_: rencontre, partie, confrontation

**Set** (`set`):
Manche d'un match, portant le score des deux équipes. Un match au format standard en compte de 3
à 5 ; un match de plateau en compte toujours exactement 2, joués tous deux.
_Avoid_: manche, période

**Match nul** (`draw`):
Issue d'un match de plateau à un set partout et à égalité de points marqués. N'existe pas au
format standard, où un match a toujours un vainqueur.
_Avoid_: égalité, ex aequo (réservé au classement)

**Tie-break** (`tieBreak`):
Cinquième et dernier set d'un match, joué en 15 points au lieu de 25. Ne se joue qu'à 2 sets
partout.
_Avoid_: belle, set décisif, cinquième manche

## Organisation d'un match

**Journée** (`matchday`):
Regroupement numéroté de matchs d'un championnat, borné par une fenêtre de dates. Un match
appartient à exactement une journée.
_Avoid_: ronde, tour, étape, semaine

**Plateau** (`tournamentDay`):
Journée d'un championnat au format plateau : les équipes se retrouvent à une date et dans une
salle fixées par l'administrateur, et y jouent autant de matchs que prévu. Pas de négociation de
créneau ni de validation du visiteur : l'administrateur saisit lui-même les matchs et leurs
résultats.
_Avoid_: tournoi, rassemblement, regroupement

**Fenêtre** (`window`):
Intervalle de dates d'une journée, à l'intérieur duquel le créneau d'un match est attendu. Ce
n'est pas une borne stricte : un match avancé ou retardé par arrangement entre les deux équipes
se joue hors fenêtre, et son créneau est alors signalé, jamais refusé.
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
du tout s'il reste moins de 24 h pour réagir, ni pour un créneau proposé hors de la fenêtre de sa
journée : la validation explicite devient alors obligatoire.
_Avoid_: accord implicite, auto-validation, expiration

**Forfait** (`forfeit`):
Match perdu par une équipe qui ne se présente pas ou renonce. Prononcé par un administrateur, il
termine le match sur un score conventionnel de 3-0 (25-0 par set) — 2-0 sur un plateau.
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
Liste des joueurs d'une équipe effectivement alignés sur un match, choisis parmi les joueurs de
son club : ceux de sa feuille verte, et d'éventuels renforts. Au plus 12 joueurs ; aucun minimum,
jouer en sous-effectif est permis.
_Avoid_: compo, équipe alignée, joueurs présents

**Renfort** (`reinforcement`):
Joueur aligné dans une équipe de son club qui n'est pas celle de sa feuille verte dans le circuit
du match. Un renfort n'est jamais refusé : il est **signalé** sur la feuille de match, et c'est
aux équipes d'en juger. Au-delà de **3 matchs** joués au-dessus de son niveau d'origine, tous niveaux
supérieurs confondus sur la saison, chaque nouveau match en renfort vers le haut est signalé.
L'ordre est celui des dates de match, pas celui de la saisie. Un renfort **au même niveau** (D3 ↔ mixte) est
affiché, mais ni signalé ni compté.
_Avoid_: prêt, dépannage, joueur extérieur

**Signalement** (`flag`):
Anomalie relevée sur une composition sans empêcher la feuille de match d'être soumise : joueur
sans feuille verte dans le circuit, renfort descendu d'un niveau plus fort hors quota, 4ᵉ match
au-dessus de son niveau d'origine, quota de renforts dépassé. Visible du visiteur au moment de
valider et de l'administrateur, jamais du public.
_Avoid_: alerte, avertissement, infraction

**Sous-effectif** (`shorthanded`):
Situation d'une équipe qui se présente avec moins de joueurs que le format nominal. Le match se
joue normalement : c'est un désavantage sportif, pas un motif de forfait.
_Avoid_: équipe incomplète, effectif insuffisant

**Effectif** (`roster`):
Ensemble des joueurs rattachés à une équipe pour la saison. Il fixe le niveau d'origine d'un
joueur : aligné ailleurs dans le circuit, ce joueur est un renfort. Affiché **« Feuille verte »** dans l'UI, le mot
des clubs : c'est un libellé, pas un concept distinct.
_Avoid_: liste, groupe, contingent
