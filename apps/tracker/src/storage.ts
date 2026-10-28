import { RETRY_MAX_EVENTS, RETRY_TTL_MS, SESSION_INACTIVITY_MS } from './constants.ts'
import type { TrackerEvent } from './types.ts'

export interface SafeStorage {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

export const memoryStorage = (): SafeStorage => {
  const map = new Map<string, string>()
  return {
    get: (key) => map.get(key) ?? null,
    set: (key, value) => void map.set(key, value),
    remove: (key) => void map.delete(key),
  }
}

// Reading window.localStorage itself throws where the visitor blocks site data or the page is a
// sandboxed frame; the tracker then runs on memory instead of not at all.
export function deviceStorage(
  win: { readonly localStorage?: Storage; readonly sessionStorage?: Storage },
  name: 'localStorage' | 'sessionStorage',
): Storage | null {
  try {
    return win[name] ?? null
  } catch {
    return null
  }
}

// Nothing is written to find out whether writing works: the first real write tells, and a store
// that refuses it (a full quota, a private window) hands over to memory for the rest of the page.
export function safeStorage(candidate: Storage | null | undefined): SafeStorage {
  if (!candidate) return memoryStorage()
  let fallback: SafeStorage | null = null

  return {
    get: (key) => {
      if (fallback) return fallback.get(key)
      try {
        return candidate.getItem(key)
      } catch {
        return null
      }
    },
    set: (key, value) => {
      if (fallback) return fallback.set(key, value)
      try {
        candidate.setItem(key, value)
      } catch {
        fallback = memoryStorage()
        fallback.set(key, value)
      }
    },
    remove: (key) => {
      if (fallback) return fallback.remove(key)
      try {
        candidate.removeItem(key)
      } catch {}
    },
  }
}

// Both live and die with the page: the collector stitches visits from its daily identity, and
// unsent events are not kept on the device.
export function createSessionTracker(newId: () => string) {
  let session: { id: string; last: number } | null = null
  return {
    current(now: number): string {
      if (!session || now - session.last > SESSION_INACTIVITY_MS)
        session = { id: newId(), last: now }
      else session.last = now
      return session.id
    },
  }
}

interface QueuedEvent {
  q: number
  e: TrackerEvent
}

export function createRetryQueue() {
  let entries: QueuedEvent[] = []
  const live = (now: number): QueuedEvent[] =>
    entries.filter((entry) => now - entry.q < RETRY_TTL_MS)

  return {
    push(events: readonly TrackerEvent[], now: number): void {
      const pending = live(now).concat(
        events.map((event) => ({ q: Date.parse(event.occurred_at) || now, e: event })),
      )
      entries = pending.slice(Math.max(0, pending.length - RETRY_MAX_EVENTS))
    },

    take(now: number): TrackerEvent[] {
      const pending = live(now)
      entries = []
      return pending.map((entry) => entry.e)
    },

    clear(): void {
      entries = []
    },
  }
}

export type RetryQueue = ReturnType<typeof createRetryQueue>
