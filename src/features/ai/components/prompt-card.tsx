import { Copy, Star } from 'lucide-react'
import { type Prompt } from '../types'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type PromptCardProps = {
  prompt: Prompt
  onCopy?: (prompt: Prompt) => void
  onToggleFavorite?: (prompt: Prompt) => void
}

export function PromptCard({
  prompt,
  onCopy,
  onToggleFavorite,
}: PromptCardProps) {
  return (
    <Card className='flex flex-col'>
      <CardHeader className='flex flex-row items-start justify-between gap-2 space-y-0'>
        <div className='space-y-1'>
          <CardTitle className='text-base'>{prompt.title}</CardTitle>
          <Badge variant='outline' className='capitalize'>
            {prompt.category}
          </Badge>
        </div>
        <Button
          variant='ghost'
          size='icon'
          aria-label={prompt.favorite ? 'Remove from favorites' : 'Add to favorites'}
          onClick={() => onToggleFavorite?.(prompt)}
        >
          <Star
            className={cn(
              'size-4',
              prompt.favorite && 'fill-amber-400 text-amber-400'
            )}
          />
        </Button>
      </CardHeader>
      <CardContent className='flex flex-1 flex-col justify-between gap-3'>
        <p className='text-sm text-muted-foreground'>{prompt.description}</p>
        <Button variant='outline' size='sm' onClick={() => onCopy?.(prompt)}>
          <Copy className='size-4' />
          Copy
        </Button>
      </CardContent>
    </Card>
  )
}
