import { createFileRoute, Link } from '@tanstack/react-router'
import { PageHeader } from '@/components/page-header'
import { Main } from '@/components/layout/main'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  MessagesSquare,
  FolderKanban,
  Paperclip,
  Sparkles,
  Wrench,
  Plug,
} from 'lucide-react'

export const Route = createFileRoute('/_authenticated/help-center/')({
  component: GettingStartedPage,
})

const SECTIONS = [
  {
    icon: MessagesSquare,
    title: 'Alpha Workspace',
    body: 'Your primary work environment. Chat with the assistant, keep every conversation in one place, and start a fresh session any time with File → New Chat (Ctrl+N).',
    to: '/workspace/assistant',
    cta: 'Open Workspace',
  },
  {
    icon: FolderKanban,
    title: 'Projects',
    body: 'A project is your work context boundary. Pick the active project from the toolbar selector in the assistant view, or open a local folder as context via File → Open Local Folder….',
    to: '/workspace/assistant',
    cta: 'Choose a project',
  },
  {
    icon: Paperclip,
    title: 'References',
    body: 'Attach files and resources as AI input with the paperclip button in the composer (File → Attach Reference…), or connect providers such as Google Drive via File → Connect Reference….',
    to: '/workspace/resources',
    cta: 'View references',
  },
  {
    icon: Sparkles,
    title: 'Assistant',
    body: 'The assistant is a capability inside your Workspace. It runs on the configured AI runtime and providers — manage them under Settings, not in this guide.',
    to: '/ai/providers',
    cta: 'View providers',
  },
  {
    icon: Wrench,
    title: 'Tools',
    body: 'Additional work capabilities — automation, documents, and spreadsheets — live in the Tools area of your Workspace.',
    to: '/tools',
    cta: 'Open Tools',
  },
  {
    icon: Plug,
    title: 'Providers',
    body: 'Integrations such as Google Workspace are configured under providers and account settings. Connect once, then work from anywhere in Alpha One.',
    to: '/settings/account',
    cta: 'Account settings',
  },
]

function GettingStartedPage() {
  return (
    <>
      <PageHeader />
      <Main>
        <div className='mx-auto max-w-3xl space-y-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>
              Getting Started
            </h1>
            <p className='text-sm text-muted-foreground'>
              One workspace. One assistant. All your work. These are the core
              concepts — everything below links to the real surface.
            </p>
          </div>
          {SECTIONS.map((s) => (
            <Card key={s.title}>
              <CardHeader>
                <CardTitle className='flex items-center gap-2 text-base'>
                  <s.icon className='size-4' />
                  {s.title}
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-3'>
                <CardDescription>{s.body}</CardDescription>
                <Button variant='outline' size='sm' asChild>
                  <Link to={s.to}>{s.cta}</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </Main>
    </>
  )
}
