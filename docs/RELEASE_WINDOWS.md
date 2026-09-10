# Alpha One — Windows Release Runbook

## Purpose

This document is the canonical operational runbook for building, validating, publishing, and replacing the Alpha One Windows installer.

Treat this file as the source of truth for Windows release paths and release sequencing. Do not rely on chat memory, prior sessions, or ad-hoc release folders when this runbook is available.

Before any Windows release mutation, read this file first.

---

## Canonical Paths

### Local Windows

Project root:

`C:\dev\alpha-one`

Canonical release directory:

`C:\dev\alpha-one\release`

Canonical installer:

`C:\dev\alpha-one\release\AlphaOne-Setup.exe`

Installed application:

`C:\Program Files\Alpha One`

Do not create or use alternate release directories such as:

- `release2`
- `release3`
- `release-final`
- timestamped release folders

The canonical release directory is always:

`C:\dev\alpha-one\release`

### VPS

Repository:

`/root/alpha-one`

Public installer directory:

`/var/www/kanal.asia/alpha/downloads/windows`

Canonical public installer:

`/var/www/kanal.asia/alpha/downloads/windows/AlphaOne-Setup.exe`

Temporary upload path:

`/var/www/kanal.asia/alpha/downloads/windows/AlphaOne-Setup.exe.uploading`

Public URL:

`https://alpha.kanal.asia/downloads/windows/AlphaOne-Setup.exe`

Production infrastructure service:

`alpha-infra.service`

Infrastructure server port:

`3002`

Infrastructure health endpoint:

`http://127.0.0.1:3002/health`

---

## Release Boundary Rule

Never mix LOCAL Windows execution and VPS execution inside one execution boundary.

Canonical sequence:

1. LOCAL — build and validate.
2. LOCAL — human validation.
3. LOCAL — Git audit, commit, and push.
4. VPS — pull the committed source.
5. VPS — build server and restart production infrastructure when server-side source changed.
6. VPS — verify service health.
7. LOCAL → VPS — upload installer using the temporary `.uploading` filename.
8. VPS — verify uploaded installer size and SHA256.
9. VPS — atomically replace the public installer.
10. VPS — verify public HTTP response.
11. LOCAL — download the public installer and verify SHA256 end-to-end.

Do not deploy an installer that has not passed local human validation.

Do not pull or mutate the VPS before local Git is committed and pushed.

---

## Local Release Preparation

Before packaging:

- Confirm the intended source state is the one being released.
- Confirm working tree state as required by the active task.
- Run the required local tests.
- Build using the canonical project tooling.
- Use the canonical `release/` directory only.
- Verify the packaged application manually when required.

After packaging, the installer intended for publishing must be:

`C:\dev\alpha-one\release\AlphaOne-Setup.exe`

Record:

- installer file size;
- SHA256;
- build timestamp.

Example verification:

`Get-Item "C:\dev\alpha-one\release\AlphaOne-Setup.exe" | Select-Object FullName,Length,LastWriteTime`

`Get-FileHash "C:\dev\alpha-one\release\AlphaOne-Setup.exe" -Algorithm SHA256`

The file size and SHA256 recorded here become the expected values for every later verification gate.

---

## Release Directory Cleanup

The canonical release directory may contain packaging output, but obsolete installer artifacts must not be mistaken for the canonical release.

Before publishing, remove obsolete installer artifacts such as:

- `Alpha One Setup 1.0.0.exe`
- `Alpha One Setup 1.0.0.exe.blockmap`
- stale updater metadata that is not part of the active release mechanism

Do not delete files merely because they look unfamiliar. Confirm whether they are required by the current packaging or update implementation.

The only canonical installer filename for public distribution is:

`AlphaOne-Setup.exe`

---

## Git Gate

After local human validation:

1. Audit modified and untracked files.
2. Stage only intended release/source changes.
3. Run `git diff --cached --check`.
4. Commit.
5. Push to `origin/main`.
6. Verify local HEAD and `origin/main` match.

Do not publish server-side source changes that exist only locally.

---

