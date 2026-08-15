# TASK-OPENCODE-023R1 — Reasoning Default + Toolbar Width Corrective

## Type

Small Corrective

## Priority

P1

## Parent

TASK-OPENCODE-023 — Model Reasoning UX & Runtime Wiring

## Status

COMPLETE

---

# Executive Verdict

**PASS**

---

# Root Cause

## Issue A — No Default Variant Selected

The toolbar computed `activeVariant` as either the persisted `defaultVariant` or empty string `''`. There was no fallback logic to select a valid default from the model's available variants when no valid persisted selection existed.

## Issue B — Selector Too Narrow

The Reasoning selector trigger had `w-[110px]` which truncated the "Reasoning" label to "Reasonin...".

---

# Corrective Changes

## Default Selection Logic

Added `resolveDefaultVariant(available, persisted)` function with priority:

1. **Persisted valid** — if `persisted` is in `available`, use it
2. **"low" fallback** — if `"low"` is in `available`, use it (safest, least reasoning effort)
3. **First available** — otherwise use `available[0]`

Added `useEffect` to auto-persist the resolved default when:
- variant names exist for the current model
- resolved variant differs from persisted value

## Model Change Handling

The `onSelect` handler clears `defaultVariant` to `''`. The `resolveDefaultVariant` function then picks a valid default for the new model from the available variants.

## Selector Width

Changed trigger from `w-[110px]` to `w-[120px]` — matches the Mode selector width and provides sufficient space for "Reasoning" and variant labels.

---

# Runtime Verification

## Model with Variants: opencode/deepseek-v4-flash-free

- Variants discovered: `low`, `high`, `max`
- Default auto-selected: `low` (persisted via `useEffect`)
- Selector visible: Yes
- Full label "Reasoning" readable: Yes
- Chat with variant "low": PROVEN — 6 events returned

## Model without Variants: opencode/big-pickle

- Variants: none
- Selector hidden: Yes
- Chat functional: Yes

## Model Switch

- Switch from no-variant to variant model → selector appears, default selected
- Switch from variant to no-variant model → selector hidden, variant cleared

---

# Visual QA

- Trigger width `w-[120px]` — "Reasoning" fully visible
- Dropdown options readable — variant names displayed with capitalization
- Toolbar balanced — no overlap, no unexpected wrapping
- Mode selector unchanged at `w-[120px]`

---

# Validation

- `tsc --noEmit` — PASS
- ESLint — no new errors
- Runtime — PROVEN

---

# Git Evidence

## Branch

`task/gworkspace-002-r1-drive-access-rework`

## Files Changed

```
M src/features/ai/opencode/components/opencode-toolbar.tsx
```

## Diff Stats

```
1 file changed, 28 insertions(+), 6 deletions(-)
```

---

# Verdict

**PASS**
