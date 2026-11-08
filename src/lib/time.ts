// Time helpers kept out of component files so reading the clock doesn't trip
// the react-hooks/purity lint in Server Components.

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8 (Asia/Taipei)

const TAIPEI_DATE = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const TAIPEI_DATE_TIME = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "2026/11/09" in Asia/Taipei (zh-TW already uses slashes). */
export function formatTaipeiDate(date: Date): string {
  return TAIPEI_DATE.format(date);
}

/** "2026/11/09 09:30" in Asia/Taipei. */
export function formatTaipeiDateTime(date: Date): string {
  return TAIPEI_DATE_TIME.format(date);
}

/** The UTC instant of the most recent local midnight in Asia/Taipei. */
export function startOfTodayTaipei(): Date {
  const local = new Date(Date.now() + TAIPEI_OFFSET_MS);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) -
      TAIPEI_OFFSET_MS,
  );
}
