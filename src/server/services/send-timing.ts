/**
 * Best-day/time-to-send analysis.
 *
 * Given a client's history of invoice-email sends (each tagged with the weekday
 * and hour it went out, and how quickly the recipient opened it), recommend the
 * send window — weekday + coarse time-of-day — that historically gets the
 * fastest, most reliable opens. When a client lacks enough history we fall back
 * to a sensible global default rather than overfit a handful of sends.
 *
 * Pure function (`recommendSendWindow`) so it's unit-testable; the router builds
 * observations from EmailEvent rows.
 */

export type TimeOfDay = "morning" | "afternoon" | "evening";

export interface SendObservation {
  /** Weekday the email was sent (0 = Sunday … 6 = Saturday). */
  weekday: number;
  /** Hour of day the email was sent (0–23). */
  hour: number;
  /** Hours until the recipient first opened it, or null if never opened. */
  hoursToOpen: number | null;
}

export interface SendWindowRecommendation {
  /** Recommended weekday (0–6). */
  weekday: number;
  weekdayLabel: string;
  timeOfDay: TimeOfDay;
  confidence: "high" | "medium" | "low";
  /** Whether the recommendation was learned from history or is the global default. */
  basis: "history" | "default";
  /** How many observations the recommendation was based on. */
  sampleSize: number;
  message: string;
}

export interface RecommendSendWindowOptions {
  /** Minimum observations before we trust the client's own history. */
  minHistory?: number;
}

const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// Sensible default when a client has too little history: midweek morning, which
// is the broadly-observed sweet spot for getting an invoice seen.
const DEFAULT_WEEKDAY = 2; // Tuesday
const DEFAULT_TIME_OF_DAY: TimeOfDay = "morning";

function timeOfDayFor(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  return "evening";
}

function median(values: number[]): number {
  if (values.length === 0) return Infinity;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

interface Bucket {
  total: number;
  opened: number[];
}

function score(bucket: Bucket): { openRate: number; medianHoursToOpen: number } {
  return {
    openRate: bucket.total === 0 ? 0 : bucket.opened.length / bucket.total,
    medianHoursToOpen: median(bucket.opened),
  };
}

function pickBest<K>(buckets: Map<K, Bucket>): K | null {
  let bestKey: K | null = null;
  let best: { openRate: number; medianHoursToOpen: number } | null = null;
  for (const [key, bucket] of buckets) {
    const s = score(bucket);
    if (
      best === null ||
      s.openRate > best.openRate ||
      (s.openRate === best.openRate && s.medianHoursToOpen < best.medianHoursToOpen)
    ) {
      best = s;
      bestKey = key;
    }
  }
  return bestKey;
}

function defaultRecommendation(sampleSize: number): SendWindowRecommendation {
  return {
    weekday: DEFAULT_WEEKDAY,
    weekdayLabel: WEEKDAY_LABELS[DEFAULT_WEEKDAY],
    timeOfDay: DEFAULT_TIME_OF_DAY,
    confidence: "low",
    basis: "default",
    sampleSize,
    message: `Not enough history yet — ${WEEKDAY_LABELS[DEFAULT_WEEKDAY]} mornings are a safe default.`,
  };
}

export function recommendSendWindow(
  observations: SendObservation[],
  options: RecommendSendWindowOptions = {},
): SendWindowRecommendation {
  const minHistory = options.minHistory ?? 5;
  if (observations.length < minHistory) {
    return defaultRecommendation(observations.length);
  }

  const byWeekday = new Map<number, Bucket>();
  const byTimeOfDay = new Map<TimeOfDay, Bucket>();
  const add = <K>(map: Map<K, Bucket>, key: K, hoursToOpen: number | null) => {
    const bucket = map.get(key) ?? { total: 0, opened: [] };
    bucket.total += 1;
    if (hoursToOpen !== null) bucket.opened.push(hoursToOpen);
    map.set(key, bucket);
  };

  for (const o of observations) {
    add(byWeekday, o.weekday, o.hoursToOpen);
    add(byTimeOfDay, timeOfDayFor(o.hour), o.hoursToOpen);
  }

  const weekday = pickBest(byWeekday) ?? DEFAULT_WEEKDAY;
  const timeOfDay = pickBest(byTimeOfDay) ?? DEFAULT_TIME_OF_DAY;

  const confidence: SendWindowRecommendation["confidence"] =
    observations.length >= 20 ? "high" : observations.length >= 10 ? "medium" : "low";

  return {
    weekday,
    weekdayLabel: WEEKDAY_LABELS[weekday],
    timeOfDay,
    confidence,
    basis: "history",
    sampleSize: observations.length,
    message: `${WEEKDAY_LABELS[weekday]} ${timeOfDay}s tend to get opened fastest for this client (${observations.length} sends).`,
  };
}
