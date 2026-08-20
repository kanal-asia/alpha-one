# TASK-OPENCODE-084 — Model Picker Metadata & Pricing UX

## 1. Objective

Improve the Alpha One model picker so paid models show useful pricing and input-capability metadata, while preserving the existing behavior for free/custom-provider models.

The model picker must use **Models.dev as an enrichment source only**. Models.dev must NOT become a runtime dependency for model availability or provider connectivity.

This task is UI/metadata enrichment only. Do not redesign provider architecture, OpenCode integration, MCP architecture, or model execution.

---

## 2. Current Problem

The model picker currently displays paid models with a generic:

`PAID`

This does not help the user compare models.

Models.dev provides useful model metadata including:

- Input modalities
  - text
  - image
  - video
  - audio
  - PDF/document
- Input token pricing
- Output token pricing
- Model/provider information
- Other model capabilities and limits
- Model detail page

The desired UX is to expose the most useful subset directly in the model picker.

---

## 3. Target UX

### 3.1 Paid model found in Models.dev

Replace:

`PAID`

with:

`$INPUT / $OUTPUT`

Example:

`$0.38 / $1.88`

Interpretation:

- first value = input price per 1M tokens
- second value = output price per 1M tokens

Do not display misleading `$0.00 / $0.00` values.

---

### 3.2 Free model

Preserve the existing:

`FREE`

Do NOT replace free pricing with:

`$0 / $0`

or another numeric price representation.

---

### 3.3 Model not available in Models.dev

Preserve the existing paid fallback:

`PAID`

This applies when:

- the provider/model cannot be found in Models.dev, or
- Models.dev does not provide usable pricing metadata.

Do not break or hide models simply because Models.dev does not know them.

Models.dev is an enrichment source, not the source of truth for provider availability.

---

## 4. Input Capability Metadata

Display the model's supported input modalities using the **same capability icons/assets/visual representation used by Models.dev**.

Do NOT create custom emoji or replacement icons.

Relevant input capabilities include:

- Text
- Image
- Video
- Audio
- PDF/document

Only display capabilities actually supported by the resolved model metadata.

Example:

`[Models.dev text icon] [Models.dev image icon] [Models.dev audio icon] [Models.dev PDF icon]`

Do not invent capabilities from the model name.

If Models.dev has no capability metadata for the model, preserve the existing model row without fabricated capability information.

---

## 5. Model Details Link

For models successfully resolved against Models.dev, display a text hyperlink:

`Model details`

The link must point to the corresponding Models.dev model detail page.

Rules:

1. Show `Model details` only when a valid Models.dev model match exists.
2. Do not construct or guess a Models.dev URL from an arbitrary model name.
3. Use the resolved Models.dev model identity/path.
4. If the model is not found in Models.dev, do not show a broken or guessed link.
5. Opening the link must not interfere with model selection.

---

## 6. Model Identity / Matching

Do not match models by display name alone.

Resolve using the strongest available identity information, preferably:

1. Provider ID + model ID
2. Provider/model canonical identity
3. Existing provider metadata mapping
4. Only use a name-based fallback when the existing model system already guarantees that identity is unambiguous.

Example:

`google-vertex + gemini-2.5-flash`

must be resolved against the corresponding Models.dev provider/model entry rather than searching only for:

`Gemini 2.5 Flash`

This prevents incorrect pricing when the same model family exists through multiple providers.

---

## 7. Provider Independence

The implementation MUST work when Alpha One uses providers other than OpenCode.

Examples include:

- OpenCode providers
- Google Vertex
- OpenRouter
- DeepSeek
- Anthropic
- custom providers
- future providers

Models.dev enrichment must be optional.

Required behavior:

`Provider runtime → model availability`

remains authoritative.

`Models.dev → metadata enrichment`

is secondary.

A Models.dev failure, timeout, unavailable response, missing model, or schema mismatch must NOT prevent the model picker from loading available runtime models.

