import { formatDate } from "./format";
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

/**
 * Libellé de l'état d'un match à l'écran. Un match reporté qui attend un nouveau créneau
 * dit « Reporté » plutôt que « Créneau à fixer », qui le confondrait avec un match jamais
 * programmé : c'est ce qui permet de savoir, depuis le bilan d'une équipe, qu'il n'a pas
 * été joué.
 */
export function matchStateLabel(match: {
  state: MatchState;
  postponement?: { previousAt?: number };
}): string {
  return match.state === "planned" && match.postponement !== undefined
    ? "Reporté"
    : matchStateLabels[match.state];
}

/**
 * Ton du badge selon l'état. La couleur porte un sens : bleu pour un état acquis, abricot
 * pour une attente, rose pour un problème, gris pour du neutre.
 */
export const matchStateVariant: Record<
  MatchState,
  "default" | "secondary" | "destructive" | "muted" | "outline"
> = {
  planned: "outline",
  awaitingSlot: "secondary",
  confirmed: "default",
  awaitingSheet: "secondary",
  disputed: "destructive",
  completed: "muted",
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
  cancelled: "Sans objet, le match a été joué ou tranché",
} as const;

/**
 * Mention du report, à côté du créneau : « Reporté, initialement le 12 nov. 2026 ». Quand le
 * badge dit déjà « Reporté » (voir `matchStateLabel`), seule la date annulée reste à dire.
 * `null` s'il n'y a rien à ajouter — jamais reporté, ou reporté avant qu'on garde la date.
 */
export function postponementNote(match: {
  state: MatchState;
  postponement?: { previousAt?: number };
}): string | null {
  if (match.postponement === undefined) {
    return null;
  }
  const { previousAt } = match.postponement;
  const date = previousAt === undefined ? null : formatDate(previousAt);
  if (match.state === "planned") {
    return date === null ? null : `Initialement le ${date}`;
  }
  return date === null ? "Reporté" : `Reporté, initialement le ${date}`;
}

export const stalledReasonLabels = {
  sheetMissing: "Feuille non saisie après la date du match",
  sheetPending: "Feuille en attente de validation",
  disputed: "Litige à trancher",
} as const;

/** Comment annoncer la journée mise en avant sur la page d'accueil. */
export const matchdayStatusLabels = {
  current: "Journée en cours",
  upcoming: "Prochaine journée",
  past: "Dernière journée",
} as const;

export const formatLabels = {
  standard: "Standard — 3 sets gagnants",
  plateau: "Plateau — 2 sets secs",
  tableau: "Tableau — classement à la place, 3 sets gagnants",
} as const;

/**
 * Nom d'une journée selon le format : un plateau, un tour de tableau (la coupe), ou une
 * journée ordinaire.
 */
export function matchdayNoun(format: keyof typeof formatLabels | undefined): string {
  return format === "plateau" ? "Plateau" : format === "tableau" ? "Tour" : "Journée";
}

/** « D1 », « D2 » : le niveau tel que les clubs le disent. */
export function levelLabel(level: number): string {
  return `D${level}`;
}
