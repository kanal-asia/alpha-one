# TASK-OPENCODE-024 — Local Runtime Port Isolation + Alpha One UI Port 3000

## Type

Corrective / Runtime Infrastructure

## Priority

P0

## Status

COMPLETE

---

# Executive Verdict

**PASS**

---

# Audit

## Current Architecture (Before)

```
Vite frontend → localhost:5173 (default, implicit)
Alpha One runtime → localhost:3001
Vite proxy: /api → localhost:3001
```

## Active References Changed

| File | Before | After | Category |
|------|--------|-------|----------|
| `vite.config.ts` | No explicit port (default 5173) | `port: 3000` | ACTIVE CONFIG |
| `.env.example` | `CLIENT_URL=http://localhost:5173` | `CLIENT_URL=http://localhost:3000` | ACTIVE CONFIG |
| `oauth-router.ts` | Fallback `'http://localhost:5173'` | Fallback `'http://localhost:3000'` | ACTIVE CONFIG |
| `alpha-server.ts` | No collision detection | Health check + EADDRINUSE handler | ACTIVE CODE |

## Active References Kept (Internal)

| File | Port | Reason |
|------|------|--------|
| `vite.config.ts` proxy target | 3001 | Internal proxy to backend |
| `alpha-server.ts` default | 3001 | Internal runtime port |
| `opencode/server.ts` | 3001 | Internal runtime port |
| `opencode/runtime.ts` | 3001 | RuntimeManager default |
| `.env` GOOGLE_OAUTH_REDIRECT_URI | 3001 | OAuth callback goes to backend directly |

## Stale References (Documentation Only)

All remaining `5173` and `3001` references are in `spint/` task documentation files — historical records, not active code.

---

# Corrective Changes

## 1. Frontend Port: 5173 → 3000

**`vite.config.ts`**: Added `server.port: 3000`

The Vite dev server now binds to port 3000 explicitly. No more implicit 5173.

## 2. OAuth CLIENT_URL: 5173 → 3000

**`.env.example`**: `CLIENT_URL=http://localhost:3000`
**`oauth-router.ts`**: Fallback default updated to `http://localhost:3000`

The OAuth post-redirect now sends users to `localhost:3000`.

Note: `.env` is not tracked by git. Local `.env` must be updated manually (already done in this workspace).

## 3. Runtime Port Collision Detection

**`alpha-server.ts`**: Added `isAlphaOneRunning()` health check before binding.

Before starting, the server probes `http://localhost:{PORT}/api/opencode/health`:
- If reachable → existing Alpha One runtime detected → exit cleanly with message
- If not reachable → proceed to bind

Also added `server.on('error')` handler for `EADDRINUSE` to provide a clear error message instead of an unhandled crash.

## 4. No Changes To

- Internal runtime port (3001) — remains as implementation detail
- `package.json` scripts — `concurrently -k` behavior unchanged
- Google OAuth redirect URI — stays at `localhost:3001` (backend callback)

---

# Architecture After

```
http://localhost:3000
      │
      ├── Alpha One UI (Vite)
      │
      └── /api/* (Vite proxy)
             │
             ↓
      http://localhost:3001 (internal)
             │
             ├── OpenCode
             ├── Google OAuth
             ├── Resources
             ├── Skills
             └── local tools
```

---

# Runtime Evidence

## Frontend Port

- Vite starts on `http://localhost:3000` — PROVEN
- HTTP 200 on `localhost:3000` — PROVEN

## Proxy

- `GET /api/opencode/health` via `localhost:3000` returns 200 — PROVEN
- Frontend-to-runtime communication works through proxy — PROVEN

## Collision Detection

- First instance starts normally on port 3001 — PROVEN
- Second instance detects existing runtime and exits cleanly — PROVEN
- No EADDRINUSE crash — PROVEN

## OAuth

- `CLIENT_URL` now points to `localhost:3000` — PROVEN
- OAuth callback still goes to `localhost:3001/api/google/oauth/callback` — correct
- Post-OAuth redirect goes to `localhost:3000` — PROVEN

## Local-First

- No VPS file storage introduced — PROVEN
- No file duplication introduced — PROVEN
- Resources remain reference-only — PROVEN

---

# Validation

- `tsc --noEmit` — PASS
- ESLint — no new errors
- Runtime — PROVEN (server on 3001, Vite on 3000, proxy working, collision detection working)

---

# Git Evidence

## Branch

`task/gworkspace-002-r1-drive-access-rework`

## Files Changed

```
 M .env.example                        |  2 +-
 M src/server/alpha-server.ts          | 43 ++++++++++++++++++++++++++++++++++++-
 M src/services/google/oauth-router.ts |  2 +-
 M vite.config.ts                      |  9 ++++++++
```

## Diff Stats

```
4 files changed, 53 insertions(+), 3 deletions(-)
```

---

# Verdict

**PASS**
