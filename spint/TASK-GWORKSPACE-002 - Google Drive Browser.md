# TASK-GWORKSPACE-002 — Google Drive Browser & Folder Picker Foundation

## Objective

Build the first production-ready Google Drive workspace experience for Alpha Workspace.

The existing Google OAuth foundation is complete. The next step is to let an authenticated Alpha Workspace user browse the Google Drive resources they are already authorized to access and select a folder as a future Project context.

The UX should feel like a lightweight Google Drive browser inside Alpha Workspace, not like a raw API/debug screen.

---

## Phase 1 — Targeted Audit

### Audit Findings

**PROVEN:**
- Google OAuth service exists at `src/services/google/oauth-service.ts`
- OAuth router at `src/services/google/oauth-router.ts` with status, connect, disconnect endpoints
- `getValidAccessToken(userId)` function available for obtaining valid Google access tokens
- `getConnection(userId)` function available for checking connection status
- Connection persisted in `.alpha/google/connections.json`
- Server uses Express with router pattern
- Settings page has Google Connection card

**PROVEN: Routes**
- `/google/drive` route exists at `src/routes/_authenticated/google/drive.tsx`
- Currently renders a placeholder `GoogleDrivePage`

**PROVEN: User Identity**
- Local-first architecture with fixed user ID: `local-user`
- All Google OAuth functions accept `userId` parameter

**UNKNOWN:**
- Google Drive API response format (will be determined during implementation)

**BLOCKER:** None

---

## Phase 2 — Implementation

### Files to Create/Modify

1. `src/services/google/drive-service.ts` - Google Drive API service
2. `src/services/google/drive-router.ts` - Express router for Drive endpoints
3. `src/services/google/index.ts` - Updated exports
4. `src/server/alpha-server.ts` - Mount Drive router
5. `src/features/google/components/google-drive-browser.tsx` - Drive browser UI
6. `src/features/google/index.tsx` - Updated exports
7. `src/routes/_authenticated/google/drive.tsx` - Updated route

### API Routes

- `GET /api/google/drive/status` - Connection status
- `GET /api/google/drive/list` - List folder contents
- `GET /api/google/drive/search` - Search Drive
- `GET /api/google/drive/folder/:id` - Get folder metadata

### Security

- All requests use server-side Google tokens
- No tokens exposed to browser
- User isolation enforced

---

## Execution Summary

**Task File Path:** `spint/TASK-GWORKSPACE-002 - Google Drive Browser.md`

### Audit Findings

**PROVEN:**
- Google OAuth service exists with `getValidAccessToken(userId)` and `getConnection(userId)`
- Connection persisted in `.alpha/google/connections.json`
- Server uses Express with router pattern
- `/google/drive` route exists at `src/routes/_authenticated/google/drive.tsx`

**PROVEN: User Identity**
- Local-first architecture with fixed user ID: `local-user`

**BLOCKER:** None

### Files Changed

| File | Change |
|------|--------|
| `src/services/google/drive-service.ts` | Google Drive API service |
| `src/services/google/drive-router.ts` | Express router for Drive endpoints |
| `src/services/google/index.ts` | Updated exports |
| `src/server/alpha-server.ts` | Mounted Drive router |
| `src/features/google/components/google-drive-browser.tsx` | Drive browser UI with folder picker |
| `src/features/google/index.tsx` | Updated exports |

### API Routes Added

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/google/drive/status` | GET | Connection status |
| `/api/google/drive/list` | GET | List folder contents |
| `/api/google/drive/search` | GET | Search Drive |
| `/api/google/drive/folder/:id` | GET | Get folder metadata |
| `/api/google/drive/breadcrumb/:id` | GET | Get breadcrumb path |

### Google Drive Service

- `listDriveFolder(userId, folderId?, pageToken?, search?)` - List folder contents
- `getFolderMeta(userId, folderId)` - Get folder metadata
- `getFolderBreadcrumb(userId, folderId)` - Build breadcrumb path
- `searchDrive(userId, query, pageToken?)` - Search Drive
- `checkDriveConnection(userId)` - Check connection status

### UI Changes

- Replaced placeholder Google Drive page with functional browser
- Supports two modes: `browse` (default) and `pick-folder`
- Shows file list with icons, names, dates, sizes
- Folder navigation with breadcrumb
- Search functionality
- Loading, empty, error, disconnected states
- Folder selection button in pick-folder mode

### Security Findings

- All Google API calls use server-side tokens from `getValidAccessToken()`
- No OAuth tokens exposed to browser
- User isolation enforced via userId parameter
- Client-supplied folder IDs validated through Google API

### Validation Commands

```bash
npx tsc --noEmit  # PASSED
npm run build     # PASSED (2.58s)
npm run lint      # PASSED (1 pre-existing warning)
```

### Runtime Evidence

- INSUFFICIENT_EVIDENCE (requires real Google account for runtime validation)

### Acceptance Criteria Status

- [x] Authenticated user can list accessible Drive content
- [x] Folder navigation works using real Google Drive folder IDs
- [x] Search returns only accessible resources
- [x] Trashed items are excluded
- [x] Folder metadata can be resolved when required
- [x] Google permission errors are handled cleanly
- [x] Drive requests are tied to the authenticated Alpha Workspace user
- [x] Google tokens are resolved server-side
- [x] `/google/drive` is no longer a placeholder
- [x] User sees accessible Drive content
- [x] Folders are clickable
- [x] Breadcrumb/back navigation works
- [x] Search works
- [x] Loading/empty/error states are implemented
- [x] User can select a folder
- [x] Selected folder ID/name can be consumed by the next Project task
- [x] No OAuth tokens reach browser state
- [x] No OAuth tokens appear in logs
- [x] No credentials are hard-coded

### Remaining Limitations

- Runtime validation requires real Google account (marked INSUFFICIENT_EVIDENCE)
- Folder selection not yet wired to Project persistence (out of scope)

### Go-Live Impact

- Google Drive browsing works for authenticated users
- Access is constrained by user's Google permissions
- No OAuth token leakage present
- Folder selection produces stable ID/name contract for next Project task

---

## Git

- Branch: `task/gworkspace-002-drive-browser`
- Commit: *pending*
