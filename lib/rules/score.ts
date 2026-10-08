/**
 * Règles de score du volley, telles que retenues pour l'UFOLEP 19.
 *
 * Module pur : aucune dépendance à Convex ni à React, pour que la combinatoire soit
 * testable directement plutôt qu'à travers un scénario de base complet par cas.
 *
 * Deux formats, portés par le championnat :
 *
 * - **standard** — meilleur des 5 sets, vainqueur au 3e set gagné ; sets 1 à 4 en 25
 *   points, tie-break (5e set) en 15 ;
 * - **plateau** — 2 sets secs en 25 points, joués tous les deux. À un set partout, le
 *   vainqueur est celui qui a marqué le plus de points ; à égalité de points, le match est
 *   **nul** (ADR-0005).
 *
 * Dans les deux cas : écart minimum de 2 points, **prolongation illimitée**, pas de plafond.
 */
export type SetScore = { home: number; away: number };

export type MatchFormat = "standard" | "plateau";

/**
 * Format d'un championnat : il porte les règles de score **et** de classement. Le tableau
 * (la coupe, ADR-0007) se joue au score du standard et ne se distingue qu'au classement.
 */
export type ChampionshipFormat = MatchFormat | "tableau";

/** Règles de score d'un championnat, selon son format. */
export function scoreFormatOf(format: ChampionshipFormat): MatchFormat {
  return format === "tableau" ? "standard" : format;
}

/** Issue d'un match : un vainqueur, ou un match nul (plateau seulement). */
export type MatchWinner = "home" | "away" | "draw";

export type ScoreOutcome = {
  homeSets: number;
  awaySets: number;
  homePoints: number;
  awayPoints: number;
  winner: MatchWinner;
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
/** Un match de plateau se joue en exactement 2 sets. */
export const PLATEAU_SET_COUNT = 2;

/** Nombre maximal de sets d'un match, donc de lignes de la grille de saisie. */
export function maxSets(format: MatchFormat): number {
  return format === "plateau" ? PLATEAU_SET_COUNT : 5;
}

/** Points à atteindre pour gagner le set d'index donné (0-based). */
export function targetForSet(index: number, format: MatchFormat = "standard"): number {
  return format === "standard" && index === 4 ? TIE_BREAK_TARGET : REGULAR_SET_TARGET;
}

/** Libellé d'un set dans une grille : le 5e set standard est le tie-break. */
export function setLabel(index: number, format: MatchFormat = "standard"): string {
  return format === "standard" && index === 4 ? "Tie-break" : `Set ${index + 1}`;
}

function fail(code: ScoreErrorCode, message: string, setNumber?: number): ScoreValidation {
  return { ok: false, error: { code, message, setNumber } };
}

/** Valide un set isolé : rend `null` s'il est légal, l'erreur sinon. */
function checkSet(set: SetScore, index: number, format: MatchFormat): ScoreValidation | null {
  const setNumber = index + 1;
  const { home, away } = set;

  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) {
    return fail(
      "invalidNumber",
      `Set ${setNumber} : les points doivent être des entiers positifs.`,
      setNumber,
    );
  }

  const target = targetForSet(index, format);
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
  return null;
}

/**
 * Valide un score de match complet et rend ses agrégats, ou l'erreur en nommant la règle
 * violée et le set fautif.
 */
export function validateMatchScore(
  sets: SetScore[],
  format: MatchFormat = "standard",
): ScoreValidation {
  return format === "plateau" ? validatePlateauScore(sets) : validateStandardScore(sets);
}

