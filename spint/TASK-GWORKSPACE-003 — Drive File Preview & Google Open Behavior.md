# TASK-GWORKSPACE-003 — Drive File Preview & Google Open Behavior

## Objective

Improve the existing Google Drive Explorer so files are visually identifiable and actionable with thumbnails and open-in-new-tab behavior.

---

## Execution Summary

### Final Verdict: PASS

### Audit Findings

**Current `LIST_FIELDS`:**
```
nextPageToken,files(id,name,mimeType,modifiedTime,size,iconLink,webViewLink,parents)
```

**Missing fields:** `thumbnailLink`, `hasThumbnail`, `videoMediaMetadata`

**Frontend state:** Files rendered with icons only, no thumbnails. Only folders clickable. No file click handlers.

**Backend:** No thumbnail proxy exists. Google's `thumbnailLink` requires auth and has CORS issues.

### Implementation

**Drive Service (`drive-service.ts`)**
- Added `thumbnailLink`, `hasThumbnail`, `videoMediaMetadata` to `DriveFile` interface
- Updated `LIST_FIELDS` to include all new fields
- Updated `mapDriveFiles()` to map new fields
- Updated `driveList()` and `searchDrive()` type parameters
- Added `getDriveFileThumbnail(userId, fileId)` function that fetches thumbnail via authenticated backend proxy

**Drive Router (`drive-router.ts`)**
- Added `GET /api/google/drive/thumbnail/:fileId` endpoint
- Endpoint proxies thumbnail with server-side auth, returns image directly with 1-hour cache
- Never exposes OAuth tokens to client

**Barrel Exports (`index.ts`)**
- Added `getDriveFileThumbnail` export

**Drive Browser UI (`google-drive-browser.tsx`)**
- Added `Play` icon import for video overlay
- Added `isImageMime()` and `isVideoMime()` helper functions
- Added `openFileInNewTab()` helper function
- Updated `DriveFile` interface with new fields
- Image/video files show thumbnail preview via `/api/google/drive/thumbnail/:fileId`
- Video thumbnails show play indicator overlay
- Thumbnail failure gracefully falls back to file icon
- All non-folder files with `webViewLink` open in new tab via `window.open()`
- External link icon shown for openable files
- Folders continue to open inside Alpha Workspace

### Fields Added/Changed

| Field | Before | After |
|-------|--------|-------|
| `thumbnailLink` | Not requested | Requested |
| `hasThumbnail` | Not requested | Requested |
| `videoMediaMetadata` | Not requested | Requested |

### Thumbnail Behavior

| File Type | Thumbnail | Fallback |
|-----------|-----------|----------|
| Image (`image/*`) | Proxied thumbnail | File icon |
| Video (`video/*`) | Proxied thumbnail + play icon | File icon + play icon |
| Other | N/A | File icon |

### Open-in-New-Tab Behavior

| File Type | Click Action |
|-----------|-------------|
| Folder | Navigate inside Alpha Workspace |
| File with `webViewLink` | `window.open(webViewLink, '_blank', 'noopener,noreferrer')` |
| File without `webViewLink` | No action |

### Security

| Check | Result |
|-------|--------|
| OAuth tokens remain server-side | PASS |
| Thumbnail proxy uses server-side auth | PASS |
| No tokens exposed to browser | PASS |
| Cache-Control headers set | PASS |

### Build

| Check | Result |
|-------|--------|
| TypeScript | PASS |
| Build | PASS (2.14s) |
| Lint | PASS (1 pre-existing warning) |

### Known Limitations

1. **Thumbnail availability:** Not all files have thumbnails. Google only generates thumbnails for certain file types.
2. **Short-lived thumbnails:** Google's `thumbnailLink` URLs are short-lived. The backend proxy fetches fresh thumbnails on demand.
3. **Google Drive API must be enabled:** User must enable Drive API in Google Cloud Console.

### Git

- branch: `task/gworkspace-002-r1-drive-access-rework`
- commit hash: *pending*
- commit message: `feat(gworkspace): add file preview thumbnails and open-in-new-tab (TASK-GWORKSPACE-003)`
