# TASK-ALPHA-SUBSCRIBER-026 — Local Windows Handoff for Interactive OAuth E2E

**Status:** COMPLETE — handoff prepared; Windows host unreachable from this session (created 2026-11-03 per `spint/TASK-WORKFLOW.md`)
**Priority:** P0 — Product Identity E2E
**Type:** Handoff (repo sync + artifact staging + runtime/interactive continuation)
**Predecessor:** TASK-ALPHA-SUBSCRIBER-025 (chain driven to the human-only auth gate)
**Task-record commit at start:** `e5574544d84ec211cade5def2529027a58d81a15`
**Verified source:** `3a02c6e367708b8157bbe015eeefdea430e5a925`
**Artifact:** `AlphaOne-Setup.exe` 160,159,836 bytes, SHA-256 `c3563367ae6168c3c406a539f65cf7ce1d2899cf453df6b2110e02bd4f106395`
**Canonical path:** `spint/TASK-ALPHA-SUBSCRIBER-026.md`

## Objective

Move the verified Alpha One build and current task state into the user's
local Windows environment so the user can install the app and the agent can
complete interactive Google Product Identity E2E. Target: local repo synced
with `origin/main`; verified installer installed; agent-driven browser after
user authentication; TASK-023 updated with complete E2E evidence.

## Execution Record (2026-11-03)

### R1. VPS repository + production state (Phase 1 — complete)

| Check | Result |
|---|---|
| VPS HEAD | `e5574544d84ec211cade5def2529027a58d81a15` (TASK-025 record commit) |
| Working tree | clean (`## main...origin/main`) |
| `origin/main` | `e5574544d84ec211cade5def2529027a58d81a15` — **matches expected exactly**; in HEAD ancestry |
| Uncommitted work at risk | none (tree clean; nothing would be overwritten) |
| Task records pushed | TASK-021…025 + TASK-023 history all on `origin/main` |
| Production | `alpha-infra.service` + `kanal-backend.service` active; `/health` `{"ok":true}` — untouched, no mutation/restart |

### R2. Git to local Windows (Phase 2) — NOT EXECUTED from this session

This agent session runs on the Linux VPS (`kanal-prod-01`). The user's local
Windows environment (`C:\dev\alpha-one`) is **not reachable** from it
(first-hand re-verification 2026-11-03):

- WireGuard peer `10.66.66.2` (the only configured tunnel toward the user
  machine): **offline — no endpoint, no handshake, 100% packet loss**; ports
  22/3389/5985/445 unreachable.
- No RDP/WinRM/VNC listeners anywhere reachable; no SSH config/keys for any
  Windows host; no remote mounts; no other tunnel tooling (tailscale/
  zerotier/cloudflared absent).

Local Windows sync is prepared but pending execution ON the Windows host:
`git fetch origin && git pull --ff-only origin main` at `C:\dev\alpha-one`
(remote tree clean; ff-only cannot overwrite local commits; any local
uncommitted work is preserved by not touching it).

### R3. Installer handoff (Phase 3) — transferable components verified

| Item | State |
|---|---|
| GitHub artifact | `alpha-one-windows-3a02c6e` (id 12965608340) — **not expired**, expires **2026-11-29T09:17:04Z** (time-box: download before expiry; fallback = re-run the TASK-024 packaging workflow pinned to the same source) |
| VPS-verified copy | `/tmp/opencode/artifact/extracted/AlphaOne-Setup.exe` — 160,159,836 bytes |
| SHA-256 (re-verified today) | `c3563367ae6168c3c406a539f65cf7ce1d2899cf453df6b2110e02bd4f106395` — **MATCH** |
| Provenance | source `3a02c6e367708b8157bbe015eeefdea430e5a925` (build-metadata.json) |
| Retrieval flow | authorized GitHub Actions artifact download (credential bridge; values never printed) |

### R4. Local installation/launch (Phase 4) — pending Windows host

Not executable from this session. The same build's install/launch/health/
loopback/broker-initiation/fail-closed behavior is already verified on a real
Windows environment (windows-latest, TASK-023 R12, run 41037916533).

### R5. Interactive E2E progress (Phase 5)

Chain state (from TASK-025 R3, agent-driven, real): VPS broker login -> real
Chrome -> Google sign-in page for the `alphaone` client. **Remaining gate:
user-only Google sign-in/MFA for the dedicated test account.** After sign-in,
the agent continues consent -> callback -> loopback return -> completion
redemption -> verified `sub` session -> gated access -> sign-out -> Workspace
isolation.

**Two proven bridges for agent-driven continuation (either suffices):**
1. Run the agent session ON the Windows machine (`C:\dev\alpha-one`, as the
   TASK-019 session did) — full local control incl. installer + browser.
2. Bring up the WireGuard tunnel (peer `10.66.66.2`) from the user machine and
   launch Chrome with `--remote-debugging-port=9222`; the agent then drives the
   user's live browser (user signed in) over CDP and completes the remaining
   chain while the user performs only the sign-in/MFA click.

### R6. Acceptance criteria for this handoff task

| Target outcome | Status |
|---|---|
| Local repo synchronized with `origin/main` | **PREPARED** (remote verified; local pull pending Windows host — R2) |
| Verified installer available locally + installed | **PREPARED** (artifact verified, unexpired — R3; install pending Windows host — R4) |
| Agent can drive local browser after user auth | **BLOCKED on bridge** (R5 options) |
| TASK-023 final verdict | unchanged: `PRODUCT_IDENTITY_PACKAGED_RUNTIME_VERIFIED_INTERACTIVE_BLOCKED` until the real chain completes (R5 gate) |

## Verdict

**HANDOFF PREPARED — WINDOWS EXECUTION ENVIRONMENT UNREACHABLE FROM THIS
SESSION** (phases 2/4/5 require the user's Windows host; all transferable
components — repo state, verified artifact, runtime proof, and the pre-consent
chain — are staged and verified). TASK-023 verdict stands unchanged.

### Go-Live impact

Nothing regressed; production untouched. Go-live of Product Identity sign-in
still requires exactly: the user's Google sign-in at the gate, executed
through either bridge in R5 — after which the agent completes and records the
full E2E and TASK-023 can flip to
`PRODUCT_IDENTITY_OAUTH_BROKER_INTERACTIVE_E2E_VERIFIED`. Note the artifact
expiry time-box (2026-11-29).