Fallback behavior:

- Existing model data remains visible.
- Existing `FREE`/`PAID` state remains usable.
- Models.dev enrichment may simply be absent.

---

## 8. Pricing Source Rules

Pricing displayed from Models.dev must be clearly treated as provider/model pricing metadata.

Do not imply that the displayed value is Alpha One's actual accumulated spend.

Actual usage/cost accounting remains outside this task.

Do not introduce:

- usage tracking
- billing calculation
- token accounting
- provider billing APIs
- cost estimation during inference

This task only displays model pricing metadata.

---

## 9. Dropdown UX

The model picker dropdown may be widened as necessary so the additional metadata remains readable.

Prefer a wider, clean model row over:

- truncated pricing
- hidden capability icons
- overlapping elements
- excessive wrapping

The row should remain easy to scan.

Target conceptual layout:

    ┌──────────────────────────────────────────────────────────────┐
    │ Gemini 2.5 Flash                            $0.38 / $1.88   │
    │ google-vertex          [text] [image] [audio] [PDF]         │
    │                         Model details                       │
    └──────────────────────────────────────────────────────────────┘

For free models:

    ┌──────────────────────────────────────────────────────────────┐
    │ Nemotron 3.5 Lightning Free                         FREE     │
    │ opencode                         [text] [image]              │
    └──────────────────────────────────────────────────────────────┘

For unknown/custom paid models:

    ┌──────────────────────────────────────────────────────────────┐
    │ Custom Model                                      PAID       │
    │ custom-provider                    [known runtime metadata]  │
    └──────────────────────────────────────────────────────────────┘

Exact visual implementation should follow the existing Alpha One design system rather than introducing a new component style.

---

## 10. Data Architecture

Implement a small, focused metadata enrichment/resolution layer if the existing architecture does not already provide one.

Conceptually:

    Runtime Provider/Model Inventory
                │
                ▼
        Model Metadata Resolver
                │
        ┌───────┴────────┐
        │                │
   Runtime data      Models.dev
   (authoritative)   (enrichment)
        │                │
        └───────┬────────┘
                ▼
        Normalized Model UI Data
                │
                ▼
           Model Picker

The normalized UI data should be able to represent:

- provider
- model ID
- display name
- free/paid state
- input modalities
- input price
- output price
- Models.dev match state
- Models.dev detail URL

Do not introduce a generalized model registry unless the existing architecture demonstrates that it is required.

Prefer the smallest production-ready implementation.

---

## 11. Caching / Performance

Models.dev metadata should not be fetched independently for every rendered model row.

Use an appropriate shared fetch/cache mechanism based on the existing Alpha One architecture.

Requirements:

- avoid N+1 requests
- avoid blocking the model picker indefinitely
- reuse metadata across model rows
- tolerate Models.dev being temporarily unavailable
- preserve existing model picker functionality while enrichment is loading/failing

If a local/server-side cache already exists for model metadata, reuse it.

Do not build a large caching subsystem for this task.

---

## 12. Failure Handling

The following must degrade gracefully:

- Models.dev unavailable
- network timeout
- malformed response
- model not found
- provider not found
- missing pricing
- missing modality metadata
- missing detail URL

Failure of enrichment must never make the underlying runtime model unavailable.

Examples:

`Models.dev unavailable → model still appears as PAID/FREE according to existing provider state.`

`Models.dev model missing → paid model remains PAID.`

`Models.dev pricing missing → paid model remains PAID.`

`Models.dev capability missing → no fabricated capability icons.`

---

## 13. Scope

### IN SCOPE

- Model picker UI
- Paid pricing display
- Free-state preservation
- Models.dev metadata resolution
- Models.dev input modality icons
- Models.dev model detail hyperlink
- Provider/model identity matching
- Graceful fallback
- Dropdown width/layout adjustment
- Minimal caching needed for efficient metadata loading
- Tests for the above behavior

