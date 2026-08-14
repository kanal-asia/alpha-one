import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { PagePlaceholder } from '@/components/page-placeholder'

export function TaskRunnerPage() {
  return (
    <>
      <PageHeader />
      <Main>
        <PagePlaceholder
          title='Task Runner'
          description='Schedule and run automation tasks across your workspace.'
        />
      </Main>
    </>
  )
}

export function BrowserAutomationPage() {
  return (
    <>
      <PageHeader />
      <Main>
        <PagePlaceholder
          title='Browser Automation'
          description='Automate browser workflows from the workspace.'
        />
      </Main>
    </>
  )
}

export function PdfGeneratorPage() {
  return (
    <>
      <PageHeader />
      <Main>
        <PagePlaceholder
          title='PDF Generator'
          description='Generate PDF documents from your workspace content.'
        />
      </Main>
    </>
  )
}

export function PptGeneratorPage() {
  return (
    <>
      <PageHeader />
      <Main>
        <PagePlaceholder
          title='PPT Generator'
          description='Create PowerPoint presentations automatically from your data.'
        />
      </Main>
    </>
  )
}
