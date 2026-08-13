/**
 * Google Drive API Service
 *
 * Server-side service for browsing Google Drive using the authenticated
 * user's OAuth connection. All Google API calls use server-side tokens.
 */
import { getValidAccessToken, getConnection } from './oauth-service'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  isFolder: boolean
  modifiedTime: string
  size?: string
  iconLink?: string
  webViewLink?: string
  thumbnailLink?: string
  hasThumbnail?: boolean
  videoMediaMetadata?: { width?: number; height?: number; durationMillis?: string }
  parents?: string[]
}

export interface DriveListResponse {
  files: DriveFile[]
  nextPageToken?: string
}

export interface DriveFolderMeta {
  id: string
  name: string
  mimeType: string
  modifiedTime: string
  parents?: string[]
}

// ---------------------------------------------------------------------------
// Google Drive API Helpers
// ---------------------------------------------------------------------------

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

async function driveFetch<T>(
  userId: string,
  path: string,
  params?: Record<string, string>
): Promise<T> {
  const token = await getValidAccessToken(userId)
  if (!token) {
    throw new Error('Google account not connected. Please connect your Google account in Settings.')
  }

  const url = new URL(`${DRIVE_API_BASE}${path}`)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value)
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { error?: { message?: string; code?: number; status?: string; details?: Array<{ reason?: string }> } }
    const message = error.error?.message ?? `Google Drive API error: ${response.status}`
    const code = error.error?.code ?? response.status
    const reason = error.error?.details?.[0]?.reason ?? ''

    if (code === 401) {
      throw new Error('Google authorization expired or revoked. Please reconnect your Google account.')
    }
    if (code === 403) {
      if (reason === 'accessNotConfigured' || message.includes('has not been used') || message.includes('is disabled')) {
        throw new Error('Google Drive API is not enabled in your Google Cloud project. Please enable it at https://console.developers.google.com/apis/api/drive.googleapis.com')
      }
      throw new Error('Permission denied. You do not have access to this resource.')
    }
    if (code === 404) {
      throw new Error('Folder or file not found.')
    }
    throw new Error(message)
  }

  return response.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Drive Operations
// ---------------------------------------------------------------------------

/** Shared field set for all Drive list queries. */
const LIST_FIELDS = 'nextPageToken,files(id,name,mimeType,modifiedTime,size,iconLink,webViewLink,thumbnailLink,hasThumbnail,videoMediaMetadata,parents)'

/** Map raw Google API file objects to our DriveFile type. */
function mapDriveFiles(files: Array<{
  id: string
  name: string
  mimeType: string
  modifiedTime: string
  size?: string
  iconLink?: string
  webViewLink?: string
  thumbnailLink?: string
  hasThumbnail?: boolean
  videoMediaMetadata?: { width?: number; height?: number; durationMillis?: string }
  parents?: string[]
}>): DriveFile[] {
  return files.map((file) => ({
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    isFolder: file.mimeType === FOLDER_MIME,
    modifiedTime: file.modifiedTime,
    size: file.size,
    iconLink: file.iconLink,
    webViewLink: file.webViewLink,
    thumbnailLink: file.thumbnailLink,
    hasThumbnail: file.hasThumbnail,
    videoMediaMetadata: file.videoMediaMetadata,
    parents: file.parents,
  }))
}

/**
 * Generic list helper. Runs a Drive files.list query with the given q/orderBy
 * and returns mapped DriveFile results.
 * Uses includeItemsFromAllDrives to ensure shared content is accessible.
 */
async function driveList(
  userId: string,
  q: string,
  opts?: { orderBy?: string; pageSize?: string; pageToken?: string }
): Promise<DriveListResponse> {
  const params: Record<string, string> = {
    fields: LIST_FIELDS,
    orderBy: opts?.orderBy ?? 'name',
    pageSize: opts?.pageSize ?? '100',
    q,
    includeItemsFromAllDrives: 'true',
    supportsAllDrives: 'true',
  }
  if (opts?.pageToken) params.pageToken = opts.pageToken

  const response = await driveFetch<{ files: Array<{
    id: string; name: string; mimeType: string; modifiedTime: string
    size?: string; iconLink?: string; webViewLink?: string
    thumbnailLink?: string; hasThumbnail?: boolean
    videoMediaMetadata?: { width?: number; height?: number; durationMillis?: string }
    parents?: string[]
  }>; nextPageToken?: string }>(userId, '/files', params)

  return {
    files: mapDriveFiles(response.files),
    nextPageToken: response.nextPageToken,
  }
}

/**
 * List contents of a Google Drive folder.
 * If folderId is undefined, lists the root folder (My Drive root).
 */
export async function listDriveFolder(
  userId: string,
  folderId?: string,
  pageToken?: string,
  searchQuery?: string
): Promise<DriveListResponse> {
  const queryParts: string[] = []

  if (folderId) {
    queryParts.push(`'${folderId}' in parents`)
  } else {
    queryParts.push("'root' in parents")
  }

  queryParts.push('trashed = false')

  if (searchQuery) {
    queryParts.push(`name contains '${searchQuery.replace(/'/g, "\\'")}'`)
  }

  return driveList(userId, queryParts.join(' and '), { pageToken })
}

/**
 * List files in the user's My Drive root.
 */
