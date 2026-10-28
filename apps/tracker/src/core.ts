import { createActions } from './actions.ts'
import {
  HEARTBEAT_INTERVAL_SECONDS,
  PAGE_TITLE_MAX_LENGTH,
  EXTERNAL_USER_ID_MAX_LENGTH,
  ACTION_ID_MAX_LENGTH,
  TRACKER_SDK,
  TRACKER_VERSION,
} from './constants.ts'
import type { TrackerExtras } from './extras.ts'
import type { FeedbackConfig, FeedbackMessage, TrackerFeedback } from './feedback.ts'
import type { TrackerInteractions } from './interactions.ts'
import { createLinks } from './links.ts'
import { createNavigation } from './navigation.ts'
import { IGNORE_KEY } from './ignore.ts'
import { isExcludedPath } from './paths.ts'
import { createSignals } from './signals.ts'
import { DEFAULT_PRIVACY_POLICY, createPrivacyGate, type PrivacyPolicy } from './privacy.ts'
import type { TrackerRules } from './rules-chunk.ts'
import type { NoCodeRule, RuleEngine, RuleMatch } from './rules.ts'
import {
  isValidEventName,
  sanitizeProperties,
  sanitizeReferrer,
  sanitizeUrl,
  truncate,
} from './sanitize.ts'
import {
  createRetryQueue,
  createSessionTracker,
  deviceStorage,
  memoryStorage,
  safeStorage,
} from './storage.ts'
import { createTransport } from './transport.ts'
import type { TrackerContext, TrackerEvent, TrackerEventType, TrackerPage } from './types.ts'
import { uuidV7 } from './uuid.ts'

export interface TrackerRuntimeConfig {
  readonly allowedDomains: readonly string[]
  readonly redactQueryKeys: readonly string[]
  readonly heartbeatIntervalSeconds: number
  readonly noCodeRules: readonly NoCodeRule[]
  readonly disabled: boolean
  readonly feedback: FeedbackConfig | null
  readonly features: {
    readonly web_vitals: boolean
    readonly engagement: boolean
    readonly heartbeat: boolean
    readonly heatmaps: boolean
  }
}

export type TrackerConfigPatch = Partial<Omit<TrackerRuntimeConfig, 'features'>> & {
  readonly features?: Partial<TrackerRuntimeConfig['features']>
}

const FEATURE_OF: Partial<Record<TrackerEventType, keyof TrackerRuntimeConfig['features']>> = {
  engagement: 'engagement',
  web_vital: 'web_vitals',
  clicks: 'heatmaps',
}

