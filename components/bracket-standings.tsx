"use client";

import { useQuery } from "convex/react";
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
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

const OUTCOME = {
  won: { letter: "V", word: "victoire", tone: "bg-win text-win-foreground border-win-border" },
  lost: { letter: "D", word: "défaite", tone: "bg-loss text-loss-foreground border-loss-border" },
  bye: { letter: "E", word: "exempt", tone: "bg-muted text-muted-foreground" },
} as const;

/**
 * Classement d'un championnat au format tableau — la coupe (ADR-0007).
 *
 * Pas de points : chaque équipe a la fourchette de places qu'elle dispute encore, puis sa
 * place définitive, et son parcours tour par tour. La lettre est écrite à côté de la couleur,
 * qui ne porte jamais seule l'issue.
 */
export function BracketStandings({ championshipId }: { championshipId: Id<"championships"> }) {
  const standings = useQuery(api.bracket.standings, { championshipId });
  if (standings === undefined) {
    return <p className="text-muted-foreground text-sm">Chargement…</p>;
  }
  if (standings.rows.length === 0) {
    return <p className="text-muted-foreground text-sm">Aucune équipe engagée.</p>;
  }
  const rounds = Array.from({ length: standings.rounds }, (_, index) => index);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">Place</TableHead>
          <TableHead>Équipe</TableHead>
          {rounds.map((index) => (
            <TableHead key={index} className="w-10 text-center">
              T{index + 1}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {standings.rows.map((row) => (
          <TableRow
            key={row.team._id}
            className={row.final && row.from === 1 ? "bg-primary/15" : undefined}
          >
            <TableCell
              className={row.final ? "font-semibold" : "text-muted-foreground"}
              title={row.label}
            >
              {row.final ? row.from : `${row.from}–${row.to}`}
            </TableCell>
            <TableCell className="font-medium">
              <span className="flex items-center gap-2">
                <ClubLogo name={row.team.clubName} logoUrl={row.clubLogoUrl} size={22} />
                <Link href={`/equipes/${row.team._id}`} className="hover:underline">
                  {row.team.name}
                </Link>
                <span className="text-muted-foreground font-normal">· {row.team.clubName}</span>
              </span>
            </TableCell>
            {rounds.map((index) => {
              const outcome = row.path[index];
              return (
                <TableCell key={index} className="text-center">
                  {outcome === undefined ? (
                    <span className="text-muted-foreground">·</span>
                  ) : (
                    <span
                      className={cn(
                        "inline-flex size-6 items-center justify-center rounded-md border text-xs font-semibold",
                        OUTCOME[outcome].tone,
                      )}
                      title={`Tour ${index + 1} : ${OUTCOME[outcome].word}`}
                    >
                      {OUTCOME[outcome].letter}
                    </span>
                  )}
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
