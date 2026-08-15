# TASK-OPENCODE-027 — Legacy Implementation Audit & Cleanup

## Type

Deep Audit + Conditional Cleanup

## Priority

P0 — Alpha One Core Finalization

## Status

COMPLETE

---

# Executive Verdict

**PASS**

---

# Audit Summary

## Repository Scope

- **Frontend**: 50 routes, 15 feature directories, 15+ Zustand stores
- **Backend**: 66 endpoints across 9 routers
- **Dependencies**: 42 production, 32 dev

## Classification System

Every candidate classified as:
- PROVEN USED
- PROVEN UNUSED
- PROVEN DUPLICATE
- PROVEN DEAD
- LEGACY BUT POSSIBLY USED
- UNKNOWN

Only PROVEN UNUSED/DEAD/DUPLICATE were deleted.

---

# Cleanup Inventory

| Candidate | Layer | Location | Classification | Action |
|-----------|-------|----------|----------------|--------|
| Dashboard feature | Frontend | `src/features/dashboard/` | PROVEN DEAD | **REMOVED** |
| `@tanstack/react-table` | Dependency | `package.json` | PROVEN UNUSED | **REMOVED** |
| `tanstack-table.d.ts` | Frontend | `src/tanstack-table.d.ts` | PROVEN UNUSED | **REMOVED** |
| `pngjs` | Dependency | `package.json` | PROVEN UNUSED | **REMOVED** |
| `VITE_CLERK_PUBLISHABLE_KEY` | Config | `.env` | PROVEN UNUSED | **REMOVED** |
| `dev:all` script | Config | `package.json` | PROVEN DUPLICATE | **REMOVED** |
| `@clerk/shared` build block | Config | `pnpm-workspace.yaml` | PROVEN UNUSED | **REMOVED** |
| Stale import order paths | Config | `.prettierrc` | PROVEN UNUSED | **REMOVED** |
| Legacy .gitignore entries | Config | `.gitignore` | PROVEN UNUSED | **REMOVED** |
| `/api/opencode/chat` (non-streaming) | Backend | `server.ts` | PROVEN UNUSED | **REMOVED** |
| `/api/opencode/status` | Backend | `server.ts` | PROVEN UNUSED | **REMOVED** |
| `/api/google/oauth/auth-url` | Backend | `oauth-router.ts` | PROVEN UNUSED | **REMOVED** |
| `/api/google/drive/folder/:id` | Backend | `drive-router.ts` | PROVEN UNUSED | **REMOVED** |
| `detectProviderStatus` import | Backend | `server.ts` | PROVEN UNUSED | **REMOVED** |
| `runChat` import | Backend | `server.ts` | PROVEN UNUSED | **REMOVED** |
| `getFolderMeta` import | Backend | `drive-router.ts` | PROVEN UNUSED | **REMOVED** |
| Runtime log files (*.log, *.err, *.out) | Files | project root | PROVEN UNUSED | **REMOVED** |
| `.env.example` real credentials | Security | `.env.example` | SECURITY FIX | **REPLACED** with placeholders |

---

# Preserved Legacy (Intentionally Kept)

## Kilo Code — DEVELOPER ONLY

| Item | Reason |
|------|--------|
| `src/features/ai/components/kilo-code-page.tsx` | Intentional developer/tool integration |
| `src/routes/_authenticated/ai/kilo-code.tsx` | Route exists, not in sidebar |
| `src/services/providers/KiloCodeProvider.ts` | Provider stub, part of provider system |
| `src/features/tools/providers/kilo-code-tool.ts` | Tool registration, part of tool system |

Classification: **DEVELOPER ONLY** — not deleted.

## Automation — SCAFFOLDING

| Item | Reason |
|------|--------|
| `src/features/automation/` (4 pages) | 3/4 are PagePlaceholder stubs, 1 has real PPT code |
| `src/routes/_authenticated/automation/*` | Route stubs, not in sidebar |

Classification: **SCAFFOLDING** — not deleted.

## Business/Productivity — PLACEHOLDER

| Item | Reason |
|------|--------|
| 8 business routes | All render SectionPlaceholder, not in sidebar |
| 2 productivity routes | All render SectionPlaceholder, not in sidebar |
| `src/features/sections/` | Shared placeholder component |

