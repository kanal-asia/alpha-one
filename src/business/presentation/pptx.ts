/**
 * Alpha Workspace — Presentation SDK: PPTX generation using pptxgenjs
 *
 * Generates PowerPoint presentations from structured slide content.
 * Uses the pptxgenjs library for reliable .pptx output.
 */
import PptxGenJS from 'pptxgenjs'

export interface SlideContent {
  title: string
  bullets: string[]
}

export interface PresentationInput {
  title: string
  purpose: string
  audience: string
  style: 'business' | 'marketing' | 'report' | 'proposal' | 'minimal'
  slideCount: number
  content: string
  slides?: SlideContent[]
}

const STYLE_THEMES: Record<string, { primary: string; secondary: string; background: string; font: string }> = {
  business: { primary: '1F4E79', secondary: '2E75B6', background: 'FFFFFF', font: 'Calibri' },
  marketing: { primary: 'C00000', secondary: 'FF6600', background: 'FFFFFF', font: 'Calibri' },
  report: { primary: '333333', secondary: '666666', background: 'FFFFFF', font: 'Calibri' },
  proposal: { primary: '0066CC', secondary: '003366', background: 'FFFFFF', font: 'Calibri' },
  minimal: { primary: '333333', secondary: '999999', background: 'FFFFFF', font: 'Calibri' },
}

function generateDefaultSlides(input: PresentationInput): SlideContent[] {
  const slideCount = Math.max(3, Math.min(20, input.slideCount))

  const slides: SlideContent[] = []

  // Title slide
  slides.push({
    title: input.title,
    bullets: [input.purpose, `Audience: ${input.audience}`],
  })

  // Content slides based on purpose
  const purposeLower = input.purpose.toLowerCase()
  const contentLower = input.content.toLowerCase()

  if (purposeLower.includes('performance') || purposeLower.includes('result') || contentLower.includes('metric')) {
    slides.push({ title: 'Overview', bullets: ['Key highlights and achievements', 'Performance metrics summary', 'Goals and objectives review'] })
    slides.push({ title: 'Key Metrics', bullets: ['Revenue and growth indicators', 'Customer engagement data', 'Market performance analysis'] })
    slides.push({ title: 'Analysis', bullets: ['Trends and patterns identified', 'Comparison with previous periods', 'Factor contributing to results'] })
    slides.push({ title: 'Recommendations', bullets: ['Strategic actions to consider', 'Resource allocation suggestions', 'Timeline for implementation'] })
  } else if (purposeLower.includes('plan') || purposeLower.includes('strategy') || contentLower.includes('strategy')) {
    slides.push({ title: 'Current State', bullets: ['Where we are today', 'Key challenges and opportunities', 'Market context'] })
    slides.push({ title: 'Strategic Vision', bullets: ['Where we want to be', 'Long-term objectives', 'Success criteria'] })
    slides.push({ title: 'Action Plan', bullets: ['Key initiatives and milestones', 'Resource requirements', 'Timeline and phases'] })
    slides.push({ title: 'Next Steps', bullets: ['Immediate priorities', 'Decision points', 'Follow-up schedule'] })
  } else if (purposeLower.includes('proposal') || purposeLower.includes('pitch') || contentLower.includes('proposal')) {
    slides.push({ title: 'The Opportunity', bullets: ['Problem statement', 'Market need', 'Target audience'] })
    slides.push({ title: 'Our Solution', bullets: ['Key features and benefits', 'Unique value proposition', 'Competitive advantages'] })
    slides.push({ title: 'Implementation', bullets: ['Approach and methodology', 'Timeline and milestones', 'Team and resources'] })
    slides.push({ title: 'Investment', bullets: ['Budget overview', 'Expected ROI', 'Risk mitigation'] })
  } else {
    // Generic content slides
    slides.push({ title: 'Introduction', bullets: ['Background and context', 'Purpose of this presentation', 'Key messages'] })
    slides.push({ title: 'Main Points', bullets: ['Core content and insights', 'Supporting evidence', 'Key takeaways'] })
    slides.push({ title: 'Details', bullets: ['In-depth analysis', 'Examples and case studies', 'Data and evidence'] })
    slides.push({ title: 'Conclusion', bullets: ['Summary of key points', 'Call to action', 'Next steps'] })
  }

  // Summary/closing slide
  slides.push({
    title: 'Summary & Next Steps',
    bullets: ['Key takeaways from this presentation', 'Recommended actions', 'Questions and discussion'],
  })

  // Trim to requested count
  return slides.slice(0, slideCount)
}

