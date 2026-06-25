// Time helpers kept out of component files so reading the clock doesn't trip
// the react-hooks/purity lint in Server Components.

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8 (Asia/Taipei)

/** The UTC instant of the most recent local midnight in Asia/Taipei. */
export function startOfTodayTaipei(): Date {
  const local = new Date(Date.now() + TAIPEI_OFFSET_MS);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) -
      TAIPEI_OFFSET_MS,
  );
}
