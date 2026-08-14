import { useEffect, useState } from 'react'
import { Play, RotateCw, Square } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Main } from '@/components/layout/main'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  useToolsStore,
} from '../store/tools-store'
import { ToolCard } from '../components/tool-card'
import { ToolDetails } from '../components/tool-details'
import { ExecutionTimeline } from '../components/execution-timeline'
import { ExecutionLog } from '../components/execution-log'

export function ToolManagerPage() {
  const {
    loaded,
    tools,
    executions,
    activeToolId,
    load,
    setActiveTool,
    execute,
    cancel,
    updateConfig,
  } = useToolsStore()

  const [prompt, setPrompt] = useState('')
  const [category, setCategory] = useState<string>('all')

  useEffect(() => {
    if (!loaded) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const categories = Array.from(
    new Set(tools.map((t) => t.definition.category))
  ).sort()

  const filteredTools =
    category === 'all'
      ? tools
      : tools.filter((t) => t.definition.category === category)

  const active = tools.find((t) => t.definition.id === activeToolId) ?? null
  const activeExecutions = active
    ? executions.filter((e) => e.toolId === active.definition.id)
    : executions
  const latest = activeExecutions[0]

  return (
    <>
      <PageHeader />
      <Main>
        <div className='mb-2 flex items-center justify-between space-y-2'>
          <div className='space-y-1'>
            <h1 className='text-2xl font-bold tracking-tight'>Tool Manager</h1>
            <p className='text-sm text-muted-foreground'>
              All local tools run through one unified runtime.
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <span className='text-sm text-muted-foreground'>Category</span>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className='w-40'>
                <SelectValue placeholder='All' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c} className='capitalize'>
                    {c.replace('_', ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className='grid gap-4 lg:grid-cols-3'>
          <div className='space-y-3 lg:col-span-2'>
            <div className='grid gap-4 sm:grid-cols-2'>
              {filteredTools.map((tool) => (
                <ToolCard
                  key={tool.definition.id}
                  tool={tool}
                  active={tool.definition.id === activeToolId}
                  onSelect={setActiveTool}
                />
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className='text-base'>Execution Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <ExecutionTimeline executions={activeExecutions} />
              </CardContent>
            </Card>
          </div>

          <div className='space-y-4'>
            {active ? (
              <Card>
                <CardHeader>
                  <CardTitle className='text-base'>Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <ToolDetails
                    tool={active}
                    onToggleEnabled={(enabled) =>
                      void updateConfig(active.definition.id, { enabled })
                    }
                    onExecutableChange={(path) =>
                      void updateConfig(active.definition.id, {
                        executablePath: path,
                      })
                    }
                    onEnvChange={(env) =>
                      void updateConfig(active.definition.id, { env })
                    }
                  />
                  <div className='mt-4 space-y-2'>
                    <Textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder='Input for this tool...'
                      className='min-h-20'
                      disabled={!active.definition.config.enabled}
                    />
                    <div className='flex gap-2'>
                      <Button
                        size='sm'
                        onClick={() => {
                          void execute(active.definition.id, {
                            input: prompt,
                          })
                          setPrompt('')
                        }}
                        disabled={!active.definition.config.enabled}
                      >
                        <Play className='size-4' />
                        Execute
                      </Button>
                      {latest?.status === 'running' && (
                        <Button
                          size='sm'
                          variant='outline'
                          onClick={() =>
                            void cancel(active.definition.id, latest.id)
                          }
                        >
                          <Square className='size-4' />
                          Cancel
                        </Button>
                      )}
                      <Button
                        size='sm'
                        variant='ghost'
                        onClick={() => void updateConfig(active.definition.id, {})}
                      >
                        <RotateCw className='size-4' />
                        Refresh
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className='py-10 text-center text-sm text-muted-foreground'>
                  Select a tool to view details and execute it.
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className='text-base'>
                  Logs {latest ? `· ${latest.toolName}` : ''}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ExecutionLog logs={latest?.logs ?? []} />
              </CardContent>
            </Card>
          </div>
        </div>
      </Main>
    </>
  )
}
