import { Link, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  AudioLines,
  CheckCircle2,
  FileText,
  Gift,
  HelpCircle,
  Image,
  Loader2,
  AlertTriangle,
  Sparkles,
  ExternalLink,
  Text,
  Video,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { getDealBySlug } from '../data/deals'
import { AffiliateCta } from '../components/affiliate-cta'
import { AffiliateDisclosure } from '../components/affiliate-disclosure'
import { ValueSignal } from '../components/value-signal'
import type { OpenCodeGoApiResponse, GoModel, GoModelEnrichment } from '../types'

// ---------------------------------------------------------------------------
// Modality icons ΓÇö same mapping as TASK-084 Model Picker
// ---------------------------------------------------------------------------

const MODALITY_ICON: Record<string, { icon: typeof Text; label: string }> = {
  text: { icon: Text, label: 'Text' },
  image: { icon: Image, label: 'Image' },
  video: { icon: Video, label: 'Video' },
  audio: { icon: AudioLines, label: 'Audio' },
  pdf: { icon: FileText, label: 'PDF/document' },
}

function ModalityIcons({ modalities }: { modalities: string[] | undefined }) {
  if (!modalities || modalities.length === 0) return null
  return (
    <span className='flex items-center gap-1'>
      {modalities.map((mod) => {
        const entry = MODALITY_ICON[mod]
        if (!entry) return null
        const Icon = entry.icon
        return (
          <span
            key={mod}
            title={`${entry.label} input`}
            className='text-muted-foreground/70'
            aria-label={`${entry.label} input supported`}
          >
            <Icon className='size-3.5' />
          </span>
        )
      })}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Pricing ΓÇö same logic as TASK-084 Model Picker
// ---------------------------------------------------------------------------

function formatPrice(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null
  return `$${value.toFixed(2)}`
}

function pricingLabel(e: GoModelEnrichment | undefined): string | null {
  if (!e?.matched) return null
  const input = formatPrice(e.inputPrice)
  const output = formatPrice(e.outputPrice)
  if (!input || !output) return null
  return `${input} / ${output}`
}

function ModelTierBadge({
  enrichment,
  free,
}: {
  enrichment?: GoModelEnrichment
  free?: boolean
}) {
  // Derive free status: if enrichment has both prices as 0, treat as free
  const isFree =
    free ?? (enrichment?.matched && enrichment.inputPrice === 0 && enrichment.outputPrice === 0)

  if (isFree) {
    return (
      <Badge
        variant='outline'
        className='shrink-0 border-transparent bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600'
      >
        FREE
      </Badge>
    )
  }
  const price = pricingLabel(enrichment)
  if (price) {
    return (
      <Badge
        variant='outline'
        className='shrink-0 whitespace-nowrap border-transparent bg-amber-500/10 px-2 py-0.5 font-mono text-xs font-semibold leading-tight text-amber-600'
        title='Input / Output price per 1M tokens (Models.dev)'
      >
        {price}
      </Badge>
    )
  }
  return (
    <Badge
      variant='outline'
      className='shrink-0 border-transparent bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600'
    >
      PAID
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// API fetcher
// ---------------------------------------------------------------------------

async function fetchOpenCodeGoData(): Promise<OpenCodeGoApiResponse> {
  const res = await fetch('/api/ai-big-deals/opencode-go?enrich=true')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ---------------------------------------------------------------------------
// Loading / Error / Empty states
// ---------------------------------------------------------------------------

function ModelsLoading() {
  return (
    <div className='flex items-center gap-2 py-6 text-sm text-muted-foreground'>
      <Loader2 className='size-4 animate-spin' />
      Loading models from OpenCodeΓÇª
    </div>
  )
}

function ModelsError() {
  return (
    <div className='flex items-center gap-2 py-6 text-sm text-muted-foreground'>
      <AlertTriangle className='size-4 text-amber-500' />
      Model list is temporarily unavailable.
    </div>
  )
}

function ModelsEmpty() {
  return (
    <div className='py-6 text-sm text-muted-foreground'>
      No models currently listed. The source may be updating.
    </div>
  )
}

// ---------------------------------------------------------------------------
// Model row ΓÇö same visual language as TASK-084 Model Picker
// ---------------------------------------------------------------------------

function ModelRow({ model }: { model: GoModel }) {
  const e = model.enrichment
  return (
    <div className='flex items-center gap-2 rounded-md border px-3 py-2'>
      <div className='min-w-0 flex-1'>
        <div className='flex items-center gap-2'>
          <span className='truncate text-sm font-medium'>{model.displayName}</span>
          {e?.matched && <ModalityIcons modalities={e.inputModalities} />}
        </div>
        <div className='flex items-center gap-2'>
          <span className='block truncate font-mono text-[11px] text-muted-foreground'>
            {model.id}
          </span>
          {e?.canonicalUrl && (
            <a
              href={e.canonicalUrl}
              target='_blank'
              rel='noopener noreferrer'
              className='shrink-0 text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-primary'
            >
              Model details
            </a>
          )}
        </div>
      </div>
      <ModelTierBadge enrichment={e} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Model list
// ---------------------------------------------------------------------------

function ModelList({ models }: { models: OpenCodeGoApiResponse['models'] }) {
  if (models.length === 0) return <ModelsEmpty />
  return (
    <div className='space-y-2'>
      <p className='text-xs text-muted-foreground'>
        {models.length} model{models.length !== 1 ? 's' : ''} currently available through OpenCode
        Go
      </p>
      <div className='grid gap-2 lg:grid-cols-1'>
        {models.map((m) => (
          <ModelRow key={m.id} model={m} />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detail page
// ---------------------------------------------------------------------------

export function DealDetailPage() {
  const { dealId } = useParams({ from: '/_authenticated/big-deals/$dealId' })
  const deal = getDealBySlug(dealId)

  const {
    data: goData,
    isLoading: goLoading,
    error: goError,
  } = useQuery({
    queryKey: ['opencode-go-data'],
    queryFn: fetchOpenCodeGoData,
    staleTime: 4 * 60_000, // 4 min (server caches 5 min)
    retry: 1,
  })

  if (!deal) {
    return (
      <>
        <PageHeader />
        <Main>
          <Link
            to='/big-deals'
            className='mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground'
          >
            <ArrowLeft className='size-4' /> AI BIG Deals
          </Link>
          <Card>
            <CardContent className='flex flex-col items-center justify-center py-12'>
              <HelpCircle className='mb-3 size-10 text-muted-foreground/50' />
              <p className='text-sm font-medium text-muted-foreground'>Deal not found</p>
              <p className='mt-1 text-xs text-muted-foreground/70'>
                The deal you are looking for does not exist or is no longer active.
              </p>
            </CardContent>
          </Card>
        </Main>
      </>
    )
  }

  return (
    <>
      <PageHeader />
      <Main>
        <Link
          to='/big-deals'
          className='mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground'
        >
          <ArrowLeft className='size-4' /> AI BIG Deals
        </Link>

        <div className='mb-6'>
          <div className='flex items-center gap-2'>
            <Sparkles className='size-5 text-amber-500' />
            <h1 className='text-2xl font-bold tracking-tight'>OpenCode Go</h1>
          </div>
          <p className='mt-1 text-sm text-muted-foreground'>{deal.headline}</p>
        </div>

        <div className='grid gap-4 lg:grid-cols-3'>
          <div className='space-y-4 lg:col-span-2'>
            <Card>
              <CardContent className='pt-6'>
                <ValueSignal
                  introductoryPrice={deal.introductoryPrice}
                  price={deal.price}
                  usageValueLabel={deal.usageValueLabel}
                  usageValue={deal.usageValue}
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent className='pt-6'>
                <div className='space-y-2'>
                  <div className='flex items-center gap-2 text-sm font-semibold text-foreground'>
                    <Gift className='size-4 text-pink-500' />
                    {deal.offerText}
                  </div>
                  <p className='text-sm text-muted-foreground'>{deal.benefitText}</p>
                </div>
                <div className='mt-4'>
                  <AffiliateCta url={deal.destinationUrl} label={deal.ctaLabel} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className='pb-2'>
                <CardTitle className='flex items-center gap-2 text-base'>
                  <CheckCircle2 className='size-4 text-emerald-500' />
                  Why OpenCode Go?
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className='space-y-2'>
                  {deal.whyItems.map((item) => (
                    <li key={item} className='flex items-start gap-2 text-sm text-muted-foreground'>
                      <CheckCircle2 className='mt-0.5 size-3.5 shrink-0 text-emerald-500' />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Included Models ΓÇö dynamic from OpenCode Go source + Models.dev enrichment */}
            <Card>
              <CardHeader className='pb-2'>
                <CardTitle className='text-base'>Included Models</CardTitle>
              </CardHeader>
              <CardContent>
                {goLoading && <ModelsLoading />}
                {goError && <ModelsError />}
                {goData && <ModelList models={goData.models} />}
                {goData && goData.stale && (
                  <p className='mt-2 text-xs text-muted-foreground/60'>
                    Source data may be stale.
                  </p>
                )}
                {!goLoading && !goError && !goData && <ModelsError />}
              </CardContent>
            </Card>
          </div>

          <div className='space-y-4'>
            <Card>
              <CardHeader className='pb-2'>
                <CardTitle className='text-base'>Usage Value</CardTitle>
              </CardHeader>
              <CardContent className='space-y-3'>
                <div className='text-center'>
                  <div className='text-sm text-muted-foreground'>{deal.price}</div>
                  <div className='my-1 text-lg'>Γåô</div>
                  <div className='text-lg font-bold text-foreground'>{deal.usageValueLabel}</div>
                </div>
                <Separator />
                <p className='text-center text-xs text-muted-foreground'>
                  Actual usage varies by model.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className='pb-2'>
                <CardTitle className='flex items-center gap-2 text-base'>
                  <HelpCircle className='size-4' />
                  How It Works
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ol className='space-y-2'>
                  {deal.howItWorks.map((step, i) => (
                    <li key={step} className='flex items-start gap-2 text-sm text-muted-foreground'>
                      <span className='mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground'>
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>

            <Card>
              <CardContent className='pt-6'>
                <AffiliateDisclosure text={deal.disclosure} />
                <div className='mt-4'>
                  <AffiliateCta url={deal.destinationUrl} label={deal.ctaLabel} />
                </div>
              </CardContent>
            </Card>

            {goData?.sourceUrl && (
              <div className='flex items-center gap-1.5 px-1 text-xs text-muted-foreground/60'>
                <ExternalLink className='size-3' />
                <a
                  href={goData.sourceUrl}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='underline decoration-dotted underline-offset-2 hover:text-foreground'
                >
                  Source: OpenCode Go models API
                </a>
              </div>
            )}
          </div>
        </div>
      </Main>
    </>
  )
}
