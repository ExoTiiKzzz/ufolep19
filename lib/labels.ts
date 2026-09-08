import type { MatchState } from "./rules/match-lifecycle";

/** Libellés français des états de match, pour l'affichage. */
export const matchStateLabels: Record<MatchState, string> = {
  planned: "Créneau à fixer",
  awaitingSlot: "Créneau à valider",
  confirmed: "Créneau confirmé",
  awaitingSheet: "Feuille à valider",
  disputed: "Litige",
  completed: "Terminé",
};

/** Ton du badge selon l'état : neutre, en attente, ou problème. */
export const matchStateVariant: Record<MatchState, "default" | "secondary" | "outline"> = {
  planned: "outline",
  awaitingSlot: "secondary",
  confirmed: "default",
  awaitingSheet: "secondary",
  disputed: "default",
  completed: "outline",
};

export const todoLabels = {
  proposeSlot: "Proposer un créneau",
  respondSlot: "Valider ou refuser le créneau",
  respondPostponement: "Répondre à une demande de report",
  submitSheet: "Saisir la feuille de match",
  respondSheet: "Valider ou contester la feuille",
  waiting: "En attente de l'adversaire",
  disputed: "En litige, le comité tranche",
} as const;

export const proposalStatusLabels = {
  pending: "En attente",
  accepted: "Acceptée",
  tacit: "Acceptée tacitement",
  rejected: "Refusée",
  cancelled: "Annulée",
} as const;

export const postponementStatusLabels = {
  pending: "En attente",
  accepted: "Acceptée",
  rejected: "Refusée",
  imposed: "Imposée par le comité",
} as const;

export const stalledReasonLabels = {
  sheetMissing: "Feuille non saisie après la date du match",
  sheetPending: "Feuille en attente de validation",
  disputed: "Litige à trancher",
} as const;