function applyStyle(pres: PptxGenJS, style: string): void {
  const theme = STYLE_THEMES[style] ?? STYLE_THEMES.business

  pres.defineSlideMaster({
    title: 'TITLE_SLIDE',
    background: { color: theme.background },
    objects: [
      { rect: { x: 0, y: 0, w: '100%', h: 0.5, fill: { color: theme.primary } } },
      { rect: { x: 0, y: '100%', w: '100%', h: 0.5, fill: { color: theme.primary }, flipV: true } },
    ],
  })

  pres.defineSlideMaster({
    title: 'CONTENT_SLIDE',
    background: { color: theme.background },
    objects: [
      { rect: { x: 0, y: 0, w: '100%', h: 0.08, fill: { color: theme.primary } } },
    ],
  })
}

export async function buildPresentation(input: PresentationInput): Promise<Uint8Array> {
  const pres = new PptxGenJS()

  // Presentation metadata
  pres.layout = 'LAYOUT_16x9'
  pres.author = 'Alpha Workspace'
  pres.title = input.title
  pres.subject = input.purpose

  applyStyle(pres, input.style)

  const theme = STYLE_THEMES[input.style] ?? STYLE_THEMES.business
  const slides = input.slides ?? generateDefaultSlides(input)

  for (let i = 0; i < slides.length; i++) {
    const slideData = slides[i]
    const isFirst = i === 0
    const isLast = i === slides.length - 1

    const slide = pres.addSlide({ masterName: isFirst ? 'TITLE_SLIDE' : 'CONTENT_SLIDE' })

    if (isFirst) {
      // Title slide
      slide.addText(slideData.title, {
        x: 0.5,
        y: 1.5,
        w: 9,
        h: 1.5,
        fontSize: 32,
        fontFace: theme.font,
        color: theme.primary,
        bold: true,
        align: 'center',
      })

      if (slideData.bullets.length > 0) {
        slide.addText(slideData.bullets.join(' | '), {
          x: 1,
          y: 3.2,
          w: 8,
          h: 0.8,
          fontSize: 14,
          fontFace: theme.font,
          color: theme.secondary,
          align: 'center',
        })
      }
    } else if (isLast) {
      // Summary slide
      slide.addText(slideData.title, {
        x: 0.5,
        y: 0.3,
        w: 9,
        h: 0.8,
        fontSize: 24,
        fontFace: theme.font,
        color: theme.primary,
        bold: true,
      })

      if (slideData.bullets.length > 0) {
        slide.addText(
          slideData.bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true } })),
          {
            x: 0.8,
            y: 1.3,
            w: 8.4,
            h: 4,
            fontSize: 16,
            fontFace: theme.font,
            color: '333333',
            lineSpacingMultiple: 1.5,
            valign: 'top',
          }
        )
      }
    } else {
      // Content slide
      slide.addText(slideData.title, {
        x: 0.5,
        y: 0.3,
        w: 9,
        h: 0.8,
        fontSize: 24,
        fontFace: theme.font,
        color: theme.primary,
        bold: true,
      })

      // Add accent line under title
      slide.addShape(pres.ShapeType.rect, {
        x: 0.5,
        y: 1.0,
        w: 1.5,
        h: 0.04,
        fill: { color: theme.secondary },
      })

      if (slideData.bullets.length > 0) {
        slide.addText(
          slideData.bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true } })),
          {
            x: 0.8,
            y: 1.3,
            w: 8.4,
            h: 4,
            fontSize: 16,
            fontFace: theme.font,
            color: '333333',
            lineSpacingMultiple: 1.5,
            valign: 'top',
          }
        )
      }
    }

    // Slide number (except title slide)
    if (!isFirst) {
      slide.addText(`${i + 1}`, {
        x: 9.2,
        y: 5.1,
        w: 0.5,
        h: 0.3,
        fontSize: 10,
        fontFace: theme.font,
        color: theme.secondary,
        align: 'right',
      })
    }
  }

  const buffer = await pres.write({ outputType: 'arraybuffer' })
  return new Uint8Array(buffer as ArrayBuffer)
}
