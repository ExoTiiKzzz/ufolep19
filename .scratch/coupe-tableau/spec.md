# Spec — Coupe de Corrèze au format tableau

Status: done

Vocabulaire : [CONTEXT.md](../../CONTEXT.md) (Tour, Tableau, Groupe, Place vide, Exempt).
Décisions : [ADR-0007](../../docs/adr/0007-coupe-en-tableau-a-places-vides.md),
[ADR-0001](../../docs/adr/0001-calendrier-saisi-manuellement.md), CLAUDE.md « Coupe : format tableau ».

## Problem Statement

La coupe se joue en tableau de classement intégral : chaque tour coupe chaque groupe en deux,
jusqu'à classer toutes les équipes de 1 à N. L'application ne connaît que le classement aux
points, et ne sait ni former les groupes, ni gérer les exempts quand il manque des équipes.

## Solution

Un format `tableau` : score du standard, classement à la place. Tableau complété par des places
vides ; nombre d'exempts imposé par groupe, choix libre ; rencontres formées par l'administrateur
avec garde-fous ; tableau figé au premier tour ; classement en fourchettes puis places.

## Hors périmètre

- Génération automatique des rencontres ou tirage au sort.
- Reprise en retour d'une journée dans une coupe (refusée).
