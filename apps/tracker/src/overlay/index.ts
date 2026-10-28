import { OVERLAY_HASH, OVERLAY_KEY } from '../constants.ts'
import { createNavigation } from '../navigation.ts'
import {
  DEVICES,
  ExpiredError,
  INTERVALS,
  GRID,
  deviceFor,
  fetchOverlay,
  resolveSelector,
  windowFor,
  type Device,
  type Interval,
  type TimeWindow,
  type Totals,
} from './data.ts'
import { h } from './dom.ts'
import { createEmbed } from './embed.ts'
import { createHeat, type HeatPoint } from './heat.ts'
import { createHover } from './hover.ts'
import { createScrollLayer } from './scroll.ts'
import { HOST_STYLE, OVERLAY_CSS } from './styles.ts'
import { createToolbar, type ViewState } from './toolbar.ts'

const MUTATION_DEBOUNCE_MS = 250
// Cells are stamped faintly in proportion to their clicks so overlapping cells
// accumulate without clipping; the heat layer then normalizes to the peak.
const CELL_WEIGHT = 0.18

let mounted = false

const HASH_PARAM = /&?(invisit-[a-z]+)=([^&]*)/g

// `api` need not be the collector the tracker loaded from; `dashboard`, when framed, is the only
// window the overlay talks to.
interface OverlaySession {
  readonly token: string
  readonly api: string
  readonly embed: boolean
  readonly dashboard: string | null
  readonly interval: Interval | null
  readonly window: TimeWindow | null
  readonly device: Device | null
}

const deviceOf = (value: unknown): Device | null =>
  DEVICES.find((device) => device === value) ?? null

const intervalOf = (value: unknown): Interval | null =>
  value === 'custom' ? value : (INTERVALS.find(([key]) => key === value)?.[0] ?? null)

const windowOf = (from: unknown, to: unknown): TimeWindow | null =>
  typeof from === 'string' && typeof to === 'string' && from && to ? { from, to } : null

const session = (strict: boolean): Storage | null => {
  try {
    return strict ? null : globalThis.sessionStorage
  } catch {
    return null
  }
}

const httpOrigin = (raw: string): string | null => {
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null
  } catch {
    return null
  }
}

const stored = (strict: boolean): OverlaySession | null => {
  try {
    const parsed = JSON.parse(session(strict)?.getItem(OVERLAY_KEY) ?? 'null') as unknown
    if (parsed === null || typeof parsed !== 'object') return null
    const { token, api, embed, dashboard, interval, window, device } = parsed as Record<
      string,
      unknown
    >
    const range = window as Record<string, unknown> | null
    const framedBy = typeof dashboard === 'string' ? httpOrigin(dashboard) : null
    return typeof token === 'string' &&
      token &&
      typeof api === 'string' &&
      httpOrigin(api) &&
      (embed !== true || framedBy !== null)
      ? {
          token,
          api,
          embed: embed === true,
          dashboard: framedBy,
          interval: intervalOf(interval),
          window: windowOf(range?.['from'], range?.['to']),
          device: deviceOf(device),
        }
      : null
  } catch {
    return null
  }
}

// Takes the token out of the URL at once so it never lands in the site's own
// analytics, shared links or history; it lives on in sessionStorage for this tab.
function takeSession(
  win: Window,
  strict: boolean,
  previous: OverlaySession | null,
): OverlaySession | null {
  const { hash, pathname, search } = win.location
  if (!hash.includes(OVERLAY_HASH)) return stored(strict) ?? previous
  const params: Record<string, string> = {}
  const rest = hash
    .replace(HASH_PARAM, (_, name: string, value: string) => {
      try {
        params[name] = decodeURIComponent(value)
      } catch {}
      return ''
    })
    .replace('#&', '#')
  win.history.replaceState(win.history.state, '', pathname + search + (rest === '#' ? '' : rest))
  const token = params['invisit-heatmap']
  const api = httpOrigin(params['invisit-api'] ?? '')
  const embed = params['invisit-embed'] === '1'
  const dashboard = httpOrigin(params['invisit-dashboard'] ?? '')
  if (!token || !api || (embed && !dashboard)) return previous
  const next: OverlaySession = {
    token,
    api,
    embed,
    dashboard,
    interval: intervalOf(params['invisit-interval']),
    window: windowOf(params['invisit-from'], params['invisit-to']),
    device: deviceOf(params['invisit-device']),
  }
  try {
    session(strict)?.setItem(OVERLAY_KEY, JSON.stringify(next))
  } catch {}
  return next
}

