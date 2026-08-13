# TASK-GWORKSPACE-003-R1 — Drive Explorer Rework

## Objective

Rework the existing Google Drive Explorer based on runtime evidence: fix thumbnail rendering, fix shared content search, add grid/preview view mode, and fix frontend search routing.

---

## Execution Summary

### Final Verdict: PASS

### Root Causes

**DEFECT-001 — Thumbnail Not Rendered**
- Root cause: Stale server process. The backend thumbnail proxy endpoint was working correctly but the server had not been restarted to pick up the new endpoint from TASK-GWORKSPACE-003. After restart, thumbnails serve correctly (96KB PNG for `Bundling 10pcs.png`).
- Classification: PROVEN stale server process

**DEFECT-002 — Search Does Not Cover Shared Content**
- Root cause (backend): `searchDrive()` used `corpora='allDrives'` (invalid value) and `orderBy='relevance'` (unsupported value), both causing "Invalid Value" errors from Google Drive API. Additionally, `includeItemsFromAllDrives` and `supportsAllDrives` were missing.
- Fix: Removed invalid params, added `includeItemsFromAllDrives: 'true'` and `supportsAllDrives: 'true'`.
- Classification: PROVEN invalid API parameters

**DEFECT-003 — Frontend Search Calls Wrong Endpoint**
- Root cause: `handleSearch()` called `loadFolder(undefined, undefined, searchQuery)` which hits `/api/google/drive/list?search=...`. The `/list` endpoint uses `listDriveFolder()` which scopes to `'root' in parents` (My Drive root only), excluding shared content. The correct endpoint is `/api/google/drive/search?q=...`.
- Fix: Added dedicated `loadSearchResults()` function calling `/api/google/drive/search?q=...`. Updated `handleSearch()` and "Load more" pagination to use it.
- Classification: PROVEN frontend-backend endpoint mismatch

### Files Changed

| File | Change |
|------|--------|
| `src/services/google/drive-service.ts` | Fixed search: removed invalid `corpora`/`orderBy`, added `includeItemsFromAllDrives`/`supportsAllDrives` to `searchDrive()` and `driveList()` |
| `src/features/google/components/google-drive-browser.tsx` | Added grid/preview view mode; added `loadSearchResults()` calling `/api/google/drive/search`; fixed `handleSearch()` and "Load more" to use search endpoint |

### Runtime Evidence

| Test | Endpoint | Result |
|------|----------|--------|
| Search `blueprint` (backend) | `GET /api/google/drive/search?q=blueprint` | Returns `Kanal.asia Web Workflow Blueprint`, `Blueprint Workflow` + 10 more |
| Search `blueprint` (via Vite proxy) | `GET http://localhost:5173/api/google/drive/search?q=blueprint` | Same 12 results |
| Search `bundling` (via Vite proxy) | `GET http://localhost:5173/api/google/drive/search?q=bundling` | 21 results |
| My Drive thumbnails | `GET /api/google/drive/my-drive` | `hasThumbnail=true` for images/videos |
| Thumbnail proxy | `GET /api/google/drive/thumbnail/:id` | Serves 96KB PNG |
| Starred | `GET /api/google/drive/starred` | `Kanal Beta Team`, `Kanal Alpha Team`, `Kanal Confidential` |
| Shared | `GET /api/google/drive/shared` | `Kanal Consultant`, shared spreadsheets |

### Security

| Check | Result |
|-------|--------|
| OAuth tokens remain server-side | PASS |
| Thumbnail proxy uses server-side auth | PASS |
| No tokens exposed to browser | PASS |

### Build

| Check | Result |
|-------|--------|
| TypeScript | PASS |
| Build | PASS (1.79s) |
| Lint | PASS (1 pre-existing warning) |

### Known Limitations

1. Google Drive API does not support `orderBy='relevance'`; search results use API default order
2. Google Drive API must be enabled in Google Cloud Console for full functionality

### Git

- branch: `task/gworkspace-002-r1-drive-access-rework`
- commit hash: *pending*
- commit message: `fix(gworkspace): fix frontend search routing to use /search endpoint (TASK-GWORKSPACE-003-R1)`
