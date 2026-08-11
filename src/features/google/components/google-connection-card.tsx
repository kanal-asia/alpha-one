import { useEffect, useState } from 'react'
import { Cloud, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface GoogleStatus {
  connected: boolean
  configured: boolean
  email?: string
  scopes?: string[]
  connectedAt?: string
}

function getInitialState() {
  const params = new URLSearchParams(window.location.search)
  const error = params.get('google_error')
  const connected = params.get('google_connected') === 'true'

  // Clean up URL params
  if (error || connected) {
    window.history.replaceState({}, '', window.location.pathname)
  }

  return {
    initialError: error ? decodeURIComponent(error) : null,
    shouldRefresh: connected,
  }
}

export function GoogleConnectionCard() {
  const [status, setStatus] = useState<GoogleStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState<string | null>(() => getInitialState().initialError)
  const [refreshKey] = useState(() =>
    getInitialState().shouldRefresh ? 1 : 0
  )

  // Fetch status on mount and when refreshKey changes
  useEffect(() => {
    let cancelled = false

    async function loadStatus() {
      try {
        const res = await fetch('/api/google/oauth/status')
        const data = await res.json()
        if (!cancelled) {
          setStatus(data)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to check status.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadStatus()

    return () => {
      cancelled = true
    }
  }, [refreshKey])

  const handleConnect = async () => {
    setConnecting(true)
    setError(null)
    try {
      const res = await fetch('/api/google/oauth/connect', { method: 'POST' })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else if (data.error) {
        setError(data.error)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect.')
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    setDisconnecting(true)
    setError(null)
    try {
      await fetch('/api/google/oauth/disconnect', { method: 'POST' })
      // Refresh status after disconnect
      const res = await fetch('/api/google/oauth/status')
      const data = await res.json()
      setStatus(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect.')
    } finally {
      setDisconnecting(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Cloud className='size-4' />
            Google Workspace
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='flex items-center gap-2 text-sm text-muted-foreground'>
            <div className='size-4 animate-spin rounded-full border-2 border-current border-t-transparent' />
            Loading...
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!status?.configured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Cloud className='size-4' />
            Google Workspace
          </CardTitle>
          <CardDescription>
            Connect your Google account to access Drive and other Google Workspace services.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground'>
            <AlertCircle className='size-4' />
            Google OAuth is not configured. An administrator needs to set up Google OAuth credentials.
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Cloud className='size-4' />
          Google Workspace
        </CardTitle>
        <CardDescription>
          Connect your Google account to access Drive and other Google Workspace services.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {status.connected && status.email ? (
          <div className='space-y-3'>
            <div className='flex items-center justify-between'>
              <div className='flex items-center gap-2'>
                <CheckCircle2 className='size-4 text-emerald-500' />
                <span className='text-sm font-medium'>Connected</span>
              </div>
              <Badge variant='outline' className='text-xs'>
                {status.email}
              </Badge>
            </div>
            {status.connectedAt && (
              <p className='text-xs text-muted-foreground'>
                Connected on {new Date(status.connectedAt).toLocaleDateString()}
              </p>
            )}
            {status.scopes && status.scopes.length > 0 && (
              <div className='space-y-1'>
                <span className='text-xs text-muted-foreground'>Permissions</span>
                <div className='flex flex-wrap gap-1'>
                  {status.scopes.map((scope) => (
                    <Badge key={scope} variant='secondary' className='text-[10px]'>
                      {scope.split('.').pop()?.replace('readonly', 'read')}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <Button
              variant='outline'
              size='sm'
              onClick={handleDisconnect}
              disabled={disconnecting}
            >
              {disconnecting ? 'Disconnecting...' : 'Disconnect'}
            </Button>
          </div>
        ) : (
          <div className='space-y-3'>
            <p className='text-sm text-muted-foreground'>
              No Google account connected. Click below to sign in with Google.
            </p>
            {error && (
              <div className='flex items-center gap-2 rounded-md bg-destructive/10 p-2 text-sm text-destructive'>
                <AlertCircle className='size-4' />
                {error}
              </div>
            )}
            <Button onClick={handleConnect} disabled={connecting}>
              <ExternalLink className='size-4' />
              {connecting ? 'Connecting...' : 'Connect Google Account'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