Classification: **PLACEHOLDER** — not deleted.

## Provider Abstraction Layer — LEGACY BUT USED

| Item | Reason |
|------|--------|
| `src/services/providers/ProviderManager.ts` | Used by `features/providers/store/providers-store.ts` |
| `src/services/providers/OpenCodeProvider.ts` | Used by ProviderManager |
| `src/features/providers/` | Active feature, has store and config page |

Classification: **LEGACY BUT POSSIBLY USED** — not deleted.

## Google Sub-Routes — PARTIALLY ACTIVE

| Item | Reason |
|------|--------|
| `/google/docs` | Has real GoogleDocsPage component |
| `/google/sheets` | Has real GoogleSheetsPage component |
| `/google/slides` | Has real GoogleSlidesPage component |
| `/google/calendar` | SectionPlaceholder |
| `/google/gmail` | SectionPlaceholder |

Classification: **PARTIALLY ACTIVE** — not deleted.

---

# Root Causes for Deletion

## Dashboard (`src/features/dashboard/`)
303-line component with zero imports anywhere in the codebase. No route points to it. No sidebar reference. Superseded by `features/workspace/pages/workspace-dashboard.tsx`. Confirmed dead via grep for `features/dashboard` — zero results.

## `@tanstack/react-table`
Only referenced in `tanstack-table.d.ts` for a `ColumnMeta` type augmentation. No `useReactTable`, `createColumnHelper`, `flexRender`, or any other API imported anywhere. The `Table` component is a pure HTML wrapper.

## `pngjs`
Zero imports across all source and test files. Leftover from a removed feature.

## Unused Backend Endpoints
- `/api/opencode/chat` (non-streaming): Frontend exclusively uses `/api/opencode/chat/stream`
- `/api/opencode/status`: All health checks use `/api/opencode/health` instead
- `/api/google/oauth/auth-url`: Frontend uses `/connect` endpoint instead
- `/api/google/drive/folder/:id`: No frontend caller found

---

# Deleted Files

```
D src/features/dashboard/index.tsx (303 lines)
D src/tanstack-table.d.ts (10 lines)
```

## Modified Files

```
M package.json (removed @tanstack/react-table, pngjs, dev:all script)
M .env (removed VITE_CLERK_PUBLISHABLE_KEY)
M .env.example (removed Clerk, replaced real credentials with placeholders)
M .prettierrc (removed 8 stale import order paths)
M .gitignore (removed legacy entries, added *.err/*.out patterns)
M pnpm-workspace.yaml (removed @clerk/shared block)
M src/services/opencode/server.ts (removed 2 endpoints, 2 unused imports)
M src/services/google/oauth-router.ts (removed 1 endpoint)
M src/services/google/drive-router.ts (removed 1 endpoint, 1 unused import)
```

---

# Validation

## TypeScript
`tsc --noEmit` — PASS

## ESLint
Only pre-existing warnings (opencode.tsx fast refresh, server.ts unused destructured variables from file_event handler). No new errors.

## Runtime
- Server starts: PASS
- Health endpoint: PASS
- Models discovery: 34 models found: PASS
- Workspace detection: `C:\dev\alpha-workspace`: PASS
- Deleted endpoints return 404: PASS

## Core Smoke Test
- Alpha Workspace: accessible
- Models: 34 discovered
- Health: OK
- Workspace: correct path
- Google OAuth: still functional (endpoints preserved)
- Resources: endpoints preserved
- Runtime: endpoints preserved

## Developer Mode
- Sidebar Platform group: gated by `developerOnly: true`
- RuntimeStatusBar: gated by `developerMode`
- DeveloperPanel: gated by `developerMode`
- All developer routes: still accessible

---

# Git Evidence

## Branch
`task/gworkspace-002-r1-drive-access-rework`

## Files Changed
```
D src/features/dashboard/index.tsx
D src/tanstack-table.d.ts
M package.json
M .env
M .env.example
M .prettierrc
M .gitignore
M pnpm-workspace.yaml
M src/services/opencode/server.ts
M src/services/google/oauth-router.ts
M src/services/google/drive-router.ts
```

## Diff Stats
```
11 files changed, 12 insertions(+), 414 deletions(-)
```

---

# Verdict

**PASS**
