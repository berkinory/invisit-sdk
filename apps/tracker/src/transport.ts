import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_ATTEMPTS,
  BACKOFF_MAX_MS,
  BATCH_DELAY_MS,
  MAX_EVENTS_PER_BATCH,
  MAX_SEND_BYTES,
  TRACKER_SCHEMA_VERSION,
} from './constants.ts'
import type { RetryQueue } from './storage.ts'
import type { EventBatchBody, HeartbeatBody, TrackerContext, TrackerEvent } from './types.ts'

export const INGEST_CONTENT_TYPE = 'text/plain;charset=UTF-8'

export interface TransportDeps {
  readonly collectorUrl: string
  readonly siteId: string
  readonly context: TrackerContext
  readonly queue: RetryQueue
  readonly now: () => number
  readonly fetchImpl?: ((url: string, init: RequestInit) => Promise<Response>) | undefined
  readonly beaconImpl?: ((url: string, body: string) => boolean) | undefined
  readonly schedule?: ((task: () => void, delayMs: number) => void) | undefined
  readonly random?: () => number
  readonly onError?: ((reason: string) => void) | undefined
  readonly maySend?: () => boolean
}

function endpoint(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path}`
}

const encoder = new TextEncoder()

function chunk(events: readonly TrackerEvent[], envelopeBytes: number): TrackerEvent[][] {
  const batches: TrackerEvent[][] = []
  let current: TrackerEvent[] = []
  let bytes = envelopeBytes

  for (const event of events) {
    const size = encoder.encode(JSON.stringify(event)).length + 1
    if (
      current.length > 0 &&
      (current.length >= MAX_EVENTS_PER_BATCH || bytes + size > MAX_SEND_BYTES)
    ) {
      batches.push(current)
      current = []
      bytes = envelopeBytes
    }
    current.push(event)
    bytes += size
  }
  if (current.length > 0) batches.push(current)
  return batches
}

function retryAfterMs(header: string | null, now: number): number | null {
  if (!header) return null
  const seconds = Number(header)
  const ms = isFinite(seconds) ? seconds * 1000 : Date.parse(header) - now
  return ms >= 0 ? ms : null
}

export function createTransport(deps: TransportDeps) {
  const eventsUrl = endpoint(deps.collectorUrl, '/v1/events')
  const heartbeatUrl = endpoint(deps.collectorUrl, '/v1/realtime/heartbeat')

  const schedule =
    deps.schedule ??
    ((task: () => void, delayMs: number) => {
      setTimeout(task, delayMs)
    })

  const random = deps.random ?? Math.random

  let buffer: TrackerEvent[] = []
  let flushScheduled = false
  let attempts = 0
  let backoffUntil = 0
  let generation = 0
  const requests = new Set<AbortController>()

  const cancelPending = (discardQueue = true): void => {
    generation += 1
    buffer = []
    if (discardQueue) deps.queue.clear()
    flushScheduled = false
    attempts = 0
    backoffUntil = 0
    for (const request of requests) request.abort()
    requests.clear()
  }

  const maySend = (): boolean => {
    if (deps.maySend?.() !== false) return true
    cancelPending()
    return false
  }

  const serialize = (
    payload:
      | Pick<EventBatchBody, 'context' | 'events'>
      | Omit<HeartbeatBody, 'schema_version' | 'site_id' | 'sent_at'>,
  ): string =>
    JSON.stringify({
      schema_version: TRACKER_SCHEMA_VERSION,
      site_id: deps.siteId,
      sent_at: new Date(deps.now()).toISOString(),
      ...payload,
    })

  const request = (payload: string): RequestInit => ({
    method: 'POST',
    body: payload,
    keepalive: true,
    credentials: 'omit',
    mode: 'cors',
    headers: { 'Content-Type': INGEST_CONTENT_TYPE },
  })

  const fetchPayload = async (url: string, payload: string): Promise<Response> => {
    const controller = new AbortController()
    requests.add(controller)
    try {
      return await deps.fetchImpl!(url, { ...request(payload), signal: controller.signal })
    } finally {
      requests.delete(controller)
    }
  }

  const body = (events: readonly TrackerEvent[]): string => {
    return serialize({ context: deps.context, events })
  }

  const requeue = (events: readonly TrackerEvent[], reason: string): void => {
    deps.queue.push(events, deps.now())
    deps.onError?.(reason)
  }

  const backOff = (serverDelayMs: number | null): void => {
    const now = deps.now()
    if (now < backoffUntil) return
    attempts += 1
    const ceiling = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (attempts - 1))
    const delay = Math.max(serverDelayMs ?? 0, ceiling / 2 + random() * (ceiling / 2))
    backoffUntil = now + delay
    const current = generation
    if (attempts < BACKOFF_MAX_ATTEMPTS) {
      schedule(() => {
        if (current === generation) flush()
      }, delay)
    }
  }

  const post = async (payload: string, events: readonly TrackerEvent[]): Promise<void> => {
    if (!maySend()) return
    const current = generation
    const fetchImpl = deps.fetchImpl
    if (!fetchImpl) {
      requeue(events, 'no_transport')
      return
    }

    try {
      const response = await fetchPayload(eventsUrl, payload)
      if (current !== generation || !maySend()) return

      if (response.ok) {
        attempts = 0
        return
      }

      if (response.status === 429 || response.status >= 500) {
        requeue(events, `status_${response.status}`)
        backOff(retryAfterMs(response.headers.get('Retry-After'), deps.now()))
        return
      }
      deps.onError?.(`dropped_${response.status}`)
    } catch {
      if (current !== generation || !maySend()) return
      requeue(events, 'network_error')
      backOff(null)
    }
  }

  const sendBeacon = (payload: string, events: readonly TrackerEvent[]): void => {
    if (!maySend()) return
    const beaconImpl = deps.beaconImpl
    if (!beaconImpl) {
      void post(payload, events)
      return
    }
    let delivered = false
    try {
      delivered = beaconImpl(eventsUrl, payload)
    } catch {
      delivered = false
    }
    if (!delivered) requeue(events, 'beacon_refused')
  }

  const flush = (options: { beacon?: boolean } = {}): void => {
    flushScheduled = false
    if (!maySend()) return

    // The page's exit is the queue's last chance, since nothing outlives the page; one beacon per
    // exit is no burden even while backing off.
    if (options.beacon !== true && deps.now() < backoffUntil) {
      if (buffer.length > 0) deps.queue.push(buffer, deps.now())
      buffer = []
      return
    }

    const pending = deps.queue.take(deps.now()).concat(buffer)
    buffer = []
    if (pending.length === 0) return

    const batches =
      pending.length === 1 ? [pending] : chunk(pending, encoder.encode(body([])).length)
    for (const batch of batches) {
      const payload = body(batch)
      if (options.beacon === true) sendBeacon(payload, batch)
      else void post(payload, batch)
    }
  }

  return {
    enqueue(event: TrackerEvent, options: { immediate?: boolean } = {}): void {
      if (!maySend()) return
      buffer.push(event)

      if (options.immediate === true) {
        flush()
        return
      }
      if (!flushScheduled) {
        flushScheduled = true
        const current = generation
        schedule(() => {
          if (current === generation) flush()
        }, BATCH_DELAY_MS)
      }
    },

    flush,
    cancelPending,

    pending(): number {
      return buffer.length
    },

    sendHeartbeat(payload: Omit<HeartbeatBody, 'schema_version' | 'site_id' | 'sent_at'>) {
      if (!maySend()) return
      const serialized = serialize(payload)

      const beaconImpl = deps.beaconImpl
      const fetchImpl = deps.fetchImpl
      try {
        if (beaconImpl) {
          beaconImpl(heartbeatUrl, serialized)
          return
        }
        if (fetchImpl) {
          void fetchPayload(heartbeatUrl, serialized).catch(() => {})
        }
      } catch {}
    },
  }
}
