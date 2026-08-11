import { useState } from 'react'
import { Download, FileSpreadsheet, Loader2, Presentation, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'

type GenerationStatus = 'idle' | 'generating' | 'done' | 'error'

interface GenerationResult {
  filename: string
  blob: Blob
}

const STYLE_OPTIONS = [
  { value: 'business', label: 'Business', description: 'Clean, professional look' },
  { value: 'marketing', label: 'Marketing', description: 'Bold, energetic colors' },
  { value: 'report', label: 'Report', description: 'Formal, data-focused' },
  { value: 'proposal', label: 'Proposal', description: 'Persuasive, clear structure' },
  { value: 'minimal', label: 'Minimal', description: 'Simple, elegant design' },
] as const

const SLIDE_COUNT_OPTIONS = [
  { value: '5', label: '5 slides' },
  { value: '8', label: '8 slides' },
  { value: '10', label: '10 slides' },
  { value: '15', label: '15 slides' },
] as const

export function PresentationWorkspace() {
  const [title, setTitle] = useState('')
  const [purpose, setPurpose] = useState('')
  const [audience, setAudience] = useState('')
  const [style, setStyle] = useState<string>('business')
  const [slideCount, setSlideCount] = useState<string>('8')
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<GenerationStatus>('idle')
  const [result, setResult] = useState<GenerationResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = title.trim() && purpose.trim() && status !== 'generating'

  const handleGenerate = async () => {
    if (!canSubmit) return

    setStatus('generating')
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/ws/presentations/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          purpose: purpose.trim(),
          audience: audience.trim() || 'General',
          style,
          slideCount: Number(slideCount),
          content: content.trim(),
        }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || `Generation failed (${response.status})`)
      }

      const blob = await response.blob()
      const filename = `${title.trim().replace(/[^a-zA-Z0-9]/g, '_')}.pptx`

      setResult({ filename, blob })
      setStatus('done')
      toast.success('Presentation created successfully!')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create presentation.'
      setError(message)
      setStatus('error')
      toast.error('Failed to create presentation. Please try again.')
    }
  }

  const handleDownload = () => {
    if (!result) return
    const url = URL.createObjectURL(result.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = result.filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleCreateAnother = () => {
    setStatus('idle')
    setResult(null)
    setError(null)
  }

  return (
    <>
      <PageHeader />
      <Main>
        <div className='mb-4'>
          <h1 className='text-2xl font-bold tracking-tight'>Presentation</h1>
          <p className='text-sm text-muted-foreground'>
            Create professional PowerPoint presentations from your ideas, content, or business data.
          </p>
        </div>

        <div className='grid gap-6 lg:grid-cols-2'>
          {/* Creation Form */}
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <Presentation className='size-4' />
                Create Presentation
              </CardTitle>
              <CardDescription>
                Fill in the details below to generate your presentation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className='space-y-4'>
                <div className='space-y-2'>
                  <Label htmlFor='ppt-title'>Presentation title</Label>
                  <Input
                    id='ppt-title'
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder='e.g. Q3 Marketing Performance'
                    disabled={status === 'generating'}
                  />
                </div>

                <div className='space-y-2'>
                  <Label htmlFor='ppt-purpose'>Purpose / topic</Label>
                  <Input
                    id='ppt-purpose'
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    placeholder='e.g. Present campaign performance and recommendations'
                    disabled={status === 'generating'}
                  />
                </div>

                <div className='space-y-2'>
                  <Label htmlFor='ppt-audience'>Audience</Label>
                  <Input
                    id='ppt-audience'
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    placeholder='e.g. Management'
                    disabled={status === 'generating'}
                  />
                </div>

                <div className='grid grid-cols-2 gap-4'>
                  <div className='space-y-2'>
                    <Label htmlFor='ppt-style'>Presentation style</Label>
                    <Select value={style} onValueChange={setStyle} disabled={status === 'generating'}>
                      <SelectTrigger id='ppt-style'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STYLE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className='space-y-2'>
                    <Label htmlFor='ppt-slides'>Approximate slide count</Label>
                    <Select value={slideCount} onValueChange={setSlideCount} disabled={status === 'generating'}>
                      <SelectTrigger id='ppt-slides'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SLIDE_COUNT_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className='space-y-2'>
                  <Label htmlFor='ppt-content'>Content / instructions</Label>
                  <Textarea
                    id='ppt-content'
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder='Describe the presentation you want to create, including key data, messages, recommendations, or sections you want included.'
                    rows={5}
                    disabled={status === 'generating'}
                  />
                </div>

                {status === 'idle' && (
                  <Button onClick={() => void handleGenerate()} disabled={!canSubmit} className='w-full'>
                    <Presentation className='size-4' />
                    Create Presentation
                  </Button>
                )}

                {status === 'generating' && (
                  <Button disabled className='w-full'>
                    <Loader2 className='size-4 animate-spin' />
                    Creating Presentation...
                  </Button>
                )}

                {status === 'error' && (
                  <div className='space-y-3'>
                    <p className='text-sm text-destructive'>
                      {error || "We couldn't create the presentation. Please try again."}
                    </p>
                    <Button onClick={() => void handleGenerate()} className='w-full'>
                      <RotateCcw className='size-4' />
                      Try Again
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Result Card */}
          {status === 'done' && result && (
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <FileSpreadsheet className='size-4' />
                  Presentation Ready
                </CardTitle>
                <CardDescription>
                  Your presentation has been created and is ready to download.
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='rounded-lg border bg-muted/50 p-4'>
                  <div className='space-y-2'>
                    <p className='text-sm font-medium'>Title</p>
                    <p className='text-sm text-muted-foreground'>{title}</p>
                  </div>
                  <div className='mt-3 space-y-2'>
                    <p className='text-sm font-medium'>Purpose</p>
                    <p className='text-sm text-muted-foreground'>{purpose}</p>
                  </div>
                  <div className='mt-3 grid grid-cols-2 gap-4'>
                    <div className='space-y-2'>
                      <p className='text-sm font-medium'>Style</p>
                      <p className='text-sm text-muted-foreground'>
                        {STYLE_OPTIONS.find((s) => s.value === style)?.label ?? style}
                      </p>
                    </div>
                    <div className='space-y-2'>
                      <p className='text-sm font-medium'>Slides</p>
                      <p className='text-sm text-muted-foreground'>{slideCount}</p>
                    </div>
                  </div>
                </div>

                <div className='flex gap-3'>
                  <Button onClick={handleDownload} className='flex-1'>
                    <Download className='size-4' />
                    Download PowerPoint
                  </Button>
                  <Button onClick={handleCreateAnother} variant='outline'>
                    <RotateCcw className='size-4' />
                    Create Another
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Placeholder when no result */}
          {status !== 'done' && (
            <Card>
              <CardContent className='flex min-h-72 flex-col items-center justify-center gap-3 py-16 text-center'>
                <Presentation className='size-12 text-muted-foreground/50' />
                <h2 className='text-lg font-semibold'>Your Presentation</h2>
                <p className='max-w-sm text-sm text-muted-foreground'>
                  Fill in the form and click "Create Presentation" to generate a PowerPoint file.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </Main>
    </>
  )
}
