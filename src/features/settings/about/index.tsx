import { useState } from 'react'
import { ExternalLink, RefreshCw, CheckCircle, AlertCircle, Info } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ContentSection } from '../components/content-section'
import { APP_VERSION } from '@/lib/version'
import { checkForUpdates, type UpdateResult } from '@/lib/update-checker'

export function SettingsAbout() {
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
    <ContentSection
      title='About & Updates'
      desc='Application information and software updates.'
    >
      <div className='space-y-6'>
        {/* Application Identity */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Info className='size-4' />
              Application
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <div className='flex items-center justify-between'>
              <span className='text-sm font-medium'>Alpha One</span>
              <span className='text-sm text-muted-foreground'>
                Version {APP_VERSION}
              </span>
            </div>
            <Separator />
            <p className='text-xs text-muted-foreground'>
              Alpha One runs locally on your device. Your data and results stay on this device.
            </p>
          </CardContent>
        </Card>

        {/* Software Update */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <RefreshCw className='size-4' />
              Software Update
            </CardTitle>
            <CardDescription>
              Check for newer versions of Alpha One.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            {/* Status display */}
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
                      {result.releaseNotes && (
                        <div className='mt-2 rounded bg-muted p-2 text-xs whitespace-pre-wrap'>
                          {result.releaseNotes}
                        </div>
                      )}
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

            {/* Check button */}
            <Button
              variant='outline'
              size='sm'
              onClick={handleCheck}
              disabled={checking}
            >
              <RefreshCw className={`mr-2 size-4 ${checking ? 'animate-spin' : ''}`} />
              {checking ? 'Checking...' : 'Check for Updates'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </ContentSection>
  )
}
