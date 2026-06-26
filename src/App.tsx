import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Check,
  Clipboard,
  Download,
  FileText,
  Image as ImageIcon,
  RotateCcw,
  Upload,
} from 'lucide-react'
import {
  ASCII_LIMITS,
  CHARACTER_SETS,
  DEFAULT_SETTINGS,
  FONT_OPTIONS,
  type AsciiSettings,
  type PreviewMode,
  type RenderMetrics,
  type SourceImage,
  type WorkerRequest,
  type WorkerResult,
} from './lib/types'
import { downloadPng, downloadText, copyAscii, drawAsciiPreview } from './lib/export'
import { getFontFamily, measureGlyphs } from './lib/glyphs'
import {
  createReducedImageData,
  disposeSourceImage,
  loadImageFile,
  pickImageFileFromPaste,
} from './lib/image'

type Stats = {
  columns: number
  rows: number
  elapsedMs: number
}

export function App() {
  const [source, setSource] = useState<SourceImage | null>(null)
  const [settings, setSettings] = useState<AsciiSettings>(DEFAULT_SETTINGS)
  const [ascii, setAscii] = useState('')
  const [metrics, setMetrics] = useState<RenderMetrics | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [completedConversionKey, setCompletedConversionKey] = useState('')
  const [activeMode, setActiveMode] = useState<PreviewMode>('text')
  const [isDragging, setIsDragging] = useState(false)
  const [isWorking, setIsWorking] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const imageCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const jobIdRef = useRef(0)
  const loadJobIdRef = useRef(0)
  const mountedRef = useRef(false)
  const currentConversionKeyRef = useRef('')
  const pendingJobKeysRef = useRef(new Map<number, string>())
  const currentConversionKey = getConversionKey(source, settings)

  currentConversionKeyRef.current = currentConversionKey

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
      loadJobIdRef.current += 1
      jobIdRef.current += 1
    }
  }, [])

  useEffect(() => {
    let disposed = false

    function clearOutput() {
      setAscii('')
      setMetrics(null)
      setStats(null)
      setCompletedConversionKey('')
    }

    function handleWorkerFailure(message: string) {
      if (disposed) {
        return
      }

      jobIdRef.current += 1
      pendingJobKeysRef.current.clear()
      clearOutput()
      setError(message)
      setIsWorking(false)

      const failedWorker = workerRef.current

      workerRef.current = null
      failedWorker?.terminate()
      attachWorker()
    }

    function attachWorker(): Worker {
      const worker = new Worker(new URL('./workers/asciiWorker.ts', import.meta.url), {
        type: 'module',
      })

      worker.onmessage = (event: MessageEvent<WorkerResult>) => {
        const result = event.data

        const resultKey = pendingJobKeysRef.current.get(result.id)

        pendingJobKeysRef.current.delete(result.id)

        if (
          disposed ||
          result.id !== jobIdRef.current ||
          resultKey !== currentConversionKeyRef.current
        ) {
          return
        }

        if (result.error !== undefined) {
          clearOutput()
          setError(result.error)
          setIsWorking(false)
          return
        }

        setAscii(result.ascii)
        setStats({
          columns: result.columns,
          rows: result.rows,
          elapsedMs: result.elapsedMs,
        })
        setCompletedConversionKey(resultKey)
        setIsWorking(false)
      }

      worker.onerror = (event) => {
        event.preventDefault()
        handleWorkerFailure(event.message || 'ASCII worker failed.')
      }

      worker.onmessageerror = () => {
        handleWorkerFailure('ASCII worker could not read the conversion message.')
      }

      workerRef.current = worker
      return worker
    }

    attachWorker()

    return () => {
      disposed = true
      workerRef.current?.terminate()
      workerRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      if (source) {
        disposeSourceImage(source)
      }
    }
  }, [source])

  const handleFile = useCallback(async (file: File) => {
    const loadJobId = loadJobIdRef.current + 1

    loadJobIdRef.current = loadJobId
    jobIdRef.current += 1
    pendingJobKeysRef.current.clear()
    setAscii('')
    setMetrics(null)
    setStats(null)
    setCompletedConversionKey('')
    setError('')
    setIsWorking(true)

    try {
      const loaded = await loadImageFile(file)

      if (!mountedRef.current || loadJobId !== loadJobIdRef.current) {
        disposeSourceImage(loaded)
        return
      }

      setSource(loaded)
      setActiveMode('text')
    } catch (caught) {
      if (!mountedRef.current || loadJobId !== loadJobIdRef.current) {
        return
      }

      setError(caught instanceof Error ? caught.message : 'Image loading failed.')
      setIsWorking(false)
    }
  }, [])

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const file = pickImageFileFromPaste(event)

      if (file) {
        void handleFile(file)
      }
    }

    window.addEventListener('paste', handlePaste)

    return () => window.removeEventListener('paste', handlePaste)
  }, [handleFile])

  useEffect(() => {
    if (!source) {
      setAscii('')
      setMetrics(null)
      setStats(null)
      setCompletedConversionKey('')
      setIsWorking(false)
      return
    }

    const jobId = jobIdRef.current + 1
    let cancelled = false

    jobIdRef.current = jobId
    pendingJobKeysRef.current.clear()
    pendingJobKeysRef.current.set(jobId, currentConversionKey)
    setAscii('')
    setMetrics(null)
    setStats(null)
    setCompletedConversionKey('')
    setIsWorking(true)
    setError('')

    const timeoutId = window.setTimeout(async () => {
      try {
        if (!workerRef.current) {
          throw new Error('Worker is not available.')
        }

        const measured = await measureGlyphs(settings, settings.width, source.width, source.height)

        if (cancelled) {
          return
        }

        const imageData = createReducedImageData(source, measured.metrics)
        const request: WorkerRequest = {
          id: jobId,
          image: {
            data: imageData.data,
            width: imageData.width,
            height: imageData.height,
          },
          glyphs: measured.glyphs,
          settings: {
            brightness: settings.brightness,
            contrast: settings.contrast,
            gamma: settings.gamma,
            invert: settings.invert,
            dither: settings.dither,
            edge: settings.edge,
          },
        }

        if (
          jobId === jobIdRef.current &&
          pendingJobKeysRef.current.get(jobId) === currentConversionKeyRef.current
        ) {
          setMetrics(measured.metrics)
          workerRef.current.postMessage(request, [imageData.data.buffer])
        }
      } catch (caught) {
        if (!cancelled && jobId === jobIdRef.current) {
          setError(caught instanceof Error ? caught.message : 'ASCII conversion failed.')
          setIsWorking(false)
        }
      }
    }, 220)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [
    settings.brightness,
    settings.charsetKey,
    settings.contrast,
    settings.dither,
    settings.edge,
    settings.fontKey,
    settings.gamma,
    settings.invert,
    settings.lineHeight,
    settings.useSpaces,
    settings.width,
    source,
    currentConversionKey,
  ])

  useEffect(() => {
    const canvas = imageCanvasRef.current

    if (activeMode !== 'image' || !canvas) {
      return
    }

    if (!ascii) {
      const context = canvas.getContext('2d')

      if (!context) {
        return
      }

      context.clearRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = settings.background
      context.fillRect(0, 0, canvas.width, canvas.height)
      return
    }

    drawAsciiPreview(canvas, ascii, settings, metrics)
  }, [activeMode, ascii, metrics, settings])

  const updateSetting = <Key extends keyof AsciiSettings>(
    key: Key,
    value: AsciiSettings[Key],
  ) => {
    setSettings((current) => ({ ...current, [key]: value }))
  }

  const handleCopy = async () => {
    if (!canExport) {
      return
    }

    try {
      await copyAscii(ascii)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      setError('Clipboard access was blocked by the browser.')
    }
  }

  const handleDownloadPng = async () => {
    if (!canExport) {
      return
    }

    try {
      await downloadPng(ascii, settings, metrics, baseName)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'PNG export failed.')
    }
  }

  const baseName = source?.name ?? 'ascii-art'
  const fontFamily = getFontFamily(settings.fontKey)
  const canExport =
    ascii.length > 0 &&
    !isWorking &&
    Boolean(stats) &&
    Boolean(metrics) &&
    completedConversionKey === currentConversionKey

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">AA</div>
          <div>
            <h1>ASCII Art Studio</h1>
            <p>Local image-to-text conversion with tunable output.</p>
          </div>
        </div>
        <div className="toolbar-actions">
          <button
            className="tool-button"
            type="button"
            title="Copy ASCII text"
            disabled={!canExport}
            onClick={handleCopy}
          >
            {copied ? <Check size={18} /> : <Clipboard size={18} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
          <button
            className="tool-button"
            type="button"
            title="Download TXT"
            disabled={!canExport}
            onClick={() => downloadText(ascii, baseName)}
          >
            <FileText size={18} />
            <span>TXT</span>
          </button>
          <button
            className="tool-button primary"
            type="button"
            title="Download PNG"
            disabled={!canExport}
            onClick={() => void handleDownloadPng()}
          >
            <Download size={18} />
            <span>PNG</span>
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="inspector" aria-label="Conversion controls">
          <section className="panel upload-panel">
            <button
              className={`drop-zone ${isDragging ? 'dragging' : ''}`}
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault()
                setIsDragging(true)
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => {
                event.preventDefault()
                setIsDragging(false)
                const file = event.dataTransfer.files[0]

                if (file) {
                  void handleFile(file)
                }
              }}
            >
              <Upload size={22} />
              <strong>{source ? source.name : 'Drop image here'}</strong>
              <span>Click, paste, or drag an image file.</span>
            </button>
            <input
              ref={fileInputRef}
              className="visually-hidden"
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0]

                if (file) {
                  void handleFile(file)
                }

                event.currentTarget.value = ''
              }}
            />
            {source ? (
              <div className="source-meta">
                <img src={source.url} alt="" />
                <div>
                  <span>{source.width} x {source.height}px</span>
                  <span>{stats ? `${stats.columns} x ${stats.rows} chars` : 'Waiting'}</span>
                </div>
              </div>
            ) : null}
          </section>

          <section className="panel">
            <div className="panel-heading">
              <h2>Output</h2>
              <button
                className="icon-button"
                type="button"
                title="Reset settings"
                onClick={() => setSettings(DEFAULT_SETTINGS)}
              >
                <RotateCcw size={17} />
              </button>
            </div>
            <SliderControl
              label="Width"
              min={ASCII_LIMITS.minColumns}
              max={ASCII_LIMITS.maxColumns}
              step={1}
              value={settings.width}
              suffix=" chars"
              onChange={(value) => updateSetting('width', value)}
            />
            <label className="field">
              <span>Font</span>
              <select
                value={settings.fontKey}
                onChange={(event) =>
                  updateSetting('fontKey', event.target.value as AsciiSettings['fontKey'])
                }
              >
                {FONT_OPTIONS.map((font) => (
                  <option key={font.key} value={font.key}>
                    {font.label}
                  </option>
                ))}
              </select>
              <small>{FONT_OPTIONS.find((font) => font.key === settings.fontKey)?.note}</small>
            </label>
            <label className="field">
              <span>Character set</span>
              <select
                value={settings.charsetKey}
                onChange={(event) =>
                  updateSetting(
                    'charsetKey',
                    event.target.value as AsciiSettings['charsetKey'],
                  )
                }
              >
                {CHARACTER_SETS.map((charset) => (
                  <option key={charset.key} value={charset.key}>
                    {charset.label}
                  </option>
                ))}
              </select>
              <small>
                {
                  CHARACTER_SETS.find((charset) => charset.key === settings.charsetKey)
                    ?.note
                }
              </small>
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={settings.useSpaces}
                onChange={(event) => updateSetting('useSpaces', event.target.checked)}
              />
              <span>Allow spaces for clean highlights</span>
            </label>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <h2>Tone</h2>
            </div>
            <SliderControl
              label="Brightness"
              min={-60}
              max={60}
              step={1}
              value={settings.brightness}
              onChange={(value) => updateSetting('brightness', value)}
            />
            <SliderControl
              label="Contrast"
              min={-60}
              max={60}
              step={1}
              value={settings.contrast}
              onChange={(value) => updateSetting('contrast', value)}
            />
            <SliderControl
              label="Gamma"
              min={0.55}
              max={2}
              step={0.05}
              value={settings.gamma}
              onChange={(value) => updateSetting('gamma', value)}
            />
            <label className="check-row">
              <input
                type="checkbox"
                checked={settings.invert}
                onChange={(event) => updateSetting('invert', event.target.checked)}
              />
              <span>Invert luminance</span>
            </label>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <h2>Detail</h2>
            </div>
            <label className="field">
              <span>Dither</span>
              <select
                value={settings.dither}
                onChange={(event) =>
                  updateSetting('dither', event.target.value as AsciiSettings['dither'])
                }
              >
                <option value="none">None</option>
                <option value="ordered">Ordered</option>
                <option value="floyd">Floyd-Steinberg</option>
              </select>
            </label>
            <label className="field">
              <span>Edge</span>
              <select
                value={settings.edge}
                onChange={(event) =>
                  updateSetting('edge', event.target.value as AsciiSettings['edge'])
                }
              >
                <option value="off">Off</option>
                <option value="weak">Weak</option>
                <option value="strong">Strong</option>
              </select>
            </label>
            <SliderControl
              label="Line height"
              min={0.9}
              max={1.35}
              step={0.01}
              value={settings.lineHeight}
              onChange={(value) => updateSetting('lineHeight', value)}
            />
            <div className="color-grid">
              <label className="field">
                <span>Text</span>
                <input
                  type="color"
                  value={settings.foreground}
                  onChange={(event) => updateSetting('foreground', event.target.value)}
                />
              </label>
              <label className="field">
                <span>Background</span>
                <input
                  type="color"
                  value={settings.background}
                  onChange={(event) => updateSetting('background', event.target.value)}
                />
              </label>
            </div>
          </section>
        </aside>

        <section className="preview-panel">
          <div className="preview-header">
            <div>
              <h2>Preview</h2>
              <p>
                {isWorking
                  ? 'Rendering...'
                  : stats
                    ? `${stats.columns} columns, ${stats.rows} rows, ${stats.elapsedMs.toFixed(1)}ms`
                    : 'Open an image to begin.'}
              </p>
            </div>
            <div className="tabs" role="tablist" aria-label="Preview mode">
              <TabButton
                active={activeMode === 'text'}
                label="Text"
                onClick={() => setActiveMode('text')}
              >
                <FileText size={17} />
              </TabButton>
              <TabButton
                active={activeMode === 'image'}
                label="Image"
                onClick={() => setActiveMode('image')}
              >
                <ImageIcon size={17} />
              </TabButton>
              <TabButton
                active={activeMode === 'compare'}
                label="Compare"
                onClick={() => setActiveMode('compare')}
              >
                <ImageIcon size={17} />
              </TabButton>
            </div>
          </div>

          {error ? <div className="error-message">{error}</div> : null}

          <div className="preview-body">
            {!source ? (
              <div className="empty-state">
                <Upload size={32} />
                <strong>No image loaded</strong>
                <span>Use the left panel, drag a file, or paste an image.</span>
              </div>
            ) : null}

            {source && activeMode === 'text' ? (
              <pre
                className="ascii-text"
                style={{
                  backgroundColor: settings.background,
                  color: settings.foreground,
                  fontFamily,
                  lineHeight: settings.lineHeight,
                }}
              >
                {ascii}
              </pre>
            ) : null}

            {source && activeMode === 'image' ? (
              <div className="canvas-wrap">
                <canvas ref={imageCanvasRef} aria-label="ASCII image preview" />
              </div>
            ) : null}

            {source && activeMode === 'compare' ? (
              <div className="compare-grid">
                <div className="compare-source">
                  <img src={source.url} alt="" />
                </div>
                <pre
                  className="ascii-text compact"
                  style={{
                    backgroundColor: settings.background,
                    color: settings.foreground,
                    fontFamily,
                    lineHeight: settings.lineHeight,
                  }}
                >
                  {ascii}
                </pre>
              </div>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  )
}

