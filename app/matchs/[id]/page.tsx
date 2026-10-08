"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { ClubLogo } from "@/components/club-logo";
import { LineupPicker } from "@/components/lineup-picker";
import {
  collectSets,
  emptySetInputs,
  SetScoresInput,
  setInputsFrom,
  type ScoreColumnTeam,
} from "@/components/set-scores-input";
import { SetsTable } from "@/components/sets-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { errorMessage } from "@/lib/errors";
import {
  formatCountdown,
  formatDateTime,
  formatPlateau,
  formatSets,
  formatWindow,
  inputValueFromTimestamp,
  parisTimestampFromInput,
} from "@/lib/format";
import {
  matchdayNoun,
  matchStateLabels,
  matchStateVariant,
  postponementStatusLabels,
  proposalStatusLabels,
} from "@/lib/labels";
import { flagMessage, kindLabel, UPPER_LEVEL_MATCH_LIMIT } from "@/lib/rules/reinforcement";
import { forfeitScore, scoreFormatOf, type MatchFormat } from "@/lib/rules/score";
import { isOutsideWindow, outsideWindowMessage } from "@/lib/rules/window";

export default function MatchPage() {
  const matchId = useParams<{ id: string }>().id as Id<"matches">;
  const match = useQuery(api.matches.get, { matchId });
  const account = useQuery(api.users.me);
  // `history` échoue pour qui n'est pas concerné : on ne l'interroge qu'avec un compte.
  const history = useQuery(api.negotiation.history, account ? { matchId } : "skip");
  const sheet = useQuery(api.sheets.get, account ? { matchId } : "skip");
  // Feuille d'un match terminé : score par set et compositions, lisibles sans compte.
  const publicSheet = useQuery(api.sheets.publicResult, { matchId });
  const championship = useQuery(
    api.championships.get,
    match ? { championshipId: match.championshipId } : "skip",
  );
  const format: MatchFormat = scoreFormatOf(championship?.format ?? "standard");
  const isPlateau = format === "plateau";
  // Les licenciés alignables ne sont lus qu'au moment de transcrire la feuille, et par qui
  // en a la main : tout le club, licences jugées à la date du match.
  const entering =
    match?.state === "confirmed" &&
    history !== undefined &&
    (isPlateau ? history.iAmAdmin : history.iAmHome || history.iAmAdmin);
  const homeCandidates = useQuery(
    api.sheets.lineupCandidates,
    entering && match ? { matchId, teamId: match.homeTeamId } : "skip",
  );
  const awayCandidates = useQuery(
    api.sheets.lineupCandidates,
    entering && match ? { matchId, teamId: match.awayTeamId } : "skip",
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
  const recordResult = useMutation(api.sheets.record);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Deux grilles distinctes : celle du receveur part vide, celle de l'arbitrage part de la
  // feuille contestée. Les mêlerait-on qu'un préremplissage écraserait une saisie en cours.
  const [sheetSets, setSheetSets] = useState(emptySetInputs);
  const [arbitrationSets, setArbitrationSets] = useState(emptySetInputs);
  const [arbitrationSeed, setArbitrationSeed] = useState<string | null>(null);
  const [gridFormat, setGridFormat] = useState<MatchFormat | null>(null);
  const [homeLineup, setHomeLineup] = useState<string[]>([]);
  const [awayLineup, setAwayLineup] = useState<string[]>([]);
  // Plateau : la composition d'une équipe est reprise de son match précédent de la journée.
  const [lineupSeed, setLineupSeed] = useState<string | null>(null);
  // Annonce, au fil de la saisie, qu'une date sort de la fenêtre (ADR-0006).
  const [proposalOutside, setProposalOutside] = useState(false);

  async function guard(action: () => Promise<unknown>, success?: string) {
    setError(null);
    setNotice(null);
    try {
      await action();
      if (success !== undefined) {
        setNotice(success);
      }
    } catch (caught) {
      setError(errorMessage(caught, "Action impossible."));
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

  const homeColumn: ScoreColumnTeam = {
    teamId: match.homeTeamId,
    teamName: match.homeTeamName,
    clubName: match.homeClubName,
    clubLogoUrl: match.homeClubLogoUrl,
  };
  const awayColumn: ScoreColumnTeam = {
    teamId: match.awayTeamId,
    teamName: match.awayTeamName,
    clubName: match.awayClubName,
    clubLogoUrl: match.awayClubLogoUrl,
  };

  // La grille de saisie suit le format du championnat, connu une fois la query revenue :
  // cinq lignes au format standard, deux en plateau. Même motif d'ajustement pendant le rendu.
  if (championship !== undefined && gridFormat !== format) {
    setGridFormat(format);
    setSheetSets(emptySetInputs(format));
  }

  // Reprise de la composition du plateau, une seule fois par match : le repère évite
  // d'écraser une composition ajustée à la main.
  if (isPlateau && homeCandidates !== undefined && awayCandidates !== undefined) {
    const key = `${matchId}`;
    if (key !== lineupSeed) {
      setLineupSeed(key);
      setHomeLineup(homeCandidates.previousOnMatchday);
      setAwayLineup(awayCandidates.previousOnMatchday);
    }
  }

  // Arbitrage : l'administrateur corrige un score, il ne le ressaisit pas. On amorce donc
  // la grille avec la feuille contestée. Motif React d'ajustement d'état pendant le rendu :
  // le repère évite de réécraser les corrections à chaque re-rendu, et le statut le fait
  // repartir si la feuille retombe en litige plus tard.
  const disputedSheet = match.state === "disputed" && sheet ? sheet : null;
  if (disputedSheet !== null) {
    // Le repère décrit la feuille elle-même : il ne bouge pas quand l'administrateur tape,
    // et repart si la feuille contestée change réellement.
    const key = `${disputedSheet.status}:${JSON.stringify(disputedSheet.sets)}`;
    if (key !== arbitrationSeed) {
      setArbitrationSeed(key);
      setArbitrationSets(setInputsFrom(disputedSheet.sets, format));
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <p className="text-muted-foreground text-sm">
        {matchdayNoun(championship?.format)} {match.matchdayNumber}
        {isPlateau && match.slot !== undefined
          ? ` · ${formatPlateau(match.slot)}`
          : ` · ${formatWindow(match.windowStart, match.windowEnd)}`}
        {championship ? ` · ${championship.name}` : ""}
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
        <Badge variant={matchStateVariant[match.state]}>
          {/* Un plateau n'a pas de créneau négocié : confirmé veut dire « à jouer ». */}
          {isPlateau && match.state === "confirmed" ? "À jouer" : matchStateLabels[match.state]}
        </Badge>
        {match.slot === undefined ? (
          <span className="text-muted-foreground text-sm">Créneau à fixer</span>
        ) : (
          <span className="text-sm">
            {formatDateTime(match.slot.at)} · {match.slot.venue}
          </span>
        )}
        {/* Signalement du déroulé administratif (ADR-0006) : pas pour le public. */}
        {history?.slotOutsideWindow ? (
          <Badge variant="secondary">{outsideWindowMessage(match.matchdayNumber)}</Badge>
        ) : null}
        {match.result === undefined ? null : (
          <span className="text-sm font-semibold">
            {formatSets(match.result.homeSets, match.result.awaySets)}
            {match.forfeitAgainst !== undefined
              ? " (forfait)"
              : match.result.winnerTeamId === undefined
                ? " (match nul)"
                : ""}
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
              format={format}
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
                  La date est attendue dans la fenêtre de la journée (
                  {formatWindow(match.windowStart, match.windowEnd)}). Le visiteur valide
                  ensuite, ou son silence vaut accord au bout de 7 jours. Un match avancé ou
                  retardé par arrangement peut se jouer hors fenêtre : il sera signalé, et le
                  visiteur devra valider explicitement.
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
                      const { tacitDeadline, outsideWindow } = await proposeSlot({
                        matchId,
                        at,
                        venue: String(form.get("venue")),
                      });
                      setNotice(
                        outsideWindow
                          ? "Proposition envoyée, hors de la fenêtre de la journée : elle est signalée, et le visiteur doit la valider explicitement."
                          : tacitDeadline === null
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
                      min={inputValueFromTimestamp(now)}
                      onChange={(event) => {
                        const at = parisTimestampFromInput(event.target.value);
                        setProposalOutside(at !== null && isOutsideWindow(at, match));
                      }}
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
                  {proposalOutside ? (
                    <p className="w-full text-sm">
                      <Badge variant="secondary">Hors fenêtre</Badge> Cette date sort de la
                      fenêtre de la journée : pas de validation tacite, le visiteur devra
                      répondre.
                    </p>
                  ) : null}
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
                  {pendingProposal.outsideWindow
                    ? ` ${outsideWindowMessage(match.matchdayNumber)} Votre validation explicite est requise.`
                    : pendingProposal.deadline === null
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

          {match.state === "confirmed" && !playable && !isPlateau ? (
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

          {match.state === "confirmed" && playable && entering ? (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-base">
                  {isPlateau ? "Résultat du plateau" : "Feuille de match"}
                </CardTitle>
                <CardDescription>
                  {isPlateau
                    ? "Saisissez le score des 2 sets et les compositions. Le match est terminé dès l'enregistrement : pas de validation du visiteur. La composition de chaque équipe est reprise de son match précédent du plateau."
                    : "Transcrivez la feuille unique : le score par set et les compositions des deux équipes. Le visiteur validera l'ensemble."}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                <div>
                  <p className="text-sm font-medium">Score par set</p>
                  <div className="mt-2">
                    <SetScoresInput
                      home={homeColumn}
                      away={awayColumn}
                      sets={sheetSets}
                      onChange={setSheetSets}
                      format={format}
                    />
                  </div>
                </div>

                <LineupPicker
                  title={`Composition ${match.homeTeamName}`}
                  players={homeCandidates?.players ?? []}
                  context={homeCandidates?.context ?? null}
                  selected={homeLineup}
                  onToggle={setHomeLineup}
                />
                <LineupPicker
                  title={`Composition ${match.awayTeamName}`}
                  players={awayCandidates?.players ?? []}
                  context={awayCandidates?.context ?? null}
                  selected={awayLineup}
                  onToggle={setAwayLineup}
                />

                <Button
                  className="self-start"
                  onClick={() =>
                    guard(async () => {
                      const payload = {
                        matchId,
                        sets: collectSets(sheetSets),
                        homeLineup: homeLineup as Id<"players">[],
                        awayLineup: awayLineup as Id<"players">[],
                      };
                      if (isPlateau) {
                        await recordResult(payload);
                        setNotice("Résultat enregistré : le match entre au classement.");
                      } else {
                        const { tacitDeadline } = await submitSheet(payload);
                        setNotice(
                          `Feuille envoyée. Sans réponse du visiteur, elle sera validée ${formatCountdown(tacitDeadline)}.`,
                        );
                      }
                      setSheetSets(emptySetInputs(format));
                      setHomeLineup([]);
                      setAwayLineup([]);
                    })
                  }
                >
                  {isPlateau ? "Enregistrer le résultat" : "Envoyer la feuille"}
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
                  format={format}
                />
                <FlaggedLineups
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

          {match.state === "completed" && sheet !== undefined && sheet !== null ? (
            <FlaggedSummary sheet={sheet} />
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
                <div>
                  <p className="text-sm font-medium">Feuille contestée</p>
                  <div className="mt-2">
                    <SetsTable
                      homeTeamName={match.homeTeamName}
                      awayTeamName={match.awayTeamName}
                      sets={sheet.sets}
                      format={format}
                    />
                  </div>
                </div>
                <FlaggedLineups
                  homeTeamName={match.homeTeamName}
                  awayTeamName={match.awayTeamName}
                  sheet={sheet}
                />
                <div>
                  <p className="text-sm font-medium">
                    Score à arrêter{" "}
                    <span className="text-muted-foreground font-normal">
                      (prérempli avec la feuille contestée : corrigez ce qui doit l&apos;être)
                    </span>
                  </p>
                  <div className="mt-2">
                    <SetScoresInput
                      home={homeColumn}
                      away={awayColumn}
                      sets={arbitrationSets}
                      onChange={setArbitrationSets}
                      idPrefix="Arbitrage — "
                      format={format}
                    />
                  </div>
                </div>
                <Button
                  className="self-start"
                  onClick={() =>
                    guard(
                      () => settleDispute({ matchId, sets: collectSets(arbitrationSets) }),
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
                  Le match est terminé sur un score conventionnel de{" "}
                  {forfeitScore(format).length}-0 (25-0 par set).
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

          {isPlateau ? null : (
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
                  {proposal.outsideWindow ? (
                    <Badge variant="secondary" className="ml-2">
                      Hors fenêtre
                    </Badge>
                  ) : null}
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
          )}
        </>
      )}
    </main>
  );
}

type PrivateSheet = NonNullable<FunctionReturnType<typeof api.sheets.get>>;
type PrivateLineupPlayer = PrivateSheet["homeLineup"][number];

/** La situation d'un joueur aligné, et ses signalements, à côté de son nom. */
function ReinforcementBadges({
  player,
  quota,
}: {
  player: PrivateLineupPlayer;
  quota: PrivateSheet["quota"];
}) {
  const { reinforcement } = player;
  const label = kindLabel(reinforcement.kind);
  return (
    <>
      {label === null ? null : (
        <Badge variant="muted">
          {label}
          {reinforcement.originTeamName === null ? "" : ` · ${reinforcement.originTeamName}`}
          {reinforcement.kind === "upward"
            ? ` · ${reinforcement.upperMatchNumber}/${UPPER_LEVEL_MATCH_LIMIT}`
            : ""}
        </Badge>
      )}
      {reinforcement.flags.map((flag) => (
        <Badge key={flag} variant="secondary">
          {flagMessage(flag, { playerId: player._id, ...reinforcement }, quota)}
        </Badge>
      ))}
    </>
  );
}

/**
 * Compositions d'une feuille, avec renforts et signalements : ce que le visiteur doit voir
 * avant de valider, et l'administrateur avant de trancher. Jamais sur la feuille publique.
 */
function FlaggedLineups({
  homeTeamName,
  awayTeamName,
  sheet,
}: {
  homeTeamName: string;
  awayTeamName: string;
  sheet: PrivateSheet;
}) {
  const column = (teamName: string, lineup: PrivateLineupPlayer[]) => (
    <div>
      <p className="font-medium">{teamName}</p>
      <ul className="mt-1 flex flex-col gap-1">
        {lineup.map((player) => (
          <li key={player._id} className="flex flex-wrap items-center gap-2">
            <Link href={`/joueurs/${player._id}`} className="text-muted-foreground hover:underline">
              {player.name}
            </Link>
            <ReinforcementBadges player={player} quota={sheet.quota} />
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <div className="grid gap-4 text-sm sm:grid-cols-2">
      {column(homeTeamName, sheet.homeLineup)}
      {column(awayTeamName, sheet.awayLineup)}
    </div>
  );
}

/** Pour un match terminé : les renforts signalés, rappelés aux comptes concernés. */
function FlaggedSummary({ sheet }: { sheet: PrivateSheet }) {
  const flagged = [...sheet.homeLineup, ...sheet.awayLineup].filter(
    (player) => player.reinforcement.flags.length > 0,
  );
  if (flagged.length === 0) {
    return null;
  }
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-base">Renforts signalés</CardTitle>
        <CardDescription>
          La feuille a été acceptée : ces signalements restent visibles du comité.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 text-sm">
        {flagged.map((player) => (
          <p key={player._id} className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{player.name}</span>
            <ReinforcementBadges player={player} quota={sheet.quota} />
          </p>
        ))}
      </CardContent>
    </Card>
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
