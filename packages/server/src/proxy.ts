import { authorization, type Context } from './context.ts'

export const DEFAULT_PREFIX = '/_i'

const TRACKER_PATHS = [
  /^\/invisit\.js$/,
  /^\/invisit-[a-z\d-]+\.js$/,
  /^\/_invisit\/[^/]+\/[^/]+$/,
  /^\/v1\/tracker\/(?:config|release)$/,
  /^\/v1\/events$/,
  /^\/v1\/realtime\/heartbeat$/,
  /^\/v1\/feedback$/,
]

const METHODS = new Set(['GET', 'HEAD', 'POST'])
/* A Response with one of these statuses must not be given a body, not even an empty stream. */
const NULL_BODY_STATUSES = new Set([204, 205, 304])
// Matches the Node adapter's cap; the collector itself takes at most 256 KiB.
const MAX_BODY_BYTES = 1024 * 1024

/* Anything else (cookies, the site's own credentials, Host) stays on this side. Content-Encoding
   describes a request body passed on byte for byte. */
const FORWARDED_REQUEST_HEADERS = [
  'user-agent',
  'accept',
  'accept-language',
  'content-type',
  'content-encoding',
  'origin',
  'referer',
  'if-none-match',
]
const FORWARDED_REQUEST_PREFIXES = ['sec-fetch-', 'sec-ch-ua']

/* Content-Encoding and Content-Length are left out on purpose: fetch has already decoded any
   compressed body it got, so both would describe bytes that are no longer there. */
const FORWARDED_RESPONSE_HEADERS = [
  'content-type',
  'cache-control',
  'etag',
  'vary',
  'retry-after',
  'access-control-expose-headers',
]

const normalizePrefix = (prefix: string): string => {
  const trimmed = prefix.replace(/\/+$/, '')
  return trimmed === '' || trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

export function trackerPathOf(pathname: string, prefix: string = DEFAULT_PREFIX): string | null {
  const base = normalizePrefix(prefix)
  if (!pathname.startsWith(`${base}/`)) return null
  const path = pathname.slice(base.length)
  return TRACKER_PATHS.some((pattern) => pattern.test(path)) ? path : null
}

function upstreamHeaders(context: Context, request: Request): Headers {
  const headers = new Headers()
  for (const [name, value] of request.headers) {
    if (
      FORWARDED_REQUEST_HEADERS.includes(name) ||
      FORWARDED_REQUEST_PREFIXES.some((prefix) => name.startsWith(prefix))
    ) {
      headers.set(name, value)
    }
  }
  // Asked for explicitly, or the runtime's fetch would ask for gzip on its own.
  headers.set('accept-encoding', 'identity')
  headers.set('authorization', authorization(context))
  const ip = context.clientIp(request)
  if (ip !== null) headers.set('x-invisit-client-ip', ip)
  else context.noteUnresolvedIp()
  return headers
}

function downstreamHeaders(upstream: Headers): Headers {
  const headers = new Headers()
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.get(name)
    if (value !== null) headers.set(name, value)
  }
  return headers
}

export async function proxyRequest(
  context: Context,
  request: Request,
  prefix: string = DEFAULT_PREFIX,
): Promise<Response | null> {
  const url = new URL(request.url)
  const path = trackerPathOf(url.pathname, prefix)
  if (path === null) return null
  if (!METHODS.has(request.method)) {
    return new Response(null, { status: 405, headers: { allow: 'GET, HEAD, POST' } })
  }

  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return new Response(null, { status: 413, headers: { 'cache-control': 'no-store' } })
  }

  try {
    // Tracker payloads are small: buffering them avoids streamed request bodies, which not every
    // runtime's fetch supports.
    const body = request.method === 'POST' ? await request.arrayBuffer() : null
    const upstream = await context.fetch(`${context.baseUrl}${path}${url.search}`, {
      method: request.method,
      headers: upstreamHeaders(context, request),
      body,
      redirect: 'manual',
    })
    const bodyless = request.method === 'HEAD' || NULL_BODY_STATUSES.has(upstream.status)
    return new Response(bodyless ? null : upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: downstreamHeaders(upstream.headers),
    })
  } catch (error) {
    context.onError(error)
    return new Response(null, { status: 502, headers: { 'cache-control': 'no-store' } })
  }
}
