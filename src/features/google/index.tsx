import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { PagePlaceholder } from '@/components/page-placeholder'
import { GoogleWorkspacePage } from './components/google-workspace-page'
import { GoogleConnectionCard } from './components/google-connection-card'

export { GoogleWorkspacePage, GoogleConnectionCard }

export function GoogleDrivePage() {
  return (
    <>
      <PageHeader />
      <Main>
        <PagePlaceholder
          title='Google Drive'
          description='Browse and manage your Google Drive files from the workspace.'
        />
      </Main>
    </>
  )
}

export function GoogleDocsPage() {
  return (
    <>
      <PageHeader />
      <Main>
        <PagePlaceholder
          title='Google Docs'
          description='Create and edit Google Docs without leaving the workspace.'
        />
      </Main>
    </>
  )
}

export function GoogleSheetsPage() {
  return (
    <>
      <PageHeader />
      <Main>
        <PagePlaceholder
          title='Google Sheets'
          description='Work with Google Sheets data directly inside the workspace.'
        />
      </Main>
    </>
  )
}

export function GoogleSlidesPage() {
  return (
    <>
      <PageHeader />
      <Main>
        <PagePlaceholder
          title='Google Slides'
          description='Build and present Google Slides from the workspace.'
        />
      </Main>
    </>
  )
}
