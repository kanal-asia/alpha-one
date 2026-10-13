/**
 * TASK-092 + TASK-092-R1: Alpha Beautify Theme & Art Direction System.
 * Eight materially distinct built-in themes as original Alpha-owned token
 * configurations. Each theme provides semantic design roles that override
 * the default PALETTE and art-direction behavior when applied.
 *
 * Architecture:
 * - Theme defines palette overrides + art direction behavior tokens
 * - applyTheme() mutates the module-level PALETTE at composition start
 * - Art direction helpers read the active theme to influence:
 *   background treatment, surface language, shape language, typography,
 *   decorative motif, data-viz styling, density, metric/title treatment
 * - Theme never affects semantic routing or factual content
 */

export type ThemeMode = 'LIGHT' | 'DARK'

// ---------------------------------------------------------------------------
// Art Direction Behavior Types
// ---------------------------------------------------------------------------

/** Background treatment beyond flat color. */
export type BackgroundStyle =
  | 'FLAT_LIGHT'
  | 'FLAT_DARK'
  | 'TINTED'
  | 'SPLIT_REGION'
  | 'HERO_DARK'
  | 'GRADIENT_LIKE'

/** Surface/container language for cards and panels. */
export type SurfaceStyle =
  | 'FLAT'
  | 'OUTLINED'
  | 'SOFT_FILL'
  | 'DARK_PANEL'
  | 'MINIMAL_RULE'
  | 'ACCENT_EDGE'
  | 'NO_CARD'

/** Shape and border language. */
export type ShapeStyle =
  | 'ROUNDED'
  | 'SHARP'
  | 'THIN_OUTLINE'
  | 'NO_OUTLINE'
  | 'ACCENT_OUTLINE'

/** Typography personality family. */
export type TypographyPersonality =
  | 'EXECUTIVE'
  | 'EDITORIAL'
  | 'TECH'
  | 'MONO'
  | 'BRAND'
  | 'FORMAL'

/** Decorative motif style. */
export type DecorativeMotif =
  | 'RESTRAINED_RULE'
  | 'LAYERED_HERO'
  | 'THIN_DIVIDERS'
  | 'ANGULAR_ACCENT'
  | 'SOFT_REGION'
  | 'MINIMAL_GEOMETRY'
  | 'BRANDED_ACCENT'

/** Data visualization treatment. */
export type DataVizStyle =
  | 'STANDARD'
  | 'STRONG_MAGNITUDE'
  | 'ANALYTICAL'
  | 'REFINED'
  | 'LUMINOUS'

/** Density personality. */
export type DensityStyle = 'SPACIOUS' | 'BALANCED' | 'COMPACT'

/** Metric emphasis treatment. */
export type MetricTreatment = 'CARD_PANEL' | 'HERO_NUMBER' | 'STRIP' | 'ELEVATED'

/** Title treatment style. */
export type TitleTreatment = 'STANDARD' | 'LIGHTWEIGHT' | 'HEAVY' | 'BRAND_ACCENT'

// ---------------------------------------------------------------------------
// Theme Palette
// ---------------------------------------------------------------------------

export interface ThemePalette {
  background: string
  ink: string
  muted: string
  accent: string
  accent2: string
  cardFill: string
  line: string
  accentSoft: string
}

// ---------------------------------------------------------------------------
// Theme Metadata
// ---------------------------------------------------------------------------

export interface ThemeMetadata {
  id: string
  name: string
  description: string
  mode: ThemeMode
  recommendedFor: string[]
  visualTraits: string[]
}

// ---------------------------------------------------------------------------
// Art Direction Contract
// ---------------------------------------------------------------------------

export interface ArtDirection {
  backgroundStyle: BackgroundStyle
  surfaceStyle: SurfaceStyle
  shapeStyle: ShapeStyle
  typographyPersonality: TypographyPersonality
  decorativeMotif: DecorativeMotif
  dataVizStyle: DataVizStyle
  density: DensityStyle
  metricTreatment: MetricTreatment
  titleTreatment: TitleTreatment
}

