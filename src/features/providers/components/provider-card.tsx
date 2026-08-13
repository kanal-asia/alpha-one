import { type ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  type ProviderState,
} from '@/services/providers/types/Provider'
import {
  ConnectionIndicator,
  ProviderHealth,
  VersionBadge,
} from './provider-status'

type ProviderCardProps = {
  state: ProviderState
  icon?: ReactNode
  actions?: ReactNode
}

export function ProviderCard({ state, icon, actions }: ProviderCardProps) {
  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
        <CardTitle className='flex items-center gap-2 text-sm font-medium'>
          {icon}
          {state.info.name}
        </CardTitle>
        <ConnectionIndicator status={state.status} />
      </CardHeader>
      <CardContent className='space-y-3'>
        <p className='text-xs text-muted-foreground'>{state.info.description}</p>
        <div className='flex items-center justify-between text-sm'>
          <span className='text-muted-foreground'>Health</span>
          <ProviderHealth health={state.health} />
        </div>
        <div className='flex items-center justify-between text-sm'>
          <span className='text-muted-foreground'>Version</span>
          <VersionBadge version={state.version} />
        </div>
        {state.lastCheckedAt && (
          <div className='flex items-center justify-between text-sm'>
            <span className='text-muted-foreground'>Last checked</span>
            <span className='text-xs text-muted-foreground'>
              {new Date(state.lastCheckedAt).toLocaleTimeString()}
            </span>
          </div>
        )}
        {state.error && (
          <p className='text-xs text-destructive'>{state.error}</p>
        )}
        {actions && <div className='flex flex-wrap gap-2 pt-1'>{actions}</div>}
      </CardContent>
    </Card>
  )
}
