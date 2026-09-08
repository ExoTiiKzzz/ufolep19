/**
 * Classement d'un championnat.
 *
 * Module pur : le classement est dérivé des matchs terminés, jamais stocké comme état
 * modifiable à la main.
 *
 * Barème : 3 points pour une victoire 3-0 ou 3-1, 2 pour une victoire 3-2, 1 pour une
 * défaite 2-3, 0 pour une défaite 0-3 ou 1-3. Le vainqueur par forfait marque 3 points,
 * l'équipe défaillante 0.
 */
export type MatchOutcome = {
  homeTeamId: string;
  awayTeamId: string;
  homeSets: number;
  awaySets: number;
  homePoints: number;
  awayPoints: number;
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
  points: number;
};

/** Points de classement d'une équipe selon les sets gagnés et perdus dans un match. */
export function pointsForResult(setsWon: number, setsLost: number): number {
  if (setsWon === 3) {
    return setsLost <= 1 ? 3 : 2;
  }
  return setsWon === 2 ? 1 : 0;
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
      row.points += pointsForResult(side.setsWon, side.setsLost);
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
