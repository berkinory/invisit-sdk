import type { ErrorSource } from './errors-watch.ts'
import { INGEST_CONTENT_TYPE } from './transport.ts'
import type { TrackerContext } from './types.ts'

export type ErrorKind = 'error' | 'rejection' | 'resource' | 'manual'

/* What a listener's event comes to, read here so the main script stays out of it. */
export interface RawError {
  readonly kind: ErrorKind
  readonly value?: unknown
  readonly text?: string
  readonly file?: string
  readonly line?: number
  readonly col?: number
}

export interface ErrorsDeps {
  readonly errorsCollector: string
  readonly errorsSiteId: string
  readonly errorsContext: TrackerContext
  readonly errorsToken?: string | undefined
  readonly errorsAllowed: () => boolean
  readonly errorsVisit: () => string | null
  readonly errorsPage: () => string
}

export interface ErrorFrame {
  fn?: string
  file?: string
  line?: number
  col?: number
}

export interface ErrorReport {
  kind: ErrorKind
  name: string
  message: string
  frames: ErrorFrame[]
  count: number
  occurred_at: string
  page: string
}

/* Past these a broken page has said what it has to say: an error is sent once when it first
   happens, and whatever repeats after that waits for the visitor to leave, as one more row with
   a count. A loop in an open tab is never a stream of requests. */
const FLUSH_DELAY_MS = 4_000
const MAX_DISTINCT_PER_PAGE = 50
const MAX_PER_REQUEST = 10
const MAX_FRAMES = 8
const MAX_COUNT = 1_000
const MESSAGE_MAX = 300
const PAGE_MAX = 1_024
const NAME_MAX = 64
const FN_MAX = 96
const URL_MAX = 512

