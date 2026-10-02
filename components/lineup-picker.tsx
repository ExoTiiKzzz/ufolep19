"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { matchesPlayer } from "@/lib/rules/player-search";
import {
  assessLineup,
  flagMessage,
  kindLabel,
  UPPER_LEVEL_MATCH_LIMIT,
  type LineupContext,
  type PlayerAssessment,
} from "@/lib/rules/reinforcement";

export type LineupCandidatePlayer = {
  _id: string;
  firstName: string;
  lastName: string;
  license: { number: string | null; validUntil: number | null; isValid: boolean };
  originTeamId: string | null;
  originTeamName: string | null;
  originLevel: number | null;
  upperMatchesBefore: number;
};

const MAX_LINEUP = 12;

/**
 * Choix des joueurs alignés, parmi **tout le club** : la feuille verte de l'équipe d'abord,
 * puis les autres licenciés, qui seraient des renforts.
 *
 * Deux sortes d'annonces, qui ne se confondent pas :
 *
 * - une licence qui ne couvre pas la date du match **décoche et désactive** le joueur : Convex
 *   refuserait la feuille, autant le dire avant ;
 * - un renfort est **signalé** en jaune, sans rien empêcher : la feuille partira, et le
 *   signalement la suivra jusqu'au visiteur et au comité (ADR-0005).
 *
 * Les signalements sont recalculés à chaque case cochée par la même fonction pure que côté
 * serveur — le quota du mixte dépend de toute la composition.
 */
export function LineupPicker({
  title,
  players,
  context,
  selected,
  onToggle,
}: {
  title: string;
  players: LineupCandidatePlayer[];
  context: LineupContext | null;
  selected: string[];
  onToggle: (next: string[]) => void;
}) {
  const [search, setSearch] = useState("");

  const byId = new Map(players.map((player) => [player._id, player]));
  const assessed = new Map<string, PlayerAssessment>();
  if (context !== null) {
    const chosen = selected.flatMap((id) => {
      const player = byId.get(id);
      return player === undefined ? [] : [{ ...player, playerId: player._id }];
    });
    for (const assessment of assessLineup(context, chosen)) {
      assessed.set(assessment.playerId, assessment);
    }
  }
  /** Situation d'un joueur non coché : classé seul, sans le quota qui dépend des autres. */
  const alone = (player: LineupCandidatePlayer) =>
    context === null ? null : assessLineup(context, [{ ...player, playerId: player._id }])[0];

  const own = players.filter((player) => player.originTeamId === context?.teamId);
  const others = players.filter((player) => player.originTeamId !== context?.teamId);
  const visibleOthers = others.filter(
    (player) =>
      selected.includes(player._id) ||
      (search.trim() !== "" &&
        matchesPlayer(
          {
            firstName: player.firstName,
            lastName: player.lastName,
            licenseNumbers: player.license.number === null ? [] : [player.license.number],
          },
          search,
        )),
  );
  const flagged = selected.filter((id) => (assessed.get(id)?.flags.length ?? 0) > 0).length;

  const row = (player: LineupCandidatePlayer) => {
    const checked = selected.includes(player._id);
    const assessment = checked ? assessed.get(player._id) : alone(player);
    const label = assessment === undefined || assessment === null ? null : kindLabel(assessment.kind);
    return (
      <label
        key={player._id}
        className={
          player.license.isValid
            ? "flex flex-wrap items-center gap-2 text-sm"
            : "text-muted-foreground flex flex-wrap items-center gap-2 text-sm"
        }
      >
        <input
          type="checkbox"
          disabled={!player.license.isValid}
          checked={checked}
          onChange={(event) =>
            onToggle(
              event.target.checked
                ? [...selected, player._id]
                : selected.filter((id) => id !== player._id),
            )
          }
        />
        <span>
          {player.lastName.toUpperCase()} {player.firstName}
        </span>
        {player.license.isValid ? null : (
          <Badge variant="destructive">
            {player.license.validUntil === null
              ? "sans licence"
              : `licence expirée le ${formatDate(player.license.validUntil)}`}
          </Badge>
        )}
        {label === null ? null : (
          <Badge variant="muted">
            {label}
            {player.originTeamName === null ? "" : ` · ${player.originTeamName}`}
            {assessment?.kind === "upward"
              ? ` · ${checked ? assessment.upperMatchNumber : player.upperMatchesBefore}/${UPPER_LEVEL_MATCH_LIMIT}`
              : ""}
          </Badge>
        )}
        {checked && context !== null
          ? (assessment?.flags ?? []).map((flag) => (
              <Badge key={flag} variant="secondary">
                {flagMessage(flag, assessment!, context.quota)}
              </Badge>
            ))
          : null}
      </label>
    );
  };

  return (
    <div>
      <p className="text-sm font-medium">
        {title}{" "}
        <span className="text-muted-foreground font-normal">
          ({selected.length} sélectionné(s), {MAX_LINEUP} maximum
          {flagged > 0 ? `, ${flagged} signalé(s)` : ""})
        </span>
      </p>
      {own.length === 0 ? (
        <p className="text-muted-foreground mt-2 text-sm">Feuille verte vide.</p>
      ) : (
        <div className="mt-2 grid gap-1 sm:grid-cols-2">{own.map(row)}</div>
      )}

      <div className="mt-3">
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Ajouter un renfort du club : nom ou numéro de licence"
          aria-label={`${title} — chercher un renfort`}
        />
        {visibleOthers.length === 0 ? (
          search.trim() === "" ? null : (
            <p className="text-muted-foreground mt-2 text-sm">Aucun licencié du club trouvé.</p>
          )
        ) : (
          <div className="mt-2 grid gap-1 sm:grid-cols-2">{visibleOthers.map(row)}</div>
        )}
      </div>

      <p className="text-muted-foreground mt-2 text-xs">
        Un renfort n&apos;est jamais refusé : il est signalé au visiteur et au comité. Une licence
        qui ne couvre pas la date du match, elle, empêche d&apos;aligner le joueur.
      </p>
    </div>
  );
}
