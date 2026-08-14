import { Badge } from '@/components/ui/badge'

const VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  completed: 'default',
  saved: 'default',
  running: 'secondary',
  pending: 'secondary',
  failed: 'destructive',
  created: 'outline',
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={VARIANTS[status] ?? 'outline'}>{status}</Badge>
}
