export type FontKey = 'consolas' | 'ms-gothic' | 'noto'
export type CharsetKey = 'classic' | 'detailed' | 'minimal'
export type DitherMode = 'none' | 'ordered' | 'floyd'
export type EdgeMode = 'off' | 'weak' | 'strong'
export type PreviewMode = 'text' | 'image' | 'compare'

export type FontOption = {
  key: FontKey
  label: string
  stack: string
  note: string
}

export type CharsetOption = {
  key: CharsetKey
  label: string
  chars: string
  note: string
}

export type AsciiSettings = {
  width: number
  brightness: number
  contrast: number
  gamma: number
  invert: boolean
  useSpaces: boolean
  charsetKey: CharsetKey
  fontKey: FontKey
  dither: DitherMode
  edge: EdgeMode
  foreground: string
  background: string
  lineHeight: number
}

export type SourceImage = {
  drawable: CanvasImageSource
  url: string
  name: string
  width: number
  height: number
  cleanup?: () => void
}

export type GlyphMetric = {
  char: string
  density: number
}

export type RenderMetrics = {
  fontFamily: string
  fontSize: number
  charWidth: number
  lineHeightPx: number
  columns: number
  rows: number
}

export type WorkerImage = {
  data: Uint8ClampedArray
  width: number
  height: number
}

export type WorkerRequest = {
  id: number
  image: WorkerImage
  glyphs: GlyphMetric[]
  settings: Pick<
    AsciiSettings,
    'brightness' | 'contrast' | 'gamma' | 'invert' | 'dither' | 'edge'
  >
}

export type WorkerSuccessResult = {
  id: number
  ascii: string
  rows: number
  columns: number
  elapsedMs: number
  error?: undefined
}

export type WorkerErrorResult = {
  id: number
  error: string
}

export type WorkerResult = WorkerSuccessResult | WorkerErrorResult

export const ASCII_LIMITS = {
  minColumns: 50,
  maxColumns: 400,
  maxRows: 900,
  maxCells: 240_000,
  maxPngSide: 32_000,
  maxPngPixels: 64_000_000,
} as const

export const FONT_OPTIONS: FontOption[] = [
  {
    key: 'consolas',
    label: 'Consolas',
    stack: 'Consolas, "Courier New", monospace',
    note: 'Sharp default for pure ASCII output.',
  },
  {
    key: 'ms-gothic',
    label: 'MS Gothic',
    stack: '"MS Gothic", "Yu Gothic Mono", "Courier New", monospace',
    note: 'Windows AA compatibility mode.',
  },
  {
    key: 'noto',
    label: 'Noto Sans Mono',
    stack: '"Noto Sans Mono", Consolas, monospace',
    note: 'Bundled fallback for stable sharing.',
  },
]

export const CHARACTER_SETS: CharsetOption[] = [
  {
    key: 'classic',
    label: 'Classic',
    chars: ' .:-=+*#%@',
    note: 'Small, readable, and predictable.',
  },
  {
    key: 'detailed',
    label: 'Detailed',
    chars:
      ' .\'`^",:;Il!i~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$',
    note: 'Best for photos and soft gradients.',
  },
  {
    key: 'minimal',
    label: 'Minimal',
    chars: ' .-+#@',
    note: 'High contrast output for small sizes.',
  },
]

export const DEFAULT_SETTINGS: AsciiSettings = {
  width: 140,
  brightness: 0,
  contrast: 18,
  gamma: 1,
  invert: false,
  useSpaces: true,
  charsetKey: 'classic',
  fontKey: 'consolas',
  dither: 'none',
  edge: 'weak',
  foreground: '#111827',
  background: '#ffffff',
  lineHeight: 1.08,
}
