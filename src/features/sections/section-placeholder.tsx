import { PagePlaceholder } from '@/components/page-placeholder'

type SectionPlaceholderProps = {
  title: string
  description: string
}

/**
 * Business section landing that maps to an Alpha Workspace capability still to
 * be surfaced in a future sprint. Keeps the product Information Architecture
 * complete without inventing scope.
 */
export function SectionPlaceholder({ title, description }: SectionPlaceholderProps) {
  return <PagePlaceholder title={title} description={description} />
}
