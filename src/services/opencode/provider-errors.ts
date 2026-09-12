/**
 * TASK-082B: Provider/model error classification (pure, no imports, no I/O).
 *
 * PROVEN GAP: quota/allowance/credit exhaustion from a model provider reached
 * the UI only as a generic "OpenCode exited..." message — or as indefinite
 * `Working...` when no terminal event arrived at all. Nothing in the product
 * path distinguished quota exhaustion from runtime failure.
 *
 * Evidence basis (machine-captured 2026-09-08):
 * - OpenCode CLI `--format json` emits provider failures as stdout JSON lines:
 *   `{type:"error", timestamp, sessionID, error:{name, data:{message, ref}}}`.
 *   The same envelope carries quota/rate/auth failures; only the message and
 *   the HTTP status/code inside it differ.
 * - Validation failures (unknown model) fail fast through the same envelope,
 *   proving the envelope shape independently of any quota state.
 * - HTTP semantics: provider insufficient-credits surfaces as 402;
 *   throttling as 429; auth problems as 401/invalid-key.
 *
 * Matching is deliberately bounded and explicit: a closed pattern list over
 * evidence-backed phrases plus numeric status. Anything unmatched falls back
 * to PROVIDER_ERROR — never to a quota class.
 */

export type ProviderErrorClass =
  | 'FREE_MODEL_LIMIT_EXCEEDED'
  | 'PAID_MODEL_USAGE_EXHAUSTED'
  | 'RATE_LIMITED'
  | 'PROVIDER_TEMPORARILY_UNAVAILABLE'
  | 'AUTHENTICATION_REQUIRED'
  | 'TOOL_PERMISSION_DENIED'
  | 'PROVIDER_ERROR'
  | 'FIRST_RESPONSE_TIMEOUT'
  | 'STARTUP_TIMEOUT'

export interface ProviderErrorInput {
  /** Raw provider/CLI error text (message, stderr fragment, event payload). */
  message?: string | null
  /** HTTP status when the provider surfaced one (402/429/401/...). */
  statusCode?: number | null
  /** Provider error code string when surfaced (e.g. insufficient_quota). */
  code?: string | null
  /** True when the selected model is a free-tier model (drives free/paid split). */
  isFreeModel?: boolean
}

export interface ClassifiedProviderError {
  classification: ProviderErrorClass
  /** Seconds until retry when the provider supplied one; null otherwise. */
  retryAfterSeconds: number | null
}

/**
 * TASK-085: OpenCode tool-permission denial (NOT a provider failure).
 * Hyper-specific to headless permission auto-reject; deliberately does NOT
 * match Google 403/PERMISSION_DENIED texts (those stay AUTHENTICATION_REQUIRED
 * via status/AUTH patterns). Checked before AUTH because it is narrower.
 */
const TOOL_DENIAL_PATTERNS: RegExp[] = [
  /the user rejected permission/i,
  /rejected permission to use/i,
  /permission request (went unanswered|was not answered|timed out)/i,
  /doom_loop/,
]

const AUTH_PATTERNS: RegExp[] = [
  /\b401\b/,
  /unauthori[sz]ed/,
  /invalid[\s_\-]?api[\s_\-]?key/,
  /invalid_api_key/,
  /authentication(?:\s+(?:failed|required|error))?/,
  /auth(?:entication)?\s+(?:failed|error|required|expired)/,
  /expired.*(?:token|key)|(?:token|key).*expired/,
  /forbidden(?!\s+quota)/,
  /api key.*(?:missing|required|invalid)/,
  // Google-style access denial (distinct from headless "user rejected"
  // permission prompts, which are checked first and classified separately).
  /does not have permission/,
  /permission[_\s-]?denied/,
]

const QUOTA_PATTERNS: RegExp[] = [
  /insufficient_quota/,
  /insufficient\s+(?:credits?|funds?|balance|quota)/,
  /quota\s*(?:exceed|exhaust)/,
  /(?:exceed|exhaust)(?:ed|ing)?\s+(?:.{0,20}\s)?quota/,
  /free\s+(?:tier|model|allowance|usage|limit).{0,40}(?:exceed|exhaust|reached|deplet|consumed)/,
  /allowance\s*(?:exceed|exhaust|deplet|consumed|reached)/,
  /(?:credit|balance)s?\s*(?:exhaust|deplet|consumed|insufficient|empty|depleted)/,
  /(?:exhaust|deplet)(?:ed|ing)?\s+(?:.{0,20}\s)?(?:credit|balance|allowance)/,
  /exceed(?:ed|ing)?\s+(?:.{0,30}\s)?allowance/,
  /billing\s+(?:quota|limit|allowance)/,
  /usage\s+(?:allowance|limit|quota)\s*(?:exceed|exhaust|deplet|consumed|reached)/,
  /no\s+remaining\s+(?:usable\s+)?(?:quota|allowance|credit|balance)/,
  /plan\s+allowance\s*(?:exceed|exhaust|deplet|consumed)/,
]

