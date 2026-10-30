/**
 * TASK-ALPHA-SUBSCRIBER-022: bundled public Google OAuth client id.
 *
 * The Google client id is a PUBLIC identifier (it appears in every OAuth
 * authorization URL and is visible to any user) — it is not a credential.
 * The desktop runtime needs it as the ID-token audience for
 * `google-id-token.ts` verification; the packaged app ships no `.env`, so
 * the id is bundled at build time and applied at server startup.
 *
 * `GOOGLE_CLIENT_ID` from the environment always wins (tests/dev).
 * `GOOGLE_CLIENT_SECRET` is NEVER bundled, never referenced here, and never
 * leaves the VPS.
 */
export const BUNDLED_GOOGLE_CLIENT_ID =
  '480048442203-stiuf8pf1o0kvb0vejpk8hfa85b6o4c4.apps.googleusercontent.com'

/** Apply the bundled public client id when no environment value is set. */
export function applyBundledGoogleClientIdFallback(): void {
  if (!process.env.GOOGLE_CLIENT_ID) {
    process.env.GOOGLE_CLIENT_ID = BUNDLED_GOOGLE_CLIENT_ID
  }
}
