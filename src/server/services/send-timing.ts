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

// Concrete local hour used when turning a coarse time-of-day recommendation
// into a schedulable instant: mid-window, biased early so the email lands
// before the recipient's inbox sweep rather than after it.
export const TIME_OF_DAY_HOUR: Record<TimeOfDay, number> = {
  morning: 9,
  afternoon: 14,
  evening: 18,
};

/** Minutes east of UTC for a zone at a given instant, via Intl (no dependency). */
function timeZoneOffsetMinutes(ts: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ts));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return (asUtc - ts) / 60_000;
}

/** UTC instant corresponding to a wall-clock date+hour in a zone. */
function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour);
  // Two passes converge across DST transitions near the guess.
  let ts = guess - timeZoneOffsetMinutes(guess, timeZone) * 60_000;
  ts = guess - timeZoneOffsetMinutes(ts, timeZone) * 60_000;
  return new Date(ts);
}

/**
 * The next future instant matching a send-window recommendation, in the org's
 * time zone — e.g. "Tuesday morning" → next Tuesday 9:00 AM org-local, as UTC.
 * If today is the recommended weekday but the window hour has already passed,
 * rolls to the following week. Pure (takes `from`) so it's unit-testable.
 */
export function nextSendWindowOccurrence(
  recommendation: Pick<SendWindowRecommendation, "weekday" | "timeOfDay">,
  timeZone: string,
  from: Date = new Date(),
): Date {
  const hour = TIME_OF_DAY_HOUR[recommendation.timeOfDay];

  // Today's date + weekday as seen in the org's zone.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(from);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdayIndex: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const todayWeekday = weekdayIndex[get("weekday")] ?? 0;
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));

  for (let offset = 0; offset <= 7; offset++) {
    if ((todayWeekday + offset) % 7 !== recommendation.weekday) continue;
    // Normalize day-of-month arithmetic through Date.UTC so month/year roll over.
    const candidateYmd = new Date(Date.UTC(year, month - 1, day + offset));
    const candidate = zonedDateTimeToUtc(
      candidateYmd.getUTCFullYear(),
      candidateYmd.getUTCMonth() + 1,
      candidateYmd.getUTCDate(),
      hour,
      timeZone,
    );
    // Skip a same-day window that already passed (or is < 1 min away).
    if (candidate.getTime() > from.getTime() + 60_000) return candidate;
  }
  // Unreachable: an 8-day scan always contains a strictly-future occurrence.
  return zonedDateTimeToUtc(year, month, day + 7, hour, timeZone);
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
