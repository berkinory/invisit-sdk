import type { IncomingMessage, ServerResponse } from 'node:http'
import { CLIENT_IP_HEADERS, bareAddress } from './client-ip.ts'
import { InvisitError } from './errors.ts'
import type { Invisit } from './index.ts'
import { DEFAULT_PREFIX, trackerPathOf } from './proxy.ts'

/* Far above any tracker payload (the collector takes 256 KiB), low enough to bound memory. */
const MAX_BODY_BYTES = 1024 * 1024

const SKIPPED_HEADERS = new Set([
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'te',
  'trailer',
  'content-length',
])

/* Express keeps the path it was mounted under here; req.url has it stripped. */
type NodeRequest = IncomingMessage & { readonly originalUrl?: string }

export interface ToRequestOptions {
  /**
   * Whether a proxy you run in front of this server sets the client headers. Off (the default),
   * the visitor is the socket's peer and any `X-Forwarded-*` or platform address header in the
   * request is dropped, since a visitor could have written it. On, `X-Forwarded-Proto` and
   * `X-Forwarded-Host` build the URL and the address headers are kept for `clientIp`, with the
   * socket's peer as `X-Real-IP` when none is present.
   */
  readonly trustProxy?: boolean
}

export interface MiddlewareOptions extends ToRequestOptions {
  /** The path the tracker is served under. Defaults to `/_i`. */
  readonly prefix?: string
}

const firstValue = (value: string | readonly string[] | undefined): string | undefined => {
  const raw = typeof value === 'string' ? value : value?.[0]
  const first = raw?.split(',', 1)[0]?.trim()
  return first === '' ? undefined : first
}

const pathOf = (req: NodeRequest): string => {
  const path = req.originalUrl ?? req.url ?? '/'
  return path.startsWith('/') ? path : `/${path}`
}

function socketAddress(req: IncomingMessage): string | null {
  const raw = req.socket.remoteAddress
  return raw === undefined ? null : bareAddress(raw)
}

function requestHead(
  req: NodeRequest,
  options: ToRequestOptions,
): { url: string; headers: Headers } {
  const trust = options.trustProxy === true
  const encrypted = (req.socket as { encrypted?: boolean }).encrypted === true
  const forwardedProto = trust ? firstValue(req.headers['x-forwarded-proto']) : undefined
  const proto =
    forwardedProto === 'http' || forwardedProto === 'https'
      ? forwardedProto
      : encrypted
        ? 'https'
        : 'http'
  const named =
    (trust ? firstValue(req.headers['x-forwarded-host']) : undefined) ??
    firstValue(req.headers.host) ??
    firstValue(req.headers[':authority'])
  // A host carrying a path, query or credentials would rewrite the URL around it.
  const host = named === undefined || /[/?#@\\]/.test(named) ? 'localhost' : named

  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined || name.startsWith(':') || SKIPPED_HEADERS.has(name)) continue
    if (Array.isArray(value)) for (const item of value) headers.append(name, item)
    else headers.set(name, value)
  }

  const peer = socketAddress(req)
  if (!trust) {
    for (const name of CLIENT_IP_HEADERS) headers.delete(name)
    // Already ignored for the URL; dropped so nothing downstream takes a visitor's word for them.
    headers.delete('x-forwarded-host')
    headers.delete('x-forwarded-proto')
  }
  const hasAddress = CLIENT_IP_HEADERS.some((name) => headers.has(name))
  if (!hasAddress && peer !== null) headers.set('x-real-ip', peer)

  return { url: new URL(`${proto}://${host}${pathOf(req)}`).href, headers }
}

