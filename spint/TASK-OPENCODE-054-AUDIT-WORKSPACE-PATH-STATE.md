# TASK-OPENCODE-054 — Audit Workspace Path State & Selection Lifecycle

## 1. Objective

Audit-only terhadap lifecycle `Workspace Path` pada OpenCode.

Fokus utama adalah membuktikan dari source code dan runtime state:

1. Dari mana nilai `Workspace Path` berasal.
2. Apakah nilai tersebut global/runtime state, project state, atau session state.
3. Mengapa `New Chat` kosong maupun existing session dapat menampilkan workspace path yang sama.
4. Apakah UI Local / Drive / folder selection yang sebelumnya tersedia masih ada di implementation atau sudah hilang.
5. Apakah perilaku `Runtime-detected. Cannot be overridden manually.` memang merupakan design yang disengaja atau merupakan legacy/regression.
6. Apakah workspace path dapat berbeda antar-session/project atau saat ini secara tidak sengaja dipaksakan ke satu runtime workspace.

## 2. Scope

### IN SCOPE

Audit source dan runtime untuk:

- OpenCode page lifecycle.
- New Chat initialization.
- Existing session restoration.
- Session → project relationship.
- Project → workspace relationship.
- Workspace path state.
- Runtime workspace detection.
- Local workspace selection.
- Google Drive / remote workspace selection jika masih terdapat implementation.
- Workspace selector / picker UI.
- Persistence dan hydration state.
- Relevant API/provider/backend boundary.
- Legacy implementation yang masih mempengaruhi behavior.

Audit harus membandingkan minimal dua kondisi:

### Case A — New Chat

Expected state menurut product direction:

```text
New Chat
Project = empty
Model = default
Workspace = empty / unresolved
```

### Case B — Existing Session

Audit bagaimana session lama mendapatkan:

```text
Project
Workspace
Workspace Path
Model
```

dan apakah workspace path benar-benar berasal dari session/project atau dari runtime global.

### OUT OF SCOPE

Jangan:

* mengubah source code,
* mengubah database,
* mengubah runtime state secara persistent,
* menghapus legacy implementation,
* redesign UX,
* membuat workspace picker baru,
* memperbaiki behavior berdasarkan asumsi,
* mengubah Project/Model behavior yang sudah diselesaikan oleh task sebelumnya.

Task ini adalah AUDIT-ONLY.

---

## 3. Evidence Required

Temukan dan dokumentasikan evidence konkret untuk:

### A. Workspace Path Source

Identifikasi:

* source of truth workspace path,
* state/store yang menyimpan nilainya,
* initialization path,
* hydration path,
* runtime detection mechanism,
* API/backend response jika ada.

Jawab:

```text
Workspace Path berasal dari:
[PROVEN / UNKNOWN]
```

### B. New Chat

Trace flow:

```text
New Chat
→ initialization
→ project state
→ workspace state
→ runtime state
```

Tentukan apakah `C:\dev\alpha-one` memang diberikan kepada New Chat oleh runtime, project, persisted state, atau sumber lain.

### C. Existing Session

Trace flow:

```text
Open existing session
→ session restore
→ project restore
→ workspace restore
→ runtime workspace
```

Tentukan apakah existing session memiliki workspace sendiri atau hanya membaca global runtime workspace.

### D. Local / Drive Selection

Cari evidence implementation untuk:

* local folder selection,
* local path picker,
* Google Drive selection,
* workspace browser,
* project folder selection,
* path override.

Untuk setiap fitur:

```text
FOUND
PARTIALLY FOUND
REMOVED
DEAD CODE
UNKNOWN
```

Jangan menyimpulkan fitur "hilang" hanya karena tidak terlihat pada UI.

### E. Runtime-Derived State

Audit teks/logic terkait:

```text
Runtime-detected
Cannot be overridden manually
```

Tentukan:

* komponen yang menampilkan text tersebut,
* state yang membuatnya muncul,
* apakah memang intended behavior,
* apakah ada legacy restriction,
* apakah restriction berlaku untuk semua session atau hanya kondisi tertentu.