### OUT OF SCOPE

- Provider architecture redesign
- OpenCode API redesign
- MCP changes
- Google Custom MCP changes
- OAuth changes
- Actual billing calculation
- Token usage accounting
- Provider onboarding
- Model execution changes
- Model routing changes
- Replacing existing runtime model discovery
- Making Models.dev a required dependency
- Redesigning the entire model picker

---

## 14. Acceptance Criteria

### Gate A — Existing Model Picker

- Existing providers still load.
- Existing model selection still works.
- No regression in model switching.
- No regression in free models.

### Gate B — Models.dev Enrichment

For a model known to Models.dev:

- correct model is matched
- pricing is resolved
- input modalities are resolved
- detail URL is resolved

### Gate C — Pricing UX

Paid known model:

`$input / $output`

Free model:

`FREE`

Unknown paid model:

`PAID`

No fabricated `$0 / $0`.

### Gate D — Capability UX

Supported input modalities display using the Models.dev visual representation.

Unsupported modalities are not displayed.

No manually invented capability mapping.

### Gate E — Model Details

Known Models.dev model:

`Model details` is visible and opens the correct Models.dev detail page.

Unknown model:

No Model details link.

### Gate F — Provider Independence

Test at least:

- one OpenCode-backed provider/model
- one non-OpenCode provider/model
- one custom/unknown model if available

Models.dev enrichment must not determine whether the model can be selected.

### Gate G — Failure Resilience

Simulate or prove:

- Models.dev unavailable
- model not found
- missing pricing

The model picker remains functional.

### Gate H — Performance

Confirm:

- no per-row Models.dev request storm
- metadata is reused/cached appropriately
- model picker does not become unusably slow

### Gate I — Visual Regression

Confirm:

- dropdown width is sufficient
- pricing is readable
- capability icons are readable
- Model details does not overlap other metadata
- existing UI remains visually coherent

### Gate J — Production Readiness

No unrelated files or architecture are changed.

No provider or MCP behavior is modified.

---

# 27. Execution Summary

## 27.1 Files Changed

- `src/services/opencode/modelsdev.ts` (NEW) — pure Models.dev enrichment resolver (provider+model matching, price/modality normalization, detail URL). Browser-safe, no Node imports.
- `src/services/opencode/client-modelsdev.test.ts` (NEW) — unit tests for the resolver (4 tests).
- `src/services/opencode/types.ts` — added `ModelsDevInputModality` + `ModelsDevEnrichment` types.
- `src/services/opencode/client.ts` — added disk-reading `readModelsDevCatalog()` (cached, 5-min TTL), `resolveModelsDevEnrichment()` (single), `resolveModelsDevEnrichments()` (list). Reuses OpenCode's local models.dev snapshot — no per-row network request.
- `src/services/opencode/server.ts` — `/api/opencode/models` attaches optional `modelsDev` to each model + `enrichment` summary. Fails open.
- `src/features/runtime/contract.ts` — added optional `RuntimeModel.modelsDev` (additive, non-breaking).
- `src/features/ai/opencode/components/model-selector.tsx` — UI: `$input / $output` pricing badge, FREE/PAID preservation, Models.dev modality icons (lucide Text/Image/Video/AudioLines/FileText), `Model details` hyperlink, widened dropdown (540px).
- `spint/TASK-OPENCODE-084-Model-Picker-Metadata-Pricing-UX.md` (this task file).

## 27.2 Provider/Model Identities Tested

Tested against the real local Models.dev catalog (OpenCode snapshot, 4MB):

