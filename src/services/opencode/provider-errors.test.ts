/**
 * TASK-082B §13: provider/model error classification regression tests.
 *
 * Pure module — no store, no fetch, no localStorage. Runs anywhere.
 * Evidence basis: machine-captured OpenCode CLI `--format json` envelope
 * {type:"error", error:{name, data:{message}}} plus HTTP status semantics
 * (402 insufficient credits, 429 throttling, 401 auth).
 */
import { describe, expect, it } from 'vitest'
import {
  buildProviderErrorWarning,
  classifyProviderError,
  defaultWatchdogClassification,
  extractCliError,
  extractRetryAfterSeconds,
  isQuotaExhaustionClass,
} from './provider-errors'

describe('extractCliError — CLI envelope parsing', () => {
  it('parses the machine-proven envelope {type:error, error:{name, data:{message}}}', () => {
    const out = extractCliError({
      type: 'error',
      timestamp: 1788880195086,
      sessionID: 'ses_abc',
      error: { name: 'UnknownError', data: { message: 'Unexpected server error.', ref: 'err_x' } },
    })
    expect(out).toMatchObject({ message: 'Unexpected server error.', name: 'UnknownError' })
  })
  it('accepts string error payloads and top-level message', () => {
    expect(extractCliError({ type: 'error', error: 'boom' })).toMatchObject({ message: 'boom' })
    expect(extractCliError({ type: 'error', message: 'top' })).toMatchObject({ message: 'top' })
  })
  it('extracts numeric status codes from code/status fields', () => {
    expect(extractCliError({ type: 'error', error: { message: 'm', code: 429 } })).toMatchObject({ statusCode: 429 })
    expect(extractCliError({ type: 'error', error: { message: 'm', status: '402' } })).toMatchObject({ statusCode: 402 })
  })
  it('returns null for non-error events and empty messages', () => {
    expect(extractCliError({ type: 'token', text: 'hi' })).toBeNull()
    expect(extractCliError({ type: 'error', error: { name: 'X', data: {} } })).toBeNull()
    expect(extractCliError(null)).toBeNull()
    expect(extractCliError(undefined)).toBeNull()
  })
})

describe('classifyProviderError — §13 cases 1..11', () => {
  it('1. free quota exhausted → FREE_MODEL_LIMIT_EXCEEDED', () => {
    expect(
      classifyProviderError({
        message: 'Free model limit reached for opencode/muse-spark-1.3-contributor-free',
        isFreeModel: true,
      }).classification
    ).toBe('FREE_MODEL_LIMIT_EXCEEDED')
  })
  it('2. free-tier hint in message suffices without the flag', () => {
    expect(
      classifyProviderError({ message: 'You have exceeded your free tier allowance for this month' }).classification
    ).toBe('FREE_MODEL_LIMIT_EXCEEDED')
  })
  it('5. paid allowance exhausted → PAID_MODEL_USAGE_EXHAUSTED', () => {
    expect(
      classifyProviderError({ message: 'Insufficient credits: account balance depleted', isFreeModel: false })
        .classification
    ).toBe('PAID_MODEL_USAGE_EXHAUSTED')
  })
  it('5b. HTTP 402 → quota (paid default when free flag unknown)', () => {
    expect(classifyProviderError({ message: 'Payment required', statusCode: 402 }).classification).toBe(
      'PAID_MODEL_USAGE_EXHAUSTED'
    )
  })
  it('8. 429 + insufficient_quota is quota, NOT rate-limited', () => {
    expect(
      classifyProviderError({ message: 'You exceeded your current quota, code insufficient_quota', statusCode: 429 })
        .classification
    ).toBe('PAID_MODEL_USAGE_EXHAUSTED')
  })
  it('8b. plain 429 → RATE_LIMITED with retry-after preserved', () => {
    const out = classifyProviderError({ message: 'Too many requests, retry after 45 seconds', statusCode: 429 })
    expect(out.classification).toBe('RATE_LIMITED')
    expect(out.retryAfterSeconds).toBe(45)
  })
  it('8c. overload without quota markers → PROVIDER_TEMPORARILY_UNAVAILABLE', () => {
    expect(classifyProviderError({ message: 'The server is overloaded, try again shortly' }).classification).toBe(
      'PROVIDER_TEMPORARILY_UNAVAILABLE'
    )
  })
  it('10a. 401 → AUTHENTICATION_REQUIRED, never quota', () => {
    expect(classifyProviderError({ message: 'Unauthorized', statusCode: 401 }).classification).toBe(
      'AUTHENTICATION_REQUIRED'
    )
  })
  it('10b. invalid API key → AUTHENTICATION_REQUIRED, never quota', () => {
    expect(
      classifyProviderError({ message: 'Invalid API key provided for provider openrouter' }).classification
    ).toBe('AUTHENTICATION_REQUIRED')
  })
  it('10c. expired token → AUTHENTICATION_REQUIRED, never quota', () => {
    expect(classifyProviderError({ message: 'Token expired, please reconnect' }).classification).toBe(
      'AUTHENTICATION_REQUIRED'
    )
  })
  it('TOOL_PERMISSION_DENIED: headless auto-reject is not PROVIDER_ERROR', () => {
    expect(
      classifyProviderError({ message: 'The user rejected permission to use this specific tool call.' })
        .classification
    ).toBe('TOOL_PERMISSION_DENIED')
  })
  it('TOOL_PERMISSION_DENIED: doom_loop marker classifies, Google 403 stays AUTH', () => {
    expect(classifyProviderError({ message: 'doom_loop ask google-slides_slides_create_slide' }).classification).toBe(
      'TOOL_PERMISSION_DENIED'
    )
    expect(
      classifyProviderError({
        message: 'The caller does not have permission',
        statusCode: 403,
      }).classification
    ).toBe('AUTHENTICATION_REQUIRED')
  })
  it('TOOL_PERMISSION_DENIED copy names no quota and no fake numbers', () => {
    const { headline, detail } = buildProviderErrorWarning('TOOL_PERMISSION_DENIED', {
      provider: 'opencode',
      model: 'opencode/mimo-v2.5-free',
    })
    expect(headline).toBe('Tool permission not granted')
    expect(detail).not.toMatch(/quota|credit/i)
    expect(isQuotaExhaustionClass('TOOL_PERMISSION_DENIED')).toBe(false)
  })
  it('11. unknown provider error → PROVIDER_ERROR fallback', () => {
    expect(classifyProviderError({ message: 'Unexpected server error. Check server logs.' }).classification).toBe(
      'PROVIDER_ERROR'
    )
    expect(classifyProviderError({}).classification).toBe('PROVIDER_ERROR')
  })
})

