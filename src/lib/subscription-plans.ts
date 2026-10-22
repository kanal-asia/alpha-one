/**
 * TASK-ALPHA-SUBSCRIBER-002: static subscription plan catalog.
 *
 * Source: `docs/Alpha One — Subscription Plans, Pricing & Benefits.md`
 * (PROPOSED — PRICING NOT FINAL).
 *
 * Rules enforced by this module:
 * - Plan names and positioning follow the specification exactly.
 * - Every price, quota, seat limit, Actions allowance, and add-on that the
 *   specification marks as candidate carries `candidate: true` and MUST be
 *   rendered with a candidate badge — never as a final commercial offer.
 * - No checkout URLs, no transaction targets: there is no billing backend.
 *   The catalog is display-only until a billing integration ships.
 */

export type PlanId = 'free' | 'member' | 'pro' | 'business'

/** A spec value that is still a candidate (not a final commercial decision). */
export interface CandidateValue<T> {
  value: T
  /** Always true here: the spec has not finalized any commercial number. */
  candidate: true
}

export interface PlanBenefit {
  /** Benefit label from the spec comparison matrix. */
  label: string
  /** How the spec positions this benefit for the plan. */
  level: 'Included' | 'Limited' | 'Basic' | 'Standard' | 'Advanced' | 'Preview' | 'Team' | 'Not included' | 'To be defined'
}

export interface SubscriptionPlan {
  id: PlanId
  name: string
  positioning: string
  targetUser: string
  /** Monthly price in IDR. Free is settled (Rp0); all others are candidates. */
  monthlyPriceIdr: number | CandidateValue<number>
  benefits: PlanBenefit[]
  exclusions: string[]
}

function candidate<T>(value: T): CandidateValue<T> {
  return { value, candidate: true }
}

/** True when the number still requires a founder pricing decision. */
export function isCandidatePrice(price: SubscriptionPlan['monthlyPriceIdr']): price is CandidateValue<number> {
  return typeof price === 'object' && price !== null && (price as CandidateValue<number>).candidate === true
}

export function planPriceIdr(plan: SubscriptionPlan): number {
  return isCandidatePrice(plan.monthlyPriceIdr) ? plan.monthlyPriceIdr.value : plan.monthlyPriceIdr
}

export const SUBSCRIPTION_PLANS: readonly SubscriptionPlan[] = [
  {
    id: 'free',
    name: 'Free',
    positioning: 'Coba Alpha One.',
    targetUser: 'Calon pelanggan yang ingin mencoba kemampuan Alpha One sebelum berlangganan.',
    monthlyPriceIdr: 0,
    benefits: [
      { label: 'AI Assistant', level: 'Limited' },
      { label: 'Guided workflows', level: 'Basic' },
      { label: 'Spreadsheet analysis', level: 'Preview' },
      { label: 'Report generation', level: 'Limited' },
      { label: 'Google Slides generation', level: 'Limited' },
      { label: 'Plan & usage info', level: 'Included' },
    ],
    exclusions: ['Advanced business workflows', 'Shared team workspace'],
  },
  {
    id: 'member',
    name: 'Member',
    positioning: 'Selesaikan pekerjaan rutin dengan AI.',
    targetUser: 'Individu dengan kebutuhan AI rutin.',
    monthlyPriceIdr: candidate(99_000),
    benefits: [
      { label: 'AI Assistant', level: 'Included' },
      { label: 'Guided workflows', level: 'Standard' },
      { label: 'Spreadsheet analysis', level: 'Standard' },
      { label: 'Report generation', level: 'Standard' },
      { label: 'Google Slides generation', level: 'Standard' },
      { label: 'Personal quota', level: 'Included' },
    ],
    exclusions: ['Advanced business workflows', 'Team member management', 'Centralized team quota'],
  },
  {
    id: 'pro',
    name: 'Pro',
    positioning: 'Analisis bisnis dan hasilkan report profesional.',
    targetUser: 'Profesional yang menjalankan workflow bisnis lebih intensif.',
    monthlyPriceIdr: candidate(249_000),
    benefits: [
      { label: 'AI Assistant', level: 'Included' },
      { label: 'Guided workflows', level: 'Advanced' },
      { label: 'Marketing Intelligence', level: 'Advanced' },
      { label: 'Operations Intelligence', level: 'Advanced' },
      { label: 'Executive reports & presentations', level: 'Advanced' },
      { label: 'Higher quota', level: 'Included' },
    ],
    exclusions: ['Team member management', 'Shared workspace administration', 'Centralized billing'],
  },
  {
    id: 'business',
    name: 'Business',
    positioning: 'Standarkan workflow AI dan kelola penggunaan untuk tim.',
    targetUser: 'Tim dan organisasi.',
    monthlyPriceIdr: candidate(599_000),
    benefits: [
      { label: 'Everything in Pro', level: 'Included' },
      { label: 'Business workspace', level: 'Team' },
      { label: 'Member management', level: 'Included' },
      { label: 'Team usage overview', level: 'Included' },
      { label: 'Centralized team quota', level: 'Team' },
      { label: 'Priority support', level: 'To be defined' },
    ],
    exclusions: [],
  },
]

export function getPlan(id: PlanId): SubscriptionPlan {
  const plan = SUBSCRIPTION_PLANS.find((p) => p.id === id)
  if (!plan) throw new Error(`Unknown plan: ${id}`)
  return plan
}

/**
 * Default plan for local use. There is no subscription backend, so every
 * installation starts on Free. Display layers must label this as the local
 * default, not as a server-issued subscription record.
 */
export const DEFAULT_PLAN_ID: PlanId = 'free'
