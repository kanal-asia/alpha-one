import type { Deal } from '../types'

/**
 * Alpha One affiliate URL — single source of truth.
 * This is Alpha One-owned data, NOT from the OpenCode source.
 */
const AFFILIATE_URL = 'https://opencode.ai/go?ref=JHSS0FH9KT'

/**
 * OpenCode Go deal — Alpha One marketing configuration.
 *
 * Fields here are Alpha One-owned copy (affiliate URL, disclosure, CTA labels,
 * marketing explanation). They are NOT sourced from the OpenCode Go API.
 *
 * Dynamic data (model list, model count) comes from the server-side resolver
 * via GET /api/ai-big-deals/opencode-go and is rendered by the detail page.
 *
 * Pricing copy ($5 first month, $10/month, usage value) is Alpha One marketing
 * based on publicly documented OpenCode Go pricing. The /zen/go/v1/models
 * endpoint does not expose pricing — these are editorial claims, not
 * machine-sourced constants.
 */
export const opencodeGoDeal: Deal = {
  dealId: 'opencode-go',
  providerId: 'opencode',
  productId: 'go',
  category: 'coding',
  headline: 'Curated coding models for agentic coding.',
  description:
    'OpenCode Go provides curated coding models designed for agentic coding workflows, with reliable provider access at a low monthly cost.',
  price: '$10/month',
  introductoryPrice: '$5 first month',
  usageValue: 60,
  usageValueLabel: 'Up to $60 in usage',
  offerType: 'affiliate_referral',
  offerText: 'Extra $5 usage credit',
  benefitText: 'Sign up through Alpha One and get an extra $5 in usage credit.',
  ctaLabel: 'Get Extra $5 Credit',
  destinationUrl: AFFILIATE_URL,
  disclosure:
    'Alpha One is an OpenCode affiliate. We may earn a commission when you sign up through this link.',
  status: 'ACTIVE',
  featured: true,
  whyItems: [
    'Curated coding models',
    'Designed for agentic coding',
    'Reliable model/provider access',
    'Low monthly cost',
    'Works alongside other AI providers',
    'No provider lock-in',
  ],
  howItWorks: [
    'Click Get Extra $5 Credit',
    "Sign up through Alpha One's referral",
    'Receive the applicable introductory pricing and referral usage credit',
    'Use OpenCode Go with your coding workflow',
  ],
}

export const allDeals: Deal[] = [opencodeGoDeal]

export function getActiveDeals(): Deal[] {
  return allDeals.filter((d) => d.status === 'ACTIVE')
}

export function getFeaturedDeals(): Deal[] {
  return allDeals.filter((d) => d.status === 'ACTIVE' && d.featured)
}

export function getDealBySlug(slug: string): Deal | undefined {
  return allDeals.find((d) => d.dealId === slug && d.status === 'ACTIVE')
}