// ---------------------------------------------------------------------------
// Complete Theme
// ---------------------------------------------------------------------------

export interface AlphaTheme {
  meta: ThemeMetadata
  palette: ThemePalette
  art: ArtDirection
}

// ---------------------------------------------------------------------------
// Built-in Theme Registry
// ---------------------------------------------------------------------------

export const THEMES: Record<string, AlphaTheme> = {
  EXECUTIVE_NAVY: {
    meta: {
      id: 'EXECUTIVE_NAVY',
      name: 'Executive Navy',
      description: 'Board presentations, management reviews, formal strategy, enterprise proposals. Navy-led, restrained, high legibility.',
      mode: 'LIGHT',
      recommendedFor: ['board', 'management', 'financial review', 'formal strategy', 'enterprise', 'direksi'],
      visualTraits: ['navy-led', 'restrained', 'sophisticated contrast', 'controlled accent', 'minimal decoration'],
    },
    palette: {
      background: '#FFFFFF',
      ink: '#0F172A',
      muted: '#64748B',
      accent: '#1E3A5F',
      accent2: '#B8860B',
      cardFill: '#F1F5F9',
      line: '#CBD5E1',
      accentSoft: '#E2E8F0',
    },
    art: {
      backgroundStyle: 'TINTED',
      surfaceStyle: 'OUTLINED',
      shapeStyle: 'ROUNDED',
      typographyPersonality: 'EXECUTIVE',
      decorativeMotif: 'RESTRAINED_RULE',
      dataVizStyle: 'STANDARD',
      density: 'BALANCED',
      metricTreatment: 'CARD_PANEL',
      titleTreatment: 'STANDARD',
    },
  },

  MODERN_GRADIENT: {
    meta: {
      id: 'MODERN_GRADIENT',
      name: 'Modern Gradient',
      description: 'Product strategy, technology, innovation, growth presentations. Controlled gradient use, rich surfaces, modern accents.',
      mode: 'DARK',
      recommendedFor: ['product', 'technology', 'innovation', 'growth', 'startup', 'modern', 'premium'],
      visualTraits: ['dark canvas', 'gradient motif', 'luminous accents', 'rich surfaces', 'high contrast'],
    },
    palette: {
      background: '#0F172A',
      ink: '#F8FAFC',
      muted: '#94A3B8',
      accent: '#06B6D4',
      accent2: '#8B5CF6',
      cardFill: '#1E293B',
      line: '#334155',
      accentSoft: '#164E63',
    },
    art: {
      backgroundStyle: 'GRADIENT_LIKE',
      surfaceStyle: 'DARK_PANEL',
      shapeStyle: 'ROUNDED',
      typographyPersonality: 'TECH',
      decorativeMotif: 'LAYERED_HERO',
      dataVizStyle: 'LUMINOUS',
      density: 'BALANCED',
      metricTreatment: 'HERO_NUMBER',
      titleTreatment: 'LIGHTWEIGHT',
    },
  },

  EDITORIAL_MINIMAL: {
    meta: {
      id: 'EDITORIAL_MINIMAL',
      name: 'Editorial Minimal',
      description: 'Thought leadership, reports, narrative strategy, premium consulting. Typography-led, generous whitespace, subtle rules.',
      mode: 'LIGHT',
      recommendedFor: ['thought leadership', 'report', 'narrative', 'consulting', 'editorial', 'analysis'],
      visualTraits: ['typography-led', 'generous whitespace', 'subtle dividers', 'off-white canvas', 'restrained color'],
    },
    palette: {
      background: '#FAFAF9',
      ink: '#1C1917',
      muted: '#78716C',
      accent: '#292524',
      accent2: '#A8A29E',
      cardFill: '#F5F5F4',
      line: '#D6D3D1',
      accentSoft: '#E7E5E4',
    },
    art: {
      backgroundStyle: 'FLAT_LIGHT',
      surfaceStyle: 'NO_CARD',
      shapeStyle: 'THIN_OUTLINE',
      typographyPersonality: 'EDITORIAL',
      decorativeMotif: 'THIN_DIVIDERS',
      dataVizStyle: 'REFINED',
      density: 'SPACIOUS',
      metricTreatment: 'STRIP',
      titleTreatment: 'LIGHTWEIGHT',
    },
  },

  BOLD_TECH: {
    meta: {
      id: 'BOLD_TECH',
      name: 'Bold Tech',
      description: 'AI, technology launches, developer narratives, innovation. Dark canvas, electric accents, sharper geometry.',
      mode: 'DARK',
      recommendedFor: ['AI', 'technology', 'launch', 'developer', 'platform', 'innovation', 'berani'],
      visualTraits: ['dark canvas', 'electric accents', 'sharper geometry', 'high-contrast metrics', 'subtle glow'],
    },
    palette: {
      background: '#030712',
      ink: '#F9FAFB',
      muted: '#9CA3AF',
      accent: '#22D3EE',
      accent2: '#A78BFA',
      cardFill: '#111827',
      line: '#1F2937',
      accentSoft: '#0E7490',
    },
    art: {
      backgroundStyle: 'HERO_DARK',
      surfaceStyle: 'ACCENT_EDGE',
      shapeStyle: 'SHARP',
      typographyPersonality: 'TECH',
      decorativeMotif: 'ANGULAR_ACCENT',
      dataVizStyle: 'STRONG_MAGNITUDE',
      density: 'COMPACT',
      metricTreatment: 'HERO_NUMBER',
      titleTreatment: 'HEAVY',
    },
  },

  WARM_STRATEGY: {
    meta: {
      id: 'WARM_STRATEGY',
      name: 'Warm Strategy',
      description: 'Business workshops, organizational strategy, people narratives, brand planning. Warm, approachable, professional.',
      mode: 'LIGHT',
      recommendedFor: ['workshop', 'organizational', 'people', 'brand', 'warm', 'strategy'],
      visualTraits: ['warm canvas', 'earth accents', 'softer language', 'approachable', 'organic geometry'],
    },
    palette: {
      background: '#FFFBF5',
      ink: '#292524',
      muted: '#78716C',
      accent: '#9F1239',
      accent2: '#D97706',
      cardFill: '#FEF3C7',
      line: '#E7E5E4',
      accentSoft: '#FEE2E2',
    },
    art: {
      backgroundStyle: 'TINTED',
      surfaceStyle: 'SOFT_FILL',
      shapeStyle: 'ROUNDED',
      typographyPersonality: 'FORMAL',
      decorativeMotif: 'SOFT_REGION',
      dataVizStyle: 'STANDARD',
      density: 'SPACIOUS',
      metricTreatment: 'CARD_PANEL',
      titleTreatment: 'STANDARD',
    },
  },

  DATA_INTELLIGENCE: {
    meta: {
      id: 'DATA_INTELLIGENCE',
      name: 'Data Intelligence',
      description: 'Analytics, operational intelligence, performance reviews, financial presentations. Data-first, analytical accents.',
      mode: 'DARK',
      recommendedFor: ['analytics', 'data', 'performance', 'financial', 'intelligence', 'report'],
      visualTraits: ['data-first', 'strong magnitude', 'dark base', 'analytical accents', 'high distinction'],
    },
    palette: {
      background: '#0C1222',
      ink: '#E2E8F0',
      muted: '#64748B',
      accent: '#10B981',
      accent2: '#3B82F6',
      cardFill: '#162032',
      line: '#1E3A5F',
      accentSoft: '#064E3B',
    },
    art: {
      backgroundStyle: 'FLAT_DARK',
      surfaceStyle: 'DARK_PANEL',
      shapeStyle: 'THIN_OUTLINE',
      typographyPersonality: 'MONO',
      decorativeMotif: 'MINIMAL_GEOMETRY',
      dataVizStyle: 'ANALYTICAL',
      density: 'COMPACT',
      metricTreatment: 'ELEVATED',
      titleTreatment: 'STANDARD',
    },
  },

  PREMIUM_MONOCHROME: {
    meta: {
      id: 'PREMIUM_MONOCHROME',
      name: 'Premium Monochrome',
      description: 'Premium proposals, executive narratives, minimalist brand. Black/white/gray dominant, typography-heavy, thin lines.',
      mode: 'LIGHT',
      recommendedFor: ['premium', 'proposal', 'executive', 'minimalist', 'brand', 'monochrome'],
      visualTraits: ['black/white/gray', 'typography-heavy', 'very restrained accent', 'thin lines', 'sophisticated'],
    },
    palette: {
      background: '#FFFFFF',
      ink: '#09090B',
      muted: '#71717A',
      accent: '#18181B',
      accent2: '#A1A1AA',
      cardFill: '#F4F4F5',
      line: '#E4E4E7',
      accentSoft: '#E4E4E7',
    },
    art: {
      backgroundStyle: 'FLAT_LIGHT',
      surfaceStyle: 'MINIMAL_RULE',
      shapeStyle: 'THIN_OUTLINE',
      typographyPersonality: 'MONO',
      decorativeMotif: 'MINIMAL_GEOMETRY',
      dataVizStyle: 'REFINED',
      density: 'SPACIOUS',
      metricTreatment: 'HERO_NUMBER',
      titleTreatment: 'HEAVY',
    },
  },

  KANAL_BRAND: {
    meta: {
      id: 'KANAL_BRAND',
      name: 'Kanal Brand',
      description: 'Kanal Digital Indonesia official decks, internal/external Kanal presentations. Brand-authentic identity.',
      mode: 'LIGHT',
      recommendedFor: ['Kanal', 'kanal', 'resmi', 'official', 'brand', 'internal'],
      visualTraits: ['brand-authentic', 'orange-red accent', 'professional', 'clean', 'recognizable'],
    },
    palette: {
      background: '#FFFFFF',
      ink: '#1A1A2E',
      muted: '#6B7280',
      accent: '#E63946',
      accent2: '#457B9D',
      cardFill: '#F1F5F9',
      line: '#E5E7EB',
      accentSoft: '#FECDD3',
    },
    art: {
      backgroundStyle: 'TINTED',
      surfaceStyle: 'OUTLINED',
      shapeStyle: 'ROUNDED',
      typographyPersonality: 'BRAND',
      decorativeMotif: 'BRANDED_ACCENT',
      dataVizStyle: 'STANDARD',
      density: 'BALANCED',
      metricTreatment: 'CARD_PANEL',
      titleTreatment: 'BRAND_ACCENT',
    },
  },

  NAVY_TEAL_PRODUCTION: {
    meta: {
      id: 'NAVY_TEAL_PRODUCTION',
      name: 'Navy Teal Production',
      description: 'Production go-live theme for Alpha Beautify decks. Deep navy canvas, teal primary accent, cyan/violet support, warm gold aggregate highlight. Backs the ALPHA_NAVY_TEAL_PRODUCTION_V1 catalog entry.',
      mode: 'DARK',
      recommendedFor: ['production', 'go-live', 'flagship', 'board', 'growth', 'strategy'],
      visualTraits: ['deep navy canvas', 'teal primary accent', 'luminous data marks', 'rich dark surfaces', 'high contrast'],
    },
    palette: {
      background: '#0A1628',
      ink: '#F1F5F9',
      muted: '#94A3B8',
      accent: '#2DD4BF',
      accent2: '#A78BFA',
      cardFill: '#13253F',
      line: '#2B3F5C',
      accentSoft: '#134E4A',
    },
    art: {
      backgroundStyle: 'GRADIENT_LIKE',
      surfaceStyle: 'DARK_PANEL',
      shapeStyle: 'ROUNDED',
      typographyPersonality: 'TECH',
      decorativeMotif: 'LAYERED_HERO',
      dataVizStyle: 'LUMINOUS',
      density: 'BALANCED',
      metricTreatment: 'HERO_NUMBER',
      titleTreatment: 'LIGHTWEIGHT',
    },
  },
}

