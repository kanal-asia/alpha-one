import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { PagePlaceholder } from '@/components/page-placeholder'

export function HistoryPage() {
  return (
    <>
      <PageHeader />
      <Main>
        <PagePlaceholder
          title='Activity History'
          description='Review everything that happened across your workspace.'
        />
      </Main>
    </>
  )
}
