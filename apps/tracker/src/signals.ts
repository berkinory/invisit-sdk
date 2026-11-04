import type { TrackerOptions, TrackerRuntimeConfig } from './core.ts'
import { createEngagement } from './engagement.ts'
import type { TrackerExtras } from './extras.ts'
import { createHeartbeat } from './heartbeat.ts'
import type { Interactions } from './interactions.ts'
import type { TrackerEvent, TrackerEventType, TrackerPage } from './types.ts'
import type { ObserverHost } from './vitals.ts'

interface SignalsDeps {
  readonly window: Window & typeof globalThis
  readonly options: TrackerOptions
  readonly now: () => number
  readonly config: () => TrackerRuntimeConfig
  readonly mayCollect: () => boolean
  readonly emit: (type: TrackerEventType, extras: Partial<TrackerEvent>) => boolean
  readonly sendHeartbeat: () => void
  readonly onVitalsReady: () => void
}

export function createSignals(deps: SignalsDeps) {
  const win = deps.window
  const doc = win.document
  const engagement = createEngagement({
    document: doc,
    window: win,
    now: deps.now,
    measureScroll: () =>
      Math.min(
        100,
        Math.round(
          ((win.scrollY + win.innerHeight) / (doc?.documentElement.scrollHeight || NaN)) * 100,
        ),
      ),
  })
  const heartbeat = createHeartbeat({
    document: doc,
    intervalSeconds: () => deps.config().heartbeatIntervalSeconds,
    send: deps.sendHeartbeat,
    setIntervalImpl: deps.options.setIntervalImpl,
    clearIntervalImpl: deps.options.clearIntervalImpl,
  })

  let interval = deps.config().heartbeatIntervalSeconds
  let engagementOn = false
  let extrasDeferred = deps.options.awaitConfig === true
  let extrasRequested = false
  let extras: TrackerExtras | undefined
  let vitals: ReturnType<TrackerExtras['createWebVitals']> | undefined
  let stopped = false
  let since = 0
  let paused = false
  let interactions: Interactions | undefined
  let interactionsRequested = false

  const requestExtras = (): void => {
    if (stopped || extrasDeferred || !deps.mayCollect() || !deps.config().features.web_vitals)
      return
    if (extras) {
      if (vitals) return
      vitals = extras.createWebVitals({
        host: win as unknown as ObserverHost,
        since,
        emit: (payload) => deps.emit('web_vital', { web_vital: payload }),
      })
      vitals.start()
      deps.onVitalsReady()
    } else if (!extrasRequested && deps.options.loadExtras) {
      extrasRequested = true
      deps.options.loadExtras((loaded) => {
        extras = loaded
        requestExtras()
      })
    }
  }

  const requestInteractions = (on: boolean): void => {
    if (!on) interactions?.stop()
    else if (interactions) interactions.start()
    else if (!interactionsRequested && deps.options.loadInteractions) {
      interactionsRequested = true
      deps.options.loadInteractions((chunk) => {
        interactions = chunk.createInteractions(win, deps.options.pageUrl)
        requestInteractions(!stopped && !paused && deps.config().features.heatmaps)
      })
    }
  }

  const pause = (): void => {
    interactions?.stop()
    if (engagementOn) engagement.stop()
    engagementOn = false
    heartbeat.stop()
    vitals?.stop()
    vitals = undefined
    paused = true
  }

  return {
    update(ready = false): void {
      if (ready) extrasDeferred = false
      if (stopped || !deps.mayCollect()) {
        pause()
        return
      }
      if (paused) {
        since = win.performance?.now() ?? 0
        paused = false
      }
      const config = deps.config()
      if (config.features.engagement && !engagementOn) {
        engagementOn = true
        engagement.start()
      } else if (!config.features.engagement && engagementOn) {
        engagement.stop()
        engagementOn = false
      }
      if (!config.features.heartbeat) heartbeat.stop()
      else if (interval !== config.heartbeatIntervalSeconds) heartbeat.restart()
      else heartbeat.start()
      interval = config.heartbeatIntervalSeconds
      if (!config.features.web_vitals) {
        vitals?.stop()
        vitals = undefined
      }
      requestExtras()
      requestInteractions(config.features.heatmaps)
    },

    collect(page: TrackerPage | undefined): void {
      const at = page ? { page } : {}
      const payload = engagementOn && engagement.collect()
      if (payload) deps.emit('engagement', { engagement: payload, ...at })
      const clicks = interactions?.take()
      if (clicks) deps.emit('clicks', { clicks, ...at })
    },

    report(): void {
      if (deps.config().features.web_vitals) vitals?.report()
    },

    ping(): void {
      heartbeat.ping()
    },

    stop(): void {
      stopped = true
      pause()
    },
  }
}
