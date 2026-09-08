/**
 * Cycle de vie d'un match.
 *
 * Module pur : il décide si une transition est légale depuis l'état courant et pour
 * l'acteur appelant, au lieu d'éparpiller les `if` d'état dans les mutations.
 */
export type MatchState =
  | "planned"
  | "awaitingSlot"
  | "confirmed"
  | "awaitingSheet"
  | "disputed"
  | "completed";

export type MatchTransition =
  | "proposeSlot"
  | "acceptSlot"
  | "rejectSlot"
  | "tacitSlot"
  | "postpone"
  | "submitSheet"
  | "validateSheet"
  | "tacitSheet"
  | "disputeSheet"
  | "settleDispute"
  | "forfeit";

/** Qui agit, du point de vue du match. */
export type Actor = "home" | "away" | "admin" | "system";

type Rule = { from: MatchState[]; actors: Actor[]; to: MatchState };

const RULES: Record<MatchTransition, Rule> = {
  proposeSlot: { from: ["planned"], actors: ["home", "admin"], to: "awaitingSlot" },
  acceptSlot: { from: ["awaitingSlot"], actors: ["away", "admin"], to: "confirmed" },
  rejectSlot: { from: ["awaitingSlot"], actors: ["away", "admin"], to: "planned" },
  tacitSlot: { from: ["awaitingSlot"], actors: ["system"], to: "confirmed" },
  postpone: { from: ["confirmed"], actors: ["home", "away", "admin"], to: "planned" },
  submitSheet: { from: ["confirmed"], actors: ["home", "admin"], to: "awaitingSheet" },
  validateSheet: { from: ["awaitingSheet"], actors: ["away", "admin"], to: "completed" },
  tacitSheet: { from: ["awaitingSheet"], actors: ["system"], to: "completed" },
  disputeSheet: { from: ["awaitingSheet"], actors: ["away", "admin"], to: "disputed" },
  settleDispute: { from: ["disputed"], actors: ["admin"], to: "completed" },
  forfeit: {
    from: ["planned", "awaitingSlot", "confirmed", "awaitingSheet", "disputed"],
    actors: ["admin"],
    to: "completed",
  },
};

export class TransitionError extends Error {}

/**
 * L'état d'arrivée si la transition est permise, une erreur explicite sinon.
 *
 * L'acteur `home` désigne le receveur, `away` le visiteur. Un responsable qui gère les
 * deux équipes est vu comme l'un ou l'autre selon le rôle qu'il tient dans le match : il
 * ne peut donc pas valider sa propre soumission.
 */
export function nextState(
  transition: MatchTransition,
  from: MatchState,
  actor: Actor,
): MatchState {
  const rule = RULES[transition];
  if (!rule.from.includes(from)) {
    throw new TransitionError(
      `Action impossible dans l'état « ${stateLabels[from]} » : ${transitionLabels[transition]}.`,
    );
  }
  if (!rule.actors.includes(actor)) {
    throw new TransitionError(`Vous n'avez pas la main pour ${transitionLabels[transition]}.`);
  }
  return rule.to;
}

export const stateLabels: Record<MatchState, string> = {
  planned: "Planifié",
  awaitingSlot: "En attente de validation du créneau",
  confirmed: "Confirmé",
  awaitingSheet: "Feuille à valider",
  disputed: "Litige",
  completed: "Terminé",
};

export const transitionLabels: Record<MatchTransition, string> = {
  proposeSlot: "proposer un créneau",
  acceptSlot: "valider le créneau",
  rejectSlot: "refuser le créneau",
  tacitSlot: "confirmer tacitement le créneau",
  postpone: "reporter le match",
  submitSheet: "saisir la feuille de match",
  validateSheet: "valider la feuille de match",
  tacitSheet: "valider tacitement la feuille de match",
  disputeSheet: "contester la feuille de match",
  settleDispute: "arbitrer le litige",
  forfeit: "prononcer un forfait",
};
