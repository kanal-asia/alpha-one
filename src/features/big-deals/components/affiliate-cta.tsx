import { ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface AffiliateCtaProps {
  url: string
  label: string
  className?: string
  size?: 'default' | 'sm' | 'lg'
}

export function AffiliateCta({ url, label, className, size = 'lg' }: AffiliateCtaProps) {
  return (
    <Button
      asChild
      size={size}
      className={className}
      onClick={() => {
        try {
          window.dispatchEvent(
            new CustomEvent('ai_big_deals:affiliate_click', {
              detail: { url, timestamp: Date.now() },
            })
          )
        } catch {
          // analytics unavailable — fail silently
        }
      }}
    >
      <a href={url} target='_blank' rel='noopener noreferrer'>
        {label}
        <ArrowUpRight className='size-4' />
      </a>
    </Button>
  )
}
