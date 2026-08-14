import { useState } from 'react'
import { FileSpreadsheet, Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useCreateTask, useWorkflows } from '../hooks'

export function RunTaskForm({
  onCreated,
  createdBy = 'user',
  heading = 'Run a workflow',
  submitLabel = 'Run workflow',
}: {
  onCreated?: (taskId: string) => void
  createdBy?: 'user' | 'assistant'
  heading?: string
  submitLabel?: string
}) {
  const { data: workflows } = useWorkflows()
  const createTask = useCreateTask()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [workflowId, setWorkflowId] = useState<string | undefined>(undefined)
  const [fileName, setFileName] = useState<string | null>(null)
  const [content, setContent] = useState('')

  const activeWorkflows = workflows?.filter((w) => w.status === 'active') ?? []
  const workflow = activeWorkflows.find((w) => w.id === workflowId)
  const canSubmit = Boolean(title.trim() && workflowId && fileName && content.trim()) && !createTask.isPending

  const onFileChange = async (file: File | undefined) => {
    if (!file) {
      setFileName(null)
      setContent('')
      return
    }
    setFileName(file.name)
    setContent(await file.text())
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!workflow || !content) return
    const result = await createTask.mutateAsync({
      title: title.trim(),
      description: description.trim() || undefined,
      workflowId: workflow.id,
      input: { source: { name: fileName ?? 'spreadsheet.csv', content } },
      createdBy,
    })
    setTitle('')
    setDescription('')
    setWorkflowId(undefined)
    setFileName(null)
    setContent('')
    onCreated?.(result.task.id)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <FileSpreadsheet className='size-4' />
          {heading}
        </CardTitle>
        <CardDescription>
          Pick any task template, import a local CSV and run it. Everything stays on your device.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void onSubmit(e)} className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='task-title'>Task title</Label>
            <Input
              id='task-title'
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='e.g. Q3 sales analysis'
            />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='task-workflow'>Task Template</Label>
            <Select value={workflowId} onValueChange={setWorkflowId}>
              <SelectTrigger id='task-workflow'>
                <SelectValue placeholder='Choose a task template…' />
              </SelectTrigger>
              <SelectContent>
                {activeWorkflows.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-2'>
            <Label htmlFor='task-desc'>Description (optional)</Label>
            <Textarea
              id='task-desc'
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder='What does this task do?'
            />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='csv-file'>Spreadsheet (CSV, local file)</Label>
            <Input
              id='csv-file'
              type='file'
              accept='.csv,text/csv'
              onChange={(e) => void onFileChange(e.target.files?.[0])}
            />
            <p className='text-xs text-muted-foreground'>
              {fileName ? `Selected: ${fileName}` : 'Choose a comma-separated values file from your computer.'}
            </p>
          </div>

          <Button type='submit' disabled={!canSubmit} className='w-full'>
            {createTask.isPending ? <Loader2 className='size-4 animate-spin' /> : <Send className='size-4' />}
            {submitLabel}
          </Button>
          {createTask.isError && (
            <p className='text-sm text-destructive'>
              {createTask.error instanceof Error ? createTask.error.message : 'Failed to run workflow.'}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