### F. Session Isolation

Audit apakah dua session dapat memiliki:

```text
Session A → Workspace A
Session B → Workspace B
```

atau implementasi sekarang memaksa:

```text
Session A ─┐
Session B ─┼→ Runtime Workspace
Session C ─┘
```

Jangan mengubah behavior untuk membuktikan hal ini. Gunakan source/runtime evidence yang sudah tersedia.

---

## 4. Required Findings Format

Pisahkan findings menjadi:

### PROVEN

Fakta yang dibuktikan oleh source/runtime evidence.

### DERIVED

Kesimpulan langsung dari beberapa evidence.

### UNPROVEN

Hipotesis yang masuk akal tetapi belum dibuktikan.

### UNKNOWN

Informasi yang tidak dapat dibuktikan dari repository/runtime yang tersedia.

### INSUFFICIENT_EVIDENCE

Kondisi yang membutuhkan evidence tambahan sebelum remediation aman dilakukan.

---

## 5. Required Root-Cause Questions

Jawab secara eksplisit:

1. Apakah `Workspace Path` merupakan global runtime state?
2. Apakah `Workspace Path` merupakan bagian dari project?
3. Apakah `Workspace Path` merupakan bagian dari session?
4. Apakah New Chat seharusnya memiliki workspace kosong?
5. Mengapa New Chat saat ini dapat menampilkan `C:\dev\alpha-one`?
6. Mengapa existing session juga menampilkan path yang sama?
7. Apakah local/Drive selection masih tersedia di codebase?
8. Jika masih tersedia, mengapa tidak muncul pada current UI?
9. Jika sudah tidak tersedia, kapan/di layer mana capability tersebut hilang?
10. Apakah `Runtime-detected. Cannot be overridden manually.` merupakan intended product behavior atau legacy behavior?
11. Apakah terdapat regression dari implementation sebelumnya?
12. Apa minimal corrective action yang diperlukan setelah audit?

---

## 6. Evidence Commands

Gunakan repository/runtime inspection yang relevan.

Minimal lakukan:

```text
git status
git branch --show-current
git log -n 10 --oneline
```

Kemudian search source untuk keyword/konsep yang relevan, minimal:

```text
Workspace Path
workspacePath
workspace_path
workspace
runtime-detected
Cannot be overridden
New Chat
new session
session restore
project
Google Drive
Drive
local folder
folder picker
directory picker
```

Trace hasil search sampai ke actual state ownership dan lifecycle. Jangan berhenti pada component UI.

---

## 7. Runtime Verification

Jika runtime lokal tersedia, verifikasi tanpa melakukan mutation:

### Scenario 1

Open OpenCode → New Chat.

Catat:

```text
Project:
Model:
Workspace Path:
Runtime state:
```

### Scenario 2

Open existing session yang sudah memiliki project.

Catat:

```text
Project:
Model:
Workspace Path:
Runtime state:
```

### Scenario 3

Bandingkan kedua state.

Tujuan:

Membuktikan apakah workspace path mengikuti:

```text
runtime
project
session
atau kombinasi state
```

### Scenario 4

Inspect available workspace/project controls.

Catat apakah tersedia:

```text
Local selection
Drive selection
Folder picker
Project selection
Path override
```

Jangan mengubah data atau configuration persistent.

---

## 8. Quality Gate

Audit PASS hanya jika:

* source of truth Workspace Path berhasil diidentifikasi atau dinyatakan UNKNOWN dengan evidence yang cukup;
* New Chat lifecycle berhasil ditrace;
* existing session lifecycle berhasil ditrace;
* hubungan session/project/workspace/runtime dijelaskan;
* local/Drive selection implementation berhasil diverifikasi;
* status `Runtime-detected` berhasil ditrace ke source;
* tidak ada asumsi yang dipresentasikan sebagai fakta;
* tidak ada source/database/runtime mutation dilakukan.