const routeOf = (url: string): string => url.replace(/\?[^#]*/, '')

export const DEFAULT_RUNTIME_CONFIG: TrackerRuntimeConfig = {
  allowedDomains: [],
  redactQueryKeys: [],
  heartbeatIntervalSeconds: HEARTBEAT_INTERVAL_SECONDS,
  noCodeRules: [],
  disabled: false,
  feedback: null,
  features: { web_vitals: true, engagement: true, heartbeat: true, heatmaps: false },
}

export interface TrackerOptions {
  readonly siteId: string
  readonly collectorUrl: string
  readonly sdk?: TrackerContext['sdk']
  readonly window?: Window & typeof globalThis
  readonly debug?: boolean
  readonly storage?: 'auto' | 'none'
  readonly privacyPolicy?: Partial<PrivacyPolicy>
  readonly outboundLinks?: boolean
  readonly fileDownloads?: boolean
  readonly excludePaths?: readonly string[]
  readonly deferWebVitalsUntilConfig?: boolean
  readonly loadExtras?: (ready: (extras: TrackerExtras) => void) => void
  readonly loadRules?: (ready: (rules: TrackerRules) => void) => void
  readonly loadInteractions?: (ready: (chunk: TrackerInteractions) => void) => void
  readonly loadFeedback?: (ready: (chunk: TrackerFeedback) => void) => void
  readonly config?: TrackerConfigPatch
  readonly now?: () => number
  readonly random?: () => number
  readonly schedule?: (task: () => void, delayMs: number) => void
  readonly setIntervalImpl?: (task: () => void, ms: number) => unknown
  readonly clearIntervalImpl?: (handle: unknown) => void
  readonly fetchImpl?: (url: string, init: RequestInit) => Promise<Response>
  readonly beaconImpl?: (url: string, body: string) => boolean
  readonly onRouteChange?: () => void
}

export interface Tracker {
  track(name: string, properties?: Record<string, unknown>, options?: { actionId?: string }): void
  identify(externalUserId: string): void
  conversion(name: string, properties?: Record<string, unknown>): void
  pageview(): void
  consent(state: 'granted' | 'denied' | 'unknown'): void
  feedback(): void
  sendFeedback(input: FeedbackMessage): Promise<boolean>
  applyConfig(config: TrackerConfigPatch): void
  flush(): void
  stop(): void
  readonly version: string
}

export function createTracker(options: TrackerOptions): Tracker {
  const win = options.window ?? (globalThis as unknown as Window & typeof globalThis)
  const doc = win.document
  const now = options.now ?? (() => Date.now())
  const random = options.random ?? (() => Math.random())

  let config: TrackerRuntimeConfig = {
    ...DEFAULT_RUNTIME_CONFIG,
    ...options.config,
    features: { ...DEFAULT_RUNTIME_CONFIG.features, ...options.config?.features },
  }

  const strict = options.storage === 'none'
  // Only what the site or its owner chose is kept on the device: a consent answer and the owner's
  // own opt-out. Anything about the visit itself (its session hint, unsent events) lives and dies
  // with the page; the collector stitches visits from its daily identity, not from this hint.
  const localStore = strict ? memoryStorage() : safeStorage(deviceStorage(win, 'localStorage'))
  const queue = createRetryQueue()
  const session = createSessionTracker(uuidV7)
  const privacy = createPrivacyGate(win, localStore, {
    ...DEFAULT_PRIVACY_POLICY,
    ...options.privacyPolicy,
  })

  const context: TrackerContext = {
    sdk: options.sdk ?? TRACKER_SDK,
    sdk_version: TRACKER_VERSION,
  }

  let stopped = false
  const excludedPath = (): boolean =>
    isExcludedPath(win.location?.pathname ?? '', options.excludePaths ?? [])
  const mayCollect = (): boolean =>
    !stopped &&
    !config.disabled &&
    privacy.mayCollect() &&
    localStore.get(IGNORE_KEY) !== '1' &&
    !excludedPath()

  const transport = createTransport({
    collectorUrl: options.collectorUrl,
    siteId: options.siteId,
    context,
    maySend: () => {
      const allowed = mayCollect()
      if (!allowed) signals.update()
      return allowed
    },
    queue,
    now,
    random,
    fetchImpl: options.fetchImpl,
    beaconImpl: options.beaconImpl,
    schedule: options.schedule,
    onError:
      options.debug === true ? (reason) => win.console?.debug?.('[invisit]', reason) : undefined,
  })

  const currentPage = (): TrackerPage | undefined => {
    const url = sanitizeUrl(win.location?.href ?? '', config.redactQueryKeys)
    if (url === '') return undefined
    const title = doc?.title ?? ''
    return title === '' ? { url } : { url, title: truncate(title, PAGE_TITLE_MAX_LENGTH) }
  }

  let lastPageUrl = ''
  let lastPageExcluded = false
  let lastPage: TrackerPage | undefined
  let viewSent = false

  const emit = (
    type: TrackerEventType,
    extras: Partial<TrackerEvent> = {},
    options_: { immediate?: boolean } = {},
  ): boolean => {
    if (!mayCollect()) {
      transport.cancelPending()
      signals.update()
      return false
    }
    if ((doc as { prerendering?: boolean } | undefined)?.prerendering) return false
    const feature = FEATURE_OF[type]
    if (feature && !config.features[feature]) return false

    const page = extras.page ?? currentPage()
    const event: TrackerEvent = {
      event_id: uuidV7(),
      type,
      occurred_at: new Date(now()).toISOString(),
      client_session_id: session.current(now()),
      ...(page ? { page } : {}),
      ...extras,
    }

    transport.enqueue(event, options_)
    return true
  }

  /* The widget chunk decides itself whether new settings need a fresh mount, so a config refresh
     never closes an open form. */
  let feedbackChunk: TrackerFeedback | undefined
  let feedbackQueue: ((chunk: TrackerFeedback) => void)[] | undefined
  let feedbackWanted = false
  const withFeedback = (use: (chunk: TrackerFeedback) => void): void => {
    if (feedbackChunk) return use(feedbackChunk)
    if (feedbackQueue) return void feedbackQueue.push(use)
    feedbackQueue = [use]
    options.loadFeedback?.((chunk) => {
      feedbackChunk = chunk
      for (const queued of feedbackQueue!) queued(chunk)
    })
  }
  const feedbackDeps = (settings: FeedbackConfig) =>
    doc && {
      doc,
      feedbackCollector: options.collectorUrl,
      feedbackSiteId: options.siteId,
      settings,
      session: () => (mayCollect() ? session.current(now()) : null),
      pageUrl: () => currentPage()?.url ?? '',
    }
  const syncFeedback = (): void => {
    const settings = stopped || config.disabled ? null : config.feedback
    if (!settings && !feedbackChunk) return void (feedbackWanted = false)
    withFeedback((chunk) => {
      chunk.sync(settings && feedbackDeps(settings), feedbackWanted)
      feedbackWanted = false
    })
  }

  const emitPageview = (referrer: string): void => {
    const page = currentPage()
    if (!page) return
    lastPageExcluded = excludedPath()
    lastPageUrl = page.url
    lastPage = page

    const sent = emit(
      'page_view',
      { page, ...(referrer === '' ? {} : { referrer }) },
      { immediate: true },
    )
    if (sent) viewSent = true

    ruleEngine?.onPageView()
  }

  const signals = createSignals({
    window: win,
    options,
    now,
    config: () => config,
    mayCollect,
    emit,
    sendHeartbeat: () => {
      if (!mayCollect()) {
        transport.cancelPending()
        return
      }
      const page = currentPage()
      transport.sendHeartbeat({
        context,
        client_session_id: session.current(now()),
        ...(page ? { page } : {}),
      })
    },
    onVitalsReady: () => {
      if (left) reportVitalsAndFlush()
    },
  })
  let ruleEngine: RuleEngine | undefined
  let rulesRequested = false

  const requestRules = (): void => {
    if (!mayCollect() || rulesRequested || !options.loadRules) return
    if (config.noCodeRules.length === 0) return
    rulesRequested = true
    options.loadRules((chunk) => {
      if (stopped || ruleEngine) return
      ruleEngine = chunk.createRules({
        document: doc,
        location: () => ({
          href: win.location?.href ?? '',
          pathname: win.location?.pathname ?? '',
          search: win.location?.search ?? '',
        }),
        rules: () => config.noCodeRules,
        redactKeys: () => config.redactQueryKeys,
        now: options.now ?? (win.performance?.now ? () => win.performance.now() : now),
        newActionId: uuidV7,
        emit: emitRuleMatch,
      })
      if (viewSent) ruleEngine.onRulesChanged()
    })
  }

  const emitRuleMatch = (match: RuleMatch, actionId: string): void => {
    emit('custom_event', {
      name: match.name,
      ...(match.ruleId ? { rule_id: match.ruleId } : {}),
      action_id: actionId,
      ...(match.properties ? { properties: match.properties } : {}),
    })
  }

  const actions = createActions({
    document: doc,
    redactQueryKeys: () => config.redactQueryKeys,
    newActionId: uuidV7,
    rules: () => ruleEngine,
    emit: emitRuleMatch,
  })

  const trackEvent = (
    name: string,
    properties: Record<string, unknown> | undefined,
    actionId: string | null | undefined,
    immediate?: boolean,
  ): void => {
    if (!isValidEventName(name)) return
    const sanitized = sanitizeProperties(properties, config.redactQueryKeys)
    emit(
      'custom_event',
      {
        name,
        ...(sanitized ? { properties: sanitized } : {}),
        ...(actionId ? { action_id: truncate(actionId, ACTION_ID_MAX_LENGTH) } : {}),
      },
      { immediate: immediate === true },
    )
  }

  const links = createLinks({
    document: doc,
    pageHref: () => win.location?.href ?? '',
    outbound: options.outboundLinks !== false,
    downloads: options.fileDownloads !== false,
    emit: (match) => trackEvent(match.name, { url: match.url }, actions.actionId(), true),
  })

  const onRouteChange = (pathOnly?: boolean): void => {
    const page = currentPage()
    if (
      !page ||
      (pathOnly ? routeOf(page.url) === routeOf(lastPageUrl) : page.url === lastPageUrl)
    ) {
      return
    }

    signals.collect(lastPage)

    const previous = lastPageExcluded ? '' : lastPageUrl
    emitPageview(previous)

    startSignals()
    options.onRouteChange?.()
  }

  const navigation = createNavigation({ window: win, onNavigate: onRouteChange })

  const onPageShow = (event: Event): void => {
    if (!(event as PageTransitionEvent).persisted) return
    left = false
    emitPageview('')
    startSignals()
  }

  const onVisibility = (): void => {
    if (doc?.visibilityState === 'hidden') {
      leave()
      return
    }
    left = false
    startSignals()
    signals.ping()
  }

  let left = false
  const reportVitalsAndFlush = (withEngagement?: boolean): void => {
    signals.report()
    if (withEngagement) signals.collect(lastPage)
    transport.flush({ beacon: true })
  }

  const leave = (): void => {
    if (left) return
    left = true
    reportVitalsAndFlush(true)
  }

  const onPageHide = (): void => leave()

  const startSignals = (ready = false): void => {
    if (!mayCollect()) transport.cancelPending()
    signals.update(ready)
    requestRules()
  }

  // Only our own keys (consent, opt-out) can change what may be collected; null is a clear().
  const onStorage = (event: StorageEvent): void => {
    if (event.key === null || event.key.startsWith('invisit')) startSignals()
  }

  let referrer = sanitizeReferrer(doc?.referrer ?? '', config.redactQueryKeys)

  if (referrer && isExcludedPath(new URL(referrer).pathname, options.excludePaths ?? [])) {
    referrer = ''
  }

  const start = (): void => {
    actions.start()
    links.start()

    navigation.start()
    win.addEventListener('pagehide', onPageHide)
    win.addEventListener('pageshow', onPageShow)
    win.addEventListener('storage', onStorage)
    doc?.addEventListener('visibilitychange', onVisibility)

    emitPageview(referrer)

    startSignals()
    syncFeedback()

    transport.flush()
  }

  if ((doc as { prerendering?: boolean } | undefined)?.prerendering) {
    doc?.addEventListener('prerenderingchange', () => stopped || start(), { once: true })
  } else start()

  return {
    track(name, properties, trackOptions) {
      trackEvent(name, properties, trackOptions?.actionId ?? actions.actionId())
    },

    identify(externalUserId) {
      if (typeof externalUserId !== 'string' || externalUserId === '') return
      emit('identify', {
        external_user_id: truncate(externalUserId, EXTERNAL_USER_ID_MAX_LENGTH),
      })
    },

    conversion(name, properties) {
      if (!isValidEventName(name)) return
      const sanitized = sanitizeProperties(properties, config.redactQueryKeys)
      emit('conversion', { name, ...(sanitized ? { properties: sanitized } : {}) })
    },

    pageview() {
      onRouteChange()
    },

    consent(state) {
      privacy.setConsent(state)
      startSignals()
    },

    feedback() {
      feedbackWanted = true
      syncFeedback()
    },

    sendFeedback(input) {
      const deps = feedbackDeps({})
      return deps && options.loadFeedback
        ? new Promise((done) => withFeedback((chunk) => void chunk.submit(deps, input).then(done)))
        : Promise.resolve(false)
    },

    applyConfig(next) {
      if (stopped) return
      const previous = config
      config = {
        ...config,
        ...next,
        features: { ...config.features, ...next.features },
      }
      startSignals(true)
      syncFeedback()

      if (previous.disabled && !config.disabled && !viewSent) {
        emitPageview(referrer)
      } else if (next.noCodeRules) {
        ruleEngine?.onRulesChanged()
      }
    },

    flush() {
      if (config.disabled) return
      transport.flush()
    },

    stop() {
      stopped = true
      syncFeedback()
      transport.cancelPending(false)
      signals.stop()
      actions.stop()
      links.stop()
      navigation.stop()
      win.removeEventListener('pagehide', onPageHide)
      win.removeEventListener('pageshow', onPageShow)
      win.removeEventListener('storage', onStorage)
      doc?.removeEventListener('visibilitychange', onVisibility)
    },

    version: TRACKER_VERSION,
  }
}
