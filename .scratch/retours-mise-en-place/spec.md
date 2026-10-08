# Spec — Retours de mise en place de la saison 2026-2027

Status: done

Vocabulaire : [CONTEXT.md](../../CONTEXT.md). Décisions : [CLAUDE.md](../../CLAUDE.md),
[ADR-0001](../../docs/adr/0001-calendrier-saisi-manuellement.md) (addendum matchs retour),
[ADR-0006](../../docs/adr/0006-fenetre-de-journee-borne-souple.md).

## Problem Statement

En mettant en place ses championnats, l'administrateur de l'UFOLEP 19 bute sur des gestes
manquants : corriger la fenêtre d'une journée saisie avec une mauvaise date, renommer ou retirer
une équipe engagée par erreur, saisir les matchs retour sans tout retaper. Côté comptes, il ne
peut rattacher qu'une partie des équipes à un responsable (bug), doit retenir un mot de passe
qu'il a tapé lui-même, n'a aucune issue pour un mot de passe perdu et ne peut pas supprimer un
compte. Il a aussi appris que des matchs se jouent hors de la fenêtre de leur journée, ce que le
modèle interdisait.

## Solution

- La fenêtre d'une journée se modifie depuis l'écran du championnat, et devient une borne
  souple : un créneau hors fenêtre est signalé, sans validation tacite.
- Une journée peut reprendre en retour une autre journée, receveur et visiteur inversés.
- Une équipe se renomme, et se supprime tant qu'aucun de ses matchs n'a dépassé Planifié.
- Le circuit est expliqué là où on le choisit.
- La feuille verte liste d'emblée les licenciés du club encore disponibles dans le circuit.
- Le rattachement d'un responsable propose toutes les équipes de la saison, par championnat.
- Les mots de passe sont générés par la plateforme, réinitialisables par l'administrateur,
  modifiables par leur titulaire.
- Un compte se supprime en gardant son nom dans l'historique des matchs.

## Hors périmètre

- Configuration de l'envoi d'e-mails sur le déploiement (`MAIL_SENDER_EMAIL`, `BREVO_API_KEY`).
- Retrait d'une équipe en cours de saison (forfait général).
- Réinitialisation en libre-service par e-mail.
