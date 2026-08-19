# TASK-OPENCODE-052 — Google Sheets Large-Dataset Agent Guidance

## Type

Small Corrective Rework

## Parent Audit

TASK-OPENCODE-051 — Google Sheets MCP Optimization Audit

## Status

COMPLETED — PASS (2026-08-19)

---

# 23. EXECUTION SUMMARY

## A. Initial Audit

- Re-read TASK-051 (parent audit) — established the residual gap: MCP capabilities already optimized and proven; the agent instruction layer had safety/security guidance but no large-dataset efficiency guidance.
- Inspected `src/services/opencode/server.ts` lines 176-205 (Google Drive reference context block injected into `enhancedMessage`). Confirmed the block contains ONLY `SAFETY (TASK-OPENCODE-046)` (create-first invariant) and `SECURITY (TASK-OPENCODE-047-R1)` (untrusted cell data) rules — no efficiency guidance. Gap `PROVEN`.
- Inspected the Google Sheets MCP tool descriptions (`mcp-servers/google-sheets/server.ts` TOOLS): `read_ranges`/`write_ranges`/`get_spreadsheet` already carry batching/metadata-first guidance. Per task §10, they adequately communicate the behavior → NOT rewritten (kept the change instruction-layer-only).

## B. Root Cause

The MCP already exposes selective reads, batch reads (`read_ranges`), batch writes (`write_ranges`), formulas (`write_formulas`), metadata-first `get_spreadsheet`, and read-back — all proven in TASK-051. The instruction layer did not tell the agent to prefer these for large datasets. Historical evidence (TASK-048): the default free agent repeatedly re-read a large dataset and exhausted its step budget. So the corrective target is agent guidance, not MCP capability. `PROVEN`.

## C. Implementation

Single instruction-layer change in `src/services/opencode/server.ts` (2 lines added inside the existing spreadsheet reference context block, after the SECURITY line):

```text
EFFICIENCY (TASK-OPENCODE-052): For large spreadsheet datasets, inspect sheet structure/metadata first (list_sheets/get_spreadsheet), then read only the ranges/columns required for the task. Batch related reads with read_ranges and reuse data already returned in this execution — avoid repeating identical reads without a concrete reason. Batch related writes with write_ranges when appropriate (single-range write_range remains valid). Prefer spreadsheet-native formulas (write_formulas) for large derived calculations when appropriate. After meaningful writes, read back and verify the persisted result before reporting completion. The safety rules above always take priority over efficiency.
```

Concise, uses the existing one-block-per-rule style, explicitly subordinates optimization to the safety rules above. No new instruction system, no MCP change, no new capabilities.

## D. Safety Regression

- Git diff confirms ONLY additions: the empty separator + the EFFICIENCY line. The SAFETY (create-first invariant) and SECURITY (untrusted cell data) blocks are byte-identical and unchanged.
- The EFFICIENCY block ends with "The safety rules above always take priority over efficiency."
- Smoke test exercised the CREATE path correctly (create_sheet → write to new sheet), never modified the source, and performed no destructive operation.
- `PROVEN`: safety guidance intact.

## E. Large-Dataset Smoke Test

Real Alpha Workspace `http://localhost:3000/workspace/assistant`, Developer Mode OFF, model `opencode-go/deepseek-v4-flash`. Fresh disposable `1onXOpDR43O9e8fsGnCJEQ2aVp41yaT1N9J9k00Vw3VU` (`ALPHA_ONE_MCP052_...`), Sheet1 seeded 131×24 (3144 cells, 130 product rows) — comparable to TASK-048/049 conditions. Prompt: identify Dead Stock/Slow Moving with stock above average, create new tab `FlashSale052`, populate, verify, do not modify source.

## F. Read Strategy

Server log (source of truth), session `ses_fe820b4c3ffeZiQ8ELIfhdgCwI`, 7 tool actions:

