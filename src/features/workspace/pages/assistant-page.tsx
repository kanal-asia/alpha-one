import { Bot } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { RunTaskForm } from '../components/run-task-form'

export function AssistantPage() {
  return (
    <>
      <PageHeader />
      <Main>
        <div className='mb-4'>
          <h1 className='text-2xl font-bold tracking-tight'>Alpha Workspace</h1>
          <p className='text-sm text-muted-foreground'>
            Describe what you want; the assistant creates a task in the workspace.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Bot className='size-4' />
              New request
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RunTaskForm
              createdBy='assistant'
              heading='Ask for a spreadsheet report'
              submitLabel='Create task'
            />
          </CardContent>
        </Card>
      </Main>
    </>
  )
}
