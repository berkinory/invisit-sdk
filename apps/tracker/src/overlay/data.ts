export type Device = 'desktop' | 'mobile'
export type Interval =
  | 'today'
  | 'yesterday'
  | '7d'
  | '30d'
  | '90d'
  | '6mo'
  | '12mo'
  | 'all'
  | 'custom'

export interface TimeWindow {
  readonly from: string
  readonly to: string
}

export interface Totals {
  readonly clicks: number
  readonly rage_clicks: number
  readonly dead_clicks: number
}

export interface Cell extends Totals {
  readonly selector: string
  readonly x: number
  readonly y: number
}

export interface Scroll {
  readonly samples: number
  readonly average_percent: number
  readonly bins: readonly number[]
}

// Mirrors HeatmapOverlayResponse in @invisit/contracts; the tracker stays dependency-free.
export interface OverlayData {
  readonly totals: Totals
  readonly cells: readonly Cell[]
  readonly scroll: Scroll | null
  readonly truncated: boolean
}

export const GRID = 32

export const DEVICES: readonly Device[] = ['desktop', 'mobile']
export const INTERVALS: readonly (readonly [Interval, string])[] = [
  ['today', 'Today'],
  ['yesterday', 'Yesterday'],
  ['7d', 'Last 7 days'],
  ['30d', 'Last 30 days'],
  ['90d', 'Last 90 days'],
  ['6mo', 'Last 6 months'],
  ['12mo', 'Last 12 months'],
  ['all', 'All time'],
]

const DAY_MS = 86_400_000

// Heatmaps are rolled up by UTC day, so a picked interval is whole UTC days
// ending at the next midnight, and today's clicks show while the tab is open.
export function windowFor(interval: Exclude<Interval, 'custom'>, now: Date): TimeWindow {
  const today = Math.floor(now.getTime() / DAY_MS) * DAY_MS
  const day = (shift: number): number => today + shift * DAY_MS
  const months = (count: number): number => {
    const date = new Date(today)
    date.setUTCMonth(date.getUTCMonth() - count)
    return date.getTime() + DAY_MS
  }
  const start =
    interval === 'today'
      ? today
      : interval === 'yesterday'
        ? day(-1)
        : interval === '7d'
          ? day(-6)
          : interval === '30d'
            ? day(-29)
            : interval === '90d'
              ? day(-89)
              : interval === '6mo'
                ? months(6)
                : interval === '12mo'
                  ? months(12)
                  : 0
  const end = interval === 'yesterday' ? today : day(1)
  return { from: new Date(start).toISOString(), to: new Date(end).toISOString() }
}

export const deviceFor = (width: number): Device => (width < 768 ? 'mobile' : 'desktop')

export class ExpiredError extends Error {}

export async function fetchOverlay(
  api: string,
  token: string,
  query: { hostname: string; path: string; device: Device } & TimeWindow,
  abort: AbortSignal,
): Promise<OverlayData> {
  const params = new URLSearchParams({ ...query })
  const response = await fetch(`${api}/v1/heatmaps/overlay?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'omit',
    mode: 'cors',
    signal: abort,
  })
  if (response.status === 401) throw new ExpiredError()
  if (!response.ok) throw new Error(`status ${response.status}`)
  return (await response.json()) as OverlayData
}

export const resolveSelector = (doc: Document, selector: string): Element | null => {
  try {
    return doc.querySelector(selector)
  } catch {
    return null
  }
}

// Cumulative share of visits reaching each 5% step: reached[i] = share at depth 5i%.
export function reachedShares(scroll: Scroll): number[] {
  const total = scroll.bins.reduce((sum, count) => sum + count, 0)
  const reached: number[] = []
  let remaining = total
  for (const count of scroll.bins) {
    reached.push(total > 0 ? remaining / total : 0)
    remaining -= count
  }
  return reached
}

export function depthReaching(reached: readonly number[], share: number): number | null {
  for (let i = 1; i < reached.length; i++) {
    const [above, below] = [reached[i - 1]!, reached[i]!]
    if (below <= share && above > share) {
      return (i - 1 + (above - share) / (above - below)) * 5
    }
  }
  return null
}
