/**
 * Fenêtre d'une journée : borne **souple** (ADR-0006).
 *
 * Un créneau est attendu dans la fenêtre de sa journée, mais un match avancé ou retardé par
 * arrangement entre les deux équipes se joue en dehors. Un tel créneau est signalé, jamais
 * refusé — et sa proposition n'a pas de validation tacite (voir `tacit.ts`).
 */
export type MatchdayWindow = { windowStart: number; windowEnd: number };

/** Le créneau tombe-t-il hors de la fenêtre de sa journée ? Bornes incluses. */
export function isOutsideWindow(at: number, window: MatchdayWindow): boolean {
  return at < window.windowStart || at > window.windowEnd;
}

/** Libellé du signalement, identique partout où il s'affiche. */
export function outsideWindowMessage(matchdayNumber: number): string {
  return `Hors fenêtre de la J${matchdayNumber} : match avancé ou retardé par arrangement.`;
}
