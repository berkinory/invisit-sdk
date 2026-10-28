import { isbot } from 'isbot'
import { authorization, type Context } from './context.ts'
import { errorFromResponse } from './errors.ts'

/* A loose first pass: the collector classifies each hit itself and drops what is not a crawler. */

/* The collector's bound on a hit's user agent; longer ones would fail the whole batch. */
const USER_AGENT_MAX_LENGTH = 512

const BIND_ADDRESS = /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1?\]|0\.0\.0\.0)$/

/* request.url wins; only a bind address falls back to Host. X-Forwarded-Host is never read: a
   visitor can write it, and an adapter that trusts a proxy already folded it into request.url. */
function hostnameOf(request: Request, url: URL): string {
  if (!BIND_ADDRESS.test(url.hostname)) return url.hostname
  const host = request.headers.get('host')
  if (!host) return url.hostname
  try {
    return new URL(`http://${host}`).hostname
  } catch {
    return url.hostname
  }
}

/* robots.txt and sitemaps stay in: what a crawler asks of them is worth seeing. */
const READ_METHODS = new Set(['GET', 'HEAD'])
const STATIC_ASSET = /\.(?:css|m?js|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf)$/i

export interface CrawlerOptions {
  /** The status your server answered with. Defaults to 200 where it is not known yet. */
  readonly status?: number
}

/* Runs beside the response and must never break it: failures go to onError. */
export async function recordCrawler(
  context: Context,
  request: Request,
  options: CrawlerOptions = {},
): Promise<void> {
  const userAgent = request.headers.get('user-agent')
  if (!userAgent || !isbot(userAgent)) return
  if (!READ_METHODS.has(request.method)) return
  // A rendering crawler's own fetches and a framework's data requests (Next's RSC and prefetch)
  // are not page reads; counting them would multiply every visit.
  const dest = request.headers.get('sec-fetch-dest')
  if (request.headers.has('rsc') || (dest !== null && dest !== 'document')) return
  const url = new URL(request.url)
  if (STATIC_ASSET.test(url.pathname)) return
  try {
    const response = await context.fetch(`${context.baseUrl}/v1/crawls`, {
      method: 'POST',
      headers: { authorization: authorization(context), 'content-type': 'application/json' },
      body: JSON.stringify({
        hits: [
          {
            timestamp: new Date().toISOString(),
            method: request.method,
            hostname: hostnameOf(request, url),
            path: url.pathname,
            status: options.status ?? 200,
            user_agent: userAgent.slice(0, USER_AGENT_MAX_LENGTH),
          },
        ],
      }),
    })
    if (!response.ok) context.onError(await errorFromResponse(response))
    else await response.body?.cancel()
  } catch (error) {
    context.onError(error)
  }
}
