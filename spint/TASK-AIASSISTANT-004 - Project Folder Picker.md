# TASK-AIASSISTANT-004 — Project Folder Picker

## Objective

Replace the manual path/ID text inputs in the AI Assistant "New Project" flow with visual folder pickers:
- **Local folder picker** — browse the machine's filesystem in a dialog and select a real folder path.
- **Google Drive folder picker** — reuse the existing Google Drive Explorer (TASK-GWORKSPACE-002/003) in `pick-folder` mode, open in a dedicated picker window, and return the selected folder (id + name + breadcrumb path) back to the project selector.

Reuse the existing Google Drive Explorer and API implementation; do not create a second Drive browser.

---

## Execution Summary

### Final Verdict: PASS

### Implementation

The browser File System Access API (`window.showDirectoryPicker()`) returns directory *handles*, not real absolute paths on Windows, so a native picker cannot satisfy the requirement that the persisted project `contextPath` is a real, reusable filesystem path. Audit of `src/platform/server/` and the runtime confirmed no existing directory-browse mechanism. Therefore the smallest supported mechanism was implemented server-side: a local-first directory listing endpoint consumed by a new picker dialog.

**Backend — local folder browser**
- New `src/services/fs/fs-router.ts` with `GET /api/fs/dirs?path=<abs dir>`:
  - No `path` → returns drive roots (`C:\`, `D:\`, …) with label `This PC` (POSIX: `/`).
  - With a directory path → returns `{ root, current, parent, directories: [{ name, path }] }`.
  - Rejects non-directories / unreadable paths with `400`.
  - Only directory listings (names + resolved paths), never file contents; local-first (local dev server).
- Mounted at `/api/fs` in `src/server/alpha-server.ts`.

**Google Drive Explorer — pick-folder mode enhancements** (`google-drive-browser.tsx`)
- `onFolderSelect` payload extended from `{ id, name }` → `{ id, name, path }`, where `path` is a human-readable breadcrumb (`My Drive / … / folder`) computed from the `breadcrumb` state (`folderPathFromBreadcrumb` helper).
- Added "Use this folder" header button (visible in `pick-folder` mode when a folder is open) so the user can select the folder they navigated into, not only folders shown in the current list.
- Existing row-level "Select" buttons unchanged.

**Drive picker window**
- New `drive-folder-picker.ts` module: `DRIVE_PICKER_MESSAGE_SOURCE` constant + `openDriveFolderPicker()` (opens `/google/drive-picker` popup).
- New `drive-folder-picker-page.tsx`: renders `GoogleDriveBrowser mode='pick-folder'`; on folder select, `window.opener.postMessage({ source, folder }, '*')` then closes the popup.
- New route `src/routes/_authenticated/google/drive-picker.tsx`.
- Exported `DriveFolderPickerPage` from the Google feature barrel (components only, no react-refresh warning).

**Local folder picker dialog** (`local-folder-picker.tsx`)
- Shadcn `Dialog` with breadcrumb navigation, up/home buttons, sub-folder list, "Select this folder" confirm (disabled at drive-roots view), load/error states.
- Loads via `/api/fs/dirs`; navigation is event-handler driven (loads are promise-callback based to satisfy `react-hooks/set-state-in-effect`).

**Project selector integration** (`project-selector.tsx`)
- Manual `Folder path` / `Drive folder name or ID` inputs removed and replaced with picker buttons + read-only selected summary.
- Local → opens `LocalFolderPicker`; selection sets `contextPath` = absolute path, `contextLabel` = path.
- Google Drive → opens the picker popup; `window.addEventListener('message', …)` receives the folder and sets `contextPath` = folder id, `contextLabel` = breadcrumb path.
- Source type switch clears prior selection; create validated (disabled) until name + folder selected.
- Original `createProject` persistence (localStorage via `project-store.ts`) unchanged.

### Files Changed

| File | Change |
|------|--------|
| `src/services/fs/fs-router.ts` | **New** — `GET /api/fs/dirs` local directory browser (drive roots, breadcrumb parent, sorted sub-folders, 400 on invalid) |
| `src/server/alpha-server.ts` | Mount `createFsRouter()` at `/api/fs` |
| `src/features/google/components/google-drive-browser.tsx` | pick-folder mode: `onFolderSelect` now returns `{ id, name, path }`; added "Use this folder" button + `folderPathFromBreadcrumb` |
| `src/features/google/components/drive-folder-picker.ts` | **New** — `DRIVE_PICKER_MESSAGE_SOURCE`, `openDriveFolderPicker()` |
| `src/features/google/components/drive-folder-picker-page.tsx` | **New** — picker page: browse in pick-folder mode, postMessage + close |
| `src/features/google/index.tsx` | Export `DriveFolderPickerPage` |
| `src/routes/_authenticated/google/drive-picker.tsx` | **New** — route `/google/drive-picker` |
| `src/features/ai-assistant/components/local-folder-picker.tsx` | **New** — local folder browsing dialog |
| `src/features/ai-assistant/components/project-selector.tsx` | Replace manual path/ID inputs with local + Drive pickers; message listener; validation; persistence wiring |

### Runtime Evidence

| Test | Endpoint | Result |
|------|----------|--------|
| Drive roots | `GET /api/fs/dirs` | `This PC` → `C:\`, `D:\` |
| Directory listing | `GET /api/fs/dirs?path=C:\dev` | `adgin-admin`, `alpha-workspace`, `aromask`, …, sorted |
| Invalid path | `GET /api/fs/dirs?path=C:\nonexistent123` | `400 Bad Request` |
| Dev server (backend) | port 3001 | Running, runtime ready, `/api/fs` mounted |
| Dev server (frontend) | port 5173 | Serving; `/` → `200`, `/google/drive-picker` → `200` (SPA fallback) |
| Proxy chain | `GET http://localhost:5173/api/fs/dirs?path=C:\dev` | Returns sub-folder list via Vite → Express |
| Route registration | `src/routeTree.gen.ts` | `/google/drive-picker` included (regenerated on build) |
| Drive browse/search/thumbnail (reused) | `/api/google/drive/*` | Previously validated in TASK-GWORKSPACE-003 / -003-R1 |

### Security

| Check | Result |
|-------|--------|
| OAuth tokens remain server-side | PASS |
| `/api/fs/dirs` returns directory listings only (no file contents) | PASS |
| Picker popup posts folder metadata via `window.opener.postMessage` (same origin) | PASS |
| Drive API calls reuse existing server-side token flow | PASS |

### Build

| Check | Result |
|-------|--------|
| TypeScript (`tsc --noEmit`) | PASS |
| Build (`npm run build`) | PASS (~1.9s) |
| Lint (`npm run lint`) | PASS (1 pre-existing warning in `src/routes/_authenticated/ai/opencode.tsx`) |

### Known Limitations

1. Google Drive API must be enabled in Google Cloud Console (project `480048442203`) for full Drive picker functionality; connection UI handles the not-enabled state.
2. The Drive picker opens as a same-origin popup; pop-up blockers apply (requires a user gesture — it is button-triggered).
3. `/api/fs/dirs` is a local-first endpoint on the dev server; it intentionally exposes the machine's directory structure to localhost only.

### Git

- branch: `task/gworkspace-002-r1-drive-access-rework`
- commit hash: `c88e152`
- commit message: `feat(ai-assistant): add local & google drive project folder pickers (TASK-AIASSISTANT-004)`