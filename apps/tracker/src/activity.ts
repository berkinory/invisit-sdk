import { ACTIVITY_EVENTS, IDLE_AFTER_MS } from './constants.ts'

export interface ActivityDeps {
  readonly window: Pick<Window, 'addEventListener' | 'removeEventListener'>
  readonly now: () => number
  readonly onReturn: () => void
}

/* Wider than engagement's list: a pointer moving over a page says nothing about active time, but
   it does say someone is there. */
const PRESENCE_EVENTS = [...ACTIVITY_EVENTS, 'pointermove'] as const

/* A tab can stay visible with nobody at it, so being here takes a recent input as well. */
export function createActivity(deps: ActivityDeps) {
  let last = 0
  let running = false

  const idle = (): boolean => deps.now() - last > IDLE_AFTER_MS

  /* Says whether this input ended an idle stretch. */
  const touch = (): boolean => {
    const returned = idle()
    last = deps.now()
    if (returned) deps.onReturn()
    return returned
  }

  return {
    idle,
    touch,

    /* The last moment the visitor counted as here. Time past it is a tab nobody was at. */
    seenAt: (): number => Math.min(deps.now(), last + IDLE_AFTER_MS),

    start(): void {
      if (running) return
      running = true
      last = deps.now()
      for (const type of PRESENCE_EVENTS) {
        deps.window.addEventListener(type, touch, { passive: true, capture: true })
      }
    },

    stop(): void {
      running = false
      for (const type of PRESENCE_EVENTS) {
        deps.window.removeEventListener(type, touch, { capture: true })
      }
    },
  }
}
