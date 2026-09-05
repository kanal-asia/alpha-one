import { useEffect, useState, useCallback, useRef } from 'react'
import { Cloud, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  startProductionOAuth,
  completeProductionOAuth,
  pollProductionOAuthStatus,
  verifyAndPersistProductionOAuth,
  getStoredSessionId,
  clearStoredSessionId,
  OAuthCancelledError,
  traceOAuth,
  resolveOAuthChildClose,
  type ProductionOAuthVerifyResult,
} from '@/lib/production-oauth-client'
import { OAuthAttempt } from '@/lib/oauth-attempt'

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
  const [refreshKey] = useState(() => {
    const state = getInitialState()
    return state.shouldRefresh ? 1 : 0
  })
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // MSI-070: single ordering authority for the in-flight OAuth attempt
  // (replaces the MSI-066 cancelled/settled refs, whose guard was set too
  // late and let success auto-close masquerade as manual cancellation).
  // `childRef` holds the OAuth child window so manual close and Cancel can
  // terminate the attempt.
  const attemptRef = useRef<OAuthAttempt | null>(null)
  const childRef = useRef<Window | null>(null)
  const sessionIdRef = useRef<string | null>(null)

  // Poll production OAuth status after redirect
  const pollOAuthStatus = useCallback(async (sessionId: string) => {
    try {
      const result = await pollProductionOAuthStatus(sessionId, 60, 2000)

      if (result.status === 'completed' && result.identity) {
        // MSI-069: verify + persist + local status proof as one contract.
        // Throws on persist failure or unverified status — never marks
        // Connected from approval/redirect alone.
        const verifyResult: ProductionOAuthVerifyResult =
          await verifyAndPersistProductionOAuth(sessionId)

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

  // MSI-070: cancel side effects shared by the Cancel action and the
  // child-closed watcher. Runs only when the attempt guard says 'cancel'.
  const performCancel = useCallback(() => {
    traceOAuth('oauth.manual_cancel')
    try {
      childRef.current?.close()
    } catch {
      /* child already gone */
    }
    childRef.current = null
    sessionIdRef.current = null
    clearStoredSessionId()
    setConnecting(false)
    setError(null)
  }, [])

  // MSI-066: cancel the in-flight OAuth attempt. Ignored once success is
  // recognized or the attempt settled (Cancel during verify lets success win).
  const handleCancel = useCallback(() => {
    if ((attemptRef.current?.requestCancel() ?? 'cancel') === 'ignore') return
    performCancel()
  }, [performCancel])

  // MSI-066/067/070: watch the OAuth child. `Window.closed` is readable
  // cross-origin. On close, the shared resolver re-checks server status
  // BEFORE deciding: completed → success path continues (never cancelled);
  // otherwise the existing manual-cancel path runs. Resolved once per close.
  useEffect(() => {
    if (!connecting) return
    const timer = setInterval(() => {
      const child = childRef.current
      if (!child || !child.closed) return
      clearInterval(timer)
      void (async () => {
        const resolution = await resolveOAuthChildClose(
          sessionIdRef.current,
          attemptRef.current
        )
        if (resolution === 'continue-success') {
          traceOAuth('oauth.child_closed_after_success')
        } else {
          performCancel()
        }
      })()
    }, 500)
    return () => clearInterval(timer)
  }, [connecting, performCancel])

  const handleConnect = async () => {
    setConnecting(true)
    setError(null)
    const attempt = new OAuthAttempt()
    attemptRef.current = attempt
    childRef.current = null
    sessionIdRef.current = null
    try {
      // Start production OAuth flow. This stores the sessionId in sessionStorage.
      const result = await startProductionOAuth()
      const sessionId = getStoredSessionId()
      // MSI-067: retained for the child-closed resolver (single status
      // re-check before cancelling).
      sessionIdRef.current = sessionId

      // Open the Google authorization URL in the system browser instead of
      // navigating the main window away. This preserves the SPA and its
      // completion context so the post-Allow return no longer blanks the window.
      // The child handle is kept so manual close / Cancel can end the attempt.
      try {
        childRef.current = window.open(result.url, '_blank')
      } catch {
        childRef.current = null
      }

      if (!sessionId) {
        throw new Error('OAuth session was not initialized.')
      }

      // Poll the production session to completion in the MAIN window, then
      // verify + persist locally. This keeps the app usable after Allow.
      // The abort hook ends the poll promptly on manual child close / Cancel.
      // onStatusCompleted arms the ordering guard BEFORE verify/persist, so a
      // success auto-close racing this window can never cancel the attempt.
      const verifyResult = await completeProductionOAuth(
        sessionId,
        () => attempt.shouldAbort(),
        () => attempt.noteStatusCompleted()
      )
      attempt.settle()
      traceOAuth('oauth.settled')
      childRef.current = null
      sessionIdRef.current = null
      clearStoredSessionId()
      setStatus({
        connected: true,
        configured: true,
        email: verifyResult.identity.email,
        scopes: [],
        connectedAt: verifyResult.identity.createdAt,
      })
    } catch (err) {
      attempt.settle()
      childRef.current = null
      sessionIdRef.current = null
      if (err instanceof OAuthCancelledError || attempt.isUserCancelled) {
        // User-cancelled: clean return to idle, no error banner.
        clearStoredSessionId()
        setError(null)
      } else {
        setError(err instanceof Error ? err.message : 'Failed to connect.')
        clearStoredSessionId()
      }
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
            <div className='flex items-center gap-2'>
              <Button onClick={handleConnect} disabled={connecting}>
                <ExternalLink className='size-4' />
                {connecting ? 'Connecting...' : 'Connect Google Account'}
              </Button>
              {connecting && (
                <Button variant='outline' size='sm' onClick={handleCancel}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