Audit FAIL jika:

* hanya melakukan UI inspection;
* hanya grep tanpa tracing ownership;
* langsung menyimpulkan bug;
* langsung melakukan remediation;
* tidak membedakan runtime global vs session/project state;
* tidak memeriksa kemungkinan legacy implementation.

---

## 9. Deliverable

Update task file ini dengan:

### Execution Summary

Isi:

* files inspected,
* relevant components,
* relevant state/store,
* relevant APIs,
* runtime observations,
* exact evidence,
* findings,
* root cause,
* unresolved questions.

### Verdict

Gunakan salah satu:

```text
PASS — Root cause dan ownership workspace state terbukti.
PASS WITH UNKNOWN — Audit selesai tetapi sebagian capability tidak dapat dibuktikan.
FAIL — Evidence tidak cukup untuk menentukan root cause.
```

### Remediation Recommendation

Berikan **hanya minimal corrective action** yang dibutuhkan berdasarkan evidence.

Jangan membuat task baru atau redesign sebelum root cause terbukti.

---

## 10. Git

Setelah execution dan verification selesai:

```text
git status
git diff --stat
git diff -- <changed task file>
git add <changed task file>
git commit -m "docs(opencode): audit workspace path state lifecycle"
git status
```

Commit hanya task file ini dan perubahan yang memang diperlukan untuk mencatat hasil audit.

## 11. Final Instruction

Input your execution summary on the same task file

Do not create a separate execution-summary file.

---

# EXECUTION SUMMARY (2026-08-19)

## A. Evidence Commands

```
git status            -> working tree has many PRE-EXISTING unrelated changes (deletions of legacy features,
                         branding files, routeTree.gen.ts, etc.). TASK-053 commit b14a346 is HEAD. NO changes
                         were made by this audit except this task file.
git branch --show-current -> task/gworkspace-002-r1-drive-access-rework
git log -n 10 --oneline -> b14a346 (TASK-053) … 6b8045e … (HEAD)
```

Audit = READ-ONLY. No source, database, or persistent runtime mutation was made.
Runtime verification used GET-only HTTP probes and a read-only Playwright probe
(temporary script removed after use).

## B. Files Inspected

Frontend (OpenCode feature):
- `src/features/ai/opencode/types.ts` — `Chat`, `OpenCodeSettings`, `WorkspaceInfo`, `OpenCodeSession`
- `src/features/ai/opencode/store/opencode-store.ts` — `DEFAULT_SETTINGS`, `hydrateSettings`, `loadWorkspaces`, `selectWorkspace`, `newChat`, `makeChat`, `sendMessage`, `updateSettings`, `launch`
- `src/features/ai/opencode/services/http-transport.ts` — `launchSession`, `listWorkspaces`, `getRuntimeWorkspace`
- `src/features/ai/opencode/services/opencode-service.ts` — passthrough wrappers
- `src/features/ai/opencode/components/opencode-toolbar.tsx` — workspace popover UI
- `src/features/ai/opencode/components/settings-page.tsx` — Workspace Path card
- `src/features/ai/opencode/components/opencode-page.tsx` — mount effects, EmptyState / Recent Projects
- `src/features/ai/opencode/components/developer-panel.tsx` — reads `settings.workspacePath`

Backend:
- `src/services/opencode/server.ts` — SSE chat route (CLI spawn), `/api/runtime/workspace`, `/api/opencode/config`
- `src/services/opencode/runtime.ts` — `detectWorkspace(cwd = process.cwd())`, `RuntimeManager`
- `src/services/opencode/client.ts` — `runOpenCode` spawn

