# TASK-ALPHA-SUBSCRIBER-024 — Agent-Executable Windows Packaging Pipeline

**Status:** IN PROGRESS (created 2026-10-30 per `spint/TASK-WORKFLOW.md`)
**Priority:** P0 — Release Infrastructure
**Type:** CI Implementation + Windows Packaging + Artifact Verification
**Predecessor:** TASK-ALPHA-SUBSCRIBER-023 (resumption blocked: no Windows
execution environment reachable from the agent session — Windows builds
historically required an agent session on the founder's machine)
**Target implementation:** `3a02c6e367708b8157bbe015eeefdea430e5a925`
**Canonical path:** `spint/TASK-ALPHA-SUBSCRIBER-024.md`

## 1. Objective

Remove the Windows execution dependency for packaging Alpha One Desktop by
implementing an agent-operable GitHub-hosted Actions workflow:

`GitHub Repository → windows-latest Runner → Build → Security Inspection → Installer Artifact`

No founder's local machine, no VPS packaging, no Linux/Wine substitution, no
self-hosted runners, no OAuth/production secrets in CI. Packaging
infrastructure only — no authentication redesign.

## 2. Acceptance criteria (status filled in Execution Record)

| ID | Acceptance criteria | Status |
|---|---|---|
| AC-01 | Dedicated Windows packaging workflow exists | PENDING |
| AC-02 | GitHub-hosted Windows runner is used | PENDING |
| AC-03 | Node `26.5.0` is verified | PENDING |
| AC-04 | Dependencies install successfully | PENDING |
| AC-05 | Windows build completes successfully | PENDING |
| AC-06 | Installer is generated and validated | PENDING |
| AC-07 | Artifact security inspection passes | PENDING |
| AC-08 | SHA-256 is generated and verified | PENDING |
| AC-09 | Installer artifact is uploaded successfully | PENDING |
| AC-10 | Artifact source commit is exactly `3a02c6e` | PENDING |
| AC-11 | No production secrets are required by the workflow | PENDING |
| AC-12 | Existing CI and repository functionality remain intact | PENDING |
| AC-13 | Task record and workflow are committed and pushed | PENDING |

## 3. Constraints (from brief)

No broker/OAuth/Workspace changes; no VPS deploy; no self-hosted runners; no
engine changes; no production secrets in Actions; no interactive-E2E claims
from CI success; explicit staging only (never `git add .`); `git add -f` for
ignored task records.

---

## Execution Record (appended during execution)

(to be filled)
