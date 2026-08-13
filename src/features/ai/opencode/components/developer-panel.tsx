import { useState } from 'react'
import { ChevronDown, TerminalSquare } from 'lucide-react'
import { type ExecutionLogEntry } from '../types'
import { useOpenCodeStore } from '../store/opencode-store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

type DeveloperPanelProps = {
  logs: ExecutionLogEntry[]
  runtimeEvents: string[]
}

export function DeveloperPanel({ logs, runtimeEvents }: DeveloperPanelProps) {
  const [open, setOpen] = useState(false)
  const settings = useOpenCodeStore((s) => s.settings)
  const models = useOpenCodeStore((s) => s.models)
  const connection = useOpenCodeStore((s) => s.connection)

  // Raw JSON of current provider status (hidden by default, dev-only).
  const json = JSON.stringify(
    {
      connection,
      defaultModel: settings.defaultModel,
      defaultMode: settings.defaultMode,
      workspace: settings.workspacePath,
      modelsLoaded: models.length,
    },
    null,
    2
  )

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className='flex items-center justify-between border-t px-4 py-2'>
        <div className='flex items-center gap-2 text-sm font-medium'>
          <TerminalSquare className='size-4' />
          Developer Console
        </div>
        <CollapsibleTrigger asChild>
          <Button variant='ghost' size='sm' className='gap-1'>
            {open ? 'Collapse' : 'Expand'}
            <ChevronDown
              className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className='border-t px-4 py-3'>
          <Tabs defaultValue='logs'>
            <TabsList>
              <TabsTrigger value='logs'>Execution Log</TabsTrigger>
              <TabsTrigger value='status'>Provider Status</TabsTrigger>
              <TabsTrigger value='json'>JSON</TabsTrigger>
              <TabsTrigger value='runtime'>Runtime Events</TabsTrigger>
            </TabsList>
            <TabsContent value='logs'>
              <LogList logs={logs} empty='No execution events yet.' />
            </TabsContent>
            <TabsContent value='status'>
              <pre className='overflow-x-auto rounded-md border bg-muted/20 p-3 font-mono text-xs'>
                {json}
              </pre>
            </TabsContent>
            <TabsContent value='json'>
              <pre className='overflow-x-auto rounded-md border bg-muted/20 p-3 font-mono text-xs'>
                {json}
              </pre>
            </TabsContent>
            <TabsContent value='runtime'>
              <LogList
                logs={runtimeEvents.map((m) => ({
                  id: m,
                  level: 'info' as const,
                  message: m,
                  createdAt: '',
                }))}
                empty='No runtime events yet.'
              />
            </TabsContent>
          </Tabs>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function LogList({
  logs,
  empty,
}: {
  logs: ExecutionLogEntry[]
  empty: string
}) {
  return (
    <ScrollArea className='h-44 rounded-md border bg-muted/20 p-2'>
      {logs.length === 0 ? (
        <p className='px-2 py-4 text-center text-xs text-muted-foreground'>{empty}</p>
      ) : (
        <ul className='space-y-1 font-mono text-xs'>
          {logs.map((log) => (
            <li key={log.id} className='break-all text-foreground/80'>
              <span className='text-muted-foreground'>{log.level}</span>{' '}
              {log.message}
            </li>
          ))}
        </ul>
      )}
    </ScrollArea>
  )
}