export const THEME_IDS = Object.keys(THEMES) as string[]

/** Default theme ID when none specified. */
export const DEFAULT_THEME_ID = 'EXECUTIVE_NAVY'

/**
 * Resolve a theme by ID. Returns null for unknown IDs (caller uses default).
 */
export function resolveTheme(themeId: string | undefined | null): AlphaTheme | null {
  if (!themeId) return null
  const normalized = themeId.trim().toUpperCase().replace(/[\s-]+/g, '_')
  return THEMES[normalized] ?? null
}

/**
 * Infer theme from natural-language style hints.
 * Returns theme ID or null if no strong signal.
 */
export function inferThemeFromPrompt(prompt: string): string | null {
  const p = prompt.toLowerCase()
  // Explicit theme names (strongest signal)
  if (/\b(dark\s*tech|bold\s*tech|teknologi\s*berani)\b/i.test(p)) return 'BOLD_TECH'
  if (/\b(modern\s*(gradient|premium)|premium\s*modern)\b/i.test(p)) return 'MODERN_GRADIENT'
  if (/\b(editorial|minimal\s*(editorial)|consulting)\b/i.test(p)) return 'EDITORIAL_MINIMAL'
  if (/\b(monochrome|hitam\s*putih|minimal\s*hitam)\b/i.test(p)) return 'PREMIUM_MONOCHROME'
  if (/\b(warm|workshop|people|brand\s*planning)\b/i.test(p)) return 'WARM_STRATEGY'
  if (/\b(data|intelligence|analytics|financial\s*review)\b/i.test(p)) return 'DATA_INTELLIGENCE'
  if (/\b(kanal|resmi\s*kanal|brand\s*kanal)\b/i.test(p)) return 'KANAL_BRAND'
  if (/\b(executive|board|direksi|formal\s*strategy|enterprise)\b/i.test(p)) return 'EXECUTIVE_NAVY'
  // Tone-based inference
  if (/\b(dark|malam|gelap)\b/i.test(p) && /\b(tech|ai|launch)\b/i.test(p)) return 'BOLD_TECH'
  if (/\b(berani|bold)\b/i.test(p) && /\b(tech|ai|launch|teknologi)\b/i.test(p)) return 'BOLD_TECH'
  if (/\b(modern|premium|teknologi)\b/i.test(p)) return 'MODERN_GRADIENT'
  if (/\b(formal|resmi|manajemen)\b/i.test(p)) return 'EXECUTIVE_NAVY'
  if (/\b(minimal|bersih|simple)\b/i.test(p)) return 'EDITORIAL_MINIMAL'
  return null
}

