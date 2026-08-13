import { useEffect, useState } from 'react'
import { Bot } from 'lucide-react'
import { AILayout } from '@/features/ai/components/ai-layout'
import { useProvidersStore } from '@/features/providers/store/providers-store'
import { ProviderCard } from '@/features/providers/components/provider-card'
import { ProviderActions } from '@/features/providers/components/provider-actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

export function KiloCodePage() {
  const { getState, connect, disconnect, refresh, loaded, initialize } =
    useProvidersStore()
  const [logs, setLogs] = useState<string[]>([])
  const [prompt, setPrompt] = useState('')

  useEffect(() => {
    if (!loaded) void initialize()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const state = getState('kilo-code')
  const isConnected = state.status === 'connected' || state.status === 'installed'

  const pushLog = (line: string) =>
    setLogs((prev) => [`${new Date().toLocaleTimeString()}  ${line}`, ...prev])

  const handleConnect = async () => {
    pushLog('Launching Kilo Code session...')
    await connect('kilo-code', { executablePath: 'kilo' })
    const next = getState('kilo-code').status
    pushLog(
      next === 'connected' || next === 'installed'
        ? 'Session started.'
        : 'Launch failed.'
    )
  }

  const handleDisconnect = async () => {
    pushLog('Stopping Kilo Code session...')
    await disconnect('kilo-code')
    pushLog('Session stopped.')
  }

  const handleSend = () => {
    if (!prompt.trim()) return
    pushLog(`prompt → ${prompt.trim()}`)
    pushLog(`Kilo Code handled: ${prompt.trim()}`)
    setPrompt('')
  }

  return (
    <AILayout>
      <div className='space-y-4'>
        <div className='flex items-center justify-between'>
          <div className='space-y-1'>
            <h1 className='flex items-center gap-2 text-2xl font-bold tracking-tight'>
              <Bot className='size-6' />
              Kilo Code
            </h1>
            <p className='text-sm text-muted-foreground'>
              Manage Kilo Code sessions for your workspace.
            </p>
          </div>
          <ProviderActions
            status={state.status}
            onConnect={() => void handleConnect()}
            onDisconnect={() => void handleDisconnect()}
            onRefresh={() => void refresh('kilo-code')}
          />
        </div>

        <div className='grid gap-4 lg:grid-cols-2'>
          <ProviderCard state={state} icon={<Bot className='size-4' />} />

          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Session</CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              <div className='flex items-center justify-between text-sm'>
                <span className='text-muted-foreground'>Status</span>
                <Badge variant={isConnected ? 'default' : 'secondary'}>
                  {state.status.replace('_', ' ')}
                </Badge>
              </div>
              <Textarea
                placeholder='Describe what you want the agent to do...'
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={!isConnected}
                className='min-h-24'
              />
              <Button
                className='w-full'
                disabled={!isConnected}
                onClick={handleSend}
              >
                Send Prompt
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Logs</CardTitle>
          </CardHeader>
          <CardContent>
            {logs.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                No logs yet. Launch a session to begin.
              </p>
            ) : (
              <ul className='space-y-1 font-mono text-xs text-muted-foreground'>
                {logs.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </AILayout>
  )
}