describe('copy requirements — §7/8/9/15', () => {
  it('6. no fake reset/credit numbers in paid copy', () => {
    const { headline, detail } = buildProviderErrorWarning('PAID_MODEL_USAGE_EXHAUSTED', {
      provider: 'openrouter',
      model: 'x/y',
    })
    expect(headline).toBe('Paid model usage limit reached')
    expect(detail).not.toMatch(/\d+\s*(credits?|tokens?|days?|hours?|reset)/i)
  })
  it('free copy names the model/provider and offers actions', () => {
    const { headline, detail } = buildProviderErrorWarning('FREE_MODEL_LIMIT_EXCEEDED', {
      provider: 'opencode',
      model: 'opencode/muse-spark-1.3-contributor-free',
      modelDisplayName: 'Muse Spark 1.3 Free',
    })
    expect(headline).toBe('Free model limit reached')
    expect(detail).toContain('Muse Spark 1.3 Free')
    expect(detail).toMatch(/paid model/i)
  })
  it('rate copy never claims exhaustion; retry-after only when supplied', () => {
    const withRetry = buildProviderErrorWarning('RATE_LIMITED', { retryAfterSeconds: 30 })
    expect(withRetry.detail).toContain('30')
    expect(withRetry.detail).toMatch(/rate-limited|temporarily/i)
    const withoutRetry = buildProviderErrorWarning('RATE_LIMITED', {})
    expect(withoutRetry.detail).not.toMatch(/\d+ seconds/)
  })
  it('extractRetryAfterSeconds returns null when absent (never invented)', () => {
    expect(extractRetryAfterSeconds('slow down please')).toBeNull()
    expect(extractRetryAfterSeconds('retry after 120 seconds')).toBe(120)
  })
  it('isQuotaExhaustionClass splits quota from transient', () => {
    expect(isQuotaExhaustionClass('FREE_MODEL_LIMIT_EXCEEDED')).toBe(true)
    expect(isQuotaExhaustionClass('PAID_MODEL_USAGE_EXHAUSTED')).toBe(true)
    expect(isQuotaExhaustionClass('RATE_LIMITED')).toBe(false)
    expect(isQuotaExhaustionClass('PROVIDER_ERROR')).toBe(false)
  })
})

/**
 * TASK-082B-R1: real exhausted-free-model envelope (machine-captured
 * 2026-09-10, opencode/mimo-v2.5-free, user-confirmed exhausted allowance).
 * CLI-internal stream error; the CLI emits zero stdout/stderr bytes and hangs,
 * so Alpha's watchdog is the classifying layer. Sanitized: no secrets present.
 */
