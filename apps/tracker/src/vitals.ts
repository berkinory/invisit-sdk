import type { WebVitalPayload } from './types.ts'

interface LayoutShiftEntry extends PerformanceEntry {
  readonly value?: number
  readonly hadRecentInput?: boolean
}

interface InteractionEntry extends PerformanceEntry {
  readonly interactionId?: number
}

export interface ObserverHost {
  PerformanceObserver?: {
    new (callback: (list: { getEntries(): PerformanceEntry[] }) => void): {
      observe(options: { type: string; buffered?: boolean; durationThreshold?: number }): void
      disconnect(): void
      takeRecords?(): PerformanceEntry[]
    }
    readonly supportedEntryTypes?: readonly string[]
  }
  performance?: { getEntriesByType(type: string): PerformanceEntry[]; interactionCount?: number }
  document?: { visibilityState?: DocumentVisibilityState; prerendering?: boolean }
}

export interface WebVitalsDeps {
  readonly host: ObserverHost
  readonly emit: (payload: WebVitalPayload) => void
  readonly since?: number
}

const THRESHOLDS: Record<string, readonly [number, number]> = {
  LCP: [2_500, 4_000],
  CLS: [0.1, 0.25],
  INP: [200, 500],
  FCP: [1_800, 3_000],
  TTFB: [800, 1_800],
}

function rate(metric: string, value: number): WebVitalPayload['rating'] {
  const threshold = THRESHOLDS[metric]
  if (!threshold) return undefined
  if (value <= threshold[0]) return 'good'
  return value <= threshold[1] ? 'needs-improvement' : 'poor'
}

export function createWebVitals(deps: WebVitalsDeps) {
  const observers: { disconnect(): void; takeRecords?(): PerformanceEntry[] }[] = []
  const handlers: ((entries: PerformanceEntry[]) => void)[] = []
  const measured = new Map<string, number>()
  let reported = false

  let clsValue = 0
  let sessionValue = 0
  let sessionStart = 0
  let sessionLast = 0
  const interactions = new Map<number, number>()
  let firstInteraction = Infinity
  let lastInteraction = 0
  const initialCount = deps.since ? (deps.host.performance?.interactionCount ?? 0) : 0

  const recordInteractions = (entries: PerformanceEntry[]): void => {
    for (const entry of entries as InteractionEntry[]) {
      const id = entry.interactionId
      if (!id) continue
      firstInteraction = Math.min(firstInteraction, id)
      lastInteraction = Math.max(lastInteraction, id)
      interactions.set(id, Math.max(interactions.get(id) ?? 0, entry.duration))
    }
    const longest = [...interactions].sort((a, b) => b[1] - a[1])
    for (const [id] of longest.slice(10)) interactions.delete(id)
    // Event Timing IDs advance by seven; use this estimate only without the native count.
    const nativeCount = deps.host.performance?.interactionCount
    const count =
      nativeCount === undefined
        ? lastInteraction
          ? (lastInteraction - firstInteraction) / 7 + 1
          : 0
        : Math.max(0, nativeCount - initialCount)
    const interaction = longest[Math.min(longest.length - 1, Math.floor(count / 50))]
    if (interaction) measured.set('INP', interaction[1])
  }

  const observe = (
    type: string,
    options: { buffered?: boolean; durationThreshold?: number },
    onEntries: (entries: PerformanceEntry[]) => void,
  ): boolean => {
    const Observer = deps.host.PerformanceObserver
    if (!Observer) return false
    try {
      const handle = (entries: PerformanceEntry[]): void =>
        onEntries(entries.filter((entry) => entry.startTime >= (deps.since ?? 0)))
      const observer = new Observer((list) => handle(list.getEntries()))
      observer.observe({ type, ...options })
      observers.push(observer)
      handlers.push(handle)
      return true
    } catch {
      return false
    }
  }

  const stop = (): void => {
    for (const observer of observers) {
      try {
        observer.disconnect()
      } catch {}
    }
    observers.length = 0
    handlers.length = 0
  }

  return {
    start(): void {
      let navigation: { responseStart?: number; activationStart?: number } | undefined
      try {
        navigation = deps.host.performance?.getEntriesByType('navigation')?.[0] as
          | typeof navigation
          | undefined
      } catch {}
      // A prerendered page is timed from when the visitor opened it, as Chrome reports it.
      const activation = navigation?.activationStart ?? 0
      const sinceOpened = (time: number): number => Math.max(time - activation, 0)

      /* A tab opened in the background first paints when someone switches to it, minutes later,
         and Chrome times that paint from the navigation. Paints after the page was first hidden
         are not load speed, so FCP and LCP keep only earlier ones, as web-vitals does. */
      const doc = deps.host.document
      const hiddenAtStart = doc?.visibilityState === 'hidden' && !doc.prerendering ? 0 : Infinity
      const paintedVisible = (entries: PerformanceEntry[]): PerformanceEntry[] => {
        const hidden =
          deps.host.performance
            ?.getEntriesByType('visibility-state')
            .find((entry) => entry.name === 'hidden' && entry.startTime >= activation)?.startTime ??
          hiddenAtStart
        return entries.filter((entry) => entry.startTime < hidden)
      }

      observe('largest-contentful-paint', { buffered: true }, (entries) => {
        const painted = paintedVisible(entries)
        const last = painted[painted.length - 1]
        if (last) measured.set('LCP', sinceOpened(last.startTime))
      })

      observe('paint', { buffered: true }, (entries) => {
        for (const entry of paintedVisible(entries)) {
          if (entry.name === 'first-contentful-paint') {
            measured.set('FCP', sinceOpened(entry.startTime))
          }
        }
      })

      // A page that never shifted scores 0; leaving it out would count only the pages that did.
      const shifts = deps.host.PerformanceObserver?.supportedEntryTypes?.includes('layout-shift')
      const observingShifts = observe('layout-shift', { buffered: true }, (entries) => {
        for (const entry of entries as LayoutShiftEntry[]) {
          if (entry.hadRecentInput === true) continue
          const value = entry.value ?? 0

          if (
            sessionValue !== 0 &&
            (entry.startTime - sessionLast >= 1_000 || entry.startTime - sessionStart >= 5_000)
          ) {
            sessionValue = 0
          }
          if (sessionValue === 0) sessionStart = entry.startTime

          sessionValue += value
          sessionLast = entry.startTime
          clsValue = Math.max(clsValue, sessionValue)
          measured.set('CLS', clsValue)
        }
      })
      if (observingShifts && shifts && !measured.has('CLS')) measured.set('CLS', 0)

      observe('event', { buffered: true, durationThreshold: 0 }, recordInteractions)
      observe('first-input', { buffered: true }, recordInteractions)

      if (navigation && typeof navigation.responseStart === 'number' && !deps.since) {
        measured.set('TTFB', sinceOpened(navigation.responseStart))
      }
    },

    report(): void {
      if (reported) return
      reported = true

      observers.forEach((observer, index) => {
        try {
          const pending = observer.takeRecords?.()
          if (pending && pending.length > 0) handlers[index]?.(pending)
        } catch {}
      })
      recordInteractions([])

      for (const [metric, value] of measured) {
        const rating = rate(metric, value)
        const payload: WebVitalPayload = {
          metric: metric as WebVitalPayload['metric'],
          value: metric === 'CLS' ? Math.round(value * 10_000) / 10_000 : Math.round(value),
          ...(rating === undefined ? {} : { rating }),
        }
        deps.emit(payload)
      }
      stop()
    },

    stop,
  }
}
