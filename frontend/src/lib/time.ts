/**
 * Parse a backend timestamp. The backend stores UTC; Postgres sends an offset ("…+00:00") but SQLite
 * sends none ("2026-11-05T08:59:44"), which browsers would read as local time. No offset means UTC.
 */
export function parseServerTime(iso: string): Date {
  return new Date(/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`);
}
