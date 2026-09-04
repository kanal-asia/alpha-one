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

export const Route = createFileRoute('/_authenticated/help-center/docs')({
  component: DocumentationPage,
})

const TOPICS = [
  {
    title: 'Workspace & Assistant',
    body: 'Chat, sessions, and the primary work environment.',
    to: '/workspace/assistant',
  },
  {
    title: 'Projects & References',
    body: 'Work context boundaries and AI input resources.',
    to: '/workspace/resources',
  },
  {
    title: 'Providers & Runtime',
    body: 'Integrations and AI runtime configuration live in Settings.',
    to: '/ai/providers',
  },
  {
    title: 'Appearance & Notifications',
    body: 'Personalize Alpha One and control notification behavior.',
    to: '/settings/appearance',
  },
  {
    title: 'Account & Updates',
    body: 'Account details, support contact, and software updates.',
    to: '/settings/about',
  },
]

function DocumentationPage() {
  return (
    <>
      <PageHeader />
      <Main>
        <div className='mx-auto max-w-3xl space-y-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>Documentation</h1>
            <p className='text-sm text-muted-foreground'>
              Product documentation for Alpha One — organized by area. Each
              topic links to the real surface inside the app.
            </p>
          </div>
          {TOPICS.map((t) => (
            <Card key={t.title}>
              <CardHeader>
                <CardTitle className='text-base'>{t.title}</CardTitle>
                <CardDescription>{t.body}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant='outline' size='sm' asChild>
                  <Link to={t.to}>Open</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Support</CardTitle>
              <CardDescription>
                Need help beyond these docs? Contact the Alpha One team.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <a
                href='mailto:alphaone@kanal.asia'
                className='text-sm text-primary underline decoration-dotted underline-offset-2 hover:text-primary/80'
              >
                alphaone@kanal.asia
              </a>
            </CardContent>
          </Card>
        </div>
      </Main>
    </>
  )
}