const FREE_HINT_PATTERNS: RegExp[] = [
  /free[\s_\-](?:tier|model|allowance|usage|limit|quota)/,
  /free model/,
  /contributor[\s_\-]free/,
  /:free\b/,
]

const RATE_PATTERNS: RegExp[] = [
  /\b429\b/,
  /rate[\s_\-]?limit/,
  /too many requests/,
  /retr(?:y|ies)[\s_\-](?:after|later)|retry[\s_\-]?after/,
  /throttl(?:ed|ing)/,
  /slow down/,
]

const TEMP_UNAVAILABLE_PATTERNS: RegExp[] = [
  /\b503\b/,
  /\b502\b/,
  /temporarily\s+unavailable/,
  /service\s+unavailable/,
  /overloaded/,
  /over\s+capacity/,
  /capacity\s+(?:exceeded|unavailable)/,
  /concurrency\s+limit/,
  /server\s+overloaded/,
  /try again (?:later|shortly)/,
]

const RETRY_AFTER_RE = /retry[\s_\-]?after[:\s]+(\d{1,5})/i

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(text))
}

/**
 * Classify a provider/model failure. Order is load-bearing:
 * auth first (never quota), then explicit quota markers (including 429 +
 * insufficient_quota, which must NOT become RATE_LIMITED), then free-tier
 * rate-limit exhaustion (TASK-082B-R1: proven real incident — exhausted free
 * models surface persistent "Rate limit exceeded" with zero quota wording,
 * while the CLI swallows the error and hangs silently), then rate/temporary,
 * else PROVIDER_ERROR.
 */
export function classifyProviderError(input: ProviderErrorInput): ClassifiedProviderError {
  const text = `${input.message ?? ''} ${input.code ?? ''}`.toLowerCase()
  const status = input.statusCode ?? null

  if (matchesAny(text, TOOL_DENIAL_PATTERNS)) {
    return { classification: 'TOOL_PERMISSION_DENIED', retryAfterSeconds: extractRetryAfterSeconds(text) };
  }

  if (status === 401 || matchesAny(text, AUTH_PATTERNS)) {
    return { classification: 'AUTHENTICATION_REQUIRED', retryAfterSeconds: extractRetryAfterSeconds(text) };
  }

  const quotaByStatus = status === 402
  if (quotaByStatus || matchesAny(text, QUOTA_PATTERNS)) {
    const freeHint = input.isFreeModel === true || matchesAny(text, FREE_HINT_PATTERNS)
    return {
      classification: freeHint ? 'FREE_MODEL_LIMIT_EXCEEDED' : 'PAID_MODEL_USAGE_EXHAUSTED',
      retryAfterSeconds: extractRetryAfterSeconds(text),
    };
  }

  // TASK-082B-R1: free-tier rate-limit exhaustion. Machine-proven real envelope
  // (2026-09-10, opencode/mimo-v2.5-free, confirmed exhausted allowance):
  // "AI_APICallError: Rate limit exceeded. Please try again later." — generic
  // rate wording with zero quota markers, repeated on every request while the
  // CLI emits no stdout/stderr at all. Free-tier allowances exhaust through the
  // rate-limit channel, so rate-limit evidence on a free-tier model (explicit
  // flag or free-hint text, mirroring the QUOTA block) means the free allowance
  // is exhausted — NOT transient throttling. Paid/unknown-tier models keep the
  // RATE_LIMITED default below, so generic 429s are never auto-exhaustion.
  // Precedence: AUTH and explicit QUOTA above both win; this rule wins over the
  // generic RATE_LIMITED and PROVIDER_TEMPORARILY_UNAVAILABLE rules below
  // (including "try again later" wording, which also matches TEMP patterns).
  if (
    (input.isFreeModel === true || matchesAny(text, FREE_HINT_PATTERNS)) &&
    matchesAny(text, RATE_PATTERNS)
  ) {
    return { classification: 'FREE_MODEL_LIMIT_EXCEEDED', retryAfterSeconds: extractRetryAfterSeconds(text) };
  }

  if (matchesAny(text, RATE_PATTERNS)) {
    return { classification: 'RATE_LIMITED', retryAfterSeconds: extractRetryAfterSeconds(text) };
  }

  if (matchesAny(text, TEMP_UNAVAILABLE_PATTERNS)) {
    return { classification: 'PROVIDER_TEMPORARILY_UNAVAILABLE', retryAfterSeconds: extractRetryAfterSeconds(text) };
  }

  return { classification: 'PROVIDER_ERROR', retryAfterSeconds: extractRetryAfterSeconds(text) };
}

