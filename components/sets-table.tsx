import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  decidedOutcome,
  setsWonSoFar,
  TIE_BREAK_TARGET,
  type MatchFormat,
  type SetScore,
} from "@/lib/rules/score";
import { cn } from "@/lib/utils";

/**
 * Score d'un match set par set : une colonne par set, une ligne par équipe.
 *
 * Le gagnant de chaque set est mis en gras, et la dernière colonne rappelle le nombre de
 * sets gagnés — ce qui évite de recompter la ligne pour retrouver le score du match.
 *
 * Dès qu'une équipe a gagné, sa ligne passe au **vert** et l'autre au **rouge**, comme les
 * colonnes de la grille de saisie : c'est le même score, lu deux fois. La colonne « Sets »
 * reste le repère qui ne dépend pas de la couleur. Un match nul de plateau reste neutre,
 * et le dit en toutes lettres.
 */
export function SetsTable({
  homeTeamName,
  awayTeamName,
  sets,
  format = "standard",
}: {
  homeTeamName: string;
  awayTeamName: string;
  sets: SetScore[];
  format?: MatchFormat;
}) {
  if (sets.length === 0) {
    return <p className="text-muted-foreground text-sm">Aucun set saisi.</p>;
  }

  const won = setsWonSoFar(sets);
  const decided = decidedOutcome(sets, format);

  /** Teinte d'une ligne. `hover:` est réaffirmé, sans quoi le survol effacerait la teinte. */
  const tone = (side: "home" | "away") => {
    if (decided === null || decided === "draw") {
      return null;
    }
    return decided === side
      ? "bg-win text-win-foreground hover:bg-win"
      : "bg-loss text-loss-foreground hover:bg-loss";
  };

  const row = (
    side: "home" | "away",
    teamName: string,
    pick: (set: SetScore) => number,
    other: (set: SetScore) => number,
    total: number,
  ) => (
    <TableRow className={cn(tone(side))}>
      <TableCell className="font-medium">{teamName}</TableCell>
      {sets.map((set, index) => (
        <TableCell
          key={index}
          className={pick(set) > other(set) ? "text-right font-semibold" : "text-right"}
        >
          {pick(set)}
        </TableCell>
      ))}
      <TableCell className="border-l text-right font-semibold">{total}</TableCell>
    </TableRow>
  );

  const points = sets.reduce(
    (total, set) => ({ home: total.home + set.home, away: total.away + set.away }),
    { home: 0, away: 0 },
  );
  // À un set partout, le plateau se décide aux points : le dire, puisque la colonne « Sets »
  // affiche une égalité.
  const caption =
    format !== "plateau" || won.home !== won.away || decided === null
      ? null
      : decided === "draw"
        ? `Match nul : un set partout, ${points.home} points partout.`
        : `Un set partout, vainqueur aux points (${points.home} à ${points.away}).`;

  return (
    <>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Équipe</TableHead>
          {sets.map((_, index) => (
            <TableHead key={index} className="text-right">
              {/* Le 5e set standard est le tie-break : sa cible n'est pas la même. */}
              {format === "standard" && index === 4 ? `TB (${TIE_BREAK_TARGET})` : `Set ${index + 1}`}
            </TableHead>
          ))}
          <TableHead className="border-l text-right">Sets</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {row("home", homeTeamName, (set) => set.home, (set) => set.away, won.home)}
        {row("away", awayTeamName, (set) => set.away, (set) => set.home, won.away)}
      </TableBody>
    </Table>
    {caption === null ? null : <p className="text-muted-foreground mt-2 text-sm">{caption}</p>}
    </>
  );
}
