import { ACTIVITY_WINDOW_MS } from './constants.ts'
import type { EngagementPayload } from './types.ts'

export interface EngagementDeps {
  readonly document: Pick<Document, 'addEventListener' | 'removeEventListener'> & {
    visibilityState?: DocumentVisibilityState
  }
  readonly window: Pick<Window, 'addEventListener' | 'removeEventListener'> & {
    requestAnimationFrame?: (callback: () => void) => number
  }
  readonly now: () => number
  readonly measureScroll?: () => number
}

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'wheel'] as const

export function createEngagement(deps: EngagementDeps) {
  let visibleSince: number | null = null
  let visibleMs = 0
  let activeMs = 0
  let activeStart: number | null = null
  let activeUntil = 0
  let deepest = -1
  let framePending = false
  let running = false

  const sampleScroll = (): void => {
    framePending = false
    if (!running) return
    const depth = deps.measureScroll?.() ?? -1
    if (depth > deepest) deepest = depth
  }

  const onScroll = (): void => {
    if (framePending) return
    framePending = true
    deps.window.requestAnimationFrame?.(sampleScroll)
  }

  const isVisible = (): boolean => deps.document.visibilityState !== 'hidden'

  const closeActiveInterval = (at: number): void => {
    if (activeStart === null) return
    activeMs += Math.max(0, Math.min(at, activeUntil) - activeStart)
    activeStart = null
    activeUntil = 0
  }

  const onActivity = (): void => {
    if (!running || !isVisible()) return
    const at = deps.now()

    if (activeStart === null || at > activeUntil) {
      closeActiveInterval(at)
      activeStart = at
    }
    activeUntil = at + ACTIVITY_WINDOW_MS
  }

  const onVisibilityChange = (): void => {
    const at = deps.now()
    if (isVisible()) {
      if (visibleSince === null) visibleSince = at
      return
    }
    if (visibleSince !== null) {
      visibleMs += at - visibleSince
      visibleSince = null
    }
    closeActiveInterval(at)
  }

  return {
    start(): void {
      running = true
      visibleSince = isVisible() ? deps.now() : null
      for (const type of ACTIVITY_EVENTS) {
        deps.window.addEventListener(type, onActivity, { passive: true, capture: true })
      }
      deps.document.addEventListener('visibilitychange', onVisibilityChange)
      deps.window.addEventListener('scroll', onScroll, { passive: true })
    },

    stop(): void {
      running = false
      for (const type of ACTIVITY_EVENTS) {
        deps.window.removeEventListener(type, onActivity, { capture: true })
      }
      deps.document.removeEventListener('visibilitychange', onVisibilityChange)
      deps.window.removeEventListener('scroll', onScroll)
      visibleSince = null
      visibleMs = 0
      activeMs = 0
      activeStart = null
      activeUntil = 0
      deepest = -1
      framePending = false
    },

    collect(): EngagementPayload | null {
      const at = deps.now()

      if (visibleSince !== null) {
        visibleMs += at - visibleSince
        visibleSince = at
      }
      const stillActive = activeStart !== null && at <= activeUntil
      closeActiveInterval(at)

      sampleScroll()
      const payload: EngagementPayload = {
        active_ms: Math.round(activeMs),
        visible_ms: Math.round(visibleMs),
        ...(deepest >= 0 ? { scroll_depth: deepest } : {}),
      }

      activeMs = 0
      visibleMs = 0
      deepest = -1
      if (stillActive) {
        activeStart = at
        activeUntil = at + ACTIVITY_WINDOW_MS
      }

      return payload.visible_ms === 0 && payload.active_ms === 0 ? null : payload
    },
  }
}