## VPS Source Deployment

When the release includes server-side changes:

`cd /root/alpha-one`

Audit first:

`git status`

`git log -1 --oneline`

`git fetch origin main`

`git log -1 --oneline origin/main`

The VPS working tree must be clean before pull unless a separate approved remediation explicitly says otherwise.

Pull only by fast-forward:

`git pull --ff-only origin main`

Build infrastructure server:

`npm run build:server`

Restart:

`systemctl restart alpha-infra.service`

Verify:

`systemctl status alpha-infra.service --no-pager`

`curl -sS --max-time 5 http://127.0.0.1:3002/health`

Expected health response must indicate the service is healthy before installer publication continues.

---

## Installer Upload

Never SCP directly over the public installer.

Always upload to the temporary filename first.

From LOCAL Windows:

`scp "C:\dev\alpha-one\release\AlphaOne-Setup.exe" root@<VPS_HOST>:/var/www/kanal.asia/alpha/downloads/windows/AlphaOne-Setup.exe.uploading`

Do not replace the public installer until the uploaded temporary file has been verified.

---

## VPS Upload Verification

On VPS:

`cd /var/www/kanal.asia/alpha/downloads/windows`

Verify temporary upload:

`ls -l AlphaOne-Setup.exe.uploading`

`sha256sum AlphaOne-Setup.exe.uploading`

Compare both against the LOCAL canonical installer:

- exact byte size must match;
- SHA256 must match exactly.

Also inspect the currently published installer before replacing it:

`ls -l AlphaOne-Setup.exe`

`sha256sum AlphaOne-Setup.exe`

If the temporary upload does not match the local canonical installer, stop. Do not replace the public file.

---

## Atomic Public Replacement

After size and SHA256 match:

`mv -f AlphaOne-Setup.exe.uploading AlphaOne-Setup.exe`

Then verify again:

`ls -l AlphaOne-Setup.exe`

`sha256sum AlphaOne-Setup.exe`

The public file must still match the expected local size and SHA256.

---

## Public HTTP Verification

Verify the public endpoint:

`curl -I https://alpha.kanal.asia/downloads/windows/AlphaOne-Setup.exe`

Required evidence:

- HTTP `200`;
- expected `Content-Length`;
- public URL resolves successfully.

A successful HEAD request alone is not sufficient for final integrity proof.

---

## External End-to-End Integrity Verification

From LOCAL Windows, download the public installer again:

`$Url = "https://alpha.kanal.asia/downloads/windows/AlphaOne-Setup.exe"`

`$Downloaded = "$env:TEMP\AlphaOne-Setup-public.exe"`

`Invoke-WebRequest $Url -OutFile $Downloaded`

Verify:

`Get-Item $Downloaded | Select-Object FullName,Length,LastWriteTime`

`Get-FileHash $Downloaded -Algorithm SHA256`

The downloaded file must match the original canonical local installer by:

- exact byte size;
- exact SHA256.

Only after this gate passes is the public installer deployment considered complete.

---

## Current Known-Good Release Evidence

As of 2026-09-05, the validated public installer was:

Filename:

`AlphaOne-Setup.exe`

Size:

`160961400` bytes

SHA256:

`2A53CE34C44D81FF8FDAD46277274864DB821BCD877219DAD895E69D4F814DBE`

Public URL:

`https://alpha.kanal.asia/downloads/windows/AlphaOne-Setup.exe`

This historical value is evidence for that release only. Future releases must calculate and verify their own size and SHA256. Do not reuse this hash as an expected value for a later build.

---

## Update Mechanism Status

The existence of a published installer does not prove in-app updating works.

Current status as of this runbook creation:

`Check for Updates` end-to-end flow is UNPROVEN.

A valid update proof requires a controlled version transition:

1. Install version N.
2. Publish version N+1 using the actual update mechanism.
3. Trigger `Check for Updates` in the installed Alpha One app.
4. Prove the app detects N+1.
5. Prove the expected update/download flow occurs.
6. Prove the application restarts or installs into N+1 as designed.
7. Verify the installed version after completion.