export async function listMyDrive(
  userId: string,
  pageToken?: string
): Promise<DriveListResponse> {
  return driveList(userId, "'root' in parents and trashed = false", { pageToken })
}

/**
 * List files shared directly with the user.
 * Google Drive API: `sharedWithMe = true` returns files where another user
 * explicitly shared with the authenticated account.
 */
export async function listSharedWithMe(
  userId: string,
  pageToken?: string
): Promise<DriveListResponse> {
  return driveList(userId, "sharedWithMe = true and trashed = false", {
    pageToken,
    orderBy: 'modifiedTime desc',
  })
}

/**
 * List files/folders starred by the user.
 */
export async function listStarred(
  userId: string,
  pageToken?: string
): Promise<DriveListResponse> {
  return driveList(userId, "starred = true and trashed = false", {
    pageToken,
    orderBy: 'modifiedTime desc',
  })
}

/**
 * List recently modified files.
 * Uses `modifiedTime desc` ordering as a reasonable approximation of the
 * Google Drive UI's "Recent" view. The API does not expose a dedicated
 * "recently accessed" query, so we order by modification time.
 */
export async function listRecent(
  userId: string,
  pageToken?: string
): Promise<DriveListResponse> {
  return driveList(userId, "trashed = false and mimeType != 'application/vnd.google-apps.folder'", {
    pageToken,
    orderBy: 'modifiedTime desc',
    pageSize: '50',
  })
}

/**
 * Get metadata for a specific folder.
 */
export async function getFolderMeta(
  userId: string,
  folderId: string
): Promise<DriveFolderMeta> {
  const file = await driveFetch<{
    id: string
    name: string
    mimeType: string
    modifiedTime: string
    parents?: string[]
  }>(userId, `/files/${folderId}`, {
    fields: 'id,name,mimeType,modifiedTime,parents',
  })

  if (file.mimeType !== FOLDER_MIME) {
    throw new Error('The specified ID is not a folder.')
  }

  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    modifiedTime: file.modifiedTime,
    parents: file.parents,
  }
}

/**
 * Build breadcrumb path for a folder by walking up the parent chain.
 */
export async function getFolderBreadcrumb(
  userId: string,
  folderId: string
): Promise<DriveFolderMeta[]> {
  const breadcrumb: DriveFolderMeta[] = []
  let currentId: string | undefined = folderId

  while (currentId) {
    const meta = await getFolderMeta(userId, currentId)
    breadcrumb.unshift(meta)
    currentId = meta.parents?.[0]
  }

  return breadcrumb
}

/**
 * Search Google Drive for files and folders.
 * Searches all accessible content including shared resources by using
 * includeItemsFromAllDrives and supportsAllDrives.
 */
export async function searchDrive(
  userId: string,
  query: string,
  pageToken?: string
): Promise<DriveListResponse> {
  const params: Record<string, string> = {
    fields: LIST_FIELDS,
    pageSize: '50',
    q: `name contains '${query.replace(/'/g, "\\'")}' and trashed = false`,
    includeItemsFromAllDrives: 'true',
    supportsAllDrives: 'true',
  }

  if (pageToken) {
    params.pageToken = pageToken
  }

  const response = await driveFetch<{ files: Array<{
    id: string; name: string; mimeType: string; modifiedTime: string
    size?: string; iconLink?: string; webViewLink?: string
    thumbnailLink?: string; hasThumbnail?: boolean
    videoMediaMetadata?: { width?: number; height?: number; durationMillis?: string }
    parents?: string[]
  }>; nextPageToken?: string }>(userId, '/files', params)

  return {
    files: mapDriveFiles(response.files),
    nextPageToken: response.nextPageToken,
  }
}

/**
 * Check if user has a Google Drive connection.
 */
export async function checkDriveConnection(userId: string): Promise<{
  connected: boolean
  email?: string
  error?: string
}> {
  const connection = await getConnection(userId)

  if (!connection) {
    return { connected: false, error: 'Google account not connected.' }
  }

  // Try to get a valid token
  const token = await getValidAccessToken(userId)
  if (!token) {
    return { connected: false, error: 'Google authorization expired. Please reconnect.' }
  }

  return { connected: true, email: connection.email }
}

/**
 * Fetch a file's thumbnail from Google Drive with server-side authentication.
 * Returns the image buffer and content type, or null if not available.
 */
export async function getDriveFileThumbnail(
  userId: string,
  fileId: string
): Promise<{ data: Buffer; contentType: string } | null> {
  const token = await getValidAccessToken(userId)
  if (!token) return null

  // First, get the thumbnailLink from the file metadata
  const file = await driveFetch<{
    thumbnailLink?: string
    hasThumbnail?: boolean
  }>(userId, `/files/${fileId}`, {
    fields: 'thumbnailLink,hasThumbnail',
  })

  if (!file.thumbnailLink || !file.hasThumbnail) {
    return null
  }

  // Google thumbnailLinks are short-lived and require auth.
  // We need to add our access token and fetch the actual image.
  const thumbnailUrl = new URL(file.thumbnailLink)
  thumbnailUrl.searchParams.set('access_token', token)

  const response = await fetch(thumbnailUrl.toString())
  if (!response.ok) {
    return null
  }

  const contentType = response.headers.get('content-type') ?? 'image/jpeg'
  const arrayBuffer = await response.arrayBuffer()
  return { data: Buffer.from(arrayBuffer), contentType }
}