Related features (Local/Drive selection, project model):
- `src/features/ai-assistant/store/project-store.ts` — `Project` model (client-only, localStorage)
- `src/features/ai-assistant/components/project-selector.tsx` — Local folder + Google Drive folder options
- `src/features/ai-assistant/components/local-folder-picker.tsx` — folder browser dialog
- `src/features/ai-assistant/components/assistant-chat-page.tsx` — where ProjectSelector is used
- `src/features/google/components/drive-folder-picker.ts` + `src/routes/_authenticated/google/drive-picker.tsx` — Drive picker
- `src/services/fs/fs-router.ts` + `src/server/alpha-server.ts` — `/api/fs` directory browser endpoint
- `src/platform/workspace/` (service.ts, task-store.ts, client.ts) — Alpha Workspace task-execution platform SDK (DIFFERENT concept; NOT the OpenCode workspace-path state — out of scope, noted)

History:
- `git show b2758e4` (TASK-OPENCODE-025R1) — origin of the runtime workspace sync + the `Runtime-detected` text

## C. Relevant State / Stores / APIs

| Item | Location | Kind |
|---|---|---|
| `settings.workspacePath` (default `C:\dev\alpha-one`) | `opencode-store.ts:79` | GLOBAL settings, persisted to `alpha-one:opencode-settings` |
| `Chat` workspace field | — | DOES NOT EXIST. `Chat` has only `project?: {id,name,path}` (`types.ts:263-287`) |
| `Chat.project` | `types.ts:277` | Per-session, display-only, persisted in chat |
| `OpenCodeSession.workspacePath` | `types.ts:118` | Echoed metadata from client settings in `launchSession`; not used by runtime |
| `WorkspaceInfo[]` (`workspaces`) | `types.ts:141` | Always `[]` — `listWorkspaces()` transport hardcodes `return []` (`http-transport.ts:329-332`) |
| `getRuntimeWorkspace()` | `http-transport.ts:334-343` | GET `/api/runtime/workspace` → server cwd |
| `loadWorkspaces()` | `opencode-store.ts:324-337` | Syncs `settings.workspacePath` ← runtime path on every page mount |
| `selectWorkspace(path)` | `opencode-store.ts:339-342` | In-memory only (NO `localStorage.setItem`); only caller is the always-empty list |
| CLI spawn | `server.ts:248-254` | `spawn(..., { stdio, windowsHide, shell:false, detached:false, env })` — **NO `cwd` option** → always server `process.cwd()` |
| `allowedRoots` | `server.ts:121` | `[process.cwd()]` for reference/file resolution |
| `/api/opencode/config` | `server.ts:745-749` | `detectWorkspace().path` (server cwd) |
| `/api/runtime/workspace` | `server.ts:870-871` | `runtimeManager.snapshot().workspace ?? detectWorkspace()` (server cwd) |
| `Project` model | `project-store.ts:6-15` | `contextType: 'local' \| 'google-drive'`, `contextPath` = local path OR Drive folder ID; localStorage only |
| `/api/fs/dirs` | `fs-router.ts:88`, mounted `alpha-server.ts:25` | Local directory browser (server-side; browser FS API cannot expose real paths on Windows) |
| `/google/drive-picker` | `routes/_authenticated/google/drive-picker.tsx` | Drive folder picker window |

## D. Runtime Observations (READ-ONLY probes, live dev servers: vite :3000, alpha-server :3001)

1. `GET /api/runtime/workspace` → `{ workspace: { path: "C:\\dev\\alpha-one", name: "alpha-one", isGit: true, gitBranch: "task/gworkspace-002-r1-drive-access-rework", packageManager: "pnpm", projectName: "alpha-one" } }`
2. `GET /api/opencode/config` → `{ resolvedPath: "C:\\Users\\ASUS\\.config\\opencode\\opencode.jsonc", cwd: "C:\\dev\\alpha-one", config.model: "opencode/deepseek-v4-flash-free", config.default_agent: "build", mcp.google-sheets.cwd: "C:\\dev\\alpha-one" }`
3. `GET /api/opencode/health` → healthy, CLI v1.18.18, 48 models, `workspace.path: "C:\\dev\\alpha-one"`
4. Browser probe at `/ai/opencode`:
   - `alpha-one:opencode-settings` = `{ workspacePath: "C:\\dev\\alpha-one", defaultModel: "opencode/deepseek-v4-flash-free", defaultMode: "build", defaultVariant: "low", … }` (matches opencode.jsonc)
   - Toolbar workspace popover: Input `#ws` value `C:\dev\alpha-one`, `readOnly=true`, hint text `Runtime-detected. Cannot be overridden manually.` PRESENT, workspace list NOT rendered (empty).
   - Mode `Build`, Variant `Low`; no folder/Drive picker on the OpenCode page.
