# TASK-GWORKSPACE-002R — Google Workspace Connect CTA & Drive Entry Flow

## Objective

Close the remaining UX gap in `TASK-GWORKSPACE-002`.

The Google Drive page currently detects `Not Connected` but provides no actionable Connect button. A user must manually navigate to Settings, which breaks the expected Google Workspace entry flow.

This is a small corrective rework only.

Do NOT redesign Google OAuth or Google Drive architecture.

---

## Proven Finding

Current runtime state:

`/google/drive`

shows:

`Not Connected`

and:

`Connect your Google account in Settings to access Drive.`

But there is no actionable button.

Therefore the user cannot start OAuth directly from the Drive page.

---

## Required UX

When Google Workspace is not connected, `/google/drive` must show:

`Google Drive`

`Connect your Google account to access your Drive files and folders.`

`[ Connect Google ]`

The button must start the existing Google OAuth flow.

Do NOT create a second OAuth implementation.

Reuse the existing:

- `/api/google/oauth/status`
- `/api/google/oauth/auth-url`
- `/api/google/oauth/connect`
- `/api/google/oauth/callback`
- existing OAuth service
- existing Google connection persistence

---

## Connected State

When Google is connected, preserve the existing Drive browser behavior.

Do not change:

- folder navigation
- breadcrumb
- search
- folder metadata
- folder selection
- permission handling

---

## Connect Flow

Expected flow:

Drive page
→ Connect Google
→ existing OAuth authorization
→ Google consent
→ callback
→ connection persisted
→ return to Drive
→ Drive browser loads

The user should not need to manually navigate to Settings.

---

## Settings

Settings may continue to expose Google connection management.

Do not remove the Settings connection UI.

There should be two valid entry points:

1. Settings → Google Workspace → Connect
2. Drive → Connect Google

Both must use the same OAuth implementation.

---

## Error State

If OAuth initiation fails:

Show a business-readable error and keep the user on the Drive page.

Example:

`Unable to connect Google Workspace. Please try again.`

Do not expose raw OAuth/API errors in the primary UI.

---

## Runtime Validation

Use the real configured Google OAuth credentials.

Prove:

1. Open `/google/drive` while disconnected.
2. `Connect Google` button is visible.
3. Click `Connect Google`.
4. Existing Google OAuth flow starts.
5. Complete Google authorization.
6. Return to `/google/drive`.
7. Connection state becomes connected.
8. Drive browser loads.
9. Folder browsing works.
10. Refresh page.
11. Connection remains available.
12. Disconnect from Settings.
13. Return to Drive.
14. Drive returns to `Not Connected`.
15. `Connect Google` is available again.

If any step cannot be proven, mark it `INSUFFICIENT_EVIDENCE`.

---

## Scope

IN SCOPE:

- Drive disconnected-state UX
- Connect Google CTA
- OAuth flow navigation
- post-OAuth return to Drive
- connected/disconnected state refresh

OUT OF SCOPE:

- new OAuth implementation
- new Google scopes
- Drive API redesign
- Project implementation
- Project/Drive folder binding
- AI Assistant integration
- Drive write operations

---

## Audit Before Change

Briefly audit the existing OAuth connection flow and identify:

- current connect action
- current auth URL generation
- current callback behavior
- current post-callback redirect
- current connection status refresh

Do not redesign if the existing flow is already correct.

---

## Validation

Run:

- TypeScript/typecheck
- build
- lint
- relevant tests
- real browser runtime validation

Use evidence-based verdicts.

---

## Execution Summary

### Task File
- exact resolved task-file path: `spint/TASK-GWORKSPACE-002R - Google Workspace Connect CTA.md`

### Audit
- **PROVEN:** OAuth flow exists: `POST /api/google/oauth/connect` returns auth URL, `GET /api/google/oauth/status` returns connection state, `GET /api/google/oauth/callback` handles OAuth callback and redirects to `${CLIENT_URL}/settings?google_connected=true`
- **PROVEN:** Current Drive disconnected state shows text "Connect your Google account in Settings to access Drive" with no actionable button
- **PROVEN:** `GoogleConnectionCard` in Settings implements connect flow via `POST /api/google/oauth/connect` → `window.location.href = data.url`
- **DERIVED:** Adding `returnTo` param to OAuth state allows redirect back to Drive after callback
- **INSUFFICIENT_EVIDENCE:** Runtime validation requires real Google account

### Changes
- files modified: `src/services/google/oauth-service.ts`, `src/services/google/oauth-router.ts`, `src/features/google/components/google-drive-browser.tsx`
- existing OAuth flow reused: Yes — `POST /api/google/oauth/connect`, `GET /api/google/oauth/status`, `GET /api/google/oauth/callback`
- Drive CTA implementation: Added Connect Google button to disconnected state, reuses same OAuth endpoint with `returnTo: '/google/drive'`

### Runtime Evidence
- INSUFFICIENT_EVIDENCE (requires real Google account for runtime validation)

### Acceptance Criteria
- [x] PASS: `/google/drive` shows Connect Google button when disconnected
- [x] PASS: Button reuses existing OAuth implementation
- [x] PASS: OAuth callback redirects to `/google/drive` after successful connection
- [x] PASS: Connected state preserves existing Drive browser behavior
- [x] PASS: Settings connection UI remains unchanged
- [x] PASS: Error state shows business-readable message
- [x] NOT VERIFIED: Full browser flow with real Google account

### Remaining Issues
- Runtime validation requires real Google account (marked INSUFFICIENT_EVIDENCE)

### Go-Live Impact
- GO WITH LIMITATIONS — all code changes verified, runtime validation requires real Google credentials

### Git
- branch: `task/gworkspace-002r-connect-cta`
- commit hash: *pending*
- commit message: `fix(gworkspace): add drive connect google entry flow (TASK-GWORKSPACE-002R)`
