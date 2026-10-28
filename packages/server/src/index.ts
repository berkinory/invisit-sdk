import { bareAddress, clientIp } from './client-ip.ts'
import type { Context, Fetch } from './context.ts'
import { recordCrawler, type CrawlerOptions } from './crawlers.ts'
import { proxyRequest } from './proxy.ts'
import { InvisitError } from './errors.ts'
import { trackEvent, type TrackOptions, type TrackResult } from './track.ts'

export { clientIp } from './client-ip.ts'
export { InvisitError } from './errors.ts'
export type { Fetch } from './context.ts'
export type { CrawlerOptions } from './crawlers.ts'
export type { PropertyValue, TrackOptions, TrackResult } from './track.ts'

const DEFAULT_BASE_URL = 'https://api.invisit.dev'
const API_KEY_PREFIX = 'invisit_sk_'
const UPSTREAM_TIMEOUT_MS = 10_000

export interface InvisitOptions {
  /** An API key with the ingest scope (`invisit_sk_…`). It is secret: never send it to a browser. */
  readonly key: string
  /** Where the collector is: https://api.invisit.dev unless invisit support gives you another address. */
  readonly baseUrl?: string
  /** Reads the visitor's address from a request; replaces the default `clientIp`. */
  readonly clientIp?: (request: Request) => string | null
  /** The fetch to reach the collector with. Defaults to the global one. */
  readonly fetch?: Fetch
  /** Told about failures that are not thrown: proxy 502s and crawler hits that were not taken. */
  readonly onError?: (error: unknown) => void
}

export interface ProxyOptions {
  /** The path the tracker is served under on your site. Defaults to `/_i`. */
  readonly prefix?: string
  /**
   * The visitor's address, for servers with no edge in front to put it in a header (Bun, Deno,
   * a bare Node server): e.g. Hono's `getConnInfo(c).remote.address`. Overrides `clientIp`.
   */
  readonly ip?: string | null
}

export interface HandleOptions extends ProxyOptions {
  /** Keeps the crawler hit running after the response, e.g. `event.waitUntil` or `ctx.waitUntil`. */
  readonly waitUntil?: (promise: Promise<unknown>) => void
}

export interface Invisit {
  /**
   * Forwards a tracker request under `prefix` (`/_i/invisit.js`, `/_i/v1/events`…) to the
   * collector, vouching for the visitor's address with the API key. Resolves to null for any
   * other path. Never rejects: an unreachable collector is a 502.
   */
  proxy(request: Request, options?: ProxyOptions): Promise<Response | null>
  /** Records the request as a crawler read when its user agent looks like one. Never rejects. */
  crawlers(request: Request, options?: CrawlerOptions): Promise<void>
  /**
   * Sends a custom event for the visitor behind `options.request`. Rejects with an InvisitError
   * when the collector refuses it or cannot be reached.
   */
  track(name: string, options: TrackOptions): Promise<TrackResult>
  /**
   * The middleware one-liner: proxies tracker requests, and for every other request records
   * crawler reads in the background and resolves to null so your app answers it.
   */
  handle(request: Request, options?: HandleOptions): Promise<Response | null>
}

const reportError = (error: unknown): void => {
  console.error('[invisit]', error)
}

/** Creates the server client for one site. */
export function createInvisit(options: InvisitOptions): Invisit {
  if (typeof options.key !== 'string' || options.key === '') {
    throw new TypeError('createInvisit: no key given. Is INVISIT_API_KEY set where this runs?')
  }
  if (!options.key.startsWith(API_KEY_PREFIX)) {
    throw new TypeError(
      `createInvisit: key must be an API key with the ingest scope (${API_KEY_PREFIX}…), not the site id.`,
    )
  }
  const onError = options.onError ?? reportError
  let ipWarned = false
  const context: Context = {
    key: options.key,
    baseUrl: (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, ''),
    clientIp: options.clientIp ?? clientIp,
    // Called unbound and looked up per call: some runtimes reject fetch invoked on another
    // object, and a global replaced after startup (instrumentation, tests) is still used.
    // A hung collector must not hold the site's own request (Node waits 300 s by default).
    fetch: (input, init) =>
      (options.fetch ?? globalThis.fetch)(input, {
        ...init,
        signal: init.signal ?? AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      }),
    onError: (error) => {
      try {
        onError(error)
      } catch {
        // A failing error handler must not turn a background failure into a crash.
      }
    },
    noteUnresolvedIp: () => {
      if (ipWarned) return
      ipWarned = true
      context.onError(
        new InvisitError(
          'CLIENT_IP_UNRESOLVED',
          'A proxied visitor came without an address, so the collector sees this server instead: pass `ip`, or clientIp to createInvisit.',
        ),
      )
    },
  }

  const crawlers = (request: Request, crawlerOptions?: CrawlerOptions): Promise<void> =>
    recordCrawler(context, request, crawlerOptions)
  const withIp = (ip: string | null | undefined): Context =>
    ip == null ? context : { ...context, clientIp: () => bareAddress(ip) }

  return {
    proxy: (request, proxyOptions) =>
      proxyRequest(withIp(proxyOptions?.ip), request, proxyOptions?.prefix),
    crawlers,
    track: (name, trackOptions) => trackEvent(withIp(trackOptions.ip), name, trackOptions),
    async handle(request, handleOptions) {
      const response = await proxyRequest(withIp(handleOptions?.ip), request, handleOptions?.prefix)
      if (response !== null) return response
      const pending = crawlers(request)
      if (handleOptions?.waitUntil) handleOptions.waitUntil(pending)
      return null
    },
  }
}
