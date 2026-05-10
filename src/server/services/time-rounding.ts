/**
 * Time Rounding Service
 *
 * Exact TypeScript port of Pancake PHP get_rounded_minutes(). Round
 * minutes up to the nearest interval bucket.
 *
 * The interval is configurable per-org via Organization.taskTimeInterval
 * (set in /settings → Projects). Callers in timeEntries / timesheets /
 * timers routers all read that field and pass it through; passing 0
 * disables rounding for entry-level overrides.
 */

/**
 * Round minutes up to nearest interval bucket.
 * Algorithm: Math.ceil(Math.round(minutes) / interval) * interval
 * intervalMinutes=0 means rounding disabled — return raw minutes.
 */
export function roundMinutes(minutes: number, intervalMinutes: number): number {
  if (intervalMinutes <= 0) return minutes;
  return Math.ceil(Math.round(minutes) / intervalMinutes) * intervalMinutes;
}
