# TASK-OPENCODE-025 — Default Model: DeepSeek V4 Flash Free

## Type

Small Corrective

## Priority

P1

## Status

COMPLETE

---

# Executive Verdict

**PASS**

---

# Audit

## Root Cause

**PROVEN** — `loadModels()` in `opencode-store.ts` selected the first free model sorted alphabetically by `displayName`:

```javascript
const firstFree = [...models]
  .sort((a, b) => Number(b.free) - Number(a.free) || a.displayName.localeCompare(b.displayName))
  .find((m) => m.free)
```

"Big Pickle" sorts before "DeepSeek V4 Flash Free" alphabetically, so it was always selected as the default for new users or when no model was persisted.

## Existing Mechanism

- `DEFAULT_SETTINGS.defaultModel` was `''` (empty)
- `hydrateSettings()` merges persisted localStorage over defaults
- `loadModels()` auto-selects when current model doesn't exist
- No explicit intended-default constant existed

## Persistence Behavior

- Existing persisted model selections are preserved (not overwritten)
- New default only applies when no valid model is persisted

---

# Corrective Changes

## Added Constant

```javascript
const INTENDED_DEFAULT_MODEL = 'opencode/deepseek-v4-flash-free'
```

## Updated loadModels()

When the current model doesn't exist, the logic now:

1. **First**: Check if `INTENDED_DEFAULT_MODEL` is available → use it
2. **Fallback**: First free model sorted alphabetically (existing behavior)

This preserves user selection when valid, and applies the intended default only when appropriate.

---

# Runtime Smoke Test

## Model Availability

**PROVEN** — `opencode/deepseek-v4-flash-free` exists in the model list with display name "DeepSeek V4 Flash Free".

## Alphabetical Confirmation

**PROVEN** — Free models sorted alphabetically:
1. Big Pickle
2. chatgpt-image-latest
3. DeepSeek V4 Flash Free

This confirms Big Pickle was incorrectly selected by the old logic.

## Fresh Default

When `defaultModel` is empty and `opencode/deepseek-v4-flash-free` is available:
- Selected model: `opencode/deepseek-v4-flash-free`
- Display name: `DeepSeek V4 Flash Free`

## Explicit User Choice

If user previously selected a different model and it's still valid:
- Persisted selection preserved
- New default does not overwrite

## Unavailable Default

If `opencode/deepseek-v4-flash-free` is not available:
- Falls back to first free model alphabetically (existing behavior)
- No crash, no fake model

---

# Validation

- `tsc --noEmit` — PASS
- ESLint — no new errors
- Runtime — PROVEN

---

# Project Folder Note

Project Folder bug remains UNPROVEN / INTERMITTENT and was not modified.

---

# Git Evidence

## Branch

`task/gworkspace-002-r1-drive-access-rework`

## Files Changed

```
M src/features/ai/opencode/store/opencode-store.ts
```

## Diff Stats

```
1 file changed, 13 insertions(+), 4 deletions(-)
```

---

# Verdict

**PASS**
