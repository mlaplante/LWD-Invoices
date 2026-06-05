// Shared Gemini "model fallback chain with capped retry on 429" runner.
//
// Both receipt OCR and reminder drafting call Gemini's generateContent API over
// an ordered list of vision/text models. When a model returns a 429 (rate-limit
// or quota), the next model in the chain is tried — this rescues the case where
// Google has zeroed the free-tier quota on one specific model but not others.
// Only the final model in the chain retries (under a short, capped backoff)
// before giving up; earlier models fall straight through to the next model so a
// user-facing request never sleeps longer than necessary.

// This runs inside a request the user is actively waiting on, so we never sleep
// long: a 429 on any model that still has a fallback falls straight through to
// the next model. Only the final model retries with a short, capped backoff.
const GEMINI_MAX_RETRY_DELAY_MS = 2000;
const GEMINI_LAST_MODEL_RETRIES = 2;

// Resolve an ordered model chain from a comma-separated env value, falling back
// to the caller's default chain when unset/empty.
export function resolveGeminiModels(raw: string | undefined, defaults: string[]): string[] {
  if (raw) {
    const list = raw.split(",").map((m) => m.trim()).filter(Boolean);
    if (list.length > 0) return list;
  }
  return defaults;
}

function geminiGenerateContentUrl(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

// A daily request quota or a hard "limit: 0" free-tier disablement won't be
// cleared by the RetryInfo delay, so treat those as non-retryable on the same
// model and move on to the next one immediately.
function isGeminiQuotaExhausted(body: string): boolean {
  return /limit:\s*0\b/.test(body) || /PerDay/i.test(body);
}

// Gemini 429s carry a google.rpc.RetryInfo detail with retryDelay like "8s" or
// "8.152848623s". Returns the delay in ms, or null if none is present.
function parseGeminiRetryDelayMs(body: string): number | null {
  try {
    const json = JSON.parse(body) as {
      error?: { details?: Array<Record<string, unknown>> };
    };
    const details = json.error?.details;
    if (Array.isArray(details)) {
      for (const detail of details) {
        const type = detail["@type"];
        const retryDelay = detail.retryDelay;
        if (typeof type === "string" && type.includes("RetryInfo") && typeof retryDelay === "string") {
          const match = retryDelay.match(/([\d.]+)s/);
          if (match) return Math.ceil(parseFloat(match[1]) * 1000);
        }
      }
    }
  } catch {
    // Body wasn't JSON — fall through to the text-scan heuristics below.
  }
  const match =
    body.match(/"retryDelay"\s*:\s*"([\d.]+)s"/) || body.match(/retry in ([\d.]+)s/i);
  return match ? Math.ceil(parseFloat(match[1]) * 1000) : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Defensive extraction: Gemini may return multiple candidates/parts, so join all
// text rather than reading parts[0].
export function extractGeminiText(response: Record<string, unknown>): string {
  const candidates = response.candidates;
  if (!Array.isArray(candidates)) return "";
  return candidates
    .flatMap((candidate) => {
      if (!candidate || typeof candidate !== "object") return [];
      const content = (candidate as { content?: unknown }).content;
      if (!content || typeof content !== "object") return [];
      const parts = (content as { parts?: unknown }).parts;
      return Array.isArray(parts) ? parts : [];
    })
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const text = (part as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .join("\n");
}

export interface GeminiFallbackOptions<T> {
  apiKey: string;
  // Ordered model chain; index 0 is the primary, the rest are fallbacks.
  models: string[];
  // The generateContent request body, identical across every model attempt.
  body: unknown;
  // Parse a successful (HTTP 200) response into the caller's result type. May
  // throw (e.g. empty/invalid payload); the throw propagates to the caller.
  onOk: (json: Record<string, unknown>) => T;
  // Used in thrown error messages, e.g. "receipt OCR" / "reminder draft".
  label: string;
}

// Iterate the model chain, returning the first model's successful result. On a
// 429 the next model is tried; only the last model retries under a capped
// backoff. Any non-429 error fails immediately (auth/400/404 won't be fixed by
// a different model). Throws the last rate-limit error if every model is
// exhausted.
export async function callGeminiWithModelFallback<T>(opts: GeminiFallbackOptions<T>): Promise<T> {
  const { apiKey, models, body, onOk, label } = opts;
  let lastRateLimit: Error | null = null;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const isLastModel = i === models.length - 1;
    // Only the final model retries with backoff; earlier models fall straight
    // through to the next model on a 429 (faster than sleeping in-request).
    const maxAttempts = isLastModel ? GEMINI_LAST_MODEL_RETRIES + 1 : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const response = await fetch(geminiGenerateContentUrl(model), {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const json = await response.json() as Record<string, unknown>;
        return onOk(json);
      }

      const responseBody = await response.text().catch(() => "");

      // Only 429 (rate-limit/quota) is worth trying another model for. Auth,
      // bad-request, and 404 (e.g. a misspelled model id) errors won't be fixed
      // by a different model, so fail loudly and immediately.
      if (response.status !== 429) {
        throw new Error(
          `Gemini ${label} failed on ${model} (${response.status}): ${responseBody || response.statusText}`,
        );
      }

      lastRateLimit = new Error(
        `Gemini ${label} rate-limited on ${model} (429): ${responseBody || response.statusText}`,
      );

      // A daily / "limit: 0" quota can't be cleared by waiting, so never sleep
      // on it — fall straight through to the next model.
      const exhausted = isGeminiQuotaExhausted(responseBody);
      const retryDelayMs = parseGeminiRetryDelayMs(responseBody);
      const canRetrySameModel =
        isLastModel && !exhausted && attempt < maxAttempts && retryDelayMs !== null;

      if (canRetrySameModel) {
        await sleep(Math.min(retryDelayMs, GEMINI_MAX_RETRY_DELAY_MS));
        continue;
      }

      break; // try the next model, or exit the loop if this was the last one
    }
  }

  throw lastRateLimit ?? new Error(`Gemini ${label} failed: no models configured`);
}
