import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TIE_BREAK_TARGET } from "@/lib/rules/score";

type SetScore = { home: number; away: number };

/**
 * Score d'un match set par set : une colonne par set, une ligne par équipe.
 *
 * Le gagnant de chaque set est mis en gras, et la dernière colonne rappelle le nombre de
 * sets gagnés — ce qui évite de recompter la ligne pour retrouver le score du match.
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

  const homeSets = sets.filter((set) => set.home > set.away).length;
  const awaySets = sets.length - homeSets;

  const row = (
    teamName: string,
    pick: (set: SetScore) => number,
    other: (set: SetScore) => number,
    total: number,
  ) => (
    <TableRow>
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
        {row(homeTeamName, (set) => set.home, (set) => set.away, homeSets)}
        {row(awayTeamName, (set) => set.away, (set) => set.home, awaySets)}
      </TableBody>
    </Table>
  );
}
