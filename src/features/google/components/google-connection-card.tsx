import { useEffect, useState, useCallback, useRef } from 'react'
import { Cloud, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  startProductionOAuth,
  pollProductionOAuthStatus,
  verifyProductionOAuth,
  getStoredSessionId,
  clearStoredSessionId,
  type ProductionOAuthVerifyResult,
} from '@/lib/production-oauth-client'

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
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Poll production OAuth status after redirect
  const pollOAuthStatus = useCallback(async (sessionId: string) => {
    try {
      const result = await pollProductionOAuthStatus(sessionId, 60, 2000)

      if (result.status === 'completed' && result.identity) {
        // Verify and get tokens
        const verifyResult: ProductionOAuthVerifyResult = await verifyProductionOAuth(sessionId)

        // Persist tokens locally via local server (include sessionId for binding)
        await fetch('/api/google/oauth/persist-production', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            identity: verifyResult.identity,
            tokens: verifyResult.tokens,
          }),
        })

        // Clear session and refresh status
        clearStoredSessionId()
        setStatus({
          connected: true,
          configured: true,
          email: verifyResult.identity.email,
          scopes: [],
          connectedAt: verifyResult.identity.createdAt,
        })
      } else if (result.status === 'failed') {
        setError(result.error || 'OAuth failed')
        clearStoredSessionId()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete OAuth')
      clearStoredSessionId()
    }
  }, [])

  // Fetch status on mount and when refreshKey changes
  useEffect(() => {
    let cancelled = false
    const currentPollingRef = pollingRef.current

    async function loadStatus() {
      try {
        // Check if we have a stored session from OAuth redirect
        const storedSessionId = getStoredSessionId()
        if (storedSessionId) {
          // Poll production OAuth status
          await pollOAuthStatus(storedSessionId)
        }

        // Fetch local connection status
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
      if (currentPollingRef) {
        clearTimeout(currentPollingRef)
      }
    }
  }, [refreshKey, pollOAuthStatus])

  const handleConnect = async () => {
    setConnecting(true)
    setError(null)
    try {
      // Start production OAuth flow
      const result = await startProductionOAuth()

      // Redirect to Google authorization URL
      window.location.href = result.url
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
