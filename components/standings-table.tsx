import type { FunctionReturnType } from "convex/server";
import Link from "next/link";

import { ClubLogo } from "@/components/club-logo";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { api } from "@/convex/_generated/api";

type Row = FunctionReturnType<typeof api.standings.byChampionship>[number];

/** Classement d'un championnat, partagé par la page d'accueil et la page du championnat. */
export function StandingsTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">Aucune équipe engagée.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8">#</TableHead>
          <TableHead>Équipe</TableHead>
          <TableHead className="text-right">J</TableHead>
          <TableHead className="text-right">V</TableHead>
          <TableHead className="text-right">D</TableHead>
          <TableHead className="text-right">Sets</TableHead>
          <TableHead className="text-right">Points</TableHead>
          <TableHead className="text-right">Pts</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          // La couleur principale marque la tête du classement — plusieurs lignes si
          // des équipes sont ex aequo au premier rang.
          <TableRow key={row.teamId} className={row.rank === 1 ? "bg-primary/15" : undefined}>
            <TableCell className="text-muted-foreground">{row.rank}</TableCell>
            <TableCell className="font-medium">
              <span className="flex items-center gap-2">
                <ClubLogo name={row.clubName} logoUrl={row.clubLogoUrl} size={22} />
                <Link href={`/equipes/${row.teamId}`} className="hover:underline">
                  {row.teamName}
                </Link>
                <span className="text-muted-foreground font-normal">· {row.clubName}</span>
              </span>
            </TableCell>
            <TableCell className="text-right">{row.played}</TableCell>
            <TableCell className="text-right">{row.wins}</TableCell>
            <TableCell className="text-right">{row.losses}</TableCell>
            <TableCell className="text-right">
              {row.setsWon} / {row.setsLost}
            </TableCell>
            <TableCell className="text-right">
              {row.pointsFor} / {row.pointsAgainst}
            </TableCell>
            <TableCell className="text-right font-semibold">{row.points}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
