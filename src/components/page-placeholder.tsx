import { type ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'

type PagePlaceholderProps = {
  title: string
  description: string
  children?: ReactNode
}

export function PagePlaceholder({
  title,
  description,
  children,
}: PagePlaceholderProps) {
  return (
    <>
      <div className='mb-2 flex items-center justify-between space-y-2'>
        <div className='space-y-1'>
          <h1 className='text-2xl font-bold tracking-tight'>{title}</h1>
          <p className='text-sm text-muted-foreground'>{description}</p>
        </div>
      </div>
      <Card>
        <CardContent className='flex min-h-72 flex-col items-center justify-center gap-3 py-16 text-center'>
          <h2 className='text-3xl font-bold tracking-tight'>Coming Soon</h2>
          <p className='max-w-md text-sm text-muted-foreground'>
            This section is part of the Alpha One foundation and will be
            available in an upcoming sprint.
          </p>
          {children}
        </CardContent>
      </Card>
    </>
  )
}