describe('TASK-082B-R1 — exhausted free-model runtime envelope', () => {
  // §9.1: the exact sanitized real text + free tier → FREE_MODEL_LIMIT_EXCEEDED.
  const REAL_EXHAUSTED_TEXT =
    'AI_APICallError: Rate limit exceeded. Please try again later.'
  it('1. real exhausted envelope + free model → FREE_MODEL_LIMIT_EXCEEDED', () => {
    expect(
      classifyProviderError({ message: REAL_EXHAUSTED_TEXT, isFreeModel: true }).classification
    ).toBe('FREE_MODEL_LIMIT_EXCEEDED')
  })
  it('retry-exhausted wrapper + free model → FREE_MODEL_LIMIT_EXCEEDED', () => {
    expect(
      classifyProviderError({
        message:
          'AI_RetryError: Failed after 3 attempts. Last error: Rate limit exceeded. Please try again later.',
        isFreeModel: true,
      }).classification
    ).toBe('FREE_MODEL_LIMIT_EXCEEDED')
  })
  // §9.2: genuine temporary outage stays temporary, even on a free model.
  it('2. genuine temporary-unavailable fixture + free model → PROVIDER_TEMPORARILY_UNAVAILABLE', () => {
    expect(
      classifyProviderError({ message: 'Service temporarily unavailable (503)', isFreeModel: true })
        .classification
    ).toBe('PROVIDER_TEMPORARILY_UNAVAILABLE')
    expect(
      classifyProviderError({ message: 'The server is overloaded, try again shortly' }).classification
    ).toBe('PROVIDER_TEMPORARILY_UNAVAILABLE')
  })
  // §9.3: generic rate limiting without free-tier evidence → RATE_LIMITED.
  it('3. generic 429/rate-limit without free evidence → RATE_LIMITED', () => {
    expect(
      classifyProviderError({ message: REAL_EXHAUSTED_TEXT, isFreeModel: false }).classification
    ).toBe('RATE_LIMITED')
    expect(classifyProviderError({ message: REAL_EXHAUSTED_TEXT }).classification).toBe(
      'RATE_LIMITED'
    )
    expect(
      classifyProviderError({ message: 'Too many requests, retry after 20 seconds' }).classification
    ).toBe('RATE_LIMITED')
  })
  // §9.4: auth keeps precedence over free+rate.
  it('4. authentication failure + free model → AUTHENTICATION_REQUIRED', () => {
    expect(
      classifyProviderError({ message: 'Unauthorized: invalid credentials, rate limit ok', isFreeModel: true })
        .classification
    ).toBe('AUTHENTICATION_REQUIRED')
  })
  // §9.6 (existing §13 case 3/5b retained): paid exhaustion untouched.
  it('6. paid exhaustion still splits paid', () => {
    expect(
      classifyProviderError({
        message: 'Insufficient credits: account balance depleted',
        isFreeModel: false,
      }).classification
    ).toBe('PAID_MODEL_USAGE_EXHAUSTED')
  })
  // §9.7: precedence — free + rate wording overlapping a TEMP rule → FREE.
  it('7. free + rate wording overlapping TEMP patterns → FREE_MODEL_LIMIT_EXCEEDED', () => {
    expect(
      classifyProviderError({
        message: 'Rate limit exceeded, server overloaded, try again later',
        isFreeModel: true,
      }).classification
    ).toBe('FREE_MODEL_LIMIT_EXCEEDED')
  })
  it('7b. same overlap without free evidence stays RATE_LIMITED (TEMP still shadowed by RATE)', () => {
    expect(
      classifyProviderError({ message: 'Rate limit exceeded, try again later' }).classification
    ).toBe('RATE_LIMITED')
  })
})

