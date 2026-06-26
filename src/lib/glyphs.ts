import {
  ASCII_LIMITS,
  CHARACTER_SETS,
  FONT_OPTIONS,
  type AsciiSettings,
  type GlyphMetric,
  type RenderMetrics,
} from './types'

const GLYPH_FONT_SIZE = 24

export async function measureGlyphs(
  settings: AsciiSettings,
  columns: number,
  sourceWidth: number,
  sourceHeight: number,
): Promise<{ glyphs: GlyphMetric[]; metrics: RenderMetrics }> {
  await document.fonts.ready

  const fontFamily = getFontFamily(settings.fontKey)
  const chars = getCharacters(settings.charsetKey, settings.useSpaces)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })

  if (!context) {
    throw new Error('Canvas is not available in this browser.')
  }

  context.font = `${GLYPH_FONT_SIZE}px ${fontFamily}`
  const charWidth = Math.max(1, context.measureText('M').width)
  const lineHeightPx = Math.max(
    GLYPH_FONT_SIZE,
    GLYPH_FONT_SIZE * settings.lineHeight,
  )
  const rows = calculateRows(
    sourceWidth,
    sourceHeight,
    columns,
    charWidth,
    lineHeightPx,
  )
  const glyphs = normalizeGlyphDensities(
    chars.map((char) =>
      char === ' '
        ? { char, density: 0 }
        : measureGlyphDensity(context, char, fontFamily, charWidth, lineHeightPx),
    ),
  )
    .sort((left, right) => left.density - right.density)

  return {
    glyphs,
    metrics: {
      fontFamily,
      fontSize: GLYPH_FONT_SIZE,
      charWidth,
      lineHeightPx,
      columns,
      rows,
    },
  }
}

export function getFontFamily(fontKey: AsciiSettings['fontKey']): string {
  return FONT_OPTIONS.find((font) => font.key === fontKey)?.stack ?? FONT_OPTIONS[0].stack
}

function getCharacters(
  charsetKey: AsciiSettings['charsetKey'],
  useSpaces: boolean,
): string[] {
  const source =
    CHARACTER_SETS.find((charset) => charset.key === charsetKey)?.chars ??
    CHARACTER_SETS[0].chars
  const unique = Array.from(new Set(source.split('')))

  if (useSpaces) {
    return unique
  }

  return unique.filter((char) => char !== ' ')
}

function calculateRows(
  sourceWidth: number,
  sourceHeight: number,
  columns: number,
  charWidth: number,
  lineHeightPx: number,
): number {
  const aspectAdjustedRows =
    (sourceHeight / sourceWidth) * columns * (charWidth / lineHeightPx)
  const requestedRows = Math.max(1, Math.round(aspectAdjustedRows))
  const cellLimitedRows = Math.floor(ASCII_LIMITS.maxCells / Math.max(1, columns))
  const rowLimit = Math.max(1, Math.min(ASCII_LIMITS.maxRows, cellLimitedRows))

  return Math.min(requestedRows, rowLimit)
}

function normalizeGlyphDensities(glyphs: GlyphMetric[]): GlyphMetric[] {
  if (glyphs.length === 0) {
    throw new Error('No characters are available for this character set.')
  }

  const densities = glyphs.map((glyph) => glyph.density)
  const min = Math.min(...densities)
  const max = Math.max(...densities)
  const range = max - min

  if (range <= 0.000_001) {
    return glyphs.map((glyph) => ({ ...glyph, density: 0 }))
  }

  return glyphs.map((glyph) => ({
    ...glyph,
    density: (glyph.density - min) / range,
  }))
}

function measureGlyphDensity(
  context: CanvasRenderingContext2D,
  char: string,
  fontFamily: string,
  charWidth: number,
  lineHeightPx: number,
): GlyphMetric {
  const width = Math.max(4, Math.ceil(charWidth))
  const height = Math.max(4, Math.ceil(lineHeightPx))

  context.canvas.width = width
  context.canvas.height = height
  context.font = `${GLYPH_FONT_SIZE}px ${fontFamily}`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.fillStyle = '#000000'
  context.fillText(char, width / 2, height / 2)

  const pixels = context.getImageData(0, 0, width, height).data
  let darkness = 0

  for (let index = 0; index < pixels.length; index += 4) {
    darkness += 1 - (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 765
  }

  return {
    char,
    density: darkness / (width * height),
  }
}
