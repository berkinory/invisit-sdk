import { TRACKER_NPM_SDK } from '@invisit/tracker/constants'
import { importChunk } from '@invisit/tracker/import-chunks'
import { applyQueued, runningTracker, type QueuedCall } from '@invisit/tracker/install'
import { startTracker } from '@invisit/tracker/start'
import { version as PACKAGE_VERSION } from '../package.json'

/* The public types are written out here rather than re-exported, so the published declarations
   stand alone; the compiler still holds them to the tracker's own (init() returns one). */

export interface InitOptions {
  /** The site id, from Settings → Installation. It is public. */
  readonly site: string
  /** Where the collector is: https://api.invisit.dev (the default), or a first-party proxy
     path such as "/_i". */
  readonly baseUrl?: string
  /** Logs each delivery and why anything was refused, and lets a browser driven by automation
     send events. They still count: test without counting from Settings → Debug. */
  readonly debug?: boolean
  /** "none" keeps even the consent answer and the owner's opt-out off the device. */
  readonly storage?: 'auto' | 'none'
  readonly outboundLinks?: boolean
  readonly fileDownloads?: boolean
  /** Paths never measured: exact ("/health") or a trailing wildcard ("/preview/*"). */
  readonly excludePaths?: readonly string[]
  /** Rewrites each page address before it is recorded, for example to turn
     "/orders/8121" into "/orders/:id" so a report groups one route instead of every id.
     Gets the full URL and returns a full URL; query parameters and the fragment are
     redacted afterwards as usual. A page whose path it changes opens nowhere, so it gets no
     click heatmap. */
  readonly pageUrl?: (href: string) => string
  /** Leaves out browsers that send Global Privacy Control. Off unless set. */
  readonly respectGpc?: boolean
  /** Leaves out browsers that send Do Not Track. Off unless set. */
  readonly respectDnt?: boolean
  /** Measures nothing until consent("granted"). Off unless set. */
  readonly requireConsent?: boolean
}

export type Properties = Record<string, unknown>

export type ConsentState = 'granted' | 'denied' | 'unknown'

export interface FeedbackMessage {
  readonly message: string
  readonly email?: string
}

export interface Tracker {
  track(name: string, properties?: Properties, options?: { actionId?: string }): void
  identify(externalUserId: string): void
  conversion(name: string, properties?: Properties): void
  pageview(): void
  consent(state: ConsentState): void
  feedback(): void
  sendFeedback(input: FeedbackMessage): Promise<boolean>
  flush(): void
  stop(): void
  visitId(): string | null
  readonly version: string
}

const DEFAULT_BASE_URL = 'https://api.invisit.dev'

let started = false
let instance: Tracker | undefined
const queue: QueuedCall[] = []

const browser = (): (Window & typeof globalThis) | undefined =>
  typeof window === 'undefined' || typeof document === 'undefined' ? undefined : window

const current = (win: Window & typeof globalThis): Tracker | undefined =>
  instance ?? runningTracker(win)

const forward = (call: QueuedCall): void => {
  const win = browser()
  if (!win) return
  const tracker = current(win)
  if (tracker) applyQueued(tracker, [call])
  else if (!started) queue.push(call)
}

/** Starts the tracker once per page and returns it; undefined on the server, in heatmap overlay
   mode, for an owner who opted out, or without a site. A tracker the script tag already started
   is reused as it is. */
export function init(options: InitOptions): Tracker | undefined {
  const win = browser()
  if (!win) return undefined
  if (started) {
    if (options.debug) win.console?.warn?.('[invisit] init() already ran; reusing its tracker')
    return instance
  }
  started = true

  const existing = runningTracker(win)
  if (existing && options.debug) {
    win.console?.warn?.('[invisit] a script tag already started invisit; init() options ignored')
  }
  const privacyPolicy = {
    ...(options.respectGpc === undefined ? {} : { respectGpc: options.respectGpc }),
    ...(options.respectDnt === undefined ? {} : { respectDnt: options.respectDnt }),
    ...(options.requireConsent === undefined ? {} : { requireConsent: options.requireConsent }),
  }
  instance =
    existing ??
    startTracker(
      win,
      {
        siteId: options.site,
        collectorUrl: options.baseUrl ?? DEFAULT_BASE_URL,
        sdk: TRACKER_NPM_SDK,
        sdkVersion: PACKAGE_VERSION,
        excludePaths: options.excludePaths ?? [],
        privacyPolicy,
        ...(options.debug === undefined ? {} : { debug: options.debug }),
        ...(options.storage === undefined ? {} : { storage: options.storage }),
        ...(options.outboundLinks === undefined ? {} : { outboundLinks: options.outboundLinks }),
        ...(options.fileDownloads === undefined ? {} : { fileDownloads: options.fileDownloads }),
        ...(options.pageUrl === undefined ? {} : { pageUrl: options.pageUrl }),
      },
      importChunk,
    )
  const queued = queue.splice(0)
  if (instance) applyQueued(instance, queued)
  return instance
}

export function track(
  name: string,
  properties?: Properties,
  options?: { actionId?: string },
): void {
  forward(['track', name, properties, options])
}

export function identify(externalUserId: string): void {
  forward(['identify', externalUserId])
}

export function consent(state: ConsentState): void {
  forward(['consent', state])
}

/** Opens the feedback widget, where the site has it on. */
export function feedback(): void {
  forward(['feedback'])
}

export function flush(): void {
  forward(['flush'])
}

/** The current visit's id, to pass into a checkout as `invisit_visit_id` metadata so its
   revenue is attributed to this visit's source, campaign, landing page and short link. It names
   the visit alone and changes with every visit. Null on the server, before init(), before the
   collector has answered the first page view, after 30 idle minutes, or while nothing may be
   measured. */
export function visitId(): string | null {
  const win = browser()
  const tracker = win && current(win)
  return tracker ? tracker.visitId() : null
}

/** Sends one message from the site's own form; resolves to whether the collector took it, and to
   false with no running tracker (on the server, or before init()). */
export function sendFeedback(input: FeedbackMessage): Promise<boolean> {
  const win = browser()
  const tracker = win && current(win)
  return tracker ? tracker.sendFeedback(input) : Promise.resolve(false)
}