describe('watchdog timeout classification (neutral observation, never diagnosis)', () => {
  it('stashed specific classification always wins', () => {
    expect(
      defaultWatchdogClassification({
        stashedClassification: 'RATE_LIMITED',
        modelFree: true,
        stdoutBytes: 0,
        stderrBytes: 0,
      })
    ).toBe('RATE_LIMITED')
  })
  it('A. free model + total silence → FIRST_RESPONSE_TIMEOUT, never FREE_MODEL_LIMIT_EXCEEDED', () => {
    expect(
      defaultWatchdogClassification({ modelFree: true, stdoutBytes: 0, stderrBytes: 0 })
    ).toBe('FIRST_RESPONSE_TIMEOUT')
  })
  it('B. paid/Go model + total silence → FIRST_RESPONSE_TIMEOUT, never PROVIDER_TEMPORARILY_UNAVAILABLE', () => {
    expect(
      defaultWatchdogClassification({ modelFree: false, stdoutBytes: 0, stderrBytes: 0 })
    ).toBe('FIRST_RESPONSE_TIMEOUT')
    expect(defaultWatchdogClassification({ stdoutBytes: 0, stderrBytes: 0 })).toBe(
      'FIRST_RESPONSE_TIMEOUT'
    )
  })
  it('observed bytes do not change the neutral timeout fallback', () => {
    expect(
      defaultWatchdogClassification({ modelFree: true, stdoutBytes: 128, stderrBytes: 0 })
    ).toBe('FIRST_RESPONSE_TIMEOUT')
    expect(
      defaultWatchdogClassification({ modelFree: true, stdoutBytes: 0, stderrBytes: 64 })
    ).toBe('FIRST_RESPONSE_TIMEOUT')
  })
  it('G. stashed authoritative error wins over the neutral timeout', () => {
    expect(
      defaultWatchdogClassification({
        stashedClassification: 'AUTHENTICATION_REQUIRED',
        modelFree: false,
        stdoutBytes: 0,
        stderrBytes: 0,
      })
    ).toBe('AUTHENTICATION_REQUIRED')
  })
  it('H. 60s startup watchdog expiry → neutral STARTUP_TIMEOUT', () => {
    expect(
      defaultWatchdogClassification({ modelFree: true, stdoutBytes: 0, stderrBytes: 0, timeout: 'startup' })
    ).toBe('STARTUP_TIMEOUT')
    expect(
      defaultWatchdogClassification({ modelFree: false, stdoutBytes: 0, stderrBytes: 0, timeout: 'startup' })
    ).toBe('STARTUP_TIMEOUT')
  })
  it('neutral timeout copy never mentions quota, outage, or auth', () => {
    for (const cls of ['FIRST_RESPONSE_TIMEOUT', 'STARTUP_TIMEOUT'] as const) {
      const { headline, detail } = buildProviderErrorWarning(cls, {
        provider: 'opencode-go',
        model: 'opencode-go/mimo-v2.5',
      })
      expect(headline).toBe('No response received')
      expect(detail).not.toMatch(/quota|free limit|unavailable|outage|auth|exhaust/i)
    }
    expect(buildProviderErrorWarning('FIRST_RESPONSE_TIMEOUT', {}).detail).toMatch(/20 seconds/)
    expect(buildProviderErrorWarning('STARTUP_TIMEOUT', {}).detail).toMatch(/60 seconds/)
  })
})

describe('explicit evidence classification is preserved (DNS counterexample must not weaken it)', () => {
  it('C. free model + explicit free-limit/rate evidence → FREE_MODEL_LIMIT_EXCEEDED', () => {
    expect(
      classifyProviderError({ message: 'Rate limit exceeded. Please try again later.', isFreeModel: true }).classification
    ).toBe('FREE_MODEL_LIMIT_EXCEEDED')
    expect(
      classifyProviderError({ message: 'Free model limit reached for opencode/mimo-v2.5-free', isFreeModel: true }).classification
    ).toBe('FREE_MODEL_LIMIT_EXCEEDED')
  })
  it('D. paid/Go model + explicit quota evidence → PAID_MODEL_USAGE_EXHAUSTED', () => {
    expect(
      classifyProviderError({ message: 'Insufficient credits: account balance depleted', isFreeModel: false }).classification
    ).toBe('PAID_MODEL_USAGE_EXHAUSTED')
    expect(
      classifyProviderError({ message: 'Payment required', statusCode: 402 }).classification
    ).toBe('PAID_MODEL_USAGE_EXHAUSTED')
  })
  it('E. explicit auth evidence → AUTHENTICATION_REQUIRED', () => {
    expect(
      classifyProviderError({ message: 'Unauthorized', statusCode: 401 }).classification
    ).toBe('AUTHENTICATION_REQUIRED')
  })
  it('F. explicit temporary-provider evidence → PROVIDER_TEMPORARILY_UNAVAILABLE', () => {
    expect(
      classifyProviderError({ message: 'The server is overloaded, try again shortly' }).classification
    ).toBe('PROVIDER_TEMPORARILY_UNAVAILABLE')
    expect(
      classifyProviderError({ message: 'Service temporarily unavailable (503)' }).classification
    ).toBe('PROVIDER_TEMPORARILY_UNAVAILABLE')
  })
})

describe('TASK-082B-R1 — free-limit warning contract (§8)', () => {
  it('explicitly states exhaustion with both next actions and no retry framing', () => {
    const { headline, detail } = buildProviderErrorWarning('FREE_MODEL_LIMIT_EXCEEDED', {
      provider: 'opencode',
      model: 'opencode/mimo-v2.5-free',
      modelDisplayName: 'MiMo V2.5 Free',
    })
    expect(headline).toBe('Free model limit reached')
    expect(detail).toMatch(/available free usage/i)
    expect(detail).toMatch(/choose another available model/i)
    expect(detail).toMatch(/paid model/i)
    expect(detail).not.toMatch(/try again|retry|shortly/i)
    expect(detail).not.toMatch(/\d+\s*(seconds?|minutes?|hours?|credits?|tokens?)/i)
  })
})
