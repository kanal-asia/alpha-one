/**
 * Google Apps Script API Service
 *
 * Server-side service for managing Google Apps Script projects using the authenticated
 * user's OAuth connection. Implements Read -> Write -> Read-Back validation workflow.
 */
import { getValidAccessToken } from './oauth-service'

export interface ScriptFile {
  name: string
  type: 'SERVER_JS' | 'HTML' | 'JSON'
  source: string
  lastModifyUser?: { name: string; email: string }
  createTime?: string
  updateTime?: string
}

export interface ScriptProject {
  scriptId: string
  title: string
  files: ScriptFile[]
  parentId?: string // Bound container ID (e.g. Google Sheet ID)
  boundContainerName?: string
  updatedAt?: string
}

const SCRIPT_API_BASE = 'https://script.googleapis.com/v1'
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3'

async function scriptFetch<T>(userId: string, path: string, options?: RequestInit): Promise<T> {
  const token = await getValidAccessToken(userId)
  if (!token) {
    throw new Error('Google account not connected. Please connect your Google account in Settings.')
  }

  const response = await fetch(`${SCRIPT_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { error?: { message?: string; code?: number; status?: string; details?: Array<{ reason?: string }> } }
    const message = error.error?.message ?? `Google Apps Script API error: ${response.status}`
    const code = error.error?.code ?? response.status
    const reason = error.error?.details?.[0]?.reason ?? ''

    if (code === 401) {
      throw new Error('Google authorization expired or revoked. Please reconnect your Google account.')
    }
    if (code === 403) {
      if (reason === 'accessNotConfigured' || message.includes('has not been used') || message.includes('is disabled')) {
        throw new Error('Google Apps Script API is not enabled in your Google Cloud project. Please enable it at https://console.developers.google.com/apis/api/script.googleapis.com')
      }
      if (message.includes('permission') || message.includes('scope')) {
        throw new Error('Apps Script access required. Please re-authenticate your Google account with Apps Script permissions.')
      }
      throw new Error('Permission denied. You do not have access to this Apps Script project.')
    }
    if (code === 404) {
      throw new Error('Apps Script project not found. Verify the Script ID.')
    }
    throw new Error(message)
  }

  return response.json() as Promise<T>
}

/**
 * Get Apps Script project metadata and bound container (parentId) if available.
 */
export async function getScriptProjectMeta(userId: string, scriptId: string): Promise<{ title: string; parentId?: string; boundContainerName?: string }> {
  const meta = await scriptFetch<{ scriptId: string; title: string; parentId?: string; updateTime?: string }>(userId, `/projects/${encodeURIComponent(scriptId)}`)
  
  let boundContainerName: string | undefined = undefined
  if (meta.parentId) {
    try {
      const token = await getValidAccessToken(userId)
      if (token) {
        const driveRes = await fetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(meta.parentId)}?fields=name,mimeType`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (driveRes.ok) {
          const driveFile = (await driveRes.json()) as { name?: string }
          boundContainerName = driveFile.name
        }
      }
    } catch {
      /* ignore bound container resolution failure */
    }
  }

  return {
    title: meta.title,
    parentId: meta.parentId,
    boundContainerName,
  }
}

/**
 * Get Apps Script project source files.
 */
export async function getScriptProjectContent(userId: string, scriptId: string): Promise<ScriptProject> {
  const meta = await getScriptProjectMeta(userId, scriptId)
  const content = await scriptFetch<{ scriptId: string; files: ScriptFile[] }>(userId, `/projects/${encodeURIComponent(scriptId)}/content`)

  return {
    scriptId,
    title: meta.title,
    files: content.files ?? [],
    parentId: meta.parentId,
    boundContainerName: meta.boundContainerName,
  }
}

/**
 * Update Apps Script project source files with Read -> Write -> Read-Back validation workflow.
 */
export async function updateScriptProjectContent(
  userId: string,
  scriptId: string,
  files: ScriptFile[]
): Promise<ScriptProject> {
  const baseline = await getScriptProjectContent(userId, scriptId)
  if (!baseline) {
    throw new Error('Apps Script project not found for baseline check.')
  }

  await scriptFetch(userId, `/projects/${encodeURIComponent(scriptId)}/content`, {
    method: 'PUT',
    body: JSON.stringify({ files }),
  })

  const readBack = await getScriptProjectContent(userId, scriptId)
  if (!readBack || !readBack.files || readBack.files.length === 0) {
    throw new Error('Read-back validation failed: project content is empty after update.')
  }

  return readBack
}

export interface ScriptProjectSummary {
  scriptId: string
  name: string
  modifiedTime: string
  parentId?: string
  boundContainerName?: string
}

/**
 * List accessible Google Apps Script projects via Drive API query (mimeType = application/vnd.google-apps.script).
 * Avoids any web scraping and uses official authorized Google API integration.
 */
export async function listScriptProjects(userId: string, searchQuery?: string): Promise<{ projects: ScriptProjectSummary[] }> {
  const queryParts = ["mimeType = 'application/vnd.google-apps.script'", 'trashed = false']
  if (searchQuery && searchQuery.trim()) {
    queryParts.push(`name contains '${searchQuery.trim().replace(/'/g, "\\'")}'`)
  }
  const token = await getValidAccessToken(userId)
  if (!token) {
    throw new Error('Google account not connected.')
  }

  const url = new URL(`${DRIVE_API_BASE}/files`)
  url.searchParams.set('q', queryParts.join(' and '))
  url.searchParams.set('fields', 'files(id,name,modifiedTime,parents)')
  url.searchParams.set('orderBy', 'modifiedTime desc')
  url.searchParams.set('pageSize', '100')
  url.searchParams.set('includeItemsFromAllDrives', 'true')
  url.searchParams.set('supportsAllDrives', 'true')

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    throw new Error('Failed to list Apps Script projects from Google Drive.')
  }

  const data = (await response.json()) as { files?: Array<{ id: string; name: string; modifiedTime: string; parents?: string[] }> }
  const files = data.files ?? []

  const projects: ScriptProjectSummary[] = []
  for (const f of files) {
    let boundContainerName: string | undefined = undefined
    const parentId = f.parents?.[0]
    if (parentId) {
      try {
        const parentRes = await fetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(parentId)}?fields=name`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (parentRes.ok) {
          const parentFile = (await parentRes.json()) as { name?: string }
          boundContainerName = parentFile.name
        }
      } catch {
        /* ignore parent resolution failure */
      }
    }
    projects.push({
      scriptId: f.id,
      name: f.name,
      modifiedTime: f.modifiedTime,
      parentId,
      boundContainerName,
    })
  }

  return { projects }
}
