# TASK-ALPHA-SUBSCRIBER-024 — Agent-Executable Windows Packaging Pipeline

**Status:** COMPLETE — `WINDOWS_PACKAGING_CI_VERIFIED` (created 2026-10-30 per `spint/TASK-WORKFLOW.md`)
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

---

## Execution Record (completed 2026-10-30)

### R1. Discovery findings

- Repo `kanal-asia/alpha-one` (from `origin`); Actions enabled (126 prior runs).
- Existing `ci.yml` = ubuntu-latest/pnpm — fails pre-existing at "Install
  dependencies" (untouched by this task; failures identical before and after).
- `engines.node = 26.5.0` exact — confirmed in nodejs.org dist index (setup-node
  can provision it).
- Packaging chain (verified from repo, not assumed): `npm ci` -> `npm run
  build:windows` (= `prepare:runtime` -> `build:server` -> `build:mcp` ->
  `build` -> `provenance` -> `build:electron`) -> `npx electron-builder build
  --win` -> `release/AlphaOne-Setup.exe` (NSIS, `electron-builder.json`).
- `prepare:runtime` stages `process.execPath` (runner Node) +
  `node_modules/opencode-ai/bin/opencode.exe` — satisfiable on windows-latest.
- Build inputs tracked: `electron-builder.json`, `package-lock.json`,
  `build-installer/assets/alpha-one.ico`, `mcp-servers/` (51 files).
- **Trigger constraint:** no PAT/GH_TOKEN exists on the agent side (push auth is
  an IDE askpass bridge; artifact downloads 401 anonymously). Therefore the
  workflow supports BOTH `workflow_dispatch` (input `ref`) AND a
  `packaging-<sha>[-rN]` tag trigger whose suffix selects the build target —
  the agent triggers builds with `git push` alone. Anonymously readable
  evidence channels: jobs/steps API + check-run **annotations**.

### R2. Workflow implemented

`.github/workflows/windows-packaging.yml` — `windows-latest`, `permissions:
contents: read`, no secrets, no pull_request trigger. Steps: checkout
(fetch-depth 0) -> resolve build commit (input > tag suffix > run commit;
`-rN` revision-strip fallback) -> detach + verify -> setup-node 26.5.0 (npm
cache) -> engine verification (fail on mismatch) -> `npm ci` -> `npm run
build:windows` -> `electron-builder build --win --publish never` -> installer
validation (exists, >10MB) -> **provenance pin** (`dist/provenance.json
.sourceCommit == resolved sha`, `contentClean`) -> **fail-closed security
inspection** -> SHA-256 + build metadata -> best-effort noninteractive
packaged-backend smoke -> upload `alpha-one-windows-<short-sha>` (30-day
retention).

### R3. Build iterations (diagnose -> minimal fix; 4 failures, each root-caused)

