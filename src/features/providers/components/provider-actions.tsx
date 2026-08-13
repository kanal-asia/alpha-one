import { Plug, PlugZap, RefreshCw, PowerOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { type ProviderStatus } from '@/services/providers/types/Provider'

type ProviderActionsProps = {
  status: ProviderStatus
  onConnect?: () => void
  onDisconnect?: () => void
  onRefresh?: () => void
  connecting?: boolean
}

export function ProviderActions({
  status,
  onConnect,
  onDisconnect,
  onRefresh,
  connecting,
}: ProviderActionsProps) {
  const isConnected = status === 'connected' || status === 'installed'
  const isActive =
    status === 'connected' || status === 'installed' || status === 'detecting'
  return (
    <div className='flex flex-wrap gap-2'>
      {!isConnected ? (
        <Button size='sm' onClick={onConnect} disabled={connecting}>
          <PlugZap className='size-4' />
          Connect
        </Button>
      ) : (
        <Button size='sm' variant='outline' onClick={onDisconnect}>
          <PowerOff className='size-4' />
          Disconnect
        </Button>
      )}
      {isActive && onConnect && !isConnected && (
        <Button size='sm' onClick={onConnect} disabled={connecting}>
          <Plug className='size-4' />
          Launch
        </Button>
      )}
      {onRefresh && (
        <Button size='sm' variant='ghost' onClick={onRefresh}>
          <RefreshCw className='size-4' />
          Refresh
        </Button>
      )}
    </div>
  )
}
