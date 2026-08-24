import { useState } from 'react'
import { ShieldCheck, Info, Sparkles, Wrench, Mail, RefreshCw, CheckCircle, AlertCircle, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useDeveloperMode } from '@/context/developer-mode-provider'
import { GoogleConnectionCard } from '@/features/google'
import { APP_VERSION } from '@/lib/version'
import { checkForUpdates, type UpdateResult } from '@/lib/update-checker'

export function Settings() {
  const { developerMode, setDeveloperMode } = useDeveloperMode()
  const [showAboutDetails, setShowAboutDetails] = useState(false)
  const [result, setResult] = useState<UpdateResult | null>(null)
  const [checking, setChecking] = useState(false)

  const handleCheck = async () => {
    setChecking(true)
    try {
      const r = await checkForUpdates()
      setResult(r)
    } finally {
      setChecking(false)
    }
  }

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

        <Card className='mt-4'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Info className='size-4' />
              About & Updates
            </CardTitle>
            <CardDescription>
              Application information and software updates.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='flex items-center justify-between'>
              <div className='space-y-1'>
                <p className='text-sm font-medium'>Alpha One</p>
                <p className='text-sm text-muted-foreground'>
                  Version {APP_VERSION}
                </p>
              </div>
              <Button
                variant='ghost'
                size='sm'
                onClick={() => setShowAboutDetails(!showAboutDetails)}
                className='gap-1'
              >
                {showAboutDetails ? 'Hide details' : 'View details'}
                {showAboutDetails
                  ? <ChevronDown className='size-4' />
                  : <ChevronRight className='size-4' />
                }
              </Button>
            </div>

            {showAboutDetails && (
              <div className='space-y-4 rounded-md border p-4'>
                {/* Application */}
                <div className='space-y-2'>
                  <p className='text-sm font-medium'>Application</p>
                  <div className='flex items-center justify-between'>
                    <span className='text-sm text-muted-foreground'>Alpha One</span>
                    <span className='text-sm text-muted-foreground'>Version {APP_VERSION}</span>
                  </div>
                  <p className='text-xs text-muted-foreground'>
                    Alpha One runs locally on your device. Your data and results stay on this device.
                  </p>
                </div>
                <Separator />

                {/* Update Status */}
                <div className='space-y-2'>
                  <p className='text-sm font-medium'>Software Update</p>
                  {result && (
                    <div className='flex items-start gap-2 rounded-md border p-3 text-sm'>
                      {result.status === 'up_to_date' && (
                        <>
                          <CheckCircle className='mt-0.5 size-4 shrink-0 text-green-500' />
                          <div>
                            <p className='font-medium'>Up to date</p>
                            <p className='text-muted-foreground'>
                              You are running the latest version ({result.currentVersion}).
                            </p>
                          </div>
                        </>
                      )}
                      {result.status === 'update_available' && (
                        <>
                          <ExternalLink className='mt-0.5 size-4 shrink-0 text-blue-500' />
                          <div className='space-y-1'>
                            <p className='font-medium'>Update available</p>
                            <p className='text-muted-foreground'>
                              Version {result.latestVersion} is now available
                              {result.releaseDate && ` (${result.releaseDate})`}.
                            </p>
                          </div>
                        </>
                      )}
                      {result.status === 'check_failed' && (
                        <>
                          <AlertCircle className='mt-0.5 size-4 shrink-0 text-amber-500' />
                          <div>
                            <p className='font-medium'>Unable to check for updates</p>
                            <p className='text-muted-foreground'>
                              {result.error ?? 'The update check could not be completed.'}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {!result && (
                    <p className='text-sm text-muted-foreground'>
                      You are using the latest version.
                    </p>
                  )}
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={handleCheck}
                    disabled={checking}
                  >
                    <RefreshCw className={`mr-2 size-4 ${checking ? 'animate-spin' : ''}`} />
                    {checking ? 'Checking...' : 'Check for Updates'}
                  </Button>
                </div>
                <Separator />

                {/* Support */}
                <div className='space-y-2'>
                  <p className='text-sm font-medium'>Support</p>
                  <p className='text-sm text-muted-foreground'>
                    Need help? Contact the Alpha One support team.
                  </p>
                  <a
                    href='mailto:alphaone@kanal.asia'
                    className='inline-flex items-center gap-1.5 text-sm text-primary underline decoration-dotted underline-offset-2 hover:text-primary/80'
                  >
                    <Mail className='size-3.5' />
                    alphaone@kanal.asia
                  </a>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </Main>
    </>
  )
}
