/**
 * Pull a leading YYMMDD date off a title (e.g. "260621 - Frank vs Cindy" →
 * { recordedOn: 2026-06-21, title: "Frank vs Cindy" }). Returns the original
 * title when there is no valid leading date. Pure (no deps) so scripts can use it.
 */
export function extractDatePrefix(raw: string): {
  recordedOn: Date | null;
  title: string;
} {
  const input = raw.trim();
  const m = input.match(/^(\d{2})(\d{2})(\d{2})(?!\d)\s*[-–—_.:、]?\s*([\s\S]*)$/);
  if (!m) return { recordedOn: null, title: input };

  const year = 2000 + Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const rest = m[4].trim();
  if (month < 1 || month > 12 || day < 1 || day > 31 || !rest) {
    return { recordedOn: null, title: input };
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  // Reject impossible dates (e.g. 260230 → rolls over to March).
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return { recordedOn: null, title: input };
  }
  return { recordedOn: date, title: rest };
}