async function readBody(req: IncomingMessage): Promise<Uint8Array<ArrayBuffer>> {
  const chunks: Uint8Array[] = []
  let total = 0
  for await (const chunk of req as AsyncIterable<Uint8Array | string>) {
    const bytes = typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk
    total += bytes.byteLength
    if (total > MAX_BODY_BYTES) {
      throw new InvisitError('PAYLOAD_TOO_LARGE', 'The request body is too large.', {
        status: 413,
      })
    }
    chunks.push(bytes)
  }
  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

/**
 * A Node `http` request as a web `Request`, for `invisit.proxy`, `crawlers` and `track`. Reads
 * the body of anything but GET and HEAD (up to 1 MiB), so call it before a body parser does, and
 * only for requests you hand to invisit.
 */
export async function toRequest(
  req: IncomingMessage,
  options: ToRequestOptions = {},
): Promise<Request> {
  const { url, headers } = requestHead(req, options)
  const method = req.method ?? 'GET'
  const body = method === 'GET' || method === 'HEAD' ? null : await readBody(req)
  return new Request(url, { method, headers, body })
}

/** Writes a web `Response` to a Node `http` response, streaming its body. */
export async function sendResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status
  if (response.statusText !== '') res.statusMessage = response.statusText
  for (const [name, value] of response.headers) {
    if (name !== 'set-cookie') res.setHeader(name, value)
  }
  const cookies = response.headers.getSetCookie()
  if (cookies.length > 0) res.setHeader('set-cookie', cookies)

  if (response.body === null) {
    res.end()
    return
  }
  const reader = response.body.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (res.destroyed) {
        await reader.cancel()
        return
      }
      if (!res.write(value)) {
        await new Promise<void>((resolve) => {
          const resume = (): void => {
            res.off('drain', resume)
            res.off('close', resume)
            resolve()
          }
          res.on('drain', resume)
          res.on('close', resume)
        })
      }
    }
    res.end()
  } catch (error) {
    res.destroy(error instanceof Error ? error : new Error('The response body failed.'))
  }
}

/**
 * Express/Connect-style middleware: answers tracker requests under `prefix` from the collector
 * and hands every other request on with `next`, recording crawler reads with the status your app
 * answered once the response is finished. `next` is awaited, so one that returns a promise works.
 * Without `next` (Fastify's onRequest hook), check `res.headersSent` afterwards to
 * know whether it answered.
 */
export function middleware(
  invisit: Invisit,
  options: MiddlewareOptions = {},
): (
  req: IncomingMessage,
  res: ServerResponse,
  next?: (error?: unknown) => unknown,
) => Promise<void> {
  const prefix = options.prefix ?? DEFAULT_PREFIX
  return async (req, res, next) => {
    const pathname = new URL(`http://localhost${pathOf(req)}`).pathname
    if (trackerPathOf(pathname, prefix) === null) {
      res.once('finish', () => {
        let request: Request
        try {
          const { url, headers } = requestHead(req, options)
          request = new Request(url, { method: req.method ?? 'GET', headers })
        } catch {
          return
        }
        void invisit.crawlers(request, { status: res.statusCode })
      })
      await next?.()
      return
    }

    // A body parser that ran first leaves nothing to forward; an empty event would still get a
    // 202, so the tracker's data would vanish without a trace.
    if (
      req.method === 'POST' &&
      (req.readableEnded || (req as { _body?: unknown })._body === true)
    ) {
      const error = new InvisitError(
        'BODY_CONSUMED',
        'A body parser read the tracker request first; register middleware(invisit) before it.',
        { status: 500 },
      )
      if (next) await next(error)
      else {
        res.statusCode = 500
        res.end()
      }
      return
    }

    let response: Response | null
    try {
      response = await invisit.proxy(await toRequest(req, options), { prefix })
    } catch (error) {
      const status = error instanceof InvisitError ? error.status : null
      if (status === null && next) {
        await next(error)
        return
      }
      res.statusCode = status ?? 400
      res.end()
      return
    }
    // Outside the try: a failure further down the app's chain is not this middleware's to report.
    if (response === null) await next?.()
    else await sendResponse(res, response)
  }
}
