import { ShieldCheck } from 'lucide-react'

interface AffiliateDisclosureProps {
  text: string
}

export function AffiliateDisclosure({ text }: AffiliateDisclosureProps) {
  return (
    <div className='flex items-start gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2.5'>
      <ShieldCheck className='mt-0.5 size-4 shrink-0 text-muted-foreground' />
      <p className='text-xs leading-relaxed text-muted-foreground'>{text}</p>
    </div>
  )
}