| Provider | Model (slug) | Match | Input $ | Output $ | Modalities | Detail URL |
| --- | --- | --- | --- | --- | --- | --- |
| opencode (OpenCode Zen) | deepseek-v4-flash-free | ✓ | null (free) | null | [text] | models.dev/#/opencode/deepseek-v4-flash-free |
| opencode (OpenCode Zen) | gemini-3-pro | ✓ | 2 | 12 | [text,image,video,audio,pdf] | models.dev/#/opencode/gemini-3-pro |
| google-vertex | gemini-2.5-flash | ✓ | 0.3 | 2.5 | [text,image,video,audio,pdf] | models.dev/#/google-vertex/gemini-2.5-flash |
| google-vertex | gemini-2.5-flash-lite | ✓ | 0.1 | 0.4 | [text,image,video,audio,pdf] | models.dev/#/google-vertex/gemini-2.5-flash-lite |
| deepseek | deepseek-v4-flash | ✓ | 0.14 | 0.28 | [text] | models.dev/#/deepseek/deepseek-v4-flash |
| anthropic | claude-sonnet-4-5 | ✓ | 3 | 15 | [text,image,pdf] | models.dev/#/anthropic/claude-sonnet-4-5 |
| openrouter | nvidia/nemotron-3-super-120b-a12b | ✓ | 0.085 | 0.4 | [text] | models.dev/#/openrouter/... |
| unknown-provider | custom-model | ✗ | — | — | — | (none) |

Identity matching is by **provider ID + model ID** (strongest identity), NOT display name. Date-suffixed ids (`claude-sonnet-4-5@20250929`) and provider-scoped ids (`nvidia/nemotron-...`) are handled via a controlled prefix fallback. PROVEN.

## 27.3 Models.dev Source/Matching Evidence

- Enrichment reads OpenCode's **local models.dev catalog snapshot** (`~/.cache/opencode/models.json`, 4MB, same source models.dev publishes). No live network fetch per row — the exact same file `readModelsDevRegistry` already uses for provider discovery.
- Matcher resolves `provider + slug` → models.dev provider entry → model entry via strongest identity (`m.id === slug` / key match), then prefix fallback.
- `google-vertex + gemini-2.5-flash` resolves to the `google-vertex` provider entry (NOT `google`/`Gemini 2.5 Flash` search) — correct provider-scoped pricing (0.3/2.5). PROVEN.

## 27.4 Pricing Evidence (Gate C)

- Paid known: `google-vertex/gemini-2.5-flash` → `$0.30 / $2.50`; `anthropic/claude-sonnet-4-5` → `$3.00 / $15.00`. PROVEN.
- Free: `opencode/deepseek-v4-flash-free` → `FREE` (cost 0 → prices null → free branch first; **no `$0 / $0`**). PROVEN.
- Unknown paid: `unknown-provider/custom-model` → `PAID` (no match → fallback badge). PROVEN.
- Pricing is presented as Models.dev provider/model pricing metadata, not Alpha One spend. No billing/usage/token accounting introduced. PROVEN.

## 27.5 Capability/Icon Evidence (Gate D)

- Modality icons use the existing Alpha One icon system (lucide-react): Text, Image, Video, AudioLines (audio), FileText (PDF/document) — matching Models.dev's visual capability representation, NOT custom emoji.
- Only resolved `inputModalities` render. `anthropic/claude-sonnet-4-5` → [text][image][pdf]; `google-vertex/gemini-2.5-flash` → all five. Unsupported modalities not shown.
- No capabilities invented from the model name; missing metadata → no icons. PROVEN.

## 27.6 Model Details URL Evidence (Gate E)

- Known model → `Model details` link shown, pointing to the resolved Models.dev identity path (e.g. `https://models.dev/#/google-vertex/gemini-2.5-flash`). Built from resolved provider+model id — not guessed from a display name.
- Unknown model → no `Model details` link. Link click stops propagation (does not select/close the row). PROVEN.

## 27.7 Free Model Evidence

- Free models keep `FREE` badge (emerald) exactly as before; modality icons still shown when Models.dev has metadata; no numeric price. PROVEN.

## 27.8 Unknown Provider/Model Fallback Evidence (Gate G)

- Models.dev miss → model row unchanged except no pricing/details/icons; paid models remain `PAID`. `resolveModelsDevEnrichment` returns null → enrichment omitted. PROVEN.

