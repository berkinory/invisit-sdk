import { selectorOf } from './selector.ts'
import type { ClickPoint } from './types.ts'

const GRID = 32
const MAX_CLICKS = 50
const WINDOW_MS = 1_000
const RAGE_RADIUS = 30
const RAGE_COUNT = 3
const INTERACTIVE =
  'a[href],button,[role=button],[role=link],[role=tab],[role=menuitem],summary,label,' +
  'input[type=submit],input[type=button],input[type=checkbox],input[type=radio]'
// The browser answers these itself (navigation, native submit), which can take
// longer than the dead-click window without touching the DOM.
const NATIVE = 'a[href],form [type=submit],form button:not([type])'
// Focus moves are left out: the next click's own mousedown blurs the last target.
const DOCUMENT_RESPONSES = ['change', 'input', 'submit']
const WINDOW_RESPONSES = ['hashchange', 'scroll']

type Point = { -readonly [K in keyof ClickPoint]: ClickPoint[K] }

interface Pending {
  readonly point: Point
  readonly at: number
  readonly event: MouseEvent
  readonly native: boolean
}

export function createInteractions(
  win: Window & typeof globalThis,
  pageUrl?: (href: string) => string,
) {
  const doc = win.document
  let points: Point[] = []
  let recent: [at: number, x: number, y: number][] = []
  let pending: Pending[] = []
  let timer = 0
  let running = false

  const watch = (on: boolean): void => {
    for (const type of DOCUMENT_RESPONSES) {
      if (on) doc.addEventListener(type, respond, true)
      else doc.removeEventListener(type, respond, true)
    }
    for (const type of WINDOW_RESPONSES) {
      if (on) win.addEventListener(type, respond, true)
      else win.removeEventListener(type, respond, true)
    }
    // The window itself losing focus means a new tab, download or dialog opened.
    if (on) win.addEventListener('blur', respond)
    else win.removeEventListener('blur', respond)
    if (on) {
      observer.observe(doc, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      })
    } else observer.disconnect()
  }

  // Any visible reaction clears every pending click: it is cheap and errs
  // toward under-reporting dead clicks rather than inventing them.
  const respond = (): void => {
    if (pending.length === 0) return
    pending = []
    win.clearTimeout(timer)
    watch(false)
  }
  const observer = new win.MutationObserver(respond)

  const expire = (): void => {
    const now = win.performance.now()
    pending = pending.filter((entry) => {
      if (now - entry.at < WINDOW_MS) return true
      if (!entry.native || entry.event.defaultPrevented) entry.point.dead = true
      return false
    })
    const next = pending[0]
    if (next) timer = win.setTimeout(expire, WINDOW_MS - (now - next.at))
    else watch(false)
  }

  const cell = (offset: number, size: number): number =>
    Math.min(GRID - 1, Math.max(0, Math.floor((offset / size) * GRID)))

  const onClick = (event: MouseEvent): void => {
    if (!event.isTrusted || event.detail === 0 || points.length >= MAX_CLICKS) return
    // A heatmap is drawn over the page opened at its recorded address. One that pageUrl rewrote
    // beyond its query, such as a route template, opens no page to draw on.
    const { href } = win.location
    if (pageUrl && pageUrl(href).split(/[?#]/)[0] !== href.split(/[?#]/)[0]) return
    const origin = event.target as Element | null
    if (origin?.nodeType !== 1 || origin.closest('invisit-overlay,invisit-feedback')) return
    const target = origin.closest('svg') ?? origin
    const rect = target.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const selector = selectorOf(target, doc)
    if (!selector) return

    const { clientX, clientY } = event
    const point: Point = {
      selector,
      x: cell(clientX - rect.left, rect.width),
      y: cell(clientY - rect.top, rect.height),
    }
    const now = win.performance.now()
    recent = recent.filter(([at]) => now - at < WINDOW_MS)
    recent.push([now, clientX, clientY])
    const near = recent.filter(([, x, y]) => Math.hypot(x - clientX, y - clientY) <= RAGE_RADIUS)
    if (near.length >= RAGE_COUNT) point.rage = true
    points.push(point)

    if (target.closest(INTERACTIVE) || win.getComputedStyle(target).cursor === 'pointer') {
      if (pending.length === 0) {
        watch(true)
        timer = win.setTimeout(expire, WINDOW_MS)
      }
      pending.push({ point, at: now, event, native: target.closest(NATIVE) !== null })
    }
  }

  return {
    start(): void {
      if (running) return
      running = true
      win.addEventListener('click', onClick, { capture: true, passive: true })
    },

    stop(): void {
      running = false
      win.removeEventListener('click', onClick, { capture: true })
      respond()
      points = []
      recent = []
    },

    // Called at the engagement flush points; clicks still waiting on the dead
    // check are sent as live rather than holding the flush.
    take(): readonly ClickPoint[] | undefined {
      respond()
      const taken = points
      points = []
      recent = []
      return taken.length > 0 ? taken : undefined
    },
  }
}

export type Interactions = ReturnType<typeof createInteractions>

export const TRACKER_INTERACTIONS = { createInteractions }

export type TrackerInteractions = typeof TRACKER_INTERACTIONS
