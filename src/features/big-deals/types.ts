export type DealStatus = 'DRAFT' | 'VERIFIED' | 'ACTIVE' | 'EXPIRED' | 'ARCHIVED'

export type DealCategory = 'coding' | 'general-ai' | 'image' | 'video' | 'productivity'

export type OfferType = 'affiliate_referral' | 'discount' | 'bonus_credit' | 'free_trial' | 'limited_time'

export interface Deal {
  dealId: string
  providerId: string
  productId: string
  category: DealCategory
  headline: string
  description: string
  price: string
  introductoryPrice: string
  usageValue: number
  usageValueLabel: string
  offerType: OfferType
  offerText: string
  benefitText: string
  ctaLabel: string
  destinationUrl: string
  disclosure: string
  status: DealStatus
  featured: boolean
  whyItems: string[]
  howItWorks: string[]
}

/** Models.dev enrichment for a single Go model (same shape as TASK-084). */
export interface GoModelEnrichment {
  providerId: string
  modelId: string
  detailUrl: string
  canonicalUrl?: string
  inputPrice: number | null
  outputPrice: number | null
  inputModalities: string[]
  matched: boolean
}

/** Dynamic model from OpenCode Go source, with optional Models.dev enrichment. */
export interface GoModel {
  id: string
  displayName: string
  ownedBy: string | null
  created: number | null
  enrichment?: GoModelEnrichment
}

/** Normalized API response from GET /api/ai-big-deals/opencode-go. */
export interface OpenCodeGoApiResponse {
  models: GoModel[]
  modelCount: number
  sourceUrl: string
  fetchedAt: string
  stale: boolean
}
