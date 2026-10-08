/**
 * Règles d'échéance de la validation tacite (ADR-0002).
 *
 * Une proposition ou une feuille restée sans réponse est acceptée automatiquement au bout
 * de 7 jours. Pour un créneau, l'échéance est **plafonnée à la veille du créneau** : sans
 * ce plafond, une proposition faite 3 jours avant la date se confirmerait après que le
 * match ait été joué.
 */
import { endOfDayBefore } from "./paris-time";
import { isOutsideWindow, type MatchdayWindow } from "./window";

export const TACIT_DELAY_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Temps de réaction minimum laissé au visiteur pour qu'une échéance tacite soit
 * programmée. En dessous, la validation explicite devient obligatoire : une proposition
 * faite la veille au soir laisserait sinon une heure pour refuser, ce qui revient à
 * imposer la date.
 */
export const MIN_TACIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Échéance de validation tacite d'une proposition de créneau, ou `null` quand le créneau
 * est trop proche ou hors de la fenêtre de sa journée.
 *
 * `null` signifie **validation explicite obligatoire**. Créneau trop proche : le cas
 * n'était pas couvert par la règle des 7 jours, et le laisser produire une échéance déjà
 * dépassée aurait confirmé le créneau instantanément — c'est-à-dire permis au receveur
 * d'imposer une date sans l'accord de personne. Créneau hors fenêtre : c'est un
 * arrangement entre les deux équipes, qui ne tient que par le consentement du visiteur
 * (ADR-0006) — un silence ne le vaut pas.
 */
export function slotTacitDeadline(
  now: number,
  slotAt: number,
  window: MatchdayWindow,
): number | null {
  if (isOutsideWindow(slotAt, window)) {
    return null;
  }
  const deadline = Math.min(now + TACIT_DELAY_MS, endOfDayBefore(slotAt));
  return deadline - now < MIN_TACIT_WINDOW_MS ? null : deadline;
}

/** Échéance de validation tacite d'une feuille de match : 7 jours, sans plafond. */
export function sheetTacitDeadline(now: number): number {
  return now + TACIT_DELAY_MS;
}
