import { ShieldCheck, Sparkles, Wrench } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { Switch } from '@/components/ui/switch'
import { useDeveloperMode } from '@/context/developer-mode-provider'
import { GoogleConnectionCard } from '@/features/google'

export function Settings() {
  const { developerMode, setDeveloperMode } = useDeveloperMode()

  return (
    <>
      <PageHeader />
      <Main>
        <div className='mb-4'>
          <h1 className='text-2xl font-bold tracking-tight'>Settings</h1>
          <p className='text-sm text-muted-foreground'>
            Configure your workspace, preferences and access levels.
          </p>
        </div>

        <GoogleConnectionCard />

        <Card className='mt-4'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Wrench className='size-4' />
              Developer Mode
            </CardTitle>
            <CardDescription>
              Reveal the underlying platform components — services, engines, registries,
              health and diagnostics. For developers and administrators only.
            </CardDescription>
          </CardHeader>
          <CardContent className='flex items-center justify-between gap-4'>
            <div className='space-y-1'>
              <Label htmlFor='developer-mode'>Enable Developer Mode</Label>
              <p className='text-sm text-muted-foreground'>
                When enabled, the sidebar shows the Platform section with the engineering
                tools. When disabled, only business tools remain visible.
              </p>
            </div>
            <Switch
              id='developer-mode'
              checked={developerMode}
              onCheckedChange={setDeveloperMode}
              aria-label='Toggle developer mode'
            />
          </CardContent>
        </Card>

        <Card className='mt-4'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <ShieldCheck className='size-4' />
              Workspace
            </CardTitle>
            <CardDescription>
              General workspace preferences and integrations.
            </CardDescription>
          </CardHeader>
          <CardContent className='flex items-center gap-2 text-sm text-muted-foreground'>
            <Sparkles className='size-4' />
            Alpha Workspace runs locally. Your data and results stay on this device.
          </CardContent>
        </Card>
      </Main>
    </>
  )
}