function validateStandardScore(sets: SetScore[]): ScoreValidation {
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
    if (homeSets === SETS_TO_WIN || awaySets === SETS_TO_WIN) {
      // Un nombre invalide reste signalé comme tel, même dans un set de trop.
      const invalid = checkSet(set, index, "standard");
      if (invalid !== null && !invalid.ok && invalid.error.code === "invalidNumber") {
        return invalid;
      }
      return fail(
        "matchAlreadyWon",
        `Le match était déjà gagné avant le set ${setNumber} : un match s'arrête à 3 sets.`,
        setNumber,
      );
    }

    const invalid = checkSet(set, index, "standard");
    if (invalid !== null) {
      return invalid;
    }

    if (set.home > set.away) {
      homeSets++;
    } else {
      awaySets++;
    }
    homePoints += set.home;
    awayPoints += set.away;
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

/**
 * Plateau : 2 sets secs, joués tous les deux même à 2-0. À un set partout, le total de
 * points départage ; à égalité, le match est nul.
 */
function validatePlateauScore(sets: SetScore[]): ScoreValidation {
  if (sets.length !== PLATEAU_SET_COUNT) {
    return fail(
      "setCount",
      "Un match de plateau se joue en 2 sets secs : les deux sets sont à saisir.",
    );
  }

  let homeSets = 0;
  let awaySets = 0;
  let homePoints = 0;
  let awayPoints = 0;
  for (const [index, set] of sets.entries()) {
    const invalid = checkSet(set, index, "plateau");
    if (invalid !== null) {
      return invalid;
    }
    if (set.home > set.away) {
      homeSets++;
    } else {
      awaySets++;
    }
    homePoints += set.home;
    awayPoints += set.away;
  }

  return {
    ok: true,
    outcome: {
      homeSets,
      awaySets,
      homePoints,
      awayPoints,
      winner: winnerOf(homeSets, awaySets, homePoints, awayPoints),
    },
  };
}

/** Aux sets d'abord, aux points ensuite ; nul si rien ne sépare les deux équipes. */
export function winnerOf(
  homeSets: number,
  awaySets: number,
  homePoints: number,
  awayPoints: number,
): MatchWinner {
  if (homeSets !== awaySets) {
    return homeSets > awaySets ? "home" : "away";
  }
  if (homePoints !== awayPoints) {
    return homePoints > awayPoints ? "home" : "away";
  }
  return "draw";
}

/**
 * Sets gagnés de part et d'autre, sans rien valider.
 *
 * Distinct de `validateMatchScore` : celui-ci juge un match complet et refuse tout ce qui
 * n'est pas un score légal. Ici on compte ce qui est déjà posé, sur une feuille encore en
 * cours de frappe, pour donner un repère à la saisie. Un set nul ne compte pour personne.
 */
export function setsWonSoFar(sets: SetScore[]): { home: number; away: number } {
  let home = 0;
  let away = 0;
  for (const set of sets) {
    if (set.home > set.away) {
      home++;
    } else if (set.away > set.home) {
      away++;
    }
  }
  return { home, away };
}

/**
 * Le camp qui a atteint les 3 sets, ou `null` tant que personne n'y est.
 *
 * Rend `null` aussi quand les deux y sont : c'est un score impossible, qu'une saisie en
 * cours peut traverser. Mieux vaut ne rien annoncer que désigner un vainqueur au hasard —
 * `validateMatchScore` refusera le score de toute façon.
 */
export function decidedWinner(won: { home: number; away: number }): "home" | "away" | null {
  const homeWins = won.home >= SETS_TO_WIN;
  const awayWins = won.away >= SETS_TO_WIN;
  if (homeWins === awayWins) {
    return null;
  }
  return homeWins ? "home" : "away";
}

/**
 * L'issue lisible d'une saisie en cours, ou `null` tant qu'elle n'est pas acquise.
 *
 * Standard : dès qu'une équipe atteint 3 sets. Plateau : une fois les 2 sets posés, aux
 * sets puis aux points — et `"draw"` si rien ne les sépare. Repère d'affichage seulement :
 * `validateMatchScore` reste le seul juge.
 */
export function decidedOutcome(
  sets: SetScore[],
  format: MatchFormat = "standard",
): MatchWinner | null {
  if (format === "standard") {
    return decidedWinner(setsWonSoFar(sets));
  }
  const played = sets.filter((set) => set.home !== set.away);
  if (played.length < PLATEAU_SET_COUNT) {
    return null;
  }
  const won = setsWonSoFar(played);
  const points = played.reduce(
    (total, set) => ({ home: total.home + set.home, away: total.away + set.away }),
    { home: 0, away: 0 },
  );
  return winnerOf(won.home, won.away, points.home, points.away);
}

/**
 * Score conventionnel d'un forfait : tous les sets à 25-0 — 3 sets en format standard,
 * les 2 sets en plateau.
 */
export function forfeitScore(format: MatchFormat = "standard"): SetScore[] {
  const count = format === "plateau" ? PLATEAU_SET_COUNT : SETS_TO_WIN;
  return Array.from({ length: count }, () => ({ home: REGULAR_SET_TARGET, away: 0 }));
}