/**
 * Theme precedence as documented in TASK-092 §52:
 * 1. Explicit user theme/style request (inferred from prompt)
 * 2. Explicit compose theme (themeId parameter)
 * 3. Existing deck theme context (Google Slides theme colors)
 * 4. Agent-inferred theme
 * 5. Neutral Alpha default (EXECUTIVE_NAVY)
 */
export function resolveThemePrecedence(
  explicitThemeId: string | null | undefined,
  promptHint: string | null | undefined,
  existingDeckTheme: Record<string, string> | null,
): { themeId: string; source: string } {
  // 1. Explicit compose parameter
  if (explicitThemeId) {
    const t = resolveTheme(explicitThemeId)
    if (t) return { themeId: t.meta.id, source: 'EXPLICIT_COMPOSE' }
  }
  // 2. Explicit user request inferred from prompt
  if (promptHint) {
    const inferred = inferThemeFromPrompt(promptHint)
    if (inferred) return { themeId: inferred, source: 'USER_EXPLICIT_STYLE' }
  }
  // 3. Existing deck context — if the deck already has a coherent theme, preserve it
  // (For now, we don't map Google Slides themes to Alpha themes — documented as future work)
  // 4. Agent inference — not implemented in unit tests (requires LLM)
  // 5. Default
  return { themeId: DEFAULT_THEME_ID, source: 'DEFAULT' }
}