| Run | Result | Root cause (evidence) | Minimal fix |
|---|---|---|---|
| 41027242676 (r1) | fail | electron-builder step | added failure-diagnostics capture |
| 41027987876 (r2) | fail | same step; summaries unreadable anonymously | publish diagnostics as annotations |
| 41028804165 (r3) | fail | **`Implicit publishing triggered by git tag ... GH_TOKEN not set`** — installer WAS built | `--publish never` (tool's own guidance; no token — AC-11) |
| 41030127262 (r5) | fail | own scan script: `set -euo pipefail` + `grep`\|`wc` exits 1 on no-match (silent death); then fail-closed hits on PEM/AIza shapes | tolerate grep no-match; attribute matches to files (values never printed) |
| attribution | — | PEM header = parser constants (`jose` web import.js; Go pem strings in `opencode.exe`); AIza shape = vendor runtime placeholder strings (zero matches in entire project tree) | scope fuzzy shapes to project-authored content (bundles+asar); literal secret forms stay package-wide fail-closed |
| **41031189390 (r6)** | **SUCCESS** | — | — |
| **41031835852 (r7)** | **SUCCESS (final workflow state)** | — | — |

### R4. Final verified run evidence (41031835852)

- Runner: `windows-latest` (`GitHub Actions 1000000140`; electron-builder
  reported os=10.0.26100), 2026-10-30T09:13:21Z -> 09:17:19Z.
- Steps: all green — engine verify, `npm ci`, `build:windows`, electron-builder,
  installer validation, provenance pin, security inspection, checksums, smoke,
  upload.
- **Installer:** `AlphaOne-Setup.exe`, **160,159,836 bytes**.
- **SHA-256:** `c3563367ae6168c3c406a539f65cf7ce1d2899cf453df6b2110e02bd4f106395`
  (published via annotation; also in artifact `AlphaOne-Setup.exe.sha256` +
  `build-metadata.json` for authorized downloaders to re-verify).
- **Security inspection:** PASSED — literal secret forms absent package-wide
  (GOCSPX / secret assignments / `.env`), fuzzy patterns clean in
  project-authored content, `PRODUCT_OAUTH_LOCAL_EXCHANGE` not enabled, VPS
  broker default (`alpha.kanal.asia`) + public client id present in the
  packaged backend.
- **Packaged smoke (noninteractive, on the built artifact):**
  `/api/opencode/health` = `{"state":"healthy","cliReachable":true,"version":"1.18.21",...,"notes":["Discovered 7 models."],"workspace":{...,"gitBranch":"3a02c6e"}}`;
  `/api/subscription/status` = `{"planId":"free",...}` (anonymous contract).
- **Provenance:** `dist/provenance.json` sourceCommit == `3a02c6e...` verified
  by the run step (contentClean true) — plus smoke `gitBranch: 3a02c6e`.
- **Artifact:** `alpha-one-windows-3a02c6e` (160,159,606 bytes compressed),
  expires 2026-11-29, accessible to authenticated repository users via the
  Actions UI/API.

### R5. Acceptance criteria

| ID | Status | Evidence |
|---|---|---|
| AC-01 | **PASS** | `windows-packaging.yml` committed/pushed |
| AC-02 | **PASS** | jobs API: `labels: ['windows-latest']`, GitHub-hosted runner |
| AC-03 | **PASS** | "Verify Node engine requirement" step green (v26.5.0 exact vs engines) |
| AC-04 | **PASS** | `npm ci` green |
| AC-05 | **PASS** | `build:windows` + electron-builder green |
| AC-06 | **PASS** | installer validated (160,159,836 bytes > threshold) + smoke booted |
| AC-07 | **PASS** | security inspection notice (quoted in R4) |
| AC-08 | **PASS** | `sha256sum` + metadata step green; digest pinned in R4 (post-download re-verification by authorized users; anonymous zip download is 401 by GitHub policy) |
| AC-09 | **PASS** | artifact `alpha-one-windows-3a02c6e` listed by API |
| AC-10 | **PASS** | provenance step pinned `3a02c6e`; artifact name + smoke gitBranch corroborate |
| AC-11 | **PASS** | zero repo secrets used; `contents: read`; `--publish never` removed the only token demand |
| AC-12 | **PASS** | `ci.yml` untouched; its `pnpm install` failure pre-dates this task and is unchanged |
| AC-13 | **PASS** | workflow + task records committed & pushed; `origin/main` verified |

### R6. Remaining limitations (interactive E2E handoff)

1. Noninteractive runner: no GUI, no Google consent, no browser handoff, no
   dynamic-loopback callback, no session/logout exercise (brief §7 — not
   claimed).
2. Artifact download requires an authenticated GitHub session (anonymous API
   returns 401); next phase verifies the download against the SHA-256 in R4.
3. Existing `ci.yml` stays broken at `pnpm install` (pre-existing, out of
   scope).

## Final Verdict

**`WINDOWS_PACKAGING_CI_VERIFIED`** — a real GitHub-hosted `windows-latest`
execution built, security-inspected, checksummed and uploaded a downloadable
installer of TASK-022's exact implementation commit `3a02c6e`. Handoff for the
next interactive phase: download artifact `alpha-one-windows-3a02c6e`, verify
SHA-256 `c3563367ae6168c3c406a539f65cf7ce1d2899cf453df6b2110e02bd4f106395`,
then run TASK-023 Phase 3-5 (packaged runtime + interactive consent).