function getConversionKey(source: SourceImage | null, settings: AsciiSettings): string {
  if (!source) {
    return ''
  }

  return JSON.stringify({
    source: source.url,
    width: settings.width,
    brightness: settings.brightness,
    contrast: settings.contrast,
    gamma: settings.gamma,
    invert: settings.invert,
    useSpaces: settings.useSpaces,
    charsetKey: settings.charsetKey,
    fontKey: settings.fontKey,
    dither: settings.dither,
    edge: settings.edge,
    lineHeight: settings.lineHeight,
  })
}

type SliderControlProps = {
  label: string
  min: number
  max: number
  step: number
  value: number
  suffix?: string
  onChange: (value: number) => void
}

function SliderControl({
  label,
  min,
  max,
  step,
  value,
  suffix = '',
  onChange,
}: SliderControlProps) {
  return (
    <label className="slider-control">
      <span>
        <span>{label}</span>
        <output>{Number.isInteger(value) ? value : value.toFixed(2)}{suffix}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

type TabButtonProps = {
  active: boolean
  label: string
  children: ReactNode
  onClick: () => void
}

function TabButton({ active, label, children, onClick }: TabButtonProps) {
  return (
    <button
      className={`tab-button ${active ? 'active' : ''}`}
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
    >
      {children}
      <span>{label}</span>
    </button>
  )
}
