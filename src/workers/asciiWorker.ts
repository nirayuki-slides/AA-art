/// <reference lib="webworker" />

import { ASCII_LIMITS, type GlyphMetric, type WorkerRequest, type WorkerResult } from '../lib/types'

const ctx: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const startedAt = performance.now()
  const request = event.data
  const id = typeof request?.id === 'number' ? request.id : -1

  try {
    const { image, glyphs, settings } = request

    validateRequest(image.width, image.height, glyphs)

    const luminance = toLuminance(image.data, settings)
    const edgeBoost = createEdgeBoost(luminance, image.width, image.height, settings.edge)
    const density = new Float32Array(luminance.length)

    for (let index = 0; index < luminance.length; index += 1) {
      density[index] = clamp01(1 - luminance[index] + edgeBoost[index])
    }

    const ascii =
      settings.dither === 'floyd'
        ? renderFloydSteinberg(density, image.width, image.height, glyphs)
        : renderDirect(density, image.width, image.height, glyphs, settings.dither)
    const result: WorkerResult = {
      id,
      ascii,
      columns: image.width,
      rows: image.height,
      elapsedMs: performance.now() - startedAt,
    }

    ctx.postMessage(result)
  } catch (caught) {
    const result: WorkerResult = {
      id,
      error: caught instanceof Error ? caught.message : 'ASCII conversion failed.',
    }

    ctx.postMessage(result)
  }
}

function validateRequest(width: number, height: number, glyphs: GlyphMetric[]): void {
  if (glyphs.length === 0) {
    throw new Error('No glyphs are available for conversion.')
  }

  if (
    width < 1 ||
    height < 1 ||
    width > ASCII_LIMITS.maxColumns ||
    height > ASCII_LIMITS.maxRows ||
    width * height > ASCII_LIMITS.maxCells
  ) {
    throw new Error('The requested output is too large. Reduce width or use a less extreme image.')
  }
}

function toLuminance(
  data: Uint8ClampedArray,
  settings: WorkerRequest['settings'],
): Float32Array {
  const luminance = new Float32Array(data.length / 4)
  const contrastValue = settings.contrast * 2.55
  const contrastFactor =
    (259 * (contrastValue + 255)) / (255 * (259 - contrastValue))

  for (let dataIndex = 0, pixelIndex = 0; dataIndex < data.length; dataIndex += 4) {
    const red = data[dataIndex] / 255
    const green = data[dataIndex + 1] / 255
    const blue = data[dataIndex + 2] / 255
    let value = 0.2126 * red + 0.7152 * green + 0.0722 * blue

    value = ((value * 255 - 128) * contrastFactor + 128) / 255
    value += settings.brightness / 100
    value = clamp01(value)
    value = Math.pow(value, 1 / settings.gamma)

    if (settings.invert) {
      value = 1 - value
    }

    luminance[pixelIndex] = clamp01(value)
    pixelIndex += 1
  }

  return luminance
}

function createEdgeBoost(
  luminance: Float32Array,
  width: number,
  height: number,
  edgeMode: WorkerRequest['settings']['edge'],
): Float32Array {
  const boost = new Float32Array(luminance.length)

  if (edgeMode === 'off' || width < 3 || height < 3) {
    return boost
  }

  const strength = edgeMode === 'strong' ? 0.38 : 0.2

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const topLeft = luminance[(y - 1) * width + x - 1]
      const top = luminance[(y - 1) * width + x]
      const topRight = luminance[(y - 1) * width + x + 1]
      const left = luminance[y * width + x - 1]
      const right = luminance[y * width + x + 1]
      const bottomLeft = luminance[(y + 1) * width + x - 1]
      const bottom = luminance[(y + 1) * width + x]
      const bottomRight = luminance[(y + 1) * width + x + 1]
      const gradientX = -topLeft - 2 * left - bottomLeft + topRight + 2 * right + bottomRight
      const gradientY = -topLeft - 2 * top - topRight + bottomLeft + 2 * bottom + bottomRight

      boost[y * width + x] = Math.min(1, Math.hypot(gradientX, gradientY)) * strength
    }
  }

  return boost
}

function renderDirect(
  density: Float32Array,
  width: number,
  height: number,
  glyphs: GlyphMetric[],
  dither: WorkerRequest['settings']['dither'],
): string {
  const matrix = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
  const lines: string[] = []

  for (let y = 0; y < height; y += 1) {
    let line = ''

    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      const orderedOffset =
        dither === 'ordered' ? ((matrix[(y % 4) * 4 + (x % 4)] - 7.5) / 16) * 0.16 : 0

      line += pickGlyph(clamp01(density[index] + orderedOffset), glyphs).char
    }

    lines.push(line)
  }

  return lines.join('\n')
}

function renderFloydSteinberg(
  density: Float32Array,
  width: number,
  height: number,
  glyphs: GlyphMetric[],
): string {
  const working = new Float32Array(density)
  const lines: string[] = []

  for (let y = 0; y < height; y += 1) {
    let line = ''

    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      const target = clamp01(working[index])
      const glyph = pickGlyph(target, glyphs)
      const error = target - glyph.density

      line += glyph.char
      distributeError(working, width, height, x + 1, y, error * (7 / 16))
      distributeError(working, width, height, x - 1, y + 1, error * (3 / 16))
      distributeError(working, width, height, x, y + 1, error * (5 / 16))
      distributeError(working, width, height, x + 1, y + 1, error * (1 / 16))
    }

    lines.push(line)
  }

  return lines.join('\n')
}

function distributeError(
  density: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
  error: number,
): void {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return
  }

  density[y * width + x] += error
}

function pickGlyph(targetDensity: number, glyphs: GlyphMetric[]): GlyphMetric {
  let bestGlyph = glyphs[0]
  let bestDistance = Number.POSITIVE_INFINITY

  for (const glyph of glyphs) {
    const distance = Math.abs(glyph.density - targetDensity)

    if (distance < bestDistance) {
      bestDistance = distance
      bestGlyph = glyph
    }
  }

  return bestGlyph
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}
