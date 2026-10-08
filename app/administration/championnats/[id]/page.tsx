"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { ChampionshipSettingsForm } from "@/components/championship-settings-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  dateInputValue,
  formatDateTime,
  formatPlateau,
  formatWindow,
  inputValueFromTimestamp,
  parisDayBounds,
  parisDayOf,
  parisTimestampFromInput,
} from "@/lib/format";
import { formatLabels, levelLabel, matchStateLabels, matchStateVariant } from "@/lib/labels";
import { errorMessage } from "@/lib/errors";

export default function AdminChampionshipPage() {
  const championshipId = useParams<{ id: string }>().id as Id<"championships">;
  const championship = useQuery(api.championships.get, { championshipId });
  const clubs = useQuery(api.clubs.list);
  const teams = useQuery(api.teams.listByChampionship, { championshipId });
  const matchdays = useQuery(api.matchdays.listByChampionship, { championshipId });
  const matches = useQuery(api.matches.listByChampionship, { championshipId });
  const overlaps = useQuery(api.adminViews.playerOverlaps, { championshipId });
  const flags = useQuery(api.adminViews.reinforcementFlags, { championshipId });
  const circuits = useQuery(
    api.circuits.listBySeason,
    championship ? { seasonId: championship.seasonId } : "skip",
  );

  const createTeam = useMutation(api.teams.create);
  const createMatchday = useMutation(api.matchdays.create);
  const updatePlateau = useMutation(api.matchdays.updatePlateau);
  const updateWindow = useMutation(api.matchdays.updateWindow);
  const mirrorMatchday = useMutation(api.matches.mirrorMatchday);
  const renameTeam = useMutation(api.teams.rename);
  const removeTeam = useMutation(api.teams.remove);
  const createMatch = useMutation(api.matches.create);
  const updateChampionship = useMutation(api.championships.update);

  const isPlateau = championship?.format === "plateau";

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function guard(action: () => Promise<unknown>, success?: string) {
    setError(null);
    setNotice(null);
    try {
      await action();
      if (success !== undefined) {
        setNotice(success);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <p className="text-muted-foreground text-sm">
        Saison {championship?.seasonLabel ?? "…"}
        {championship ? ` · circuit ${championship.circuitName}` : ""}
      </p>
      <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
        {championship?.name ?? "…"}
        {championship ? <Badge variant="muted">{levelLabel(championship.level)}</Badge> : null}
        {championship ? (
          <Badge variant="muted">{formatLabels[championship.format]}</Badge>
        ) : null}
      </h1>

      {error === null ? null : <p className="mt-4 text-sm text-red-600">{error}</p>}
      {notice === null ? null : <p className="mt-4 text-sm text-green-700">{notice}</p>}

      {championship === undefined || championship === null || circuits === undefined ? null : (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Réglages</CardTitle>
            <CardDescription>
              Niveau et quota se changent à tout moment : les signalements de renfort sont
              recalculés.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChampionshipSettingsForm
              // Remonté quand le championnat change en base, pour repartir de ses valeurs.
              key={JSON.stringify([
                championship.name,
                championship.circuitId,
                championship.level,
                championship.format,
                championship.reinforcementQuota,
              ])}
              circuits={circuits}
              initial={{
                name: championship.name,
                circuitId: championship.circuitId,
                level: championship.level,
                format: championship.format,
                reinforcementQuota: championship.reinforcementQuota ?? null,
              }}
              formatLocked={(matchdays ?? []).length > 0}
              submitLabel="Enregistrer"
              onSubmit={(settings) =>
                guard(
                  () => updateChampionship({ championshipId, ...settings }),
                  "Réglages enregistrés.",
                )
              }
            />
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Équipes engagées</CardTitle>
          <CardDescription>
            La saison de l&apos;équipe est déduite du championnat : elle ne peut pas être
            contredite.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1 text-sm">
            {(teams ?? []).length === 0 ? (
              <p className="text-muted-foreground">Aucune équipe engagée.</p>
            ) : (
              (teams ?? []).map((team) => (
                <TeamAdminRow
                  key={team._id}
                  team={team}
                  onRename={(name) =>
                    guard(() => renameTeam({ teamId: team._id, name }), "Équipe renommée.")
                  }
                  onRemove={() =>
                    guard(() => removeTeam({ teamId: team._id }), `${team.name} supprimée.`)
                  }
                />
              ))
            )}
          </div>
          <form
            className="flex flex-wrap items-end gap-3 border-t pt-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const element = event.currentTarget;
              await guard(async () => {
                await createTeam({
                  clubId: String(form.get("clubId")) as Id<"clubs">,
                  championshipId,
                  name: String(form.get("name")),
                });
                element.reset();
              }, "Équipe engagée.");
            }}
          >
            <div className="min-w-40 flex-1">
              <Label htmlFor="clubId">Club</Label>
              <Select id="clubId" name="clubId" className="mt-2" required>
                <option value="">Choisir…</option>
                {(clubs ?? []).map((club) => (
                  <option key={club._id} value={club._id}>
                    {club.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="min-w-40 flex-1">
              <Label htmlFor="teamName">Nom de l&apos;équipe</Label>
              <Input id="teamName" name="name" className="mt-2" required placeholder="Club A 1" />
            </div>
            <Button type="submit">Engager</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">{isPlateau ? "Plateaux" : "Journées"}</CardTitle>
          <CardDescription>
            {isPlateau
              ? "Chaque journée est un plateau : une date, une heure et une salle communes à ses matchs. Pas de négociation de créneau."
              : "Le créneau des matchs est attendu dans la fenêtre de la journée. Un match avancé ou retardé par arrangement entre les équipes peut se jouer en dehors : il est alors signalé, et le visiteur doit valider explicitement."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1 text-sm">
            {(matchdays ?? []).map((matchday) =>
              matchday.plateau === undefined ? (
                <details key={matchday._id}>
                  <summary className="cursor-pointer">
                    <span className="font-medium">Journée {matchday.number}</span>{" "}
                    <span className="text-muted-foreground">
                      {formatWindow(matchday.windowStart, matchday.windowEnd)}
                    </span>
                  </summary>
                  <WindowForm
                    idPrefix={`window-${matchday._id}-`}
                    initial={matchday}
                    onSubmit={(window) =>
                      guard(
                        () => updateWindow({ matchdayId: matchday._id, ...window }),
                        `Fenêtre de la journée ${matchday.number} modifiée. Ses matchs gardent leur créneau.`,
                      )
                    }
                    onInvalid={() => setError("Dates de fenêtre invalides.")}
                  />
                  <MirrorForm
                    idPrefix={`mirror-${matchday._id}-`}
                    target={matchday}
                    matchdays={matchdays ?? []}
                    label="Journée"
                    onSubmit={(sourceMatchdayId, sourceNumber) =>
                      guard(async () => {
                        const result = await mirrorMatchday({
                          sourceMatchdayId,
                          targetMatchdayId: matchday._id,
                        });
                        setNotice(
                          [
                            `${result.created} match${result.created > 1 ? "s" : ""} retour créé${result.created > 1 ? "s" : ""} en journée ${matchday.number}, depuis la journée ${sourceNumber}.`,
                            ...result.duplicateWarnings,
                          ].join(" "),
                        );
                      })
                    }
                  />
                </details>
              ) : (
                <details key={matchday._id}>
                  <summary className="cursor-pointer">
                    <span className="font-medium">Plateau {matchday.number}</span>{" "}
                    <span className="text-muted-foreground">
                      {formatPlateau(matchday.plateau)}
                    </span>
                  </summary>
                  <PlateauForm
                    idPrefix={`move-${matchday._id}-`}
                    initial={matchday.plateau}
                    submitLabel="Déplacer le plateau"
                    onSubmit={(plateau) =>
                      guard(async () => {
                        const day = parisDayOf(plateau.at);
                        await updatePlateau({
                          matchdayId: matchday._id,
                          windowStart: day.start,
                          windowEnd: day.end,
                          plateau,
                        });
                      }, "Plateau déplacé, avec ses matchs non joués.")
                    }
                  />
                  <MirrorForm
                    idPrefix={`mirror-${matchday._id}-`}
                    target={matchday}
                    matchdays={matchdays ?? []}
                    label="Plateau"
                    onSubmit={(sourceMatchdayId, sourceNumber) =>
                      guard(async () => {
                        const result = await mirrorMatchday({
                          sourceMatchdayId,
                          targetMatchdayId: matchday._id,
                        });
                        setNotice(
                          [
                            `${result.created} match${result.created > 1 ? "s" : ""} retour créé${result.created > 1 ? "s" : ""} au plateau ${matchday.number}, depuis le plateau ${sourceNumber}.`,
                            ...result.duplicateWarnings,
                          ].join(" "),
                        );
                      })
                    }
                  />
                </details>
              ),
            )}
            {(matchdays ?? []).length === 0 ? (
              <p className="text-muted-foreground">Aucune journée créée.</p>
            ) : null}
          </div>
          {isPlateau ? (
            <PlateauForm
              idPrefix="new-plateau-"
              submitLabel="Créer le plateau"
              defaultNumber={(matchdays ?? []).length + 1}
              onSubmit={(plateau, number) =>
                guard(async () => {
                  const day = parisDayOf(plateau.at);
                  await createMatchday({
                    championshipId,
                    number: number ?? (matchdays ?? []).length + 1,
                    windowStart: day.start,
                    windowEnd: day.end,
                    plateau,
                  });
                }, "Plateau créé.")
              }
            />
          ) : (
          <form
            className="flex flex-wrap items-end gap-3 border-t pt-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const element = event.currentTarget;
              const start = parisDayBounds(String(form.get("start")), "start");
              const end = parisDayBounds(String(form.get("end")), "end");
              if (start === null || end === null) {
                setError("Dates de fenêtre invalides.");
                return;
              }
              await guard(async () => {
                await createMatchday({
                  championshipId,
                  number: Number(form.get("number")),
                  windowStart: start,
                  windowEnd: end,
                });
                element.reset();
              }, "Journée créée.");
            }}
          >
            <div>
              <Label htmlFor="number">Numéro</Label>
              <Input
                id="number"
                name="number"
                type="number"
                min={1}
                className="mt-2 w-24"
                required
                defaultValue={((matchdays ?? []).length + 1).toString()}
              />
            </div>
            <div>
              <Label htmlFor="start">Début de fenêtre</Label>
              <Input
                id="start"
                name="start"
                type="date"
                className="mt-2"
                required
                defaultValue={dateInputValue(Date.now())}
              />
            </div>
            <div>
              <Label htmlFor="end">Fin de fenêtre</Label>
              <Input
                id="end"
                name="end"
                type="date"
                className="mt-2"
                required
                defaultValue={dateInputValue(Date.now() + 14 * 86_400_000)}
              />
            </div>
            <Button type="submit">Créer la journée</Button>
          </form>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Matchs</CardTitle>
          <CardDescription>
            {isPlateau
              ? "Saisie manuelle : programmez autant de matchs par équipe que le plateau en compte. Ils naissent confirmés, à la date et dans la salle du plateau ; les résultats se saisissent depuis chaque match."
              : "Saisie manuelle : désignez qui reçoit. Un doublon d'affiche est signalé sans être bloqué."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1 text-sm">
            {(matches ?? []).map((match) => (
              <Link
                key={match._id}
                href={`/matchs/${match._id}`}
                className="hover:bg-muted/50 flex flex-wrap items-center gap-2 rounded-md px-2 py-1"
              >
                <span className="text-muted-foreground w-16">J{match.matchdayNumber}</span>
                <span className="font-medium">
                  {match.homeTeamName} — {match.awayTeamName}
                </span>
                {match.slot === undefined ? null : (
                  <span className="text-muted-foreground">{formatDateTime(match.slot.at)}</span>
                )}
                <Badge variant={matchStateVariant[match.state]} className="ml-auto">
                  {matchStateLabels[match.state]}
                </Badge>
              </Link>
            ))}
            {(matches ?? []).length === 0 ? (
              <p className="text-muted-foreground">Aucun match programmé.</p>
            ) : null}
          </div>

          <form
            className="flex flex-wrap items-end gap-3 border-t pt-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              await guard(async () => {
                const result = await createMatch({
                  matchdayId: String(form.get("matchdayId")) as Id<"matchdays">,
                  homeTeamId: String(form.get("homeTeamId")) as Id<"teams">,
                  awayTeamId: String(form.get("awayTeamId")) as Id<"teams">,
                });
                setNotice(result.duplicateWarning ?? "Match créé.");
              });
            }}
          >
            <div>
              <Label htmlFor="matchdayId">Journée</Label>
              <Select id="matchdayId" name="matchdayId" className="mt-2" required>
                {(matchdays ?? []).map((matchday) => (
                  <option key={matchday._id} value={matchday._id}>
                    {isPlateau ? "Plateau" : "Journée"} {matchday.number}
                  </option>
                ))}
              </Select>
            </div>
            <div className="min-w-40 flex-1">
              <Label htmlFor="homeTeamId">Reçoit</Label>
              <Select id="homeTeamId" name="homeTeamId" className="mt-2" required>
                <option value="">Choisir…</option>
                {(teams ?? []).map((team) => (
                  <option key={team._id} value={team._id}>
                    {team.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="min-w-40 flex-1">
              <Label htmlFor="awayTeamId">Se déplace</Label>
              <Select id="awayTeamId" name="awayTeamId" className="mt-2" required>
                <option value="">Choisir…</option>
                {(teams ?? []).map((team) => (
                  <option key={team._id} value={team._id}>
                    {team.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit">Créer le match</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Renforts signalés</CardTitle>
          <CardDescription>
            Un renfort n&apos;est jamais refusé à la saisie : il est signalé ici, et c&apos;est au
            comité d&apos;en juger.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          {flags === undefined ? (
            <p className="text-muted-foreground">Chargement…</p>
          ) : flags.length === 0 ? (
            <p className="text-muted-foreground">Aucun renfort signalé.</p>
          ) : (
            flags.map((row) => (
              <Link
                key={`${row.matchId}-${row.playerId}`}
                href={`/matchs/${row.matchId}`}
                className="hover:bg-muted/50 flex flex-wrap items-center gap-2 rounded-md px-2 py-1"
              >
                <span className="text-muted-foreground w-10">J{row.matchdayNumber}</span>
                <span className="font-medium">{row.playerName}</span>
                <span className="text-muted-foreground">
                  pour {row.teamName}
                  {row.originTeamName === null ? "" : `, feuille verte ${row.originTeamName}`}
                </span>
                {row.messages.map((message) => (
                  <Badge key={message} variant="secondary">
                    {message}
                  </Badge>
                ))}
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Cumuls de joueurs</CardTitle>
          <CardDescription>
            Un joueur aligné pour deux équipes la même journée est autorisé, mais signalé ici.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          {(overlaps ?? []).length === 0 ? (
            <p className="text-muted-foreground">Aucun cumul détecté.</p>
          ) : (
            (overlaps ?? []).map((row) => (
              <p key={`${row.playerId}-${row.matchdayNumber}`}>
                <span className="font-medium">{row.playerName}</span>{" "}
                <span className="text-muted-foreground">
                  journée {row.matchdayNumber} — {row.teams.join(" et ")}
                </span>
              </p>
            ))
          )}
        </CardContent>
      </Card>
    </main>
  );
}

/**
 * Une équipe engagée, avec son renommage et sa suppression.
 *
 * La suppression s'annonce avant d'agir : ce qu'elle emporte (matchs, feuille verte,
 * responsables), ou les matchs qui l'empêchent. L'impact n'est lu qu'à la demande.
 */
function TeamAdminRow({
  team,
  onRename,
  onRemove,
}: {
  team: { _id: Id<"teams">; name: string; clubName: string };
  onRename: (name: string) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const impact = useQuery(api.teams.removalImpact, confirming ? { teamId: team._id } : "skip");
  const plural = (count: number, noun: string, adjective = "") => {
    const s = count > 1 ? "s" : "";
    return `${count} ${noun}${s}${adjective === "" ? "" : ` ${adjective}${s}`}`;
  };

  return (
    <details>
      <summary className="cursor-pointer">
        <span className="font-medium">{team.name}</span>{" "}
        <span className="text-muted-foreground">{team.clubName}</span>{" "}
        <Link href={`/equipes/${team._id}`} className="text-muted-foreground text-xs hover:underline">
          fiche
        </Link>
      </summary>
      <form
        className="mt-2 flex flex-wrap items-end gap-3 border-t pt-4"
        onSubmit={async (event) => {
          event.preventDefault();
          await onRename(String(new FormData(event.currentTarget).get("name")));
        }}
      >
        <div className="min-w-56 flex-1">
          <Label htmlFor={`rename-${team._id}`}>Nom de l&apos;équipe</Label>
          <Input
            id={`rename-${team._id}`}
            name="name"
            className="mt-2"
            required
            defaultValue={team.name}
          />
        </div>
        <Button type="submit" variant="outline">
          Renommer
        </Button>
        {confirming ? null : (
          <Button type="button" variant="ghost" onClick={() => setConfirming(true)}>
            Supprimer…
          </Button>
        )}
      </form>
      {!confirming ? null : impact === undefined ? (
        <p className="text-muted-foreground mt-3">Vérification…</p>
      ) : impact.blockingMatches.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p>
            {team.name} ne peut pas être supprimée : ces matchs ont déjà un créneau ou une
            feuille — {impact.blockingMatches.join(", ")}. Le retrait d&apos;une équipe en
            cours de saison passe par des forfaits.
          </p>
          <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
            Fermer
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p>
            Supprimer {team.name} emporte {plural(impact.matches, "match", "planifié")},{" "}
            {plural(impact.rosterEntries, "joueur")} sur la feuille verte et{" "}
            {plural(impact.managers, "responsable", "rattaché")}. Les fiches des licenciés et
            les comptes restent.
          </p>
          <Button type="button" variant="destructive" onClick={() => onRemove()}>
            Supprimer définitivement
          </Button>
          <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
            Annuler
          </Button>
        </div>
      )}
    </details>
  );
}

/** Dates de la fenêtre d'une journée, préremplies. Déplacer la fenêtre ne touche aucun match. */
function WindowForm({
  idPrefix,
  initial,
  onSubmit,
  onInvalid,
}: {
  idPrefix: string;
  initial: { windowStart: number; windowEnd: number };
  onSubmit: (window: { windowStart: number; windowEnd: number }) => Promise<void>;
  onInvalid: () => void;
}) {
  return (
    <form
      className="mt-2 flex flex-wrap items-end gap-3 border-t pt-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const windowStart = parisDayBounds(String(form.get("start")), "start");
        const windowEnd = parisDayBounds(String(form.get("end")), "end");
        if (windowStart === null || windowEnd === null) {
          onInvalid();
          return;
        }
        await onSubmit({ windowStart, windowEnd });
      }}
    >
      <div>
        <Label htmlFor={`${idPrefix}start`}>Début de fenêtre</Label>
        <Input
          id={`${idPrefix}start`}
          name="start"
          type="date"
          className="mt-2"
          required
          defaultValue={dateInputValue(initial.windowStart)}
        />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}end`}>Fin de fenêtre</Label>
        <Input
          id={`${idPrefix}end`}
          name="end"
          type="date"
          className="mt-2"
          required
          defaultValue={dateInputValue(initial.windowEnd)}
        />
      </div>
      <Button type="submit" variant="outline">
        Modifier la fenêtre
      </Button>
    </form>
  );
}

/**
 * Reprise en retour : les matchs d'une autre journée sont recopiés dans celle-ci, receveur
 * et visiteur inversés. L'administrateur choisit la journée aller — l'ordre des retours
 * reste le sien (ADR-0001, addendum).
 */
function MirrorForm({
  idPrefix,
  target,
  matchdays,
  label,
  onSubmit,
}: {
  idPrefix: string;
  target: { _id: Id<"matchdays">; number: number };
  matchdays: { _id: Id<"matchdays">; number: number }[];
  label: string;
  onSubmit: (sourceMatchdayId: Id<"matchdays">, sourceNumber: number) => Promise<void>;
}) {
  const sources = matchdays.filter((matchday) => matchday._id !== target._id);
  if (sources.length === 0) {
    return null;
  }
  return (
    <form
      className="mt-2 flex flex-wrap items-end gap-3 border-t pt-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const sourceId = String(new FormData(event.currentTarget).get("source"));
        const source = sources.find((matchday) => matchday._id === sourceId);
        if (source !== undefined) {
          await onSubmit(source._id, source.number);
        }
      }}
    >
      <div>
        <Label htmlFor={`${idPrefix}source`}>Reprendre en retour</Label>
        <Select id={`${idPrefix}source`} name="source" className="mt-2" required>
          <option value="">Choisir…</option>
          {sources.map((matchday) => (
            <option key={matchday._id} value={matchday._id}>
              {label} {matchday.number}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" variant="outline">
        Créer les matchs retour
      </Button>
      <p className="text-muted-foreground w-full text-xs">
        Les matchs {label === "Plateau" ? "du plateau choisi" : "de la journée choisie"} sont
        recréés ici, receveur et visiteur inversés.
      </p>
    </form>
  );
}

/**
 * Date, heure et salle d'un plateau. La fenêtre de la journée en est déduite : le jour du
 * plateau, en heure de Paris.
 */
function PlateauForm({
  idPrefix,
  initial,
  submitLabel,
  defaultNumber,
  onSubmit,
}: {
  idPrefix: string;
  initial?: { at: number; venue: string };
  submitLabel: string;
  /** Présent à la création seulement : un plateau déplacé garde son numéro. */
  defaultNumber?: number;
  onSubmit: (plateau: { at: number; venue: string }, number?: number) => Promise<void>;
}) {
  const [invalid, setInvalid] = useState(false);
  return (
    <form
      className="mt-2 flex flex-wrap items-end gap-3 border-t pt-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const at = parisTimestampFromInput(String(form.get("at")));
        setInvalid(at === null);
        if (at === null) {
          return;
        }
        await onSubmit(
          { at, venue: String(form.get("venue")) },
          defaultNumber === undefined ? undefined : Number(form.get("number")),
        );
      }}
    >
      {defaultNumber === undefined ? null : (
        <div>
          <Label htmlFor={`${idPrefix}number`}>Numéro</Label>
          <Input
            id={`${idPrefix}number`}
            name="number"
            type="number"
            min={1}
            className="mt-2 w-24"
            required
            defaultValue={String(defaultNumber)}
          />
        </div>
      )}
      <div>
        <Label htmlFor={`${idPrefix}at`}>Date et heure</Label>
        <Input
          id={`${idPrefix}at`}
          name="at"
          type="datetime-local"
          className="mt-2"
          required
          defaultValue={
            initial === undefined
              ? inputValueFromTimestamp(Date.now() + 14 * 86_400_000)
              : inputValueFromTimestamp(initial.at)
          }
        />
      </div>
      <div className="min-w-56 flex-1">
        <Label htmlFor={`${idPrefix}venue`}>Salle</Label>
        <Input
          id={`${idPrefix}venue`}
          name="venue"
          className="mt-2"
          required
          defaultValue={initial?.venue}
        />
      </div>
      <Button type="submit">{submitLabel}</Button>
      {invalid ? <p className="w-full text-sm text-red-600">Date ou heure invalide.</p> : null}
    </form>
  );
}
