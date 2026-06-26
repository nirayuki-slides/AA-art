import { ASCII_LIMITS, type AsciiSettings, type RenderMetrics } from './types'

export async function copyAscii(ascii: string): Promise<void> {
  await navigator.clipboard.writeText(ascii)
}

export function downloadText(ascii: string, baseName: string): void {
  const blob = new Blob([ascii], { type: 'text/plain;charset=utf-8' })
  downloadBlob(blob, `${baseName || 'ascii-art'}.txt`)
}

export function downloadPng(
  ascii: string,
  settings: AsciiSettings,
  metrics: RenderMetrics | null,
  baseName: string,
): Promise<void> {
  const canvas = renderAsciiToCanvas(ascii, settings, metrics, 2)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('PNG export failed.'))
        return
      }

      downloadBlob(blob, `${baseName || 'ascii-art'}.png`)
      resolve()
    }, 'image/png')
  })
}

export function drawAsciiPreview(
  canvas: HTMLCanvasElement,
  ascii: string,
  settings: AsciiSettings,
  metrics: RenderMetrics | null,
): void {
  const rendered = renderAsciiToCanvas(ascii, settings, metrics, 1)
  const context = canvas.getContext('2d')

  if (!context) {
    return
  }

  canvas.width = rendered.width
  canvas.height = rendered.height
  context.drawImage(rendered, 0, 0)
}

function renderAsciiToCanvas(
  ascii: string,
  settings: AsciiSettings,
  metrics: RenderMetrics | null,
  scale: number,
): HTMLCanvasElement {
  const lines = ascii.length > 0 ? ascii.split('\n') : ['']
  const fontSize = 14
  const lineHeight = fontSize * settings.lineHeight
  const fontFamily = metrics?.fontFamily ?? 'Consolas, "Courier New", monospace'
  const measurement = document.createElement('canvas')
  const measurementContext = measurement.getContext('2d')

  if (!measurementContext) {
    throw new Error('Canvas is not available in this browser.')
  }

  measurementContext.font = `${fontSize}px ${fontFamily}`
  const charWidth = Math.max(1, measurementContext.measureText('M').width)
  const columns = Math.max(...lines.map((line) => line.length), 1)
  const padding = 18
  const width = Math.ceil(columns * charWidth + padding * 2)
  const height = Math.ceil(lines.length * lineHeight + padding * 2)
  const scaledWidth = Math.ceil(width * scale)
  const scaledHeight = Math.ceil(height * scale)

  if (
    scaledWidth > ASCII_LIMITS.maxPngSide ||
    scaledHeight > ASCII_LIMITS.maxPngSide ||
    scaledWidth * scaledHeight > ASCII_LIMITS.maxPngPixels
  ) {
    throw new Error('PNG export is too large. Reduce width or line height.')
  }

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Canvas is not available in this browser.')
  }

  canvas.width = scaledWidth
  canvas.height = scaledHeight
  context.scale(scale, scale)
  context.fillStyle = settings.background
  context.fillRect(0, 0, width, height)
  context.font = `${fontSize}px ${fontFamily}`
  context.textBaseline = 'top'
  context.fillStyle = settings.foreground

  lines.forEach((line, index) => {
    context.fillText(line, padding, padding + index * lineHeight)
  })

  return canvas
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