| # | Tool | Input | Guidance |
|---|---|---|---|
| 1 | `get_spreadsheet` | fileId (metadata) | §A inspect structure first ✓ |
| 2 | `list_sheets` | fileId | §A inspect structure first ✓ |
| 3 | `read_range` | `Sheet1!A1:X5` | §A/B selective (header + 4 rows only — NOT full 131×24) ✓ |
| 4 | `create_sheet` | `FlashSale052` | safety create-first ✓ |
| 5 | `bash` | candidate computation | §F appropriate computation (one-off 131-row analysis; bash was appropriate) |
| 6 | `write_range` | `FlashSale052!A1:G34` | §E header + 33 rows in ONE write ✓ |
| 7 | `read_ranges` | `FlashSale052!A1:G5`, `FlashSale052!A33:G34`, `Sheet1!A1:G2` | §C/G batch read-back of output head/tail + source integrity in ONE call ✓ |

- Selective reads: `PROVEN` (only `Sheet1!A1:X5` of source read during analysis).
- Batch reads: `PROVEN` (`read_ranges` with 3 ranges in 1 call).
- Reuse / no repeated identical reads: `PROVEN` — every tool called exactly once; zero identical repeated reads.
- Structure-first inspection: `PROVEN` (get_spreadsheet + list_sheets before any broad read).

## G. Write Strategy

- Batch write: `PROVEN` — `write_range FlashSale052!A1:G34` wrote header + 33 candidates in one call (appropriate here; `write_ranges` also available).
- Formula strategy: not required by this workflow (single-shot candidate analysis; model computed via bash). Per guidance "when appropriate" — `UNPROVEN` in this run but the capability (`write_formulas`) is unchanged and previously proven (TASK-049 real Kanal formula-driven tab).
- Read-back verification: `PROVEN` — `read_ranges` verified output (head + tail) and source integrity before final answer.

## H. Runtime Result

- Execution Summary present; no false terminal (`NoFinal=false`); 18 `step_finish`; server `PROCESS CLOSE` with success (exit 0).
- Read-back (Google Sheets = source of truth): `FlashSale052` (sheetId 1353637524) = header + 33 candidate rows (Dead Stock 50% / Slow Moving 30% discount, Prioritas ranked); source `Sheet1` unchanged (24 columns intact, no writes targeted it). Elapsed ~111s.
- No step exhaustion; single execution.

## I. Evidence Classification

- `PROVEN`: instruction-layer gap existed; guidance added is concise and safety-preserving; smoke run followed the guidance (structure-first, selective read, batch read-back, single batch write, zero repeated identical reads, read-after-write).
- `DERIVED`: the instruction layer now explicitly encourages the desired behavior across future executions (a single run does not prove universal model behavior).
- `UNPROVEN`: formula-strategy usage in this workflow; behavior across other models/providers (free-tier default not re-tested — external 429 rate-limit context from prior tasks).

## J. Files Changed

- `src/services/opencode/server.ts` (instruction-layer only: +2 lines).
- `spint/TASK-OPENCODE-052 — Google Sheets Large-Dataset Agent Guidance.md` (this task file).
- No MCP server file, no tool descriptions, no other source changed.

## K. Out-of-Scope Findings

- Pre-existing unrelated eslint errors in `src/services/opencode/server.ts:54` (unused destructured fields in `isReferenceAttachment`); typecheck passes with 0 errors. Pre-existing, NOT introduced by this task, left untouched (documented only).
- The default model remains `opencode/deepseek-v4-flash-free`; testing used `opencode-go/deepseek-v4-flash` per the established external-rate-limit context. Not changed here.

## L. Final Verdict

`PASS`

The guidance is implemented (concise, in the existing instruction layer, safety intact), and the targeted large-dataset smoke test confirms the intended behavior: structure-first inspection, selective reads, batch read-back, single efficient write, zero repeated identical reads, read-after-write verification, no step exhaustion, correct output, source unchanged. No new MCP capability, no caching, no chunking, no destructive capability, no unrelated changes. Safety rules verified intact.

---

# 1. OBJECTIVE

Add concise, evidence-based Google Sheets large-dataset execution guidance to the existing Alpha Workspace agent instruction layer.

The purpose is NOT to change the Google Sheets MCP engine.

The MCP already provides the required capabilities:

- selective range reads;
- batch reads;
- batch writes;
- formula writes;
- metadata-first spreadsheet inspection;
- read-after-write verification.

The remaining evidence-backed gap from TASK-051 is:

> The agent instruction layer does not explicitly guide the agent to use these capabilities efficiently when handling large datasets.

TASK-052 must close that guidance gap with the smallest possible change.