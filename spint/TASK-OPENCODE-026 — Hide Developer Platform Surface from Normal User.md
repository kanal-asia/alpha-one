# TASK-OPENCODE-026 — Hide Developer / Platform Surface from Normal User

## Type

Small Corrective / UX Surface Separation

## Priority

P1

## Status

COMPLETE

---

# Executive Verdict

**PASS**

---

# Audit

## Current Platform Visibility

### Sidebar Platform Group

**ALREADY GATED** — `sidebar-data.ts:87` sets `developerOnly: true` on the entire Platform group. `navGroupsForMode()` at line 140-142 filters it out when `developerMode === false`. No code change needed.

### RuntimeStatusBar

**ALREADY GATED** — `authenticated-layout.tsx:39` renders `{developerMode && <RuntimeStatusBar />}`. Only visible when Developer Mode is ON.

### TanStack Router Devtools

**ALREADY GATED** — `__root.tsx:19` renders devtools only when `import.meta.env.MODE === 'development'`. Not visible in production builds. Independent of Developer Mode cookie.

### DeveloperPanel (OpenCode Developer Console)

**NOT GATED** — `opencode-page.tsx:149` rendered `<DeveloperPanel />` unconditionally. Visible to all users regardless of Developer Mode. **THIS WAS THE BUG.**

## Developer Mode State

**Source**: `developer-mode-provider.tsx` — Cookie `developer_mode` (`'on'`/`'off'`), 7-day expiry. React `useState` initialized from cookie. Mounted at app root in `main.tsx:87`.

**Consumers**:
- `app-sidebar.tsx:17` — filters nav groups ✓
- `authenticated-layout.tsx:18` — gates RuntimeStatusBar ✓
- `command-menu.tsx:23` — filters command palette ✓
- `settings/index.tsx:11` — toggle switch ✓
- `opencode-page.tsx` — **DID NOT CONSUME** (bug)

## OpenCode Settings Developer Mode Toggle

**Independent system** — `settings.developerMode` in OpenCode zustand store (`opencode-store.ts:46`), persisted to localStorage. Controls a toggle in `settings-page.tsx:137`. Was described as "Show the developer console by default" but had **no actual effect** on DeveloperPanel rendering.

---

# Corrective Changes

## Files Changed

```
M src/features/ai/opencode/components/opencode-page.tsx
M src/features/ai/opencode/components/settings-page.tsx
```

## Change 1: Gate DeveloperPanel (`opencode-page.tsx`)

Added `useDeveloperMode` import and consumption:

```tsx
import { useDeveloperMode } from '@/context/developer-mode-provider'

export function OpenCodeDashboard() {
  const { developerMode } = useDeveloperMode()
  // ...
```

Changed DeveloperPanel rendering from unconditional to gated:

```tsx
// Before:
<DeveloperPanel logs={logs} runtimeEvents={runtimeEvents} />

// After:
{developerMode && <DeveloperPanel logs={logs} runtimeEvents={runtimeEvents} />}
```

## Change 2: Update Settings Description (`settings-page.tsx`)

Updated the OpenCode Developer Mode toggle description to reflect the new behavior:

```tsx
// Before:
Show the developer console by default.

// After:
Developer Panel is controlled by the global Developer Mode toggle.
```

---

# Runtime Smoke Test

## Test A — Default User (Developer Mode OFF)

**PROVEN** — With Developer Mode cookie set to `'off'`:
- Sidebar: Platform group hidden ✓
- RuntimeStatusBar: hidden ✓
- DeveloperPanel: hidden ✓
- TanStack Router Devtools: hidden (production build) ✓
- User sees only: Alpha Workspace, Drive, Resources, Results, Activity, Skills, Settings ✓

## Test B — Developer Mode ON

**PROVEN** — With Developer Mode cookie set to `'on'`:
- Sidebar: Platform group visible ✓
- RuntimeStatusBar: visible ✓
- DeveloperPanel: visible ✓
- All developer routes accessible ✓

## Test C — Disable Again

**PROVEN** — Toggling Developer Mode OFF:
- Platform group disappears from sidebar ✓
- RuntimeStatusBar disappears ✓
- DeveloperPanel disappears ✓
- User-facing navigation remains intact ✓

## Test D — Core User Surface

**PROVEN** — With Developer Mode OFF:
- Alpha Workspace: accessible ✓
- Drive: accessible ✓
- Resources: accessible ✓
- Results: accessible ✓
- Activity: accessible ✓
- Skills: accessible ✓
- Settings: accessible ✓
- No regression ✓

---

# Resource Integrity

Explicitly confirmed:

- No file copies introduced
- No backend binary storage introduced
- No duplicate local files introduced
- Original source remains authoritative
- Resources remain reference/metadata only

---

# Validation

- `tsc --noEmit` — PASS
- ESLint — no new errors (only pre-existing warnings)
- Runtime verification — PROVEN

---

# Git Evidence

## Branch

`task/gworkspace-002-r1-drive-access-rework`

## Files Changed

```
M src/features/ai/opencode/components/opencode-page.tsx
M src/features/ai/opencode/components/settings-page.tsx
```

## Diff Stats

```
2 files changed, 5 insertions(+), 3 deletions(-)
```

---

# Verdict

**PASS**
