import { createTracker, type Tracker, type TrackerOptions } from './core.ts'
import type { PrivacyPolicy } from './privacy.ts'

const BRAND = '__invisit__'

export type QueuedCall = readonly [method: string, ...args: unknown[]]

interface StubFunction {
  (...args: unknown[]): void
  q?: QueuedCall[]
}

export type InstallOutcome = 'installed' | 'drained_stub' | 'namespace_conflict'

export interface InstallResult {
  readonly tracker: Tracker
  readonly namespace: 'invisit' | 'invisitAnalytics'
  readonly outcome: InstallOutcome
}

function isOurStub(candidate: unknown): candidate is StubFunction {
  return typeof candidate === 'function' && Array.isArray((candidate as StubFunction).q)
}

function isForeign(candidate: unknown): boolean {
  if (candidate === undefined || candidate === null) return false
  if (isOurStub(candidate)) return false
  return typeof (candidate as Record<string, unknown>)[BRAND] !== 'boolean'
}

export function isRunningTracker(candidate: unknown): candidate is Tracker {
  return (candidate as Record<string, unknown> | null | undefined)?.[BRAND] === true
}

export function runningTracker(win: Window & typeof globalThis): Tracker | undefined {
  const globals = win as unknown as Record<string, unknown>
  return [globals['invisit'], globals['invisitAnalytics']].find(isRunningTracker)
}

export function applyQueued(tracker: object, queued: readonly QueuedCall[]): void {
  for (const call of queued) {
    const [method, ...args] = call as [string, ...unknown[]]
    const target = (tracker as unknown as Record<string, unknown>)[method]
    if (typeof target !== 'function') continue
    try {
      ;(target as (...callArgs: unknown[]) => void).apply(tracker, args)
    } catch {}
  }
}

export function installTracker(
  win: Window & typeof globalThis,
  options: TrackerOptions,
): InstallResult {
  const existing = (win as unknown as Record<string, unknown>)['invisit']
  const conflict = isForeign(existing)

  // A page that loads the script tag passes what an attribute cannot, a function, through the
  // stub before the script arrives: invisit('pageUrl', href => ...). Read before the first page
  // view, not with the rest of the queue.
  const queued = isOurStub(existing) ? existing.q?.find((call) => call[0] === 'pageUrl') : undefined
  const pageUrl =
    typeof queued?.[1] === 'function' ? (queued[1] as TrackerOptions['pageUrl']) : undefined
  const tracker = createTracker({ ...options, ...(pageUrl ? { pageUrl } : {}), window: win })
  let running = true
  const stop = tracker.stop
  tracker.stop = () => {
    running = false
    stop()
  }
  Object.defineProperty(tracker, BRAND, { get: () => running, enumerable: false })

  if (isOurStub(existing)) {
    applyQueued(tracker, existing.q ?? [])
    ;(win as unknown as Record<string, unknown>)['invisit'] = tracker
    return { tracker, namespace: 'invisit', outcome: 'drained_stub' }
  }

  if (conflict) {
    ;(win as unknown as Record<string, unknown>)['invisitAnalytics'] = tracker
    win.console?.warn?.(
      '[invisit] window.invisit already belongs to another script; invisit installed as window.invisitAnalytics',
    )
    return { tracker, namespace: 'invisitAnalytics', outcome: 'namespace_conflict' }
  }

  ;(win as unknown as Record<string, unknown>)['invisit'] = tracker
  return { tracker, namespace: 'invisit', outcome: 'installed' }
}

export type TrackerStartOptions = Pick<
  TrackerOptions,
  | 'siteId'
  | 'collectorUrl'
  | 'sdk'
  | 'sdkVersion'
  | 'debug'
  | 'storage'
  | 'outboundLinks'
  | 'fileDownloads'
  | 'excludePaths'
  | 'pageUrl'
  | 'privacyPolicy'
>

export function optionsFromScript(
  script: Element | null,
  fallbackOrigin: string,
): TrackerStartOptions & { privacyPolicy: Partial<PrivacyPolicy> } {
  const attribute = (name: string): string | null => script?.getAttribute(name) ?? null
  const flag = (name: string): boolean | undefined => {
    const value = attribute(name)
    if (value === null) return undefined
    return value !== 'false' && value !== '0'
  }

  const privacyPolicy: { respectGpc?: boolean; respectDnt?: boolean; requireConsent?: boolean } = {}
  const gpc = flag('data-respect-gpc')
  const dnt = flag('data-respect-dnt')
  const consent = flag('data-require-consent')
  if (gpc !== undefined) privacyPolicy.respectGpc = gpc
  if (dnt !== undefined) privacyPolicy.respectDnt = dnt
  if (consent !== undefined) privacyPolicy.requireConsent = consent

  const debug = flag('data-debug')
  const outboundLinks = flag('data-outbound-links')
  const fileDownloads = flag('data-file-downloads')
  const errors = flag('data-errors')
  const storage = attribute('data-storage') === 'none' ? ('none' as const) : undefined

  return {
    siteId: attribute('data-site') ?? '',
    collectorUrl: attribute('data-collector') ?? fallbackOrigin,
    excludePaths: (attribute('data-exclude-paths') ?? '')
      .split(',')
      .map((path) => path.trim())
      .filter(Boolean),
    ...(debug === undefined ? {} : { debug }),
    ...(storage === undefined ? {} : { storage }),
    ...(outboundLinks === undefined ? {} : { outboundLinks }),
    ...(fileDownloads === undefined ? {} : { fileDownloads }),
    ...(errors === undefined ? {} : { errors }),
    privacyPolicy,
  }
}
