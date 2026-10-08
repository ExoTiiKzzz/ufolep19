/**
 * Tableau de classement intégral — le format de la Coupe de Corrèze (ADR-0007).
 *
 * Le tableau compte la puissance de 2 immédiatement supérieure ou égale au nombre d'équipes
 * engagées ; les places en trop sont des **places vides**, qui perdent toujours. À chaque tour,
 * chaque **groupe** — les équipes qui disputent le même bloc de places — se coupe en deux : ses
 * vainqueurs disputent la moitié haute de ses places, ses vaincus la moitié basse.
 *
 * Une équipe opposée à une place vide est **exempte** et gagne. Comme les places vides perdent
 * toujours, l'effectif réel de chaque groupe se déduit du seul nombre d'engagés, et avec lui le
 * nombre d'exempts et de matchs qu'il exige : c'est ce qui garantit un classement de 1 à N, sans
 * trou. Le choix des équipes exemptes, lui, n'est pas l'affaire de ce module.
 *
 * Module pur : ni Convex ni React.
 */

/** Issue d'une équipe à un tour. Un exempt compte comme une victoire. */
export type Outcome = "won" | "lost" | "bye";

/** Bloc de places, bornes incluses, 1 étant la meilleure place. */
export type PlaceRange = { from: number; to: number };

/** Ce qu'un groupe exige à son tour : équipes réelles, places vides, exempts et matchs. */
export type GroupDemand = {
  range: PlaceRange;
  real: number;
  empty: number;
  byes: number;
  matches: number;
};

/** Nombre de places du tableau : la puissance de 2 ≥ au nombre d'équipes engagées. */
export function bracketSize(teamCount: number): number {
  let size = 1;
  while (size < teamCount) {
    size *= 2;
  }
  return size;
}

/** Nombre de tours : autant qu'il en faut pour qu'il ne reste qu'une équipe par place. */
export function roundCount(teamCount: number): number {
  return Math.log2(bracketSize(teamCount));
}

/** Nombre de places d'un groupe au tour `round` (1 pour le premier tour). */
export function groupSizeAt(round: number, teamCount: number): number {
  return bracketSize(teamCount) / 2 ** (round - 1);
}

/** Exempts et matchs d'un groupe de `size` places dont `real` sont tenues par des équipes. */
function demandOf(range: PlaceRange, real: number): GroupDemand {
  const size = range.to - range.from + 1;
  const empty = size - real;
  const byes = Math.min(empty, real);
  return { range, real, empty, byes, matches: (real - byes) / 2 };
}

/**
 * Bloc de places d'une équipe après les issues données, dans l'ordre des tours. Sans issue,
 * c'est le tableau entier ; après tous les tours, une seule place : la place définitive.
 */
export function rangeAfter(path: readonly Outcome[], teamCount: number): PlaceRange {
  let from = 1;
  let size = bracketSize(teamCount);
  for (const outcome of path) {
    size /= 2;
    if (outcome === "lost") {
      from += size;
    }
  }
  return { from, to: from + size - 1 };
}

/**
 * Ce qu'exige le groupe qui dispute `range`.
 *
 * L'effectif réel se calcule en descendant depuis le tableau entier : à chaque coupe, la moitié
 * haute reçoit les exempts et les vainqueurs des matchs, la moitié basse les seuls vaincus — les
 * places vides opposées entre elles n'y apportent personne.
 */
export function groupDemand(range: PlaceRange, teamCount: number): GroupDemand {
  let current = demandOf({ from: 1, to: bracketSize(teamCount) }, teamCount);
  while (current.range.from !== range.from || current.range.to !== range.to) {
    const size = current.range.to - current.range.from + 1;
    if (size <= range.to - range.from + 1) {
      throw new Error(`Bloc de places ${range.from}-${range.to} absent du tableau.`);
    }
    const half = size / 2;
    const upper = range.from < current.range.from + half;
    const from = upper ? current.range.from : current.range.from + half;
    const real = upper ? current.byes + current.matches : current.matches;
    current = demandOf({ from, to: from + half - 1 }, real);
  }
  return current;
}

/** Libellé d'un bloc de places : « places 17 à 24 », ou « 3ᵉ place » une fois définitive. */
export function rangeLabel(range: PlaceRange): string {
  if (range.from === range.to) {
    return range.from === 1 ? "1ʳᵉ place" : `${range.from}ᵉ place`;
  }
  return `places ${range.from} à ${range.to}`;
}
