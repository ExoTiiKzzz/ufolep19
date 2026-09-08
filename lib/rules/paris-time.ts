/**
 * Calculs de calendrier dans le fuseau de référence du projet.
 *
 * Les instants sont stockés en millisecondes UTC, mais les règles parlent en heure
 * locale : « la veille du créneau », « le jour du match », « la fenêtre de la journée ».
 * Sans ce module, un match du 1er janvier à 00 h 30 tomberait la veille en UTC.
 */
export const REFERENCE_TIME_ZONE = "Europe/Paris";

type Parts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: REFERENCE_TIME_ZONE,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Décompose un instant en date et heure locales de Paris. */
export function parisParts(at: number): Parts {
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(new Date(at))) {
    if (part.type !== "literal") {
      parts[part.type] = part.value;
    }
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // `hour12: false` peut rendre « 24 » pour minuit selon l'environnement.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/**
 * Décalage UTC de Paris, en millisecondes, à l'instant donné.
 *
 * `Intl` ne rend pas les millisecondes : on les reprend de l'instant lui-même, sans quoi
 * le décalage serait faux de la partie fractionnaire et se propagerait au résultat.
 */
function parisOffset(at: number): number {
  const p = parisParts(at);
  const ms = ((at % 1000) + 1000) % 1000;
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, ms) - at;
}

/**
 * Instant correspondant à une heure murale parisienne.
 *
 * Deux passes : la première estime le décalage, la seconde le corrige si l'estimation
 * tombait du mauvais côté d'un changement d'heure.
 */
export function parisWallClock(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0,
): number {
  const naive = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const firstPass = naive - parisOffset(naive);
  return naive - parisOffset(firstPass);
}

/** Dernier instant de la veille du jour parisien de `at` (23:59:59.999). */
export function endOfDayBefore(at: number): number {
  const p = parisParts(at);
  // `Date.UTC` gère le passage au mois ou à l'année précédente pour `day - 1`.
  const previous = new Date(Date.UTC(p.year, p.month - 1, p.day - 1));
  return parisWallClock(
    previous.getUTCFullYear(),
    previous.getUTCMonth() + 1,
    previous.getUTCDate(),
    23,
    59,
    59,
    999,
  );
}

/** Vrai si les deux instants tombent le même jour parisien. */
export function isSameParisDay(a: number, b: number): boolean {
  const pa = parisParts(a);
  const pb = parisParts(b);
  return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day;
}
