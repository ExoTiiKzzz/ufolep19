/**
 * Règles de score du volley, telles que retenues pour l'UFOLEP 19.
 *
 * Module pur : aucune dépendance à Convex ni à React, pour que la combinatoire soit
 * testable directement plutôt qu'à travers un scénario de base complet par cas.
 *
 * - Match au meilleur des 5 sets, vainqueur au 3e set gagné.
 * - Sets 1 à 4 en 25 points, tie-break (5e set) en 15.
 * - Écart minimum de 2 points, **prolongation illimitée** : pas de plafond.
 */
export type SetScore = { home: number; away: number };

export type ScoreOutcome = {
  homeSets: number;
  awaySets: number;
  homePoints: number;
  awayPoints: number;
  winner: "home" | "away";
};

export type ScoreErrorCode =
  | "setCount"
  | "invalidNumber"
  | "matchAlreadyWon"
  | "setUnfinished"
  | "setMargin"
  | "setExtension"
  | "matchUnfinished";

export type ScoreError = {
  code: ScoreErrorCode;
  message: string;
  /** Numéro du set fautif (1 à 5), absent quand l'erreur porte sur le match entier. */
  setNumber?: number;
};

export type ScoreValidation =
  | { ok: true; outcome: ScoreOutcome }
  | { ok: false; error: ScoreError };

export const SETS_TO_WIN = 3;
export const REGULAR_SET_TARGET = 25;
export const TIE_BREAK_TARGET = 15;

/** Points à atteindre pour gagner le set d'index donné (0-based). */
export function targetForSet(index: number): number {
  return index === 4 ? TIE_BREAK_TARGET : REGULAR_SET_TARGET;
}

function fail(code: ScoreErrorCode, message: string, setNumber?: number): ScoreValidation {
  return { ok: false, error: { code, message, setNumber } };
}

/**
 * Valide un score de match complet et rend ses agrégats, ou l'erreur en nommant la règle
 * violée et le set fautif.
 */
export function validateMatchScore(sets: SetScore[]): ScoreValidation {
  if (sets.length < SETS_TO_WIN || sets.length > 5) {
    return fail(
      "setCount",
      "Un match compte de 3 à 5 sets : les scores possibles sont 3-0, 3-1 et 3-2.",
    );
  }

  let homeSets = 0;
  let awaySets = 0;
  let homePoints = 0;
  let awayPoints = 0;

  for (const [index, set] of sets.entries()) {
    const setNumber = index + 1;
    const { home, away } = set;

    if (
      !Number.isInteger(home) ||
      !Number.isInteger(away) ||
      home < 0 ||
      away < 0
    ) {
      return fail(
        "invalidNumber",
        `Set ${setNumber} : les points doivent être des entiers positifs.`,
        setNumber,
      );
    }

    if (homeSets === SETS_TO_WIN || awaySets === SETS_TO_WIN) {
      return fail(
        "matchAlreadyWon",
        `Le match était déjà gagné avant le set ${setNumber} : un match s'arrête à 3 sets.`,
        setNumber,
      );
    }

    const target = targetForSet(index);
    const best = Math.max(home, away);
    const worst = Math.min(home, away);

    if (best < target) {
      return fail(
        "setUnfinished",
        `Set ${setNumber} : il faut atteindre ${target} points pour gagner le set.`,
        setNumber,
      );
    }
    if (best === target) {
      if (worst > target - 2) {
        return fail(
          "setMargin",
          `Set ${setNumber} : à ${target} points, l'écart doit être d'au moins 2 points.`,
          setNumber,
        );
      }
    } else if (worst !== best - 2) {
      return fail(
        "setExtension",
        `Set ${setNumber} : au-delà de ${target} points, le set se gagne exactement à 2 points d'écart.`,
        setNumber,
      );
    }

    if (home > away) {
      homeSets++;
    } else {
      awaySets++;
    }
    homePoints += home;
    awayPoints += away;
  }

  if (homeSets !== SETS_TO_WIN && awaySets !== SETS_TO_WIN) {
    return fail(
      "matchUnfinished",
      "Le match n'est pas terminé : aucune équipe n'a gagné 3 sets.",
    );
  }

  return {
    ok: true,
    outcome: {
      homeSets,
      awaySets,
      homePoints,
      awayPoints,
      winner: homeSets === SETS_TO_WIN ? "home" : "away",
    },
  };
}

/** Score conventionnel d'un forfait : 3 sets à 0, chaque set à 25-0. */
export function forfeitScore(): SetScore[] {
  return [
    { home: REGULAR_SET_TARGET, away: 0 },
    { home: REGULAR_SET_TARGET, away: 0 },
    { home: REGULAR_SET_TARGET, away: 0 },
  ];
}