const REDACTED = '[redacted]'
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]{2,}/g
const JWT = /\beyJ[\w-]{6,}\.[\w-]{6,}(?:\.[\w-]+)?/g
const BEARER = /\b(bearer|basic|token)\s+[\w.~+/=-]{8,}/gi
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
const LONG_SECRET = /\b(?=[\w+=-]*\d)(?=[\w+=-]*[a-zA-Z])[\w+=-]{24,}\b/g
const DIGIT_RUN = /\d[\d\s().+-]{6,}\d/g
const URL_QUERY = /(https?:\/\/[^\s'"`?#]+)[?#][^\s'"`]*/gi
const QUOTED = /(^|[^\w])(["'`])([^"'`\n]*)\2/g
const CODE_LIKE = /^(?:.|[\w$.:/#-]{1,64})$/

/* Kept the same as redactErrorText in @invisit/domain, which runs again on arrival: the tracker
   has no dependencies, and nothing raw should leave the page either way. */
export function scrubErrorText(value: string): string {
  return value
    .replace(URL_QUERY, '$1')
    .replace(JWT, REDACTED)
    .replace(BEARER, `$1 ${REDACTED}`)
    .replace(EMAIL, REDACTED)
    .replace(UUID, REDACTED)
    .replace(LONG_SECRET, REDACTED)
    .replace(DIGIT_RUN, (match) => (match.replace(/\D/g, '').length >= 9 ? REDACTED : match))
    .replace(QUOTED, (match, before: string, quote: string, inner: string) =>
      inner === '' || CODE_LIKE.test(inner) ? match : `${before}${quote}${REDACTED}${quote}`,
    )
}

const bareUrl = (url: string): string => url.replace(/[?#].*$/, '').slice(0, URL_MAX)

const V8_FRAME = /^\s*at (?:(.*?) \()?(.*?):(\d+):(\d+)\)?\s*$/
const GECKO_FRAME = /^\s*(.*?)@(.*?):(\d+):(\d+)\s*$/

/* Chrome and Edge write "at fn (url:1:2)", Firefox and Safari "fn@url:1:2". */
export function parseStack(stack: string): ErrorFrame[] {
  const frames: ErrorFrame[] = []
  for (const line of stack.split('\n')) {
    if (frames.length === MAX_FRAMES) break
    const match = V8_FRAME.exec(line) ?? GECKO_FRAME.exec(line)
    if (!match) continue
    const fn = (match[1] ?? '').replace(/^(?:(?:async|new) )+/, '').slice(0, FN_MAX)
    frames.push({
      ...(fn ? { fn } : {}),
      file: bareUrl(match[2] ?? ''),
      line: Number(match[3]),
      col: Number(match[4]),
    })
  }
  return frames
}

const FOREIGN_FILE = /^(?:[a-z-]+-extension|webkit-masked-url|extension):/i

const siteOf = (host: string): string => host.split('.').slice(-2).join('.')

function loadFailure(
  raw: RawError,
  pageHost: string,
): Omit<ErrorReport, 'count' | 'occurred_at' | 'page'> | null {
  const url = bareUrl(raw.file ?? '')
  // Another site's script failing is an ad blocker doing its job, on most visits of most sites.
  try {
    if (siteOf(new URL(url).hostname) !== siteOf(pageHost)) return null
  } catch {
    return null
  }
  return {
    kind: 'resource',
    name: raw.text === 'SCRIPT' ? 'ScriptLoadError' : 'StylesheetLoadError',
    message: `Failed to load ${url}`.slice(0, MESSAGE_MAX),
    frames: [{ file: url }],
  }
}

function describe(raw: RawError): Omit<ErrorReport, 'count' | 'occurred_at' | 'page'> {
  const value = raw.value as
    | { name?: unknown; message?: unknown; stack?: unknown }
    | null
    | undefined
  const isError = typeof value === 'object' && value !== null && typeof value.message === 'string'
  const text = raw.text ?? ''
  const opaque = !isError && value == null && text.replace(/^Uncaught /, '') === 'Script error.'
  // A thrown object is the program's own data: only an Error's fields are read, never its shape.
  const message = isError
    ? (value.message as string)
    : typeof raw.value === 'string'
      ? raw.value
      : value == null && text !== ''
        ? text.replace(/^Uncaught (?:\w*Error: )?/, '')
        : `Non-Error ${raw.kind === 'rejection' ? 'rejection' : 'throw'}: ${value === null ? 'null' : typeof value}`
  const stack = isError && typeof value.stack === 'string' ? value.stack : ''
  const parsed = parseStack(stack)
  return {
    kind: raw.kind,
    name: opaque
      ? 'Script error'
      : isError && typeof value.name === 'string' && value.name !== ''
        ? value.name.slice(0, NAME_MAX)
        : 'Error',
    message: opaque ? '' : scrubErrorText(message.slice(0, MESSAGE_MAX * 2)).slice(0, MESSAGE_MAX),
    frames:
      parsed.length > 0 || !raw.file
        ? parsed
        : [{ file: bareUrl(raw.file), line: raw.line ?? 0, col: raw.col ?? 0 }],
  }
}

function rawOf(source: ErrorSource, value: unknown): RawError | null {
  if (source === 1) return { kind: 'rejection', value }
  if (source === 2) return { kind: 'manual', value }
  const event = value as ErrorEvent
  const element = event.target as (Element & { src?: string; href?: string }) | null
  const tag = element?.tagName
  if (!tag) {
    return {
      kind: 'error',
      value: event.error,
      text: event.message,
      file: event.filename,
      line: event.lineno,
      col: event.colno,
    }
  }
  if (tag === 'SCRIPT' || (tag === 'LINK' && element.getAttribute('rel') === 'stylesheet')) {
    return { kind: 'resource', text: tag, file: element.src || element.href || '' }
  }
  return null
}

export function createErrors(
  win: Window & typeof globalThis,
  deps: ErrorsDeps,
): (source: ErrorSource, value: unknown) => void {
  const known = new Map<string, ErrorReport | null>()
  const pending = new Set<ErrorReport>()
  /* Sent once already: repeats of these go out with the page, not on the timer. */
  const repeats = new WeakSet<ErrorReport>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let leaving = false

  const send = (payload: string, beacon: boolean): void => {
    const url = `${deps.errorsCollector.replace(/\/+$/, '')}/v1/errors`
    if (beacon && win.navigator.sendBeacon?.(url, payload)) return
    void win
      .fetch(url, {
        method: 'POST',
        body: payload,
        keepalive: true,
        credentials: 'omit',
        mode: 'cors',
        headers: { 'Content-Type': INGEST_CONTENT_TYPE },
      })
      .catch(() => {})
  }

  /* Counting starts from zero on a new copy, since a sent report may still be in flight. */
  const rearm = (report: ErrorReport, sent: boolean): void => {
    pending.delete(report)
    for (const [key, value] of known) {
      if (value !== report) continue
      const next = { ...report, count: 0 }
      if (sent) repeats.add(next)
      known.set(key, next)
    }
  }

  const flush = (beacon: boolean): void => {
    clearTimeout(timer)
    timer = undefined
    if (pending.size === 0) return
    if (!deps.errorsAllowed()) {
      for (const report of [...pending]) rearm(report, false)
      return
    }
    const due = (): ErrorReport[] => [...pending].filter((report) => beacon || !repeats.has(report))
    const errors = due().slice(0, MAX_PER_REQUEST)
    if (errors.length === 0) return
    const visit = deps.errorsVisit()
    send(
      JSON.stringify({
        site_id: deps.errorsSiteId,
        ...(visit ? { visit_id: visit } : {}),
        sdk: deps.errorsContext.sdk,
        sdk_version: deps.errorsContext.sdk_version,
        sent_at: new Date().toISOString(),
        ...(deps.errorsToken ? { debug_token: deps.errorsToken } : {}),
        errors,
      }),
      beacon,
    )
    for (const report of errors) rearm(report, true)
    if (due().length > 0) schedule()
  }

  const schedule = (): void => {
    timer ??= setTimeout(() => flush(false), FLUSH_DELAY_MS)
  }

  const leave = (): void => flush(true)
  win.addEventListener('pagehide', () => {
    leaving = true
    leave()
  })
  win.addEventListener('pageshow', () => void (leaving = false))
  win.document?.addEventListener('visibilitychange', () => {
    if (win.document.visibilityState === 'hidden') leave()
  })

  return (source, seen) => {
    try {
      const raw = rawOf(source, seen)
      if (raw === null) return
      // Requests the browser cancels as the page goes, or that an offline device could not make.
      if (leaving && raw.kind === 'rejection') return
      if (raw.kind !== 'manual' && win.navigator.onLine === false) return
      const value = raw.value as { message?: unknown; stack?: unknown } | null | undefined
      const said = typeof value === 'string' ? value : value?.message
      const page = deps.errorsPage().slice(0, PAGE_MAX)
      const key = `${page}\n${raw.kind}\n${raw.text}\n${raw.file}\n${String(said)}\n${String(value?.stack).slice(0, 240)}`
      let report = known.get(key)
      if (report === undefined) {
        if (known.size === MAX_DISTINCT_PER_PAGE) return
        const described =
          raw.kind === 'resource' ? loadFailure(raw, win.location.hostname) : describe(raw)
        const top = described?.frames.find((frame) => frame.file)?.file
        const kept = described && !(top && FOREIGN_FILE.test(top))
        report = kept ? { ...described, count: 0, occurred_at: '', page: '' } : null
        known.set(key, report)
      }
      if (report === null || report.count === MAX_COUNT) return
      if (report.count === 0) {
        report.occurred_at = new Date().toISOString()
        report.page = page
        pending.add(report)
      }
      report.count += 1
      if (!repeats.has(report)) schedule()
    } catch {}
  }
}

export const TRACKER_ERRORS = { createErrors }
export type TrackerErrors = typeof TRACKER_ERRORS
