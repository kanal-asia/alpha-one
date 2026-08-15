# TASK-OPENCODE-023 — Model Reasoning UX & Runtime Wiring

## Type

Corrective Feature / UX Simplification

## Priority

P1

## Status

COMPLETE

---

# Executive Verdict

**PASS**

---

# Audit

## Current Model Discovery

**PROVEN** — OpenCode CLI outputs `opencode models --verbose` with full model metadata including `variants` field. The discovery chain is:

```
CLI: opencode models --verbose
  → normalize.ts: normalizeModel()      ← raw data preserved as metadata
  → runtime-model.ts: toRuntimeModelAdapter()  ← variants passed through
  → server.ts GET /api/opencode/models  ← returns RuntimeModel[] with variants
  → http-transport.ts: listModels()     ← returns ModelInfo[] with variants
  → store: loadModels()                 ← stores ModelInfo[] with variants
```

## Variant/Reasoning Discovery

**PROVEN** — Each model's `variants` field is a `Record<string, Record<string, unknown>>` where:
- Keys are variant names (e.g., `"low"`, `"high"`, `"max"`, `"minimal"`, `"none"`)
- Values contain provider-specific config (e.g., `{ reasoningEffort: "high" }`, `{ thinking: { type: "enabled" } }`)

Example from `opencode/deepseek-v4-flash-free`:
```json
{ "low": { "reasoningEffort": "low" }, "high": { "reasoningEffort": "high" }, "max": { "reasoningEffort": "max" } }
```

## Temperature Implementation

**PROVEN** — Temperature was a UI-only number input (`settings.temperature`). Default `0.7`. Never sent to OpenCode CLI. The CLI only receives `--model`, `--agent`, `--variant`, `--session`, `--file`.

## Max Tokens Implementation

**PROVEN** — Max Tokens was a UI-only number input (`settings.maxTokens`). Default `4096`. Never sent to OpenCode CLI.

## OpenCode Request Path

**PROVEN** — The CLI invocation is:
```
opencode run <message> --model <id> --format json [--agent <mode>] [--variant <variant>] [--session <id>] [--file <f>]
```

The `--variant` flag was already supported by the CLI but not wired in Alpha One.

---

# Corrective Changes

## Removed Controls

| Control | Location | Was | Now |
|---------|----------|-----|-----|
| Temperature | Settings > Model Defaults | UI-only number input | Removed |
| Max Tokens | Settings > Model Defaults | UI-only number input | Removed |
| Disclaimer text | Settings > Model Defaults | "presentation-only" notice | Replaced with variant info |

## Dynamic Reasoning UI

**Location**: Chat header toolbar, between Model selector and Mode selector.

**Behavior**:
- Reads `selectedModel.variants` from the model list
- If variants exist → shows `<Select>` with variant names (capitalized)
- If no variants → selector hidden
- Model change → clears variant if not supported by new model

## Runtime Wiring

**Full path**:
```
User selects variant in toolbar
  → updateSettings({ defaultVariant: "high" })
    → sendMessage() reads settings.defaultVariant
      → sendPrompt(..., variant="high")
        → HTTP POST body: { ..., variant: "high" }
          → server.ts: args.push("--variant", "high")
            → CLI: opencode run ... --variant high
```

## Model Change Behavior

When model changes:
1. `onSelect` in toolbar calls `updateSettings({ defaultModel: model.id, defaultVariant: '' })`
2. Variant selector recomputes from `selectedModel.variants`
3. If previously selected variant not in new model's variants → shows placeholder "Reasoning"
4. Next request uses empty variant (CLI default)

## Unsupported Variant Handling

Models with no variants (e.g., `opencode/big-pickle`):
- `variantNames` array is empty
- Variant selector is hidden (`variantNames.length > 0` guard)
- No invalid option is sent

---

# Runtime Evidence

## Model A: opencode/deepseek-v4-flash-free

**Variants discovered**: `low`, `high`, `max`
**Selector visible**: Yes
**Chat with variant "high"**: PROVEN — 6 events returned, chat completed successfully

## Model B: opencode/big-pickle

**Variants discovered**: none (empty)
**Selector visible**: No
**Chat without variant**: PROVEN — works normally

## Outgoing Request Evidence

**PROVEN** — Server receives `variant` in request body and adds `--variant high` to CLI args:
```
args = ["run", message, "--model", "opencode/deepseek-v4-flash-free", "--format", "json", "--variant", "high"]
```

---

# Storage Verification

## No reasoning-option list in Alpha One backend

**PROVEN** — Variants are discovered at runtime from OpenCode CLI. No hardcoded list, no persistence, no backend storage.

## No hardcoded reasoning registry

**PROVEN** — `variantNames` is derived from `selectedModel.variants` at render time via `useMemo`.

## Selected variant persistence

**PROVEN** — `defaultVariant` persists through existing `OpenCodeSettings` mechanism (localStorage). Same as `defaultModel` and `defaultMode`.

---

# Validation

## TypeScript

`tsc --noEmit` — **PASS** (zero errors)

## ESLint

Pre-existing errors only (line 54 of `server.ts`). No new errors.

## Runtime

**PROVEN** — Server returns variants in `/api/opencode/models`. Chat with variant works. Model change clears variant. No-variant model hides selector.

---

# Git Evidence

## Branch

`task/gworkspace-002-r1-drive-access-rework`

## Files Changed (11)

```
M src/features/runtime/contract.ts            — RuntimeModel.variants
M src/services/opencode/normalize.ts          — extract variants from raw CLI
M src/services/opencode/types.ts              — ProviderModel.variants
M src/services/opencode/runtime-model.ts      — pass variants through adapter
M src/features/ai/opencode/types.ts           — OpenCodeSettings: -temperature, -maxTokens, +defaultVariant
M src/features/ai/opencode/store/opencode-store.ts — DEFAULT_SETTINGS, hydrate, sendMessage variant
M src/features/ai/opencode/services/opencode-service.ts — sendPrompt variant param
M src/features/ai/opencode/services/http-transport.ts — sendPrompt variant param + body
M src/features/ai/opencode/components/settings-page.tsx — remove Temp/MaxTokens UI
M src/features/ai/opencode/components/opencode-toolbar.tsx — add variant selector
M src/services/opencode/server.ts             — ChatRequestBody.variant + --variant arg
```

## Diff Stats

```
11 files changed, 71 insertions(+), 42 deletions(-)
```

---

# Verdict

**PASS**
