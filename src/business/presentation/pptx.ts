/**
 * Alpha Workspace — Presentation SDK: PPTX generation using pptxgenjs
 *
 * Generates PowerPoint presentations from structured slide content.
 * Uses the pptxgenjs library for reliable .pptx output.
 */
import PptxGenJS from 'pptxgenjs'
import type { PresentationContent, PresentationInput, SlideContent } from './schema'

export type { PresentationInput, SlideContent }

const STYLE_THEMES: Record<string, { primary: string; secondary: string; background: string; font: string }> = {
  business: { primary: '1F4E79', secondary: '2E75B6', background: 'FFFFFF', font: 'Calibri' },
  marketing: { primary: 'C00000', secondary: 'FF6600', background: 'FFFFFF', font: 'Calibri' },
  report: { primary: '333333', secondary: '666666', background: 'FFFFFF', font: 'Calibri' },
  proposal: { primary: '0066CC', secondary: '003366', background: 'FFFFFF', font: 'Calibri' },
  minimal: { primary: '333333', secondary: '999999', background: 'FFFFFF', font: 'Calibri' },
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

export async function buildPresentation(input: PresentationContent): Promise<Uint8Array> {
  const pres = new PptxGenJS()

  // Presentation metadata
  pres.layout = 'LAYOUT_16x9'
  pres.author = 'Alpha Workspace'
  pres.title = input.title
  pres.subject = input.purpose

  applyStyle(pres, input.style)

  const theme = STYLE_THEMES[input.style] ?? STYLE_THEMES.business
  const slides = input.slides

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