5. Browser probe at `/workspace/assistant`: ProjectSelector renders (`No project` button). Source confirms Local folder + Google Drive folder options inside its create form.
6. No persisted chats in the fresh probe context; workspace path was identical for the no-chat (New Chat) state and is read from the same global `settings.workspacePath` regardless of active chat (see E).

## E. Findings

### PROVEN

- **E1 — `Workspace Path` is GLOBAL settings state, not session/project state.** The only client field is `settings.workspacePath` (persisted in `alpha-one:opencode-settings`). `Chat` has NO workspace field (`types.ts:269-287`). `ChatProjectContext` carries only `id/name/path` (display), never a workspace.
- **E2 — The path shown is the SERVER process cwd.** `detectWorkspace(cwd = process.cwd())` (`runtime.ts:124`) is used by `/api/runtime/workspace`, `/api/opencode/config`, and `/api/runtime` startup. Live probes confirm `C:\dev\alpha-one`.
- **E3 — The CLI always executes in the server cwd.** `server.ts:248-254` spawns `opencode run …` WITHOUT a `cwd` option (Node default = `process.cwd()`). `sendMessage` sends model/mode/variant only (`opencode-store.ts:929-930`); `workspacePath` is never sent per prompt. Reference resolution is locked to `allowedRoots: [process.cwd()]` (`server.ts:121`).
- **E4 — New Chat and existing sessions read the SAME global value.** No chat has a workspace; both states render `settings.workspacePath`, which is re-synced to the runtime path on every mount by `loadWorkspaces()` (`opencode-store.ts:330-336`). That is exactly why both display `C:\dev\alpha-one`.
- **E5 — `selectWorkspace` is non-durable.** It only does `set({settings:{...}})`, no persistence (`opencode-store.ts:339-342`); the next `loadWorkspaces()` re-sync overwrites it; and even if it changed, the CLI still runs in server cwd (E3).
- **E6 — The workspace list is always empty.** `listWorkspaces()` transport returns `[]` (`http-transport.ts:329-332`). Toolbar renders the list only when `workspaces.length > 0` (`opencode-toolbar.tsx:105`) → the `selectWorkspace` buttons are unreachable dead UI in practice.
- **E7 — `Runtime-detected. Cannot be overridden manually.` is INTENDED, added deliberately by TASK-OPENCODE-025R1 (commit `b2758e4`, Aug 15) as a fix for the "Legacy workspace-path phantom state bug"** — before that fix the field was a client-side phantom default. The message is truthful: the path IS runtime/server-detected and cannot be overridden to change where the CLI runs.
- **E8 — Local folder + Google Drive folder selection still EXIST and are live.** `LocalFolderPicker` + `/api/fs/dirs` (server route, mounted in `alpha-server.ts:25`) and the Drive picker (`/google/drive-picker` route) are both implemented and used — but ONLY in the **assistant** feature's `ProjectSelector` (`assistant-chat-page.tsx:97`), which creates `Project` records (local path or Drive folder ID). They are NOT wired into the OpenCode page.
- **E9 — Project context never influences the workspace.** `sendMessage` does not read `chat.project` or `useProjectStore`; the OpenCode page attaches a project only for display (`setActiveChatProject`). `chat.project.path` is a label, not a runtime input.
- **E10 — Session isolation is IMPOSSIBLE today.** Because of E1 + E3, every session (Session A/B/C) executes against the same runtime workspace `C:\dev\alpha-one`.

### DERIVED

