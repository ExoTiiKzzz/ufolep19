# Les feuilles de match terminées sont publiques, noms compris

La décision initiale réservait tout le nominatif aux comptes connectés : le public voyait le
calendrier, les scores agrégés et les classements, mais ni les effectifs ni les compositions. Elle a
été **renversée** sur demande : un visiteur sans compte voit désormais, sur la page d'un match
terminé, le **score set par set** et le **nom des joueurs alignés**.

## Consequences

C'est la seule query publique qui renvoie des noms de personnes physiques (`sheets.publicResult`).
Deux limites ont été posées pour que la brèche reste étroite :

- **Seuls les matchs terminés** sont exposés. Un score en attente de validation ou contesté peut
  encore changer : le publier afficherait un résultat susceptible d'être démenti.
- **Rien du déroulé administratif** ne sort par là : ni motif de contestation, ni auteur de la
  saisie, ni échéance de validation tacite. Ces informations restent dans `sheets.get`, réservée aux
  responsables du match.

Les **listes** restent anonymes : calendrier, résultats, classements, fiches de club et d'équipe ne
renvoient aucun nom. Les effectifs — c'est-à-dire les licenciés qui n'ont pas joué — et les fiches
joueur exigent toujours un compte. Un nom n'apparaît donc en accès libre que s'il figure sur une
feuille de match validée.

## Le risque, énoncé et accepté

Publier les noms de licenciés sur des pages indexables engage l'UFOLEP 19 au titre du RGPD, et une
feuille de match peut comporter des mineurs. Le point a été soulevé avant l'implémentation et la
demande a été maintenue. Si le sujet revient, le correctif le moins coûteux est de remettre
`sheets.publicResult` derrière `requireUser` : les tests distinguent déjà les listes anonymes de
cette exception, et la page du match affiche la feuille dans un bloc séparé.