/** Retry-after seconds when the provider text supplies one; null otherwise (never invented). */
export function extractRetryAfterSeconds(text: string): number | null {
  const m = RETRY_AFTER_RE.exec(text ?? '')
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** True for the two exhaustion classes that name quota/allowance. */
export function isQuotaExhaustionClass(c: ProviderErrorClass): boolean {
  return c === 'FREE_MODEL_LIMIT_EXCEEDED' || c === 'PAID_MODEL_USAGE_EXHAUSTED'
}

/**
 * Watchdog timeout classification (pure, unit-testable).
 *
 * PROVEN RULE (DNS counterexample): total post-spawn silence alone proves
 * ONLY that Alpha One observed no qualifying child output before the timer
 * expired. It must NEVER be diagnosed as quota exhaustion, provider outage,
 * or authentication failure — a local/network-layer stall (e.g. unresolvable
 * DNS before OpenCode emits any event) produces the identical silence
 * envelope on free AND paid models alike. Tier metadata (modelFree) is
 * context, never diagnosis.
 *
 * A stashed specific classification always wins (authoritative upstream/error
 * evidence observed before the timeout overrides the neutral fallback).
 * Otherwise the timeout kind selects the neutral observation class:
 * first-response window → FIRST_RESPONSE_TIMEOUT, startup net → STARTUP_TIMEOUT.
 */
export type WatchdogTimeoutKind = 'first-response' | 'startup'

export function defaultWatchdogClassification(input: {
  stashedClassification?: ProviderErrorClass | null
  /** Retained for caller context only — never used for diagnosis. */
  modelFree?: boolean | null
  /** Retained for caller context only — never used for diagnosis. */
  stdoutBytes?: number | null
  /** Retained for caller context only — never used for diagnosis. */
  stderrBytes?: number | null
  /** Which watchdog expired. Defaults to the 20s first-response window. */
  timeout?: WatchdogTimeoutKind
}): ProviderErrorClass {
  if (input.stashedClassification) return input.stashedClassification
  return input.timeout === 'startup' ? 'STARTUP_TIMEOUT' : 'FIRST_RESPONSE_TIMEOUT'
}

export interface ExtractedCliError {
  message: string
  name?: string
  code?: string | number | null
  statusCode?: number | null
}

/**
 * Extract a provider failure from an OpenCode CLI stdout JSON event.
 * Machine-proven envelope: {type:"error", error:{name, data:{message, ref}}}.
 * Also accepts {type:"error", error:"string"} and {type:"error", message}.
 * Returns null when the event is not an error event or carries no message.
 * Never throws.
 */
export function extractCliError(evt: Record<string, unknown> | null | undefined): ExtractedCliError | null {
  try {
    if (!evt || typeof evt !== 'object') return null
    if (String((evt as Record<string, unknown>).type ?? '') !== 'error') return null
    const e = evt as Record<string, unknown>
    const raw = e.error as unknown
    let message = ''
    let name: string | undefined
    let code: string | number | null | undefined
    let statusCode: number | null | undefined
    if (typeof raw === 'string') {
      message = raw
    } else if (raw && typeof raw === 'object') {
      const r = raw as Record<string, unknown>
      if (typeof r.name === 'string') name = r.name
      const data = (r.data && typeof r.data === 'object' ? r.data : r) as Record<string, unknown>
      if (typeof data.message === 'string') message = data.message
      else if (typeof r.message === 'string') message = r.message
      const rawCode = data.code ?? r.code ?? data.status ?? r.status
      if (typeof rawCode === 'string' || typeof rawCode === 'number') code = rawCode
      const asStatus = Number(rawCode)
      if (Number.isInteger(asStatus) && asStatus >= 100 && asStatus < 600) statusCode = asStatus
    }
    if (typeof e.message === 'string' && !message) message = e.message
    message = message.trim()
    if (!message) return null
    return { message, ...(name ? { name } : {}), code: code ?? null, statusCode: statusCode ?? null }
  } catch {
    return null
  }
}

/** Truncate raw provider text for logs (no secrets expected, but bounded). */
export function truncateProviderText(text: string, maxLen = 300): string {
  const t = String(text ?? '')
  return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t
}

export interface ModelErrorContext {
  provider?: string | null
  model?: string | null
  modelDisplayName?: string | null
  retryAfterSeconds?: number | null
}

/**
 * User-facing warning copy. Simple, actionable, no developer jargon, no
 * invented numbers/dates. Returns headline + detail lines.
 */
export interface ProviderErrorWarning {
  headline: string
  detail: string
  primaryLabel: string
  secondaryLabel: string
}

export function buildProviderErrorWarning(
  classification: ProviderErrorClass,
  ctx: ModelErrorContext = {}
): ProviderErrorWarning {
  const modelLabel = ctx.modelDisplayName ?? ctx.model ?? null
  const where = [ctx.provider, modelLabel].filter(Boolean).join(' · ')
  switch (classification) {
    case 'FREE_MODEL_LIMIT_EXCEEDED':
      return {
        headline: 'Free model limit reached',
        detail: [
          where
            ? `You've used the available free usage for ${where}.`
            : "You've used the available free usage for this model.",
          'Choose another available model or switch to a paid model.',
        ].join(' '),
        primaryLabel: 'Use Paid Model',
        secondaryLabel: 'Close',
      }
    case 'PAID_MODEL_USAGE_EXHAUSTED':
      return {
        headline: 'Paid model usage limit reached',
        detail: [
          where
            ? `This paid model can't process more requests because its available usage has been reached for ${where}.`
            : "This paid model can't process more requests because its available usage has been reached.",
          'Check your billing or usage limits to continue.',
        ].join(' '),
        primaryLabel: 'Check Billing',
        secondaryLabel: 'Close',
      }
    case 'RATE_LIMITED': {
      const retry =
        ctx.retryAfterSeconds != null
          ? ` Try again in about ${ctx.retryAfterSeconds} seconds.`
          : ' Try again shortly.'
      return {
        headline: 'Too many requests',
        detail: `This model is temporarily rate-limited.${retry} Choose another model or wait.`,
        primaryLabel: 'Choose Another Model',
        secondaryLabel: 'Close',
      }
    }
    case 'PROVIDER_TEMPORARILY_UNAVAILABLE':
      return {
        headline: 'Model temporarily unavailable',
        detail: 'This model isn\'t responding right now. Try again shortly or choose another model.',
        primaryLabel: 'Choose Another Model',
        secondaryLabel: 'Close',
      }
    case 'AUTHENTICATION_REQUIRED':
      return {
        headline: 'Provider connection required',
        detail: [
          where ? `The provider account for ${where} needs attention (invalid or expired credentials).` : 'The provider credentials are invalid or expired.',
          'Reconnect this provider before using the model again.',
        ].join(' '),
        primaryLabel: 'Reconnect',
        secondaryLabel: 'Close',
      }
    case 'TOOL_PERMISSION_DENIED':
      return {
        headline: 'Tool permission not granted',
        detail: [
          'A tool permission request went unanswered and the run was stopped.',
          'Retry the request; trusted packaged tools are pre-approved, other tools may still ask.',
        ].join(' '),
        primaryLabel: 'Retry',
        secondaryLabel: 'Close',
      }
    case 'FIRST_RESPONSE_TIMEOUT':
      return {
        headline: 'No response received',
        detail:
          'OpenCode produced no output within 20 seconds. The cause could not be determined yet. You can retry.',
        primaryLabel: 'Choose Another Model',
        secondaryLabel: 'Close',
      }
    case 'STARTUP_TIMEOUT':
      return {
        headline: 'No response received',
        detail:
          'OpenCode produced no output within 60 seconds. The cause could not be determined yet. You can retry.',
        primaryLabel: 'Choose Another Model',
        secondaryLabel: 'Close',
      }
    case 'PROVIDER_ERROR':
    default:
      return {
        headline: 'Model request failed',
        detail: 'The model couldn\'t complete this request. Try again or choose another model.',
        primaryLabel: 'Choose Another Model',
        secondaryLabel: 'Close',
      }
  }
}