- **D1 — `Workspace Path` is a runtime-GLOBAL value by construction**, and the single-workspace model is a consequence of the single-process runtime architecture (one API server, one cwd, one CLI execution scope), not a per-session choice.
- **D2 — The product direction "New Chat → Workspace = empty / unresolved" is NOT satisfiable by the current implementation without a runtime architecture change** (a per-chat workspace field AND per-prompt CLI `cwd` support on the server). The displayed path is honest; there is no silent bug forcing a wrong path.
- **D3 — The stale artifact is the leftover `selectWorkspace` action + conditional workspace list in the toolbar** (contradicts the "Cannot be overridden" copy), left over from the pre-025R1 era; it is dead but harmless (always empty, non-durable).
- **D4 — "Legacy" applies to the residual selection UI, not to the runtime-detected behavior.** The runtime-detected behavior is the CURRENT intended fix; the legacy remnant is the vestigial selector plumbing.

### UNPROVEN

- Nothing material. Every claim above is backed by source + live probes.

### UNKNOWN

- Whether a workspace picker was ever shown with real entries on this page in a past build (the `workspaces` array has been `[]` since the HTTP transport exists; no past build with real entries found in the current tree). Historical builds are not preserved in this repo beyond what `git log` shows.

### INSUFFICIENT_EVIDENCE

- None blocking the audit conclusion. (If a per-session/per-project workspace is desired as product direction, remediation design would need a product decision + runtime contract, not more audit evidence.)

## F. Required Root-Cause Answers

1. **Apakah `Workspace Path` merupakan global runtime state?** — YA. PROVEN (E1): satu field global `settings.workspacePath`, disinkron dari cwd server. Bukan per-session, bukan per-project.
2. **Apakah `Workspace Path` merupakan bagian dari project?** — TIDAK. `Project` (`project-store.ts`) tidak memiliki field workspace; hanya `contextPath` (path lokal / Drive folder ID) sebagai konteks, dan tidak pernah dikirim ke runtime (E9).
3. **Apakah `Workspace Path` merupakan bagian dari session?** — TIDAK. `Chat` tidak memiliki field workspace (E1). Session hanya membawa `project` display-only + `model`.
4. **Apakah New Chat seharusnya memiliki workspace kosong?** — Secara product-direction ya, tetapi dengan arsitektur saat ini TIDAK MUNGKIN: tidak ada field per-chat DAN CLI selalu berjalan di cwd server (D2). Status saat ini bukan bug.
5. **Mengapa New Chat menampilkan `C:\dev\alpha-one`?** — Karena satu-satunya sumber workspace adalah `settings.workspacePath` global yang disinkron dari runtime server cwd saat mount (E2, E4).
6. **Mengapa existing session menampilkan path yang sama?** — Sama: tidak ada workspace per-session; semua chat membaca nilai global yang sama (E4, E10).
7. **Apakah local/Drive selection masih tersedia di codebase?** — YA, hidup (E8): `LocalFolderPicker` + `/api/fs/dirs` dan Drive picker `/google/drive-picker`, di dalam ProjectSelector (assistant). Bukan di page OpenCode.
8. **Jika masih tersedia, mengapa tidak muncul pada current UI?** — Karena ProjectSelector hanya dipasang di `assistant-chat-page.tsx`. Page OpenCode hanya punya Recent Projects fast track (TASK-053) yang meng-attach project display-only; tidak pernah ada folder picker di page OpenCode (E8, E9).
9. **Jika sudah tidak tersedia, kapan/di layer mana capability hilang?** — Tidak hilang. Namun selector workspace page OpenCode (`workspaces` list + `selectWorkspace`) adalah DEAD CODE karena transport `listWorkspaces()` selalu `[]` (E6). Sisa legacy pra-025R1.
10. **Apakah `Runtime-detected. Cannot be overridden manually.` intended atau legacy?** — INTENDED, ditambahkan sengaja oleh TASK-OPENCODE-025R1 (commit `b2758e4`) sebagai perbaikan phantom-state; akurat (E7). Yang legacy adalah UI list/aksi selectWorkspace yang tersisa (D3).
11. **Apakah terdapat regression dari implementation sebelumnya?** — Tidak ada regression terhadap kemampuan yang benar-benar berfungsi. Sync runtime (025R1) adalah fix yang masih aktif. Satu-satunya artifact adalah dead selector (D3), bukan regression perilaku.
12. **Apa minimal corrective action?** — Lihat Remediation Recommendation di bawah. Tidak ada bug runtime; tidak diperlukan perubahan behavior.