Do not mark update functionality PASS merely because:

- `/releases/manifest.json` exists;
- an installer is downloadable;
- packaging generated update metadata;
- the application has a `Check for Updates` menu item.

Until the controlled N → N+1 flow is runtime-proven, classify it as:

`UNPROVEN`

---

## Release Safety Rules

- Never publish from an unvalidated local build.
- Never overwrite the public installer directly with SCP.
- Never skip SHA256 verification.
- Never use a temporary release directory as canonical state.
- Never assume VPS source is current without checking Git HEAD.
- Never mix LOCAL and VPS mutation in one task execution boundary.
- Never infer updater success from packaging artifacts alone.
- Never expose secrets, OAuth tokens, or credentials in release logs.
- Keep one canonical public installer filename: `AlphaOne-Setup.exe`.

---

## Agent Instruction

Any agent performing Alpha One Windows release work must first read this file and treat it as canonical operational context.

At minimum, the agent must recover these facts before making changes:

- LOCAL project root: `C:\dev\alpha-one`
- LOCAL release directory: `C:\dev\alpha-one\release`
- LOCAL canonical installer: `C:\dev\alpha-one\release\AlphaOne-Setup.exe`
- VPS repository: `/root/alpha-one`
- VPS public installer: `/var/www/kanal.asia/alpha/downloads/windows/AlphaOne-Setup.exe`
- temporary upload target: `AlphaOne-Setup.exe.uploading`
- public URL: `https://alpha.kanal.asia/downloads/windows/AlphaOne-Setup.exe`
- upload verification requires exact size + SHA256
- public replacement must be atomic
- external re-download SHA256 verification is mandatory
- LOCAL and VPS execution boundaries must remain separate

If current runtime evidence contradicts this document, stop and audit before mutating production. Update this runbook only after the new canonical state has been proven.

---

## Fresh Windows Builder Bootstrap (TASK-ALPHA-LOCAL-BUILDER-MIGRATION-002)

Proven toolchain (see `package.json` engines + devDependencies):

- Git 2.55+
- Node v26.5.0 exactly (`engines.node`; the runtime bootstrap fails closed otherwise)
- npm 11+ (`engines.npm`)
- Electron 35.7.0, electron-builder 26.15.3, opencode-ai 1.18.21 (all npm-pinned)
- Windows x64. No Visual Studio, Python, signing tools, or global packages required.

Fresh-machine flow (example root `C:\dev\alpha-one`; any path works — no absolute
paths are baked in):

1. Install Git and Node v26.5.0 (https://nodejs.org). Verify: `node --version`.
2. `git clone <origin>`, checkout the intended branch/commit.
3. Copy runtime `.env` from `.env.example`; provision `GOOGLE_CLIENT_SECRET`
   (and IDs/URIs) securely. BUILD needs no Google user OAuth state; per-user
   tokens are created by login at runtime and are never transferred.
4. `npm ci` (uses `package-lock.json`; installs opencode-ai platform binary).
5. `npm run build:windows` — canonical flow, runs in order:
   `prepare:runtime` (validates Node/platform, stages
   `build-installer/runtime/{node,opencode}.exe` from npm-provided sources with
   SHA256 report) → `build:server` → `build:mcp` (all 7 MCP dists) → `build`
   (`tsc -b` + frontend) → `build:electron`. Never copy the runtime EXEs by hand.
6. `npx electron-builder build --win` (uses the pinned local binary) →
   `release/win-unpacked/Alpha One.exe`.
7. Validate staging: backend boots, `opencode.exe mcp list` all connected, model
   list loads, fresh-chat `hi` succeeds, Slides `tools/list` = 13/13 with
   `slides_compose_slide`.

Do NOT copy between machines: `node_modules/`, `release/`, `dist/`,
`mcp-servers-dist/`, `build-installer/runtime/`, `C:\Program Files\Alpha One`,
`%APPDATA%\Alpha One` data, `~/.local/share/opencode` sessions/tokens, caches.
All regenerate from the steps above.
