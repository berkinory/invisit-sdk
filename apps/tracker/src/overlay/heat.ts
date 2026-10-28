export interface HeatPoint {
  readonly x: number
  readonly y: number
  readonly weight: number
}

const RADIUS = 22
const MAX_DPR = 2
// Device-pixel budgets keep canvas memory (4 B/px) and the per-pixel colorize
// pass bounded; beyond them the document canvas degrades to a viewport one.
const DOCUMENT_BUDGET = 6_000_000
const VIEWPORT_BUDGET = 1_600_000
const MIN_DOCUMENT_SCALE = 0.5
const MAX_SIDE = 16_384

const STOPS: [number, string][] = [
  [0, 'rgba(58,51,232,0)'],
  [0.18, 'rgba(58,51,232,.55)'],
  [0.42, 'rgba(34,190,238,.72)'],
  [0.66, 'rgba(250,214,60,.84)'],
  [0.86, 'rgba(249,115,22,.9)'],
  [1, 'rgba(239,52,68,.94)'],
]

function palette(doc: Document): Uint8ClampedArray {
  const canvas = doc.createElement('canvas')
  canvas.width = 256
  canvas.height = 1
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createLinearGradient(0, 0, 256, 0)
  for (const [offset, color] of STOPS) gradient.addColorStop(offset, color)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 256, 1)
  return ctx.getImageData(0, 0, 256, 1).data
}

function sprite(doc: Document, radius: number): HTMLCanvasElement {
  const canvas = doc.createElement('canvas')
  const size = Math.max(2, Math.ceil(radius * 2))
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(0,0,0,1)')
  gradient.addColorStop(0.45, 'rgba(0,0,0,.55)')
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  return canvas
}

export function createHeat(win: Window) {
  const doc = win.document
  const canvas = doc.createElement('canvas')
  canvas.className = 'layer'
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const colors = palette(doc)
  let stamp: HTMLCanvasElement | null = null
  let stampScale = 0
  let fixed = false

  return {
    canvas,
    get fixed(): boolean {
      return fixed
    },

    // Points are in document coordinates (CSS px); width/height is the document size.
    draw(points: readonly HeatPoint[], width: number, height: number): void {
      if (!ctx) return
      const dpr = Math.min(MAX_DPR, win.devicePixelRatio || 1)
      const documentScale = Math.min(dpr, Math.sqrt(DOCUMENT_BUDGET / Math.max(1, width * height)))
      fixed =
        documentScale < MIN_DOCUMENT_SCALE ||
        width * documentScale > MAX_SIDE ||
        height * documentScale > MAX_SIDE
      const [w, h, left, top] = fixed
        ? [win.innerWidth, win.innerHeight, win.scrollX, win.scrollY]
        : [width, height, 0, 0]
      const scale = fixed
        ? Math.min(dpr, Math.sqrt(VIEWPORT_BUDGET / Math.max(1, w * h)))
        : documentScale
      const [cw, ch] = [Math.max(1, Math.ceil(w * scale)), Math.max(1, Math.ceil(h * scale))]

      canvas.classList.toggle('fixed', fixed)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw
        canvas.height = ch
      } else ctx.clearRect(0, 0, cw, ch)
      if (points.length === 0) return

      if (!stamp || stampScale !== scale) {
        stamp = sprite(doc, RADIUS * scale)
        stampScale = scale
      }
      const half = stamp.width / 2
      for (const point of points) {
        const x = (point.x - left) * scale
        const y = (point.y - top) * scale
        if (x < -half || y < -half || x > cw + half || y > ch + half) continue
        ctx.globalAlpha = point.weight
        ctx.drawImage(stamp, x - half, y - half)
      }
      ctx.globalAlpha = 1

      const image = ctx.getImageData(0, 0, cw, ch)
      const pixels = image.data
      let peak = 0
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i]! > peak) peak = pixels[i]!
      // sqrt keeps quieter elements visible next to one hot button.
      const stretch = peak > 0 ? 1 / peak : 0
      for (let i = 3; i < pixels.length; i += 4) {
        const alpha = pixels[i]!
        if (alpha === 0) continue
        const at = Math.min(255, Math.round(Math.sqrt(alpha * stretch) * 255)) * 4
        pixels[i - 3] = colors[at]!
        pixels[i - 2] = colors[at + 1]!
        pixels[i - 1] = colors[at + 2]!
        pixels[i] = colors[at + 3]!
      }
      ctx.putImageData(image, 0, 0)
    },
  }
}