## G. Case A vs Case B (per requirement)

```
Case A — New Chat            Case B — Existing Session
Project  = empty (TASK-053)  Project  = per-chat (display-only)
Model    = default           Model    = per-chat ?? default
Workspace Path = C:\dev\alpha-one   Workspace Path = C:\dev\alpha-one   <-- SAMA
```
Kesimpulan: workspace path mengikuti **runtime global** (kombinasi default-settings + runtime sync), BUKAN project/session. Project dan Model berbeda antar-session; Workspace Path tidak bisa berbeda.

## H. Scenario 4 — Available controls (runtime + source)

| Control | OpenCode page | Assistant page |
|---|---|---|
| Local folder selection | NOT PRESENT | FOUND (LocalFolderPicker + `/api/fs/dirs`) |
| Drive selection | NOT PRESENT | FOUND (`/google/drive-picker`) |
| Folder picker | NOT PRESENT | FOUND |
| Project selection | Recent Projects fast track only (attach) | FOUND (ProjectSelector) |
| Path override | None (read-only + runtime-detected hint) | None |

## I. Quality Gate

- [x] source of truth Workspace Path diidentifikasi (PROVEN, E1-E3)
- [x] New Chat lifecycle ditrace (E4, G)
- [x] existing session lifecycle ditrace (E4, G)
- [x] hubungan session/project/workspace/runtime dijelaskan (E1-E4, E9-E10, G)
- [x] local/Drive selection implementation diverifikasi (E8, H)
- [x] status `Runtime-detected` ditrace ke source (E7, commit b2758e4)
- [x] tidak ada asumsi yang dipresentasikan sebagai fakta (semua PROVEN/DERIVED ditandai)
- [x] tidak ada source/database/runtime mutation (READ-ONLY audit)

## J. Verdict

```
PASS — Root cause dan ownership workspace state terbukti.
```

Semua pertanyaan root-cause terjawab dengan evidence PROVEN. Satu-satunya informasi yang tidak dapat dibuktikan (ada/tidaknya workspace picker dengan entri nyata pada build lama) bersifat historis dan tidak mempengaruhi kesimpulan.

## K. Remediation Recommendation (minimal, no redesign)

1. **(Optional, code hygiene) Hapus dead selector workspace page OpenCode:** `selectWorkspace` action + blok list `workspaces` di `opencode-toolbar.tsx` (kondisi `workspaces.length > 0`) + transport `listWorkspaces()` yang hardcode `[]` — atau, jika selector tetap diinginkan, wire `listWorkspaces()` ke daftar workspace nyata dan buat `selectWorkspace` persist + kirim `cwd` ke server (ini masuk kategori feature, bukan minimal).
2. **(Dokumentasi) Jangan tambahkan field `workspace` ke `Chat` / jangan harapkan New Chat workspace kosong** selama runtime masih single-process dengan CLI berjalan di server cwd. Per-session/per-project workspace membutuhkan perubahan runtime (spawn dengan `cwd` per prompt + validasi) — produk/arsitektur decision, bukan corrective fix.
3. **Tidak ada perubahan behavior yang diwajibkan:** path yang tampil akurat; perilaku bukan regression.

## L. Unresolved Questions

- Apakah product menginginkan workspace per-project/per-session? Jika ya → runtime contract harus didesain (bukan audit ini).
- Apakah `selectWorkspace`/workspace list sebaiknya dihapus (dead) atau dihidupkan (feature)?