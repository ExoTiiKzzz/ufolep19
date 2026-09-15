"use client";

import { Fragment } from "react";

import { ClubLogo } from "@/components/club-logo";
import { Input } from "@/components/ui/input";
import {
  decidedWinner,
  REGULAR_SET_TARGET,
  setsWonSoFar,
  TIE_BREAK_TARGET,
} from "@/lib/rules/score";
import { cn } from "@/lib/utils";

/** Un set en cours de saisie : les champs restent des chaînes tant qu'ils sont vides. */
export type SetInput = { home: string; away: string };

/** De quoi coiffer une colonne : le logo du club et le nom de l'équipe. */
export type ScoreColumnTeam = {
  teamId: string;
  teamName: string;
  clubName: string;
  clubLogoUrl: string | null;
};

type Side = "home" | "away";

/** Cinq lignes vides : un match se joue au meilleur des 5 sets. */
export function emptySetInputs(): SetInput[] {
  return [0, 1, 2, 3, 4].map(() => ({ home: "", away: "" }));
}

/** Reprend une feuille déjà saisie sous forme de champs, complétée à 5 lignes. */
export function setInputsFrom(sets: { home: number; away: number }[]): SetInput[] {
  return emptySetInputs().map((empty, index) => {
    const set = sets[index];
    return set === undefined ? empty : { home: String(set.home), away: String(set.away) };
  });
}

/** Les lignes réellement remplies, prêtes pour la mutation. */
export function collectSets(sets: SetInput[]): { home: number; away: number }[] {
  return sets
    .filter((set) => set.home !== "" || set.away !== "")
    .map((set) => ({ home: Number(set.home), away: Number(set.away) }));
}

/**
 * Les lignes exploitables pour compter les sets : les deux champs remplis et numériques.
 *
 * Une ligne à moitié saisie n'est pas un set nul, c'est un set pas encore entré — la
 * compter donnerait un vainqueur qui clignote au fil de la frappe.
 */
function scorableSets(sets: SetInput[]): { home: number; away: number }[] {
  return sets
    .filter((set) => set.home !== "" && set.away !== "")
    .map((set) => ({ home: Number(set.home), away: Number(set.away) }))
    .filter((set) => Number.isFinite(set.home) && Number.isFinite(set.away));
}

/** Teinte d'une colonne : verte pour le vainqueur, rouge pour le perdant, neutre avant. */
function toneFor(decided: Side | null, side: Side): string {
  if (decided === null) {
    return "border-transparent";
  }
  return decided === side
    ? "bg-win text-win-foreground border-win-border"
    : "bg-loss text-loss-foreground border-loss-border";
}

/**
 * Saisie du score set par set, une colonne par équipe.
 *
 * Deux repères que la saisie « 12 — 25 » en vrac ne donnait pas :
 *
 * - chaque colonne est **coiffée du logo et du nom** de son équipe, pour qu'on sache sans
 *   compter laquelle reçoit les points qu'on tape ;
 * - dès qu'une équipe atteint 3 sets, sa colonne passe au **vert** et l'autre au **rouge**.
 *   La couleur ne porte pas seule : le compte de sets et le mot « vainqueur » ou
 *   « défaite » sont écrits sous le nom.
 *
 * Partagée par la saisie du receveur et par l'arbitrage d'un litige : ce sont les mêmes
 * champs, sur les mêmes règles.
 */
export function SetScoresInput({
  home,
  away,
  sets,
  onChange,
  idPrefix,
}: {
  home: ScoreColumnTeam;
  away: ScoreColumnTeam;
  sets: SetInput[];
  onChange: (next: SetInput[]) => void;
  /** Préfixe des `aria-label`, quand deux grilles coexistent sur une page. */
  idPrefix?: string;
}) {
  const won = setsWonSoFar(scorableSets(sets));
  const decided = decidedWinner(won);

  const update = (index: number, side: Side, value: string) =>
    onChange(sets.map((set, position) => (position === index ? { ...set, [side]: value } : set)));

  const header = (team: ScoreColumnTeam, side: Side) => {
    const count = won[side];
    const outcome =
      decided === null ? null : decided === side ? "vainqueur" : "défaite";
    return (
      <div
        className={cn(
          "flex flex-col gap-1 rounded-t-md border-x border-t px-2 pt-2 pb-1",
          toneFor(decided, side),
        )}
      >
        <div className="flex items-center gap-2">
          <ClubLogo name={team.clubName} logoUrl={team.clubLogoUrl} size={24} />
          <span className="truncate text-sm font-medium">{team.teamName}</span>
        </div>
        <p className="text-xs">
          {count} set{count > 1 ? "s" : ""}
          {outcome === null ? "" : ` · ${outcome}`}
        </p>
      </div>
    );
  };

  const cell = (index: number, team: ScoreColumnTeam, side: Side) => {
    const last = index === sets.length - 1;
    return (
      <div
        className={cn(
          "border-x px-2 py-1",
          last ? "rounded-b-md border-b" : null,
          toneFor(decided, side),
        )}
      >
        <Input
          type="number"
          min={0}
          inputMode="numeric"
          value={sets[index]?.[side] ?? ""}
          aria-label={`${idPrefix ?? ""}Set ${index + 1} — ${team.teamName}`}
          onChange={(event) => update(index, side, event.target.value)}
        />
      </div>
    );
  };

  return (
    <div>
      <div className="grid grid-cols-[5rem_minmax(0,1fr)_minmax(0,1fr)] gap-x-3">
        <div />
        {header(home, "home")}
        {header(away, "away")}

        {sets.map((_, index) => (
          <Fragment key={index}>
            {/* h-11 = la hauteur d'un champ (h-9) plus son py-1 : les lignes restent en face. */}
            <div className="flex h-11 items-center px-1 text-sm">
              <span className="text-muted-foreground">
                {index === 4 ? "Tie-break" : `Set ${index + 1}`}
              </span>
            </div>
            {cell(index, home, "home")}
            {cell(index, away, "away")}
          </Fragment>
        ))}
      </div>
      <p className="text-muted-foreground mt-2 text-xs">
        Sets 1 à 4 en {REGULAR_SET_TARGET} points, tie-break en {TIE_BREAK_TARGET}, avec 2 points
        d&apos;écart minimum et prolongation illimitée. Laissez vides les sets non joués.
      </p>
    </div>
  );
}
