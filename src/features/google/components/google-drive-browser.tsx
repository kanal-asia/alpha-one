import { useEffect, useState, useCallback } from 'react'
import {
  Cloud,
  ChevronRight,
  Folder,
  File,
  Search,
  ArrowLeft,
  Check,
  AlertCircle,
  Loader2,
  FolderOpen,
  FileText,
  FileSpreadsheet,
  Presentation,
  Image,
  Film,
  Music,
  ExternalLink,
  Star,
  Clock,
  Users,
  HardDrive,
  Play,
} from 'lucide-react'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DriveFile {
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

interface DriveListResponse {
  files: DriveFile[]
  nextPageToken?: string
}

interface DriveBreadcrumb {
  id: string
  name: string
  mimeType: string
  modifiedTime: string
  parents?: string[]
}

interface DriveStatus {
  connected: boolean
  email?: string
  error?: string
}

type NavTab = 'my-drive' | 'shared' | 'starred' | 'recent'

interface GoogleDriveBrowserProps {
  mode?: 'browse' | 'pick-folder'
  onFolderSelect?: (folder: { id: string; name: string }) => void
}

// ---------------------------------------------------------------------------
// API Client
// ---------------------------------------------------------------------------

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFileIcon(mimeType: string) {
  if (mimeType === 'application/vnd.google-apps.folder') return Folder
  if (mimeType.includes('spreadsheet')) return FileSpreadsheet
  if (mimeType.includes('document')) return FileText
  if (mimeType.includes('presentation')) return Presentation
  if (mimeType.startsWith('image/')) return Image
  if (mimeType.startsWith('video/')) return Film
  if (mimeType.startsWith('audio/')) return Music
  return File
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function formatSize(size?: string): string {
  if (!size) return '-'
  const bytes = parseInt(size, 10)
  if (isNaN(bytes)) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}

function isVideoMime(mimeType: string): boolean {
  return mimeType.startsWith('video/')
}

function openFileInNewTab(webViewLink?: string) {
  if (webViewLink) {
    window.open(webViewLink, '_blank', 'noopener,noreferrer')
  }
}

const NAV_TABS: { id: NavTab; label: string; icon: React.ElementType; endpoint: string }[] = [
  { id: 'my-drive', label: 'My Drive', icon: HardDrive, endpoint: '/api/google/drive/my-drive' },
  { id: 'shared', label: 'Shared with me', icon: Users, endpoint: '/api/google/drive/shared' },
  { id: 'starred', label: 'Starred', icon: Star, endpoint: '/api/google/drive/starred' },
  { id: 'recent', label: 'Recent', icon: Clock, endpoint: '/api/google/drive/recent' },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GoogleDriveBrowser({
  mode = 'browse',
  onFolderSelect,
}: GoogleDriveBrowserProps) {
  const [status, setStatus] = useState<DriveStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [files, setFiles] = useState<DriveFile[]>([])
  const [nextPageToken, setNextPageToken] = useState<string | undefined>()
  const [loadingFiles, setLoadingFiles] = useState(false)

  const [activeTab, setActiveTab] = useState<NavTab>('my-drive')
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>()
  const [breadcrumb, setBreadcrumb] = useState<DriveBreadcrumb[]>([])

  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)

  const [selectedFolder, setSelectedFolder] = useState<{ id: string; name: string } | null>(null)

  const [connecting, setConnecting] = useState(false)

  const handleConnect = async () => {
    setConnecting(true)
    setError(null)
    try {
      const res = await fetch('/api/google/oauth/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnTo: '/google/drive' }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Unable to start Google connection. Please try again.')
        return
      }
      if (data.url) {
        window.location.href = data.url
      } else if (data.error) {
        setError(data.error)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google Workspace service is unavailable.')
    } finally {
      setConnecting(false)
    }
  }

  // Load files for a nav tab
  const loadTabFiles = useCallback(async (tab: NavTab, pageToken?: string) => {
    setLoadingFiles(true)
    setError(null)
    try {
      const tabConfig = NAV_TABS.find((t) => t.id === tab)
      if (!tabConfig) return

      const params = new URLSearchParams()
      if (pageToken) params.set('pageToken', pageToken)

      const data = await apiFetch<DriveListResponse>(
        `${tabConfig.endpoint}?${params.toString()}`
      )

      if (pageToken) {
        setFiles((prev) => [...prev, ...data.files])
      } else {
        setFiles(data.files)
      }
      setNextPageToken(data.nextPageToken)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files.')
    } finally {
      setLoadingFiles(false)
    }
  }, [])

  // Load folder contents
  const loadFolder = useCallback(async (folderId?: string, pageToken?: string, search?: string) => {
    setLoadingFiles(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (folderId) params.set('folderId', folderId)
      if (pageToken) params.set('pageToken', pageToken)
      if (search) params.set('search', search)

      const data = await apiFetch<DriveListResponse>(
        `/api/google/drive/list?${params.toString()}`
      )

      if (pageToken) {
        setFiles((prev) => [...prev, ...data.files])
      } else {
        setFiles(data.files)
      }
      setNextPageToken(data.nextPageToken)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files.')
    } finally {
      setLoadingFiles(false)
    }
  }, [])

  // Load breadcrumb
  const loadBreadcrumb = useCallback(async (folderId: string) => {
    try {
      const data = await apiFetch<{ breadcrumb: DriveBreadcrumb[] }>(
        `/api/google/drive/breadcrumb/${folderId}`
      )
      setBreadcrumb(data.breadcrumb)
    } catch {
      // Breadcrumb is optional, don't show error
    }
  }, [])

  // Check connection status (also handles post-OAuth redirect and initial folder load)
  useEffect(() => {
    let cancelled = false

    // Handle post-OAuth redirect params
    const params = new URLSearchParams(window.location.search)
    const connectedParam = params.get('google_connected') === 'true'
    const errorParam = params.get('google_error')
    if (connectedParam || errorParam) {
      window.history.replaceState({}, '', window.location.pathname)
    }

    async function checkStatus() {
      try {
        const data = await apiFetch<DriveStatus>('/api/google/drive/status')
        if (!cancelled) {
          setStatus(data)
          setLoading(false)
          // Auto-load My Drive when connected
          if (data.connected) {
            void loadTabFiles('my-drive')
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to check status.')
          setLoading(false)
        }
      }
    }
    void checkStatus()
    return () => { cancelled = true }
  }, [loadTabFiles])

  // Switch navigation tab
  const switchTab = (tab: NavTab) => {
    setActiveTab(tab)
    setCurrentFolderId(undefined)
    setBreadcrumb([])
    setIsSearching(false)
    setSearchQuery('')
    void loadTabFiles(tab)
  }

  // Navigate to folder
  const navigateToFolder = (folderId: string) => {
    setCurrentFolderId(folderId)
    void loadFolder(folderId)
    void loadBreadcrumb(folderId)
  }

  // Navigate back
  const navigateBack = () => {
    if (breadcrumb.length > 1) {
      const parent = breadcrumb[breadcrumb.length - 2]
      navigateToFolder(parent.id)
    } else {
      setCurrentFolderId(undefined)
      setBreadcrumb([])
      void loadTabFiles(activeTab)
    }
  }

  // Handle search
  const handleSearch = () => {
    if (searchQuery.trim()) {
      setIsSearching(true)
      void loadFolder(undefined, undefined, searchQuery.trim())
    }
  }

  const clearSearch = () => {
    setSearchQuery('')
    setIsSearching(false)
    setCurrentFolderId(undefined)
    setBreadcrumb([])
    void loadTabFiles(activeTab)
  }

  // Handle folder selection (for pick-folder mode)
  const handleFolderClick = (file: DriveFile) => {
    if (file.isFolder) {
      navigateToFolder(file.id)
    }
  }

  const handleSelectFolder = () => {
    if (selectedFolder && onFolderSelect) {
      onFolderSelect(selectedFolder)
    }
  }

  // Loading state
  if (loading) {
    return (
      <>
        <PageHeader />
        <Main>
          <div className='flex items-center justify-center py-12'>
            <Loader2 className='size-6 animate-spin text-muted-foreground' />
          </div>
        </Main>
      </>
    )
  }

  // Not connected state
  if (!status?.connected) {
    return (
      <>
        <PageHeader />
        <Main>
          <div className='space-y-4'>
            <div className='flex items-center justify-between'>
              <div className='space-y-1'>
                <h1 className='flex items-center gap-2 text-2xl font-bold tracking-tight'>
                  <Cloud className='size-6' />
                  Google Drive
                </h1>
                <p className='text-sm text-muted-foreground'>
                  Connect your Google account to access your Drive files and folders.
                </p>
              </div>
            </div>

            <Card>
              <CardContent className='py-8'>
                <div className='flex flex-col items-center gap-4 text-center'>
                  <Cloud className='size-10 text-muted-foreground' />
                  <div className='space-y-1'>
                    <p className='text-sm text-muted-foreground'>
                      Connect your Google account to access your Drive files and folders.
                    </p>
                  </div>
                  {error && (
                    <div className='flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive'>
                      <AlertCircle className='size-4' />
                      {error}
                    </div>
                  )}
                  <Button onClick={handleConnect} disabled={connecting}>
                    <ExternalLink className='size-4' />
                    {connecting ? 'Connecting...' : 'Connect Google'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </Main>
      </>
    )
  }

  return (
    <>
      <PageHeader />
      <Main>
        <div className='space-y-4'>
          {/* Header */}
          <div className='flex items-center justify-between'>
            <div className='space-y-1'>
              <h1 className='flex items-center gap-2 text-2xl font-bold tracking-tight'>
                <Cloud className='size-6' />
                Google Drive
              </h1>
              <p className='text-sm text-muted-foreground'>
                {status.email ? `Browsing as ${status.email}` : 'Browse your Google Drive files.'}
              </p>
            </div>
            {mode === 'pick-folder' && selectedFolder && (
              <Button onClick={handleSelectFolder}>
                <Check className='size-4' />
                Select "{selectedFolder.name}"
              </Button>
            )}
          </div>

          {/* Navigation tabs */}
          <div className='flex items-center gap-1 rounded-lg border p-1'>
            {NAV_TABS.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id && !currentFolderId && !isSearching
              return (
                <Button
                  key={tab.id}
                  variant={isActive ? 'secondary' : 'ghost'}
                  size='sm'
                  className='flex items-center gap-2'
                  onClick={() => switchTab(tab.id)}
                >
                  <Icon className='size-4' />
                  {tab.label}
                </Button>
              )
            })}
          </div>

          {/* Search and Navigation */}
          <div className='flex items-center gap-2'>
            {(isSearching || currentFolderId) ? (
              <Button
                variant='ghost'
                size='sm'
                onClick={() => {
                  if (isSearching) {
                    clearSearch()
                  } else {
                    navigateBack()
                  }
                }}
              >
                <ArrowLeft className='size-4' />
                Back
              </Button>
            ) : null}

            <div className='flex-1'>
              <div className='relative'>
                <Search className='absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
                <Input
                  placeholder='Search Drive...'
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSearch()
                  }}
                  className='h-9 pl-8'
                />
              </div>
            </div>
          </div>

          {/* Breadcrumb */}
          {breadcrumb.length > 0 && (
            <div className='flex items-center gap-1 text-sm text-muted-foreground'>
              <Button
                variant='ghost'
                size='sm'
                className='h-7 px-2'
                onClick={() => {
                  setCurrentFolderId(undefined)
                  setBreadcrumb([])
                  void loadTabFiles(activeTab)
                }}
              >
                <Cloud className='size-3.5' />
              </Button>
              {breadcrumb.map((item, i) => (
                <span key={item.id} className='flex items-center gap-1'>
                  <ChevronRight className='size-3' />
                  <Button
                    variant='ghost'
                    size='sm'
                    className={cn(
                      'h-7 px-2',
                      i === breadcrumb.length - 1 && 'font-medium text-foreground'
                    )}
                    onClick={() => navigateToFolder(item.id)}
                  >
                    {item.name}
                  </Button>
                </span>
              ))}
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className='flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive'>
              <AlertCircle className='size-4' />
              {error}
            </div>
          )}

          {/* File list */}
          <Card>
            <CardContent className='p-0'>
              {loadingFiles ? (
                <div className='flex items-center justify-center py-12'>
                  <Loader2 className='size-6 animate-spin text-muted-foreground' />
                </div>
              ) : error ? (
                <div className='flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-muted-foreground'>
                  <AlertCircle className='size-8 text-destructive' />
                  <p className='text-destructive'>{error}</p>
                </div>
              ) : files.length === 0 ? (
                <div className='flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-muted-foreground'>
                  <FolderOpen className='size-8' />
                  {isSearching ? 'No results found.' : 'This folder is empty.'}
                </div>
              ) : (
                <ScrollArea className='h-[calc(100vh-28rem)]'>
                  <div className='divide-y'>
                    {files.map((file) => {
                      const Icon = getFileIcon(file.mimeType)
                      const isSelected = selectedFolder?.id === file.id
                      const showThumbnail = !file.isFolder && file.hasThumbnail && (isImageMime(file.mimeType) || isVideoMime(file.mimeType))
                      const canOpen = !file.isFolder && !!file.webViewLink
                      return (
                        <div
                          key={file.id}
                          className={cn(
                            'flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/50',
                            file.isFolder && 'cursor-pointer',
                            canOpen && 'cursor-pointer',
                            isSelected && 'bg-primary/10'
                          )}
                          onClick={() => {
                            if (file.isFolder) {
                              handleFolderClick(file)
                            } else if (canOpen) {
                              openFileInNewTab(file.webViewLink)
                            }
                          }}
                        >
                          {showThumbnail ? (
                            <div className='relative size-10 shrink-0 overflow-hidden rounded border'>
                              <img
                                src={`/api/google/drive/thumbnail/${file.id}`}
                                alt={file.name}
                                className='size-full object-cover'
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement
                                  target.style.display = 'none'
                                  const fallback = target.nextElementSibling as HTMLElement
                                  if (fallback) fallback.style.display = 'flex'
                                }}
                              />
                              <div className='absolute inset-0 hidden items-center justify-center bg-muted'>
                                <Icon className='size-5 text-muted-foreground' />
                              </div>
                              {isVideoMime(file.mimeType) && (
                                <div className='absolute inset-0 flex items-center justify-center bg-black/30'>
                                  <Play className='size-4 text-white fill-white' />
                                </div>
                              )}
                            </div>
                          ) : (
                            <Icon
                              className={cn(
                                'size-5 shrink-0',
                                file.isFolder ? 'text-blue-500' : 'text-muted-foreground'
                              )}
                            />
                          )}
                          <div className='min-w-0 flex-1'>
                            <p className='truncate font-medium'>{file.name}</p>
                            <p className='truncate text-xs text-muted-foreground'>
                              {formatDate(file.modifiedTime)}
                              {!file.isFolder && file.size && ` · ${formatSize(file.size)}`}
                            </p>
                          </div>
                          {canOpen && !file.isFolder && (
                            <ExternalLink className='size-4 shrink-0 text-muted-foreground' />
                          )}
                          {file.isFolder && mode === 'pick-folder' && (
                            <Button
                              variant={isSelected ? 'default' : 'outline'}
                              size='sm'
                              className='shrink-0'
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedFolder({ id: file.id, name: file.name })
                              }}
                            >
                              <Check className='size-3.5' />
                              Select
                            </Button>
                          )}
                          {file.isFolder && mode === 'browse' && (
                            <ChevronRight className='size-4 shrink-0 text-muted-foreground' />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>
              )}

              {/* Load more */}
              {nextPageToken && !loadingFiles && (
                <div className='border-t p-3'>
                  <Button
                    variant='outline'
                    size='sm'
                    className='w-full'
                    onClick={() => {
                      if (isSearching) {
                        void loadFolder(currentFolderId, nextPageToken, searchQuery)
                      } else if (currentFolderId) {
                        void loadFolder(currentFolderId, nextPageToken)
                      } else {
                        void loadTabFiles(activeTab, nextPageToken)
                      }
                    }}
                  >
                    Load more
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </Main>
    </>
  )
}
