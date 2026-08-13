import { useEffect, useState } from 'react'
import { Cloud } from 'lucide-react'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useProvidersStore } from '@/features/providers/store/providers-store'
import { ProviderCard } from '@/features/providers/components/provider-card'
import { ProviderActions } from '@/features/providers/components/provider-actions'

export function GoogleWorkspacePage() {
  const { getState, connect, disconnect, refresh, loaded, initialize, connection } =
    useProvidersStore()
  const [account, setAccount] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!loaded) void initialize()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const state = getState('google-workspace')
  const isConnected = state.status === 'connected'
  const conn = connection['google-workspace'] as
    | { account: string; scopes: string[] }
    | undefined

  const handleConnect = async () => {
    setError(null)
    try {
      await connect('google-workspace', { account: account || 'user@example.com' })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <>
      <PageHeader />
      <Main>
        <div className='space-y-4'>
          <div className='flex items-center justify-between'>
            <div className='space-y-1'>
              <h1 className='flex items-center gap-2 text-2xl font-bold tracking-tight'>
                <Cloud className='size-6' />
                Google Workspace
              </h1>
              <p className='text-sm text-muted-foreground'>
                Connect Google Drive, Docs, Sheets, and Slides to the workspace.
              </p>
            </div>
            <ProviderActions
              status={state.status}
              onConnect={() => void handleConnect()}
              onDisconnect={() => void disconnect('google-workspace')}
              onRefresh={() => void refresh('google-workspace')}
            />
          </div>

          <div className='grid gap-4 lg:grid-cols-2'>
            <ProviderCard state={state} icon={<Cloud className='size-4' />} />

            <Card>
              <CardHeader>
                <CardTitle className='text-base'>Connection</CardTitle>
              </CardHeader>
              <CardContent className='space-y-3'>
                {isConnected && conn ? (
                  <>
                    <div className='flex items-center justify-between text-sm'>
                      <span className='text-muted-foreground'>Account</span>
                      <span className='font-medium'>{conn.account}</span>
                    </div>
                    <div className='space-y-1'>
                      <span className='text-xs text-muted-foreground'>Scopes</span>
                      <div className='flex flex-wrap gap-1 pt-1'>
                        {conn.scopes.map((scope) => (
                          <Badge
                            key={scope}
                            variant='outline'
                            className='text-[10px]'
                          >
                            {scope.split('/').pop()}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className='space-y-2'>
                    <Label htmlFor='account'>Account email</Label>
                    <Input
                      id='account'
                      placeholder='you@example.com'
                      value={account}
                      onChange={(e) => setAccount(e.target.value)}
                    />
                    {error && (
                      <p className='text-xs text-destructive'>{error}</p>
                    )}
                    <Button className='w-full' onClick={() => void handleConnect()}>
                      Connect account
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </Main>
    </>
  )
}
