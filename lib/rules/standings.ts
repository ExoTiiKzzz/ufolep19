/**
 * Classement d'un championnat.
 *
 * Module pur : le classement est dérivé des matchs terminés, jamais stocké comme état
 * modifiable à la main.
 *
 * Barème UFOLEP 19 : **3 points pour toute victoire**, quel qu'en soit le score ; 2 points
 * pour une défaite 2-3, qui a coûté cinq sets ; 1 point pour toute autre défaite. Une équipe
 * qui se déplace et perd sèchement marque donc quand même — c'est la présence qui est
 * récompensée, pas seulement le résultat.
 *
 * Le forfait sort de ce barème et s'aggrave : voir `pointsForForfeit`.
 */
export type MatchOutcome = {
  homeTeamId: string;
  awayTeamId: string;
  homeSets: number;
  awaySets: number;
  homePoints: number;
  awayPoints: number;
  /**
   * Équipe déclarée forfait, le cas échéant.
   *
   * Son barème n'est pas celui d'une défaite : un forfait ne rapporte rien, et les suivants
   * retirent des points. Le score conventionnel (3-0, 25-0 par set) reste compté dans les
   * sets et les points marqués, pour que les ratios de départage restent comparables.
   */
  forfeitAgainst?: string | null;
};

export type StandingRow = {
  teamId: string;
  rank: number;
  played: number;
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  pointsFor: number;
  pointsAgainst: number;
  /** Forfaits déclarés, qui expliquent un total de points en retrait — voire négatif. */
  forfeits: number;
  points: number;
};

/**
 * Points de classement d'une équipe selon les sets gagnés et perdus dans un match **joué**.
 *
 * Un match perdu rapporte toujours quelque chose : l'équipe s'est déplacée et a joué. Seule
 * la défaite en cinq sets vaut mieux que les autres, parce qu'elle s'est jouée à un set.
 * Un forfait ne passe pas par ici — il n'a pas été joué, et `pointsForForfeit` le traite.
 */
export function pointsForResult(setsWon: number, setsLost: number): number {
  if (setsWon > setsLost) {
    return 3;
  }
  return setsWon === 2 ? 2 : 1;
}

/**
 * Points du `n`-ième forfait d'une même équipe dans le championnat, `n` commençant à 1.
 *
 * Le premier ne rapporte rien, le deuxième retire un point, le troisième deux, et la
 * pénalité s'arrête là : au-delà, le classement a déjà dit ce qu'il avait à dire, et
 * creuser sans fin ne sanctionne plus, ça humilie.
 *
 * L'ordre des forfaits n'a pas à être connu : le total d'une équipe ne dépend que de leur
 * **nombre**, puisque les valeurs sont attribuées par rang. Inutile donc de trier les matchs
 * par date avant de calculer — et inutile de « corriger » ça plus tard.
 */
export function pointsForForfeit(rank: number): number {
  if (rank <= 1) {
    return 0;
  }
  return rank === 2 ? -1 : -2;
}

/**
 * Compare deux ratios sans division, pour qu'une équipe n'ayant rien perdu ne provoque
 * pas de division par zéro. Rend un nombre positif si le premier ratio est le plus grand.
 */
function compareRatios(aFor: number, aAgainst: number, bFor: number, bAgainst: number): number {
  return aFor * bAgainst - bFor * aAgainst;
}

/**
 * Classement ordonné. Les équipes que tous les critères laissent à égalité partagent le
 * même rang, et le rang suivant saute d'autant — pas d'ordre arbitraire déguisé.
 */
export function computeStandings(
  teamIds: string[],
  outcomes: MatchOutcome[],
): StandingRow[] {
  const rows = new Map<string, StandingRow>();
  for (const teamId of teamIds) {
    rows.set(teamId, {
      teamId,
      rank: 0,
      played: 0,
      wins: 0,
      losses: 0,
      setsWon: 0,
      setsLost: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      forfeits: 0,
      points: 0,
    });
  }

  for (const outcome of outcomes) {
    const sides = [
      {
        teamId: outcome.homeTeamId,
        setsWon: outcome.homeSets,
        setsLost: outcome.awaySets,
        pointsFor: outcome.homePoints,
        pointsAgainst: outcome.awayPoints,
      },
      {
        teamId: outcome.awayTeamId,
        setsWon: outcome.awaySets,
        setsLost: outcome.homeSets,
        pointsFor: outcome.awayPoints,
        pointsAgainst: outcome.homePoints,
      },
    ];
    for (const side of sides) {
      const row = rows.get(side.teamId);
      if (row === undefined) {
        continue;
      }
      row.played++;
      if (side.setsWon > side.setsLost) {
        row.wins++;
      } else {
        row.losses++;
      }
      row.setsWon += side.setsWon;
      row.setsLost += side.setsLost;
      row.pointsFor += side.pointsFor;
      row.pointsAgainst += side.pointsAgainst;

      // L'équipe défaillante est mise de côté : ses points dépendent du nombre de forfaits
      // qu'elle aura accumulés en fin de compte, pas de ce match pris isolément. Son
      // adversaire, lui, a gagné — le barème ordinaire lui donne ses 3 points.
      if (side.teamId === outcome.forfeitAgainst) {
        row.forfeits++;
      } else {
        row.points += pointsForResult(side.setsWon, side.setsLost);
      }
    }
  }

  // Les forfaits une fois tous connus : le n-ième vaut ce que vaut son rang.
  for (const row of rows.values()) {
    for (let rank = 1; rank <= row.forfeits; rank++) {
      row.points += pointsForForfeit(rank);
    }
  }

  const ordered = [...rows.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.wins - a.wins ||
      compareRatios(b.setsWon, b.setsLost, a.setsWon, a.setsLost) ||
      compareRatios(b.pointsFor, b.pointsAgainst, a.pointsFor, a.pointsAgainst),
  );

  /** Deux équipes sont ex aequo quand aucun critère ne les sépare. */
  const tied = (a: StandingRow, b: StandingRow) =>
    a.points === b.points &&
    a.wins === b.wins &&
    compareRatios(a.setsWon, a.setsLost, b.setsWon, b.setsLost) === 0 &&
    compareRatios(a.pointsFor, a.pointsAgainst, b.pointsFor, b.pointsAgainst) === 0;

  ordered.forEach((row, index) => {
    const previous = ordered[index - 1];
    row.rank = previous !== undefined && tied(previous, row) ? previous.rank : index + 1;
  });

  return ordered;
}