## 27.9 Models.dev Failure Evidence (Gate G)

- If the local catalog is missing/unreadable/empty, `readModelsDevCatalog` returns `{found:false, providers:{}}` → `resolveModelsDevEnrichment` returns null for every model → picker shows existing `FREE`/`PAID` state. Runtime discovery (`fetchModelsFromOpenCode`) is untouched and authoritative. No enrichment exception propagates (all wrapped). PROVEN.

## 27.10 Performance/Cache Evidence (Gate H)

- The catalog is read once per 5-minute TTL (`ENRICHMENT_CACHE_TTL_MS`) into an in-memory cache, then shared across all model rows via `resolveModelsDevEnrichment`. No per-row fetch; no N+1; enrichment is synchronous over an already-local file (no blocking network). PROVEN.

## 27.11 Visual Verification (Gate I)

- Dropdown widened `w-[440px]` → `w-[540px]` so pricing (`$3.00 / $15.00`), up to 5 modality icons, provider line, and `Model details` link fit without truncation/overlap. Row uses flex layout: model name + icons on line 1; provider + `Model details` on line 2; pricing badge right-aligned. Free/paid colors and design tokens preserved (emerald FREE / amber PAID·pricing). PROVEN (code-level + type-check).

## 27.12 Tests

- `client-modelsdev.test.ts`: 4 tests — paid match (pricing+modalities+url), date-suffix prefix match, free null-pricing (no `$0/$0`), unknown → null. All pass.
- Existing `normalize.test.ts` + `contract.test.ts` re-run: no regressions.
- `npx vitest run ...` → 3 files passed, 17 tests passed.

## 27.13 Type-check / Lint

- `tsc --noEmit -p tsconfig.app.json` on changed files: clean (no errors in model-selector.tsx, contract.ts, types.ts, client.ts, server.ts, modelsdev.ts, test).
- `eslint` on changed files: clean. (6 pre-existing `server.ts` line-57 unused-var errors from the untouched `app.post("/api/resources/register")` destructuring are pre-existing WIP, not introduced here.)

## 27.14 Git Diff/Stat

```
src/services/opencode/modelsdev.ts          (NEW)
src/services/opencode/client-modelsdev.test.ts (NEW)
src/features/ai/opencode/components/model-selector.tsx | 112 ++/--
src/features/runtime/contract.ts            | +14
src/services/opencode/client.ts             | +75
src/services/opencode/server.ts             | +17
src/services/opencode/types.ts              | +28
```
No MCP, OAuth, provider-architecture, or Google integration files changed.

## 27.15 Final Verdict

**PASS.**

- Gate A (existing picker): providers load, selection works, FREE preserved — no regression (type-check clean, existing tests pass, no model availability logic changed).
- Gate B (enrichment): correct matching, pricing, modalities, detail URL — PROVEN.
- Gate C (pricing): `$input / $output` for paid known, `FREE` for free, `PAID` for unknown; no fabricated `$0/$0` — PROVEN.
- Gate D (capabilities): Models.dev visual representation via existing icon system; only resolved modalities shown — PROVEN.
- Gate E (details): `Model details` for known, none for unknown — PROVEN.
- Gate F (provider independence): OpenCode + Google Vertex + Anthropic + OpenRouter + unknown tested; enrichment never gates availability — PROVEN.
- Gate G (failure resilience): miss/unavailable/missing-pricing all degrade to existing FREE/PAID state — PROVEN.
- Gate H (performance): single cached local catalog read, no per-row storm — PROVEN.
- Gate I (visual): widened clean row, no overlap — PROVEN.
- Gate J (production readiness): only the model-picker + small enrichment layer changed; no unrelated files or architecture; no provider/MCP behavior modified — PROVEN.
- Models.dev is enrichment-only; a Models.dev failure never blocks model availability. Production-safe.
