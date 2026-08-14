import { type ToolState } from '../types'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { HealthIndicator, ToolStatusBadge } from './health-indicator'
import {
  Cpu,
  FileText,
  GitBranch,
  Globe,
  Monitor,
  Terminal,
  Sparkles,
} from 'lucide-react'

const categoryIcon: Record<string, React.ReactNode> = {
  ai: <Sparkles className='size-4' />,
  filesystem: <Monitor className='size-4' />,
  browser: <Globe className='size-4' />,
  document: <FileText className='size-4' />,
  terminal: <Terminal className='size-4' />,
  version_control: <GitBranch className='size-4' />,
  future: <Cpu className='size-4' />,
}

type ToolCardProps = {
  tool: ToolState
  onSelect?: (id: string) => void
  active?: boolean
}

export function ToolCard({ tool, onSelect, active }: ToolCardProps) {
  return (
    <Card
      className={cn(
        'cursor-pointer transition-colors',
        active && 'ring-2 ring-primary'
      )}
      onClick={() => onSelect?.(tool.definition.id)}
    >
      <CardHeader className='flex flex-row items-start justify-between gap-2 space-y-0'>
        <div className='flex items-center gap-2'>
          <span className='flex size-8 items-center justify-center rounded-md bg-muted'>
            {categoryIcon[tool.definition.category]}
          </span>
          <div>
            <CardTitle className='text-base'>{tool.definition.name}</CardTitle>
            <p className='text-xs text-muted-foreground'>
              v{tool.definition.version}
            </p>
          </div>
        </div>
        <ToolStatusBadge status={tool.status} />
      </CardHeader>
      <CardContent className='space-y-2'>
        <p className='text-sm text-muted-foreground'>
          {tool.definition.description}
        </p>
        <div className='flex items-center justify-between'>
          <HealthIndicator state={tool.health} />
          <Badge variant='outline' className='capitalize'>
            {tool.definition.category.replace('_', ' ')}
          </Badge>
        </div>
      </CardContent>
    </Card>
  )
}
