"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { ClubLogo } from "@/components/club-logo";
import { SetsTable } from "@/components/sets-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  formatCountdown,
  formatDateTime,
  formatSets,
  formatWindow,
  inputValueFromTimestamp,
  parisTimestampFromInput,
} from "@/lib/format";
import {
  matchStateLabels,
  matchStateVariant,
  postponementStatusLabels,
  proposalStatusLabels,
} from "@/lib/labels";

const EMPTY_SETS = [0, 1, 2, 3, 4].map(() => ({ home: "", away: "" }));

export default function MatchPage() {
  const matchId = useParams<{ id: string }>().id as Id<"matches">;
  const match = useQuery(api.matches.get, { matchId });
  const account = useQuery(api.users.me);
  // `history` échoue pour qui n'est pas concerné : on ne l'interroge qu'avec un compte.
  const history = useQuery(api.negotiation.history, account ? { matchId } : "skip");
  const sheet = useQuery(api.sheets.get, account ? { matchId } : "skip");
  // Feuille d'un match terminé : score par set et compositions, lisibles sans compte.
  const publicSheet = useQuery(api.sheets.publicResult, { matchId });
  const homeRoster = useQuery(
    api.roster.listByTeam,
    account && match ? { teamId: match.homeTeamId } : "skip",
  );
  const awayRoster = useQuery(
    api.roster.listByTeam,
    account && match ? { teamId: match.awayTeamId } : "skip",
  );

  const proposeSlot = useMutation(api.negotiation.proposeSlot);
  const acceptSlot = useMutation(api.negotiation.acceptSlot);
  const rejectSlot = useMutation(api.negotiation.rejectSlot);
  const requestPostponement = useMutation(api.negotiation.requestPostponement);
  const respondToPostponement = useMutation(api.negotiation.respondToPostponement);
  const imposePostponement = useMutation(api.negotiation.imposePostponement);
  const submitSheet = useMutation(api.sheets.submit);
  const validateSheet = useMutation(api.sheets.validate);
  const disputeSheet = useMutation(api.sheets.dispute);
  const settleDispute = useMutation(api.sheets.settleDispute);
  const forfeit = useMutation(api.sheets.forfeit);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sets, setSets] = useState(EMPTY_SETS);
  const [homeLineup, setHomeLineup] = useState<string[]>([]);
  const [awayLineup, setAwayLineup] = useState<string[]>([]);

  async function guard(action: () => Promise<unknown>, success?: string) {
    setError(null);
    setNotice(null);
    try {
      await action();
      if (success !== undefined) {
        setNotice(success);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action impossible.");
    }
  }

  if (match === undefined) {
    return <main className="mx-auto max-w-3xl px-6 py-10 text-sm">Chargement…</main>;
  }
  if (match === null) {
    return <main className="mx-auto max-w-3xl px-6 py-10 text-sm">Match inconnu.</main>;
  }

  const now = Date.now();
  const pendingProposal = history?.proposals.find((proposal) => proposal.status === "pending");
  const pendingPostponement = history?.postponements.find(
    (request) => request.status === "pending",
  );
  const playable = match.slot !== undefined && now >= match.slot.at;
  const collectedSets = sets
    .filter((set) => set.home !== "" || set.away !== "")
    .map((set) => ({ home: Number(set.home), away: Number(set.away) }));

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <p className="text-muted-foreground text-sm">
        Journée {match.matchdayNumber} · {formatWindow(match.windowStart, match.windowEnd)}
      </p>
      <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
        <ClubLogo name={match.homeClubName} logoUrl={match.homeClubLogoUrl} size={36} />
        <Link href={`/equipes/${match.homeTeamId}`} className="hover:underline">
          {match.homeTeamName}
        </Link>
        <span className="text-muted-foreground">—</span>
        <ClubLogo name={match.awayClubName} logoUrl={match.awayClubLogoUrl} size={36} />
        <Link href={`/equipes/${match.awayTeamId}`} className="hover:underline">
          {match.awayTeamName}
        </Link>
      </h1>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Badge variant={matchStateVariant[match.state]}>{matchStateLabels[match.state]}</Badge>
        {match.slot === undefined ? (
          <span className="text-muted-foreground text-sm">Créneau à fixer</span>
        ) : (
          <span className="text-sm">
            {formatDateTime(match.slot.at)} · {match.slot.venue}
          </span>
        )}
        {match.result === undefined ? null : (
          <span className="text-sm font-semibold">
            {formatSets(match.result.homeSets, match.result.awaySets)}
            {match.forfeitAgainst === undefined ? "" : " (forfait)"}
          </span>
        )}
      </div>

      {error === null ? null : <p className="mt-4 text-sm text-red-600">{error}</p>}
      {notice === null ? null : <p className="mt-4 text-sm text-green-700">{notice}</p>}

      {publicSheet === undefined || publicSheet === null ? null : (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Feuille de match</CardTitle>
            {publicSheet.isForfeit ? <CardDescription>Forfait</CardDescription> : null}
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <SetsTable
              homeTeamName={match.homeTeamName}
              awayTeamName={match.awayTeamName}
              sets={publicSheet.sets}
            />
            {publicSheet.homeLineup.length === 0 && publicSheet.awayLineup.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Aucune composition : le match ne s&apos;est pas joué.
              </p>
            ) : (
              <LineupSummary
                homeTeamName={match.homeTeamName}
                awayTeamName={match.awayTeamName}
                sheet={publicSheet}
              />
            )}
          </CardContent>
        </Card>
      )}

      {history === undefined ? null : (
        <>
          {pendingPostponement !== undefined && !pendingPostponement.requestedByMe ? (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-base">Demande de report à trancher</CardTitle>
                <CardDescription>
                  {pendingPostponement.requestedByName} : « {pendingPostponement.reason} »
                </CardDescription>
              </CardHeader>
              <CardContent className="flex gap-3">
                <Button
                  onClick={() =>
                    guard(
                      () => respondToPostponement({ matchId, accept: true }),
                      "Report accepté : le match retourne en négociation.",
                    )
                  }
                >
                  Accepter le report
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    guard(
                      () => respondToPostponement({ matchId, accept: false }),
                      "Report refusé : le créneau tient.",
                    )
                  }
                >
                  Refuser
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {match.state === "planned" && (history.iAmHome || history.iAmAdmin) ? (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-base">Proposer un créneau</CardTitle>
                <CardDescription>
                  La date doit tomber dans la fenêtre de la journée. Le visiteur valide ensuite,
                  ou son silence vaut accord au bout de 7 jours.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="flex flex-wrap items-end gap-3"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    const at = parisTimestampFromInput(String(form.get("at")));
                    if (at === null) {
                      setError("Date ou heure invalide.");
                      return;
                    }
                    await guard(async () => {
                      const { tacitDeadline } = await proposeSlot({
                        matchId,
                        at,
                        venue: String(form.get("venue")),
                      });
                      setNotice(
                        tacitDeadline === null
                          ? "Proposition envoyée. Le créneau est trop proche pour un accord tacite : le visiteur doit valider explicitement."
                          : `Proposition envoyée. Sans réponse, elle sera acceptée ${formatCountdown(tacitDeadline)}.`,
                      );
                    });
                  }}
                >
                  <div>
                    <Label htmlFor="at">Date et heure</Label>
                    <Input
                      id="at"
                      name="at"
                      type="datetime-local"
                      className="mt-2"
                      required
                      min={inputValueFromTimestamp(Math.max(match.windowStart, now))}
                      max={inputValueFromTimestamp(match.windowEnd)}
                      defaultValue={inputValueFromTimestamp(
                        Math.max(match.windowStart, now + 7 * 86_400_000),
                      )}
                    />
                  </div>
                  <div className="min-w-56 flex-1">
                    <Label htmlFor="venue">Lieu</Label>
                    <Input
                      id="venue"
                      name="venue"
                      className="mt-2"
                      required
                      defaultValue={history.defaultVenue}
                    />
                  </div>
                  <Button type="submit">Proposer</Button>
                </form>
              </CardContent>
            </Card>
          ) : null}

          {match.state === "awaitingSlot" &&
          pendingProposal !== undefined &&
          (history.iAmAway || history.iAmAdmin) ? (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-base">Créneau proposé</CardTitle>
                <CardDescription>
                  {formatDateTime(pendingProposal.at)} · {pendingProposal.venue} — proposé par{" "}
                  {pendingProposal.proposedByName}.
                  {pendingProposal.deadline === null
                    ? " Le créneau est proche : votre validation explicite est requise."
                    : ` Sans réponse, il sera accepté ${formatCountdown(pendingProposal.deadline)}.`}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex gap-3">
                <Button
                  onClick={() => guard(() => acceptSlot({ matchId }), "Créneau confirmé.")}
                >
                  Valider ce créneau
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    guard(
                      () => rejectSlot({ matchId }),
                      "Créneau refusé : le receveur en proposera un autre.",
                    )
                  }
                >
                  Refuser
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {match.state === "confirmed" && !playable ? (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-base">Demander un report</CardTitle>
                <CardDescription>
                  L&apos;adversaire devra l&apos;accepter. Après l&apos;heure du match, un report
                  n&apos;est plus possible.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="flex flex-col gap-3"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    const element = event.currentTarget;
                    await guard(async () => {
                      await requestPostponement({
                        matchId,
                        reason: String(form.get("reason")),
                      });
                      element.reset();
                    }, "Demande de report envoyée.");
                  }}
                >
                  <div>
                    <Label htmlFor="reason">Motif</Label>
                    <Textarea
                      id="reason"
                      name="reason"
                      className="mt-2"
                      required
                      placeholder="Gymnase indisponible, effectif décimé…"
                    />
                  </div>
                  <div className="flex gap-3">
                    <Button type="submit" variant="outline">
                      Demander le report
                    </Button>
                    {history.iAmAdmin ? (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          guard(
                            () =>
                              imposePostponement({
                                matchId,
                                reason: "Report imposé par le comité.",
                              }),
                            "Report imposé.",
                          )
                        }
                      >
                        Imposer le report (comité)
                      </Button>
                    ) : null}
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : null}

          {match.state === "confirmed" && playable && (history.iAmHome || history.iAmAdmin) ? (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-base">Feuille de match</CardTitle>
                <CardDescription>
                  Transcrivez la feuille unique : le score par set et les compositions des deux
                  équipes. Le visiteur validera l&apos;ensemble.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                <div>
                  <p className="text-sm font-medium">Score par set</p>
                  <div className="mt-2 flex flex-col gap-2">
                    {sets.map((set, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <span className="text-muted-foreground w-16 text-sm">
                          Set {index + 1}
                        </span>
                        <Input
                          type="number"
                          min={0}
                          className="w-20"
                          value={set.home}
                          aria-label={`Set ${index + 1} ${match.homeTeamName}`}
                          onChange={(event) =>
                            setSets((previous) =>
                              previous.map((row, position) =>
                                position === index
                                  ? { ...row, home: event.target.value }
                                  : row,
                              ),
                            )
                          }
                        />
                        <span className="text-muted-foreground">—</span>
                        <Input
                          type="number"
                          min={0}
                          className="w-20"
                          value={set.away}
                          aria-label={`Set ${index + 1} ${match.awayTeamName}`}
                          onChange={(event) =>
                            setSets((previous) =>
                              previous.map((row, position) =>
                                position === index
                                  ? { ...row, away: event.target.value }
                                  : row,
                              ),
                            )
                          }
                        />
                        <span className="text-muted-foreground text-xs">
                          {index === 4 ? "tie-break, 15 points" : "25 points"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <LineupPicker
                  title={`Composition ${match.homeTeamName}`}
                  players={homeRoster ?? []}
                  selected={homeLineup}
                  onToggle={setHomeLineup}
                />
                <LineupPicker
                  title={`Composition ${match.awayTeamName}`}
                  players={awayRoster ?? []}
                  selected={awayLineup}
                  onToggle={setAwayLineup}
                />

                <Button
                  className="self-start"
                  onClick={() =>
                    guard(async () => {
                      const { tacitDeadline } = await submitSheet({
                        matchId,
                        sets: collectedSets,
                        homeLineup: homeLineup as Id<"players">[],
                        awayLineup: awayLineup as Id<"players">[],
                      });
                      setSets(EMPTY_SETS);
                      setHomeLineup([]);
                      setAwayLineup([]);
                      setNotice(
                        `Feuille envoyée. Sans réponse du visiteur, elle sera validée ${formatCountdown(tacitDeadline)}.`,
                      );
                    })
                  }
                >
                  Envoyer la feuille
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {match.state === "awaitingSheet" && sheet !== undefined && sheet !== null ? (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-base">Feuille à valider</CardTitle>
                <CardDescription>
                  {sheet.deadline === null
                    ? "Votre validation est requise."
                    : `Validation tacite ${formatCountdown(sheet.deadline)}.`}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <SetsTable
                  homeTeamName={match.homeTeamName}
                  awayTeamName={match.awayTeamName}
                  sets={sheet.sets}
                />
                <LineupSummary
                  homeTeamName={match.homeTeamName}
                  awayTeamName={match.awayTeamName}
                  sheet={sheet}
                />
                {sheet.submittedByMe && !history.iAmAdmin ? (
                  <p className="text-muted-foreground text-sm">
                    Vous avez saisi cette feuille : sa validation revient à l&apos;équipe adverse.
                  </p>
                ) : (
                  <form
                    className="flex flex-col gap-3"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      await guard(
                        () =>
                          disputeSheet({ matchId, reason: String(form.get("reason")) }),
                        "Feuille contestée : le comité tranchera.",
                      );
                    }}
                  >
                    <Button
                      type="button"
                      onClick={() =>
                        guard(
                          () => validateSheet({ matchId }),
                          "Feuille validée : le match entre au classement.",
                        )
                      }
                    >
                      Valider la feuille
                    </Button>
                    <div>
                      <Label htmlFor="dispute">Ou contester, avec un motif</Label>
                      <Textarea id="dispute" name="reason" className="mt-2" required />
                    </div>
                    <Button type="submit" variant="outline">
                      Contester
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          ) : null}

          {match.state === "disputed" && history.iAmAdmin && sheet ? (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-base">Arbitrer le litige</CardTitle>
                <CardDescription>
                  Motif de la contestation : « {sheet.disputeReason ?? "non précisé"} ».
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <SetsTable
                  homeTeamName={match.homeTeamName}
                  awayTeamName={match.awayTeamName}
                  sets={sheet.sets}
                />
                <div className="flex flex-col gap-2">
                  {sets.map((set, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <span className="text-muted-foreground w-16 text-sm">Set {index + 1}</span>
                      <Input
                        type="number"
                        min={0}
                        className="w-20"
                        value={set.home}
                        aria-label={`Arbitrage set ${index + 1} receveur`}
                        onChange={(event) =>
                          setSets((previous) =>
                            previous.map((row, position) =>
                              position === index ? { ...row, home: event.target.value } : row,
                            ),
                          )
                        }
                      />
                      <span className="text-muted-foreground">—</span>
                      <Input
                        type="number"
                        min={0}
                        className="w-20"
                        value={set.away}
                        aria-label={`Arbitrage set ${index + 1} visiteur`}
                        onChange={(event) =>
                          setSets((previous) =>
                            previous.map((row, position) =>
                              position === index ? { ...row, away: event.target.value } : row,
                            ),
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
                <Button
                  className="self-start"
                  onClick={() =>
                    guard(
                      () => settleDispute({ matchId, sets: collectedSets }),
                      "Litige tranché : le score est arrêté.",
                    )
                  }
                >
                  Arrêter ce score
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {history.iAmAdmin && match.state !== "completed" ? (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-base">Prononcer un forfait</CardTitle>
                <CardDescription>
                  Le match est terminé sur un score conventionnel de 3-0 (25-0 par set).
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  onClick={() =>
                    guard(
                      () => forfeit({ matchId, forfeitingTeamId: match.homeTeamId }),
                      "Forfait enregistré.",
                    )
                  }
                >
                  Forfait de {match.homeTeamName}
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    guard(
                      () => forfeit({ matchId, forfeitingTeamId: match.awayTeamId }),
                      "Forfait enregistré.",
                    )
                  }
                >
                  Forfait de {match.awayTeamName}
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Historique</CardTitle>
              <CardDescription>
                Rien n&apos;est effacé : les propositions refusées et les demandes de report
                restent lisibles.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {history.proposals.length === 0 && history.postponements.length === 0 ? (
                <p className="text-muted-foreground">Aucune négociation engagée.</p>
              ) : null}
              {history.proposals.map((proposal) => (
                <p key={proposal._id}>
                  <span className="text-muted-foreground">Créneau</span>{" "}
                  {formatDateTime(proposal.at)} · {proposal.venue} —{" "}
                  {proposalStatusLabels[proposal.status]} (proposé par {proposal.proposedByName})
                </p>
              ))}
              {history.postponements.map((request) => (
                <p key={request._id}>
                  <span className="text-muted-foreground">Report</span> « {request.reason} » —{" "}
                  {postponementStatusLabels[request.status]} (demandé par{" "}
                  {request.requestedByName})
                </p>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}

function LineupPicker({
  title,
  players,
  selected,
  onToggle,
}: {
  title: string;
  players: { _id: string; firstName: string; lastName: string }[];
  selected: string[];
  onToggle: (next: string[]) => void;
}) {
  return (
    <div>
      <p className="text-sm font-medium">
        {title}{" "}
        <span className="text-muted-foreground font-normal">
          ({selected.length} sélectionné(s), 12 maximum)
        </span>
      </p>
      {players.length === 0 ? (
        <p className="text-muted-foreground mt-2 text-sm">Effectif vide.</p>
      ) : (
        <div className="mt-2 grid gap-1 sm:grid-cols-2">
          {players.map((player) => (
            <label key={player._id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(player._id)}
                onChange={(event) =>
                  onToggle(
                    event.target.checked
                      ? [...selected, player._id]
                      : selected.filter((id) => id !== player._id),
                  )
                }
              />
              {player.lastName.toUpperCase()} {player.firstName}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function LineupSummary({
  homeTeamName,
  awayTeamName,
  sheet,
}: {
  homeTeamName: string;
  awayTeamName: string;
  sheet: { homeLineup: { _id: string; name: string }[]; awayLineup: { _id: string; name: string }[] };
}) {
  return (
    <div className="grid gap-4 text-sm sm:grid-cols-2">
      <div>
        <p className="font-medium">{homeTeamName}</p>
        <ul className="text-muted-foreground mt-1">
          {sheet.homeLineup.map((player) => (
            <li key={player._id}>
              <Link href={`/joueurs/${player._id}`} className="hover:underline">
                {player.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="font-medium">{awayTeamName}</p>
        <ul className="text-muted-foreground mt-1">
          {sheet.awayLineup.map((player) => (
            <li key={player._id}>
              <Link href={`/joueurs/${player._id}`} className="hover:underline">
                {player.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
