import { loadTrackerConfig } from './config.ts'
import { DEBUG_KEY, OVERLAY_HASH, OVERLAY_KEY, type TrackerChunk } from './constants.ts'
import type { Tracker, TrackerConfigPatch } from './core.ts'
import { takeDebugToken } from './debug-session.ts'
import type { DebugReport, TrackerDebug } from './debug.ts'
import type { TrackerExtras } from './extras.ts'
import type { TrackerFeedback } from './feedback.ts'
import { resolveIgnore } from './ignore.ts'
import { installTracker, type TrackerStartOptions } from './install.ts'
import type { TrackerInteractions } from './interactions.ts'
import type { TrackerNotices } from './notices.ts'
import { isHostAllowed } from './origin.ts'
import type { TrackerOverlay } from './overlay/index.ts'
import type { TrackerRules } from './rules-chunk.ts'
import { deviceStorage, memoryStorage, safeStorage } from './storage.ts'

export interface TrackerChunks {
  readonly extras: TrackerExtras
  readonly notices: TrackerNotices
  readonly rules: TrackerRules
  readonly interactions: TrackerInteractions
  readonly overlay: TrackerOverlay
  readonly feedback: TrackerFeedback
  readonly debug: TrackerDebug
}

export type ChunkLoader = <K extends TrackerChunk>(
  name: K,
  ready: (chunk: TrackerChunks[K]) => void,
) => void

export function startTracker(
  win: Window & typeof globalThis,
  options: TrackerStartOptions,
  loadChunk: ChunkLoader,
): Tracker | undefined {
  const doc = win.document
  const strict = options.storage === 'none'

  // A dashboard link opens the page in overlay mode; the tab then stops
  // collecting so the site owner's own browsing never lands in the data.
  let stopTracker: (() => void) | undefined
  let overlayLoaded = false
  const overlay = (): boolean => {
    if (
      !win.location.hash.includes(OVERLAY_HASH) &&
      !safeStorage(strict ? null : deviceStorage(win, 'sessionStorage')).get(OVERLAY_KEY)
    ) {
      return false
    }
    stopTracker?.()
    if (!overlayLoaded) {
      overlayLoaded = true
      loadChunk('overlay', (chunk) => chunk.openOverlay(strict))
    }
    return true
  }
  win.addEventListener('hashchange', overlay)
  if (overlay()) return

  const tabStore = safeStorage(strict ? null : deviceStorage(win, 'sessionStorage'))
  const debugToken = takeDebugToken(win, tabStore)
  const localStore = strict ? memoryStorage() : safeStorage(deviceStorage(win, 'localStorage'))
  if (!strict) {
    const ignore = resolveIgnore(localStore, win.location?.hash ?? '')
    const changed = ignore.changed
    if (changed) loadChunk('notices', (notices) => notices.showIgnoreNotice(doc, changed))
    if (ignore.ignored && !debugToken) return
  }

  // Playwright, Puppeteer, Selenium and other WebDriver clients set navigator.webdriver: tests and
  // scrapers, not visitors. Debug mode still sends, so a test can check its own setup.
  if (win.navigator?.webdriver && !options.debug && !debugToken) return

  if (options.siteId === '' || options.collectorUrl === '') {
    win.console?.warn?.('[invisit] missing site or collector; tracker not started')
    return
  }

  const fetchDeps =
    typeof win.fetch === 'function'
      ? { fetchImpl: (url: string, init: RequestInit) => win.fetch(url, init) }
      : {}
  // A beacon gets no answer, and debugging is reading the collector's answer.
  const beaconDeps =
    typeof win.navigator?.sendBeacon === 'function' && !options.debug && !debugToken
      ? { beaconImpl: (url: string, payload: string) => win.navigator.sendBeacon(url, payload) }
      : {}

  const configDeps = {
    collectorUrl: options.collectorUrl,
    siteId: options.siteId,
    // Per page: the browser's HTTP cache already spares repeat fetches across pages.
    storage: memoryStorage(),
    now: () => Date.now(),
    onUnknownSite: () =>
      win.console?.warn?.('[invisit] the collector does not recognise this site; nothing is sent'),
    ...fetchDeps,
  }

  let pending = false
  const syncConfig = (): void => {
    if (pending) return
    pending = true
    void loadTrackerConfig(configDeps)
      .then((config) => {
        tracker.applyConfig(config ? guardHost(config) : {})
      })
      .finally(() => {
        pending = false
      })
  }

  let hostWarned = false
  const guardHost = (config: TrackerConfigPatch): TrackerConfigPatch => {
    const allowedDomains = config.allowedDomains
    const hostname = win.location?.hostname ?? ''

    // A session sends anyway, so the page shows the collector turning the host away.
    if (!allowedDomains || allowedDomains.length === 0 || debugToken) return config
    if (isHostAllowed(hostname, allowedDomains)) return config

    if (!hostWarned) {
      hostWarned = true
      loadChunk('notices', (notices) =>
        win.console?.warn?.(
          notices.unallowedHostMessage({
            host: win.location?.host ?? hostname,
            allowedDomains,
          }),
        ),
      )
    }

    return { ...config, disabled: true }
  }

  let report: DebugReport | undefined
  const unseen: Parameters<DebugReport>[] = []
  if (debugToken) {
    loadChunk('debug', (chunk) => {
      report = chunk.openDebug({
        doc,
        end: () => {
          tabStore.remove(DEBUG_KEY)
          win.location.reload()
        },
      })
      for (const delivery of unseen) report(...delivery)
    })
  }

  const { tracker } = installTracker(win, {
    ...options,
    ...fetchDeps,
    ...beaconDeps,
    awaitConfig: true,
    loadExtras: (ready) => loadChunk('extras', ready),
    loadInteractions: (ready) => loadChunk('interactions', ready),
    loadRules: (ready) => loadChunk('rules', ready),
    onRouteChange: () => syncConfig(),
    // Feedback is a real message to the site's owner: a session leaves the widget off.
    ...(debugToken
      ? {
          debugToken,
          onDelivery: (...delivery: Parameters<DebugReport>) =>
            report ? report(...delivery) : void unseen.push(delivery),
        }
      : { loadFeedback: (ready) => loadChunk('feedback', ready) }),
  })

  stopTracker = () => tracker.stop()
  syncConfig()
  return tracker
}
