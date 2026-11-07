import type { ErrorsDeps, TrackerErrors } from './errors.ts'

/* Every byte here ships to every site, on or off: this holds what happened and nothing more. The
   chunk reads it, and waits for the first error, so a page that has none never downloads it. */
const HELD_MAX = 20

export type ErrorSource = 0 | 1 | 2 // an error event, a rejection's reason, a caught value

export interface ErrorWatch {
  capture(value: unknown): void
  stop(): void
}

export function watchErrors(
  win: Window & typeof globalThis,
  load: (ready: (chunk: TrackerErrors) => void) => void,
  deps: ErrorsDeps,
): ErrorWatch {
  let held: [ErrorSource, unknown][] | undefined
  let take: ((source: ErrorSource, value: unknown) => void) | undefined
  const hold = (source: ErrorSource, value: unknown): void => {
    try {
      if (take) take(source, value)
      else if (held) {
        if (held.length < HELD_MAX) held.push([source, value])
      } else {
        held = [[source, value]]
        load((chunk) => {
          take = chunk.createErrors(win, deps)
          for (const [from, what] of held!) take(from, what)
          held = undefined
        })
      }
    } catch {}
  }
  const onError = (event: Event): void => hold(0, event)
  const onRejection = (event: PromiseRejectionEvent): void => hold(1, event.reason)

  // Captured, or a script or stylesheet that failed to load would never bubble up to here.
  win.addEventListener('error', onError, true)
  win.addEventListener('unhandledrejection', onRejection)

  return {
    capture: (value) => hold(2, value),
    stop() {
      win.removeEventListener('error', onError, true)
      win.removeEventListener('unhandledrejection', onRejection)
    },
  }
}
