# TASK-GWORKSPACE-002 — Google OAuth Runtime Configuration Fix

## Objective

Perbaiki Google Workspace OAuth runtime configuration sampai aplikasi benar-benar dapat membaca credential dari `.env`, menghasilkan Google authorization URL, menjalankan callback, menyimpan token, dan melaporkan koneksi sebagai `connected:true`.

---

## Execution Summary

### Final Verdict: PASS

### Root Cause

**PROVEN:** No `dotenv` package was installed. The backend server (`tsx src/server/alpha-server.ts`) never loaded `.env` file. Vite loads `.env` for the frontend automatically, but the backend process had no `.env` loading mechanism. Therefore `process.env.GOOGLE_CLIENT_ID` etc. were `undefined`, making `isConfigured()` return `false`.

### Evidence

1. **Environment audit:** `.env` file exists with correct variables (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `CLIENT_URL`)
2. **Loading mechanism:** No `dotenv` import anywhere in server code. `tsx` does not auto-load `.env`.
3. **Fix:** Installed `dotenv`, added `import 'dotenv/config'` at top of `alpha-server.ts` and `server.ts`
4. **Runtime validation:**
   - `GET /api/google/oauth/status` → `{"connected":false,"configured":true}` (before OAuth)
   - `POST /api/google/oauth/connect` → returns valid Google authorization URL
   - After OAuth callback → `GET /api/google/oauth/status` → `{"connected":true,"configured":true,"email":"kanalconsultant.indonesia@gmail.com"}`
5. **Persistence:** `.alpha/google/connections.json` contains valid connection record with userId, email, connectedAt
6. **OAuth state files:** `.alpha/google/states/` consumed/deleted per one-time state design

### Files Changed

| File | Change |
|------|--------|
| `package.json` | Added `dotenv` dependency |
| `src/server/alpha-server.ts` | Added `import 'dotenv/config'` |
| `src/services/opencode/server.ts` | Added `import 'dotenv/config'` |
| `.env.example` | Added `CLIENT_URL` documentation |
| `spint/TASK-GWORKSPACE-002*.md` | Task file |

### Runtime Validation

| Step | Result |
|------|--------|
| `.env` loaded by runtime | PASS |
| Google OAuth variables present | PASS |
| Secret values not exposed | PASS |
| `GET /api/google/oauth/status` reports `configured:true` | PASS |
| `POST /api/google/oauth/connect` starts real OAuth flow | PASS |
| Google authorization callback succeeds | PASS |
| Tokens persisted server-side | PASS |
| `GET /api/google/oauth/status` reports `connected:true` | PASS |
| TypeScript passes | PASS |
| Build passes | PASS |
| Lint passes (1 pre-existing warning) | PASS |

### Port Decision

`localhost:5173` retained — Vite proxy correctly configured.

### Remaining Issues

None. All acceptance criteria met.

### Go-Live Impact

GO

### Git

- branch: `task/gworkspace-002-oauth-runtime-fix`
- commit hash: *pending*
- commit message: `fix(gworkspace): fix oauth runtime configuration (TASK-GWORKSPACE-002)`
