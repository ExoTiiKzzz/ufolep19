/**
 * Renforts : qui, sur une composition, ne joue pas dans l'équipe de sa feuille verte.
 *
 * Module pur, partagé par la mutation de saisie (qui enregistre la feuille sans rien
 * refuser), par la feuille affichée au visiteur et par l'écran de composition, qui annonce
 * les signalements avant l'envoi.
 *
 * Un renfort n'est **jamais refusé** : il est signalé, et c'est aux équipes d'en juger
 * (ADR-0005). Les cas signalés :
 *
 * - **sans feuille verte** dans le circuit du match : le joueur n'a pas de niveau d'origine ;
 * - **descente** : un joueur d'un niveau plus fort (numéro plus petit) aligné plus bas —
 *   sauf dans un championnat à quota, où il est admis dans la limite du quota ;
 * - **au-delà de 3 matchs** joués au-dessus de son niveau d'origine, tous niveaux supérieurs
 *   confondus : chaque nouveau match vers le haut est signalé, à partir du 4ᵉ ;
 * - **quota dépassé** dans un championnat à quota (le mixte) : plus de renforts venus d'en
 *   haut que permis, ou une composition qui dépasse le total qu'ils ne doivent que compléter.
 *
 * Un renfort au **même niveau** (D3 ↔ mixte) est affiché, mais ni signalé ni compté.
 */

/** Matchs qu'un joueur peut jouer au-dessus de son niveau avant d'être signalé. */
export const UPPER_LEVEL_MATCH_LIMIT = 3;

/**
 * Quota d'un championnat qui admet des renforts venus de niveaux plus forts : au plus
 * `maxPlayers` d'entre eux, et seulement pour compléter la composition jusqu'à
 * `completeTo` joueurs. Le mixte de l'UFOLEP 19 : 2 joueurs, pour compléter à 6.
 */
export type ReinforcementQuota = { maxPlayers: number; completeTo: number };

/** Le quota du mixte, proposé par défaut à la création d'un championnat à quota. */
export const DEFAULT_QUOTA: ReinforcementQuota = { maxPlayers: 2, completeTo: 6 };

/** Situation d'un joueur vis-à-vis de l'équipe où il est aligné. */
export type ReinforcementKind = "own" | "sameLevel" | "upward" | "downward" | "noRoster";

export type ReinforcementFlag = "noRoster" | "downward" | "upperLimit" | "quotaExceeded";

/** Ce qu'il faut savoir d'un joueur aligné pour le classer. */
export type LineupCandidate = {
  playerId: string;
  /** Équipe de sa feuille verte dans le circuit du match, `null` s'il n'en a pas. */
  originTeamId: string | null;
  /** Niveau du championnat de cette équipe, `null` sans feuille verte. */
  originLevel: number | null;
  /** Matchs déjà joués au-dessus de son niveau d'origine, **avant** celui-ci. */
  upperMatchesBefore: number;
};

export type PlayerAssessment = {
  playerId: string;
  kind: ReinforcementKind;
  flags: ReinforcementFlag[];
  /** Rang de ce match parmi ceux joués au-dessus de son niveau ; 0 s'il ne monte pas. */
  upperMatchNumber: number;
};

/** L'équipe alignée et le championnat où elle joue. */
export type LineupContext = {
  teamId: string;
  level: number;
  quota: ReinforcementQuota | null;
};

/** Classe un joueur seul, sans le quota, qui dépend de toute la composition. */
function classify(context: LineupContext, candidate: LineupCandidate): PlayerAssessment {
  const base = { playerId: candidate.playerId, upperMatchNumber: 0 };
  if (candidate.originTeamId === context.teamId) {
    return { ...base, kind: "own", flags: [] };
  }
  if (candidate.originTeamId === null || candidate.originLevel === null) {
    return { ...base, kind: "noRoster", flags: ["noRoster"] };
  }
  if (candidate.originLevel === context.level) {
    return { ...base, kind: "sameLevel", flags: [] };
  }
  if (candidate.originLevel > context.level) {
    const upperMatchNumber = candidate.upperMatchesBefore + 1;
    return {
      ...base,
      kind: "upward",
      upperMatchNumber,
      flags: upperMatchNumber > UPPER_LEVEL_MATCH_LIMIT ? ["upperLimit"] : [],
    };
  }
  // Descente : admise dans un championnat à quota, signalée partout ailleurs.
  return { ...base, kind: "downward", flags: context.quota === null ? ["downward"] : [] };
}

/** Classe chaque joueur d'une composition et pose ses signalements. */
export function assessLineup(
  context: LineupContext,
  candidates: LineupCandidate[],
): PlayerAssessment[] {
  const assessed = candidates.map((candidate) => classify(context, candidate));
  if (context.quota === null) {
    return assessed;
  }
  const fromAbove = assessed.filter((player) => player.kind === "downward");
  const overQuota =
    fromAbove.length > context.quota.maxPlayers ||
    (fromAbove.length > 0 && assessed.length > context.quota.completeTo);
  if (overQuota) {
    for (const player of fromAbove) {
      player.flags.push("quotaExceeded");
    }
  }
  return assessed;
}

/** Libellé court de la situation, pour une pastille à côté du nom. */
export function kindLabel(kind: ReinforcementKind): string | null {
  switch (kind) {
    case "own":
      return null;
    case "sameLevel":
      return "renfort, même niveau";
    case "upward":
      return "renfort, monte";
    case "downward":
      return "renfort, descend";
    case "noRoster":
      return "sans feuille verte";
  }
}

/** Phrase de signalement, écrite pour être lue par le visiteur et par l'administrateur. */
export function flagMessage(
  flag: ReinforcementFlag,
  assessment: PlayerAssessment,
  quota: ReinforcementQuota | null,
): string {
  switch (flag) {
    case "noRoster":
      return "n'est sur aucune feuille verte de ce circuit";
    case "downward":
      return "vient d'un niveau plus fort";
    case "upperLimit":
      return `${assessment.upperMatchNumber}ᵉ match au-dessus de son niveau (${UPPER_LEVEL_MATCH_LIMIT} au plus)`;
    case "quotaExceeded":
      return quota === null
        ? "quota de renforts dépassé"
        : `quota dépassé : ${quota.maxPlayers} renforts au plus, pour compléter à ${quota.completeTo}`;
  }
}
