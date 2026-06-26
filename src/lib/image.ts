import { ASCII_LIMITS, type RenderMetrics, type SourceImage } from './types'

export async function loadImageFile(file: File): Promise<SourceImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file.')
  }

  const url = URL.createObjectURL(file)

  try {
    const decoded = await decodeDrawable(file, url)

    return {
      drawable: decoded.drawable,
      url,
      name: file.name.replace(/\.[^.]+$/, '') || 'ascii-art',
      width: decoded.width,
      height: decoded.height,
      cleanup: decoded.cleanup,
    }
  } catch (caught) {
    URL.revokeObjectURL(url)
    throw caught
  }
}

export function disposeSourceImage(source: SourceImage): void {
  URL.revokeObjectURL(source.url)
  source.cleanup?.()
}

async function decodeDrawable(
  file: File,
  url: string,
): Promise<{
  drawable: CanvasImageSource
  width: number
  height: number
  cleanup?: () => void
}> {
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })

      return {
        drawable: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      }
    } catch {
      // Fall back to HTMLImageElement decoding below.
    }
  }

  const image = await loadHtmlImage(url)

  return {
    drawable: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
  }
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()

    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Image loading failed.'))
    image.src = url
  })
}

export function createReducedImageData(
  source: SourceImage,
  metrics: RenderMetrics,
): ImageData {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })

  if (!context) {
    throw new Error('Canvas is not available in this browser.')
  }

  if (
    metrics.columns > ASCII_LIMITS.maxColumns ||
    metrics.rows > ASCII_LIMITS.maxRows ||
    metrics.columns * metrics.rows > ASCII_LIMITS.maxCells
  ) {
    throw new Error('The requested output is too large. Reduce width or use a less extreme image.')
  }

  canvas.width = metrics.columns
  canvas.height = metrics.rows
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(source.drawable, 0, 0, canvas.width, canvas.height)

  return context.getImageData(0, 0, canvas.width, canvas.height)
}

export function pickImageFileFromPaste(event: ClipboardEvent): File | null {
  const items = Array.from(event.clipboardData?.items ?? [])
  const imageItem = items.find((item) => item.type.startsWith('image/'))

  return imageItem?.getAsFile() ?? null
}
