# TASK-OPENCODE-032 — Development Runtime Isolation

## Type

Small Corrective / Engineering Infrastructure

## Priority

P0 — Development Stability

## Status

COMPLETE — PASS

---

# 1. Root Cause

The incident involved an unintended process (PID 9304) occupying port 3001 during agent validation. The root cause of PID 9304 is UNKNOWN — the process was killed before command-line evidence was captured.

Classification: `PROVEN — unintended process occupied 3001`

The root cause is that there was no mechanism to prevent agent/test runtimes from starting on port 3001, and no utility to dynamically allocate isolated ports.

---

# 2. Implementation

## Files Created

| File | Lines | Role |
|------|-------|------|
| `src/server/isolated-runtime.ts` | +210 | Port allocator, isolated runtime launcher, process tree kill |

## Files Modified

| File | Change |
|------|--------|
| `vite.config.ts` | Proxy target now reads `process.env.BACKEND_PORT \|\| 3001` (was hardcoded `3001`) |

## Key Components

### findFreePort()

Binds to port 0 (OS-assigned), returns the assigned port. Guarantees no collision with occupied ports.

### startIsolatedRuntime(options)

1. Calls `findFreePort()` to get a free port
2. Spawns `tsx src/server/alpha-server.ts` with `PORT=<free_port>`
3. Polls `/api/opencode/health` until healthy
4. Returns `{ port, url, pid, process, cleanup }`
5. `cleanup()` uses `taskkill /F /T /PID` (Windows) to kill the entire process tree

### killProcessTree(pid)

Windows-safe: uses `taskkill /F /T /PID` to kill parent + all child processes. Prevents orphaned node processes surviving parent termination.

### Vite Proxy Dynamic Target

```ts
target: `http://localhost:${process.env.BACKEND_PORT || 3001}`
```

Isolated runtimes set `BACKEND_PORT` to point the Vite proxy to the correct port.

---

# 3. Port Flow

```
npm run dev (primary)
  → PORT=3001 (default fallback)
  → Vite proxy: process.env.BACKEND_PORT || 3001 = 3001
  → localhost:3000 → localhost:3001

Isolated runtime (agent/test)
  → findFreePort() → 3102
  → PORT=3102
  → Vite proxy: BACKEND_PORT=3102 (if set)
  → localhost:3102
```

---

# 4. Validation Evidence

## Test A: Port Collision

```
Primary on 3001:  YES (PID 10600)
Isolated on 3102: YES (PID 2588)
Ports different:  YES
Isolated health:  OK
After cleanup:    Port 3102 FREE, Port 3001 OCCUPIED (PID 10600)
```

## Test B: Concurrent Runtimes

```
Primary 3001:     PID 10600
Isolated A 3201:  PID 3356
Isolated B 3202:  PID 1252
All different PIDs: YES
Isolated A health: OK
Isolated B health: OK
After cleanup:    Port 3201 FREE, Port 3202 FREE, Port 3001 OCCUPIED
```

## Regression

```
Primary runtime survived all isolation tests
Port 3001 remained occupied by primary throughout
No orphaned processes after cleanup
```

---

# 5. Hardcoded Port 3001 Audit

| File | Line | Classification | Status |
|------|------|---------------|--------|
| `alpha-server.ts:45` | `PORT \|\| 3001` | PRIMARY RUNTIME fallback | Acceptable — reads `process.env.PORT` first |
| `server.ts:63` | `RuntimeManager(3001)` | PRIMARY RUNTIME fallback | Acceptable — reads `process.env.PORT` first |
| `server.ts:628` | `PORT \|\| 3001` | PRIMARY RUNTIME fallback | Acceptable — reads `process.env.PORT` first |
| `runtime.ts:229` | `constructor(port = 3001)` | PRIMARY RUNTIME fallback | Acceptable — always overridden by caller |
| `vite.config.ts:28` | `target: 'http://localhost:3001'` | CONFIG | **FIXED** — now reads `BACKEND_PORT` env var |
| `.env:8` | `GOOGLE_OAUTH_REDIRECT_URI=...3001...` | CONFIG (OAuth) | Acceptable — user-configurable, primary-only |

---

# 6. Scope Discipline

- No OpenCode product architecture changes
- No model/provider changes
- No Google Sheets tools changes
- No Skills/Resources/Execution Summary changes
- Only isolation infrastructure added
- Primary `npm run dev` workflow unchanged

---

# 7. Git Evidence

- **Branch**: `task/gworkspace-002-r1-drive-access-rework`
- **Files changed**: 2
- **Lines**: +210 (isolated-runtime.ts), +1 (vite.config.ts)
- **Commit**: pending

---

# 8. Verdict

**PASS**

- Primary runtime on 3001: PROVEN
- Isolated runtime on free port: PROVEN
- Port collision avoided: PROVEN
- Concurrent runtimes: PROVEN
- Cleanup only kills isolated: PROVEN
- Primary survives isolation: PROVEN
- No orphaned processes: PROVEN
