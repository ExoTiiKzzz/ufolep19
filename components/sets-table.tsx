import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { decidedWinner, setsWonSoFar, TIE_BREAK_TARGET, type SetScore } from "@/lib/rules/score";
import { cn } from "@/lib/utils";

/**
 * Score d'un match set par set : une colonne par set, une ligne par équipe.
 *
 * Le gagnant de chaque set est mis en gras, et la dernière colonne rappelle le nombre de
 * sets gagnés — ce qui évite de recompter la ligne pour retrouver le score du match.
 *
 * Dès qu'une équipe atteint 3 sets, sa ligne passe au **vert** et l'autre au **rouge**,
 * comme les colonnes de la grille de saisie : c'est le même score, lu deux fois. La
 * colonne « Sets » reste le repère qui ne dépend pas de la couleur.
 */
export function SetsTable({
  homeTeamName,
  awayTeamName,
  sets,
}: {
  homeTeamName: string;
  awayTeamName: string;
  sets: SetScore[];
}) {
  if (sets.length === 0) {
    return <p className="text-muted-foreground text-sm">Aucun set saisi.</p>;
  }

  const won = setsWonSoFar(sets);
  const decided = decidedWinner(won);

  /** Teinte d'une ligne. `hover:` est réaffirmé, sans quoi le survol effacerait la teinte. */
  const tone = (side: "home" | "away") => {
    if (decided === null) {
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

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Équipe</TableHead>
          {sets.map((_, index) => (
            <TableHead key={index} className="text-right">
              {/* Le 5e set est le tie-break : sa cible n'est pas la même. */}
              {index === 4 ? `TB (${TIE_BREAK_TARGET})` : `Set ${index + 1}`}
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
  );
}