export function openOverlay(strict: boolean): void {
  const win = globalThis as unknown as Window & typeof globalThis
  const doc = win.document
  let overlaySession = takeSession(win, strict, null)
  if (mounted || !overlaySession) return
  mounted = true
  const embedded = overlaySession.embed && win.parent !== win

  const host = doc.createElement('invisit-overlay')
  host.setAttribute('style', HOST_STYLE)
  const shadow = host.attachShadow({ mode: 'closed' })
  const heat = createHeat(win)
  const scroll = createScrollLayer(doc)
  const hover = createHover(win)
  const layers = h(doc, 'div', { class: 'layer' }, [heat.canvas, scroll.el])
  const root = h(doc, 'div', { class: 'root' }, [layers, ...hover.nodes])
  shadow.append(h(doc, 'style', {}, [OVERLAY_CSS]), root)

  const carried = overlaySession.window
  const state: ViewState = {
    interval: carried ? (overlaySession.interval ?? 'custom') : '30d',
    window: carried ?? (embedded ? null : windowFor('30d', new Date())),
    device: overlaySession.device ?? deviceFor(win.innerWidth),
    collapsed: false,
    status: 'loading',
    scroll: false,
    data: null,
    missing: 0,
  }
  let deviceChosen = overlaySession.device !== null
  let path = win.location.pathname
  let resolved = new Map<string, Element | null>()
  let controller: AbortController | undefined
  let frame = 0
  let debounce = 0

  const forget = (): void => {
    try {
      session(strict)?.removeItem(OVERLAY_KEY)
    } catch {}
  }

  const onHash = (): void => {
    const next = takeSession(win, strict, overlaySession)
    if (next === null || next.token === overlaySession?.token) return
    overlaySession = next
    void load()
  }

  const resolve = (): void => {
    resolved = new Map()
    for (const cell of state.data?.cells ?? []) {
      if (!resolved.has(cell.selector)) {
        resolved.set(cell.selector, resolveSelector(doc, cell.selector))
      }
    }
  }

  const paint = (): void => {
    frame = 0
    const data = state.data
    // Measured with our layers out of the flow so they never pin the document size.
    layers.hidden = true
    const width = Math.max(doc.documentElement.scrollWidth, doc.body?.scrollWidth ?? 0)
    const height = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0)
    layers.hidden = !data

    const elements = new Map<Element, Totals>()
    let missing = 0
    if (data) {
      const rects = new Map<Element, DOMRect>()
      const raw: [x: number, y: number, value: number][] = []
      let max = 0
      for (const cell of data.cells) {
        const el = resolved.get(cell.selector)
        if (!el?.isConnected) {
          missing += cell.clicks
          continue
        }
        let rect = rects.get(el)
        if (!rect) rects.set(el, (rect = el.getBoundingClientRect()))
        if (!rect.width || !rect.height) continue
        const sum = elements.get(el)
        elements.set(el, {
          clicks: (sum?.clicks ?? 0) + cell.clicks,
          rage_clicks: (sum?.rage_clicks ?? 0) + cell.rage_clicks,
          dead_clicks: (sum?.dead_clicks ?? 0) + cell.dead_clicks,
        })
        const value = cell.clicks
        if (value <= 0) continue
        raw.push([
          rect.left + win.scrollX + ((cell.x + 0.5) / GRID) * rect.width,
          rect.top + win.scrollY + ((cell.y + 0.5) / GRID) * rect.height,
          value,
        ])
        if (value > max) max = value
      }
      const points: HeatPoint[] = raw.map(([x, y, value]) => ({
        x,
        y,
        weight: CELL_WEIGHT * (value / max),
      }))
      heat.draw(points, width, height)
      scroll.draw(state.scroll ? data.scroll : null, width, height)
    }
    hover.set(elements, data?.totals.clicks ?? 0, true)
    state.missing = missing
    toolbar.render(state)
    embed?.send(state)
  }

  const schedulePaint = (): void => {
    if (!frame) frame = win.requestAnimationFrame(paint)
  }

  const load = async (): Promise<void> => {
    controller?.abort()
    const current = (controller = new AbortController())
    state.status = 'loading'
    state.data = null
    schedulePaint()
    try {
      if (overlaySession === null) return
      if (state.window === null) return
      const page = {
        hostname: win.location.hostname,
        path: win.location.pathname,
        device: state.device,
      }
      const data = await fetchOverlay(
        overlaySession.api,
        overlaySession.token,
        { ...page, ...state.window },
        current.signal,
      )
      if (current !== controller) return
      state.data = data
      state.status = 'ready'
      resolve()
    } catch (error) {
      if (current !== controller) return
      state.status = error instanceof ExpiredError ? 'expired' : 'error'
      if (state.status === 'expired') forget()
    }
    schedulePaint()
  }

  const set = (patch: Partial<ViewState>): void => {
    if (patch.device) deviceChosen = true
    const refetch =
      (patch.window !== undefined && patch.window !== state.window) ||
      (patch.device !== undefined && patch.device !== state.device)
    Object.assign(state, patch)
    if (refetch) void load()
    else schedulePaint()
  }

  const onRoute = (): void => {
    if (win.location.pathname === path) return
    path = win.location.pathname
    void load()
  }

  const onResize = (): void => {
    const device = deviceFor(win.innerWidth)
    if (!deviceChosen && device !== state.device) {
      state.device = device
      void load()
    } else schedulePaint()
  }

  const onScroll = (): void => {
    if (heat.fixed) schedulePaint()
  }

  const onKey = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
    if (event.key === 'Escape') close()
  }

  const mutations = new win.MutationObserver(() => {
    win.clearTimeout(debounce)
    debounce = win.setTimeout(() => {
      if (doc.body) resizes.observe(doc.body)
      onRoute()
      resolve()
      schedulePaint()
    }, MUTATION_DEBOUNCE_MS)
  })
  const resizes = new win.ResizeObserver(schedulePaint)
  const navigation = createNavigation({ window: win, onNavigate: onRoute })

  const close = (): void => {
    forget()
    controller?.abort()
    controller = undefined
    mutations.disconnect()
    resizes.disconnect()
    navigation.stop()
    hover.stop()
    embed?.stop()
    win.cancelAnimationFrame(frame)
    win.clearTimeout(debounce)
    win.removeEventListener('resize', onResize)
    win.removeEventListener('scroll', onScroll)
    win.removeEventListener('load', schedulePaint)
    win.removeEventListener('hashchange', onHash)
    doc.removeEventListener('keydown', onKey, true)
    host.remove()
    mounted = false
  }

  const toolbar = createToolbar(doc, {
    set,
    retry: () => void load(),
    close,
    viewportDevice: () => deviceFor(win.innerWidth),
  })
  const embed =
    embedded && overlaySession.dashboard
      ? createEmbed(win, overlaySession.dashboard, (command) => {
          const next = command.window
          const moved =
            next !== undefined && (next.from !== state.window?.from || next.to !== state.window?.to)
          if (next) state.window = next
          if (command.scroll !== undefined) state.scroll = command.scroll
          schedulePaint()
          if (moved) void load()
        })
      : null
  if (!embedded) root.append(toolbar.el)
  doc.documentElement.append(host)

  mutations.observe(doc.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'open'],
  })
  resizes.observe(doc.documentElement)
  if (doc.body) resizes.observe(doc.body)
  navigation.start()
  win.addEventListener('resize', onResize, { passive: true })
  win.addEventListener('scroll', onScroll, { passive: true })
  win.addEventListener('load', schedulePaint)
  win.addEventListener('hashchange', onHash)
  if (!embedded) doc.addEventListener('keydown', onKey, true)
  embed?.hello()
  void load()
}

export const TRACKER_OVERLAY = { openOverlay }

export type TrackerOverlay = typeof TRACKER_OVERLAY
