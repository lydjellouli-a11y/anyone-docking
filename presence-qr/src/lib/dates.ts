// Dates : stockées en UTC dans la base, affichées à l'heure d'Alger
// (UTC+1, sans heure d'été) au format JJ/MM/AAAA.

export const APP_TIME_ZONE = "Africa/Algiers";

const dateFormatter = new Intl.DateTimeFormat("fr-DZ", {
  timeZone: APP_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("fr-DZ", {
  timeZone: APP_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function parts(formatter: Intl.DateTimeFormat, date: Date) {
  return Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
}

/** « 05/03/2027 » */
export function formatDate(value: Date | string): string {
  const p = parts(dateFormatter, new Date(value));
  return `${p.day}/${p.month}/${p.year}`;
}

/** « 08:30 » */
export function formatTime(value: Date | string): string {
  const p = parts(timeFormatter, new Date(value));
  return `${p.hour}:${p.minute}`;
}

/** « 05/03/2027 08:30 » */
export function formatDateTime(value: Date | string): string {
  return `${formatDate(value)} ${formatTime(value)}`;
}
