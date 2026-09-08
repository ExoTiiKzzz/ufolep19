import { parisParts, parisWallClock, REFERENCE_TIME_ZONE } from "./rules/paris-time";

const dateTimeFormat = new Intl.DateTimeFormat("fr-FR", {
  timeZone: REFERENCE_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  timeZone: REFERENCE_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** « sam. 10 janv. 2026, 20:00 », toujours en heure de Paris. */
export function formatDateTime(at: number): string {
  return dateTimeFormat.format(new Date(at));
}

export function formatDate(at: number): string {
  return dateFormat.format(new Date(at));
}

/** « du 5 au 18 janv. 2026 » */
export function formatWindow(start: number, end: number): string {
  return `du ${dateFormat.format(new Date(start))} au ${dateFormat.format(new Date(end))}`;
}

/** Compte à rebours lisible : « dans 3 jours », « dans 5 h », « échéance dépassée ». */
export function formatCountdown(at: number, now = Date.now()): string {
  const ms = at - now;
  if (ms <= 0) {
    return "échéance dépassée";
  }
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) {
    return `dans ${Math.max(1, Math.floor(ms / 60_000))} min`;
  }
  if (hours < 48) {
    return `dans ${hours} h`;
  }
  // Arrondi, et non troncature : une échéance à 7 jours moins deux heures reste
  // « dans 7 jours » plutôt que « dans 6 jours ».
  return `dans ${Math.round(hours / 24)} jours`;
}

/**
 * Convertit la valeur d'un `<input type="datetime-local">` en instant, en l'interprétant
 * comme une heure murale **parisienne** — et non comme l'heure du navigateur, qui peut
 * être ailleurs.
 */
export function parisTimestampFromInput(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (match === null) {
    return null;
  }
  const [, year, month, day, hour, minute] = match.map(Number);
  return parisWallClock(year, month, day, hour, minute);
}

/** Valeur d'un `<input type="datetime-local">` pour un instant donné, en heure de Paris. */
export function inputValueFromTimestamp(at: number): string {
  const p = parisParts(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** Valeur d'un `<input type="date">` pour un instant donné, en heure de Paris. */
export function dateInputValue(at: number): string {
  const p = parisParts(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Instant correspondant au début (ou à la fin) d'un jour saisi dans un `<input type="date">`. */
export function parisDayBounds(value: string, edge: "start" | "end"): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    return null;
  }
  const [, year, month, day] = match.map(Number);
  return edge === "start"
    ? parisWallClock(year, month, day, 0, 0, 0, 0)
    : parisWallClock(year, month, day, 23, 59, 59, 999);
}

/** Score d'un match sous forme « 3 - 1 ». */
export function formatSets(homeSets: number, awaySets: number): string {
  return `${homeSets} - ${awaySets}`;
}
