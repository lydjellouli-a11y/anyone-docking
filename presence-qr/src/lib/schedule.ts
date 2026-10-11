// Planification : conversion d'une date/heure saisie « à Alger » en instant
// UTC, et génération de séances hebdomadaires.
//
// L'Algérie est à UTC+1 toute l'année (pas d'heure d'été depuis 1981) : le
// décalage fixe ci-dessous est donc exact.
const ALGIERS_OFFSET = "+01:00";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const MAX_WEEKLY_SESSIONS = 40;

export const WEEKDAYS = [
  { value: 0, label: "Dimanche" },
  { value: 1, label: "Lundi" },
  { value: 2, label: "Mardi" },
  { value: 3, label: "Mercredi" },
  { value: 4, label: "Jeudi" },
  { value: 5, label: "Vendredi" },
  { value: 6, label: "Samedi" },
] as const;

/** Refuse les dates inexistantes comme le 30/02. */
function isRealDate(date: string): boolean {
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

/** « 2026-10-12 » + « 08:30 » (heure d'Alger) → ISO UTC « 2026-10-12T07:30:00.000Z ». */
export function algiersToUtcIso(date: string, time: string): string {
  if (!DATE_RE.test(date) || !TIME_RE.test(time)) {
    throw new Error("Date ou heure invalide");
  }
  if (!isRealDate(date)) throw new Error("Date invalide");
  return new Date(`${date}T${time}:00${ALGIERS_OFFSET}`).toISOString();
}

/**
 * Toutes les dates (AAAA-MM-JJ) tombant le jour `weekday` (0 = dimanche)
 * entre `from` et `to` inclus.
 */
export function weeklyDates(from: string, to: string, weekday: number): string[] {
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || !isRealDate(from) || !isRealDate(to)) {
    throw new Error("Date invalide");
  }
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    throw new Error("Période invalide");
  }
  const first = new Date(start);
  first.setUTCDate(first.getUTCDate() + ((weekday - first.getUTCDay() + 7) % 7));
  const dates: string[] = [];
  for (let d = first; d <= end; d.setUTCDate(d.getUTCDate() + 7)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}
