export interface HeartbeatDeps {
  readonly document: { visibilityState?: DocumentVisibilityState }
  readonly idle: () => boolean
  readonly intervalSeconds: () => number
  readonly send: () => void
  readonly setIntervalImpl?: ((task: () => void, ms: number) => unknown) | undefined
  readonly clearIntervalImpl?: ((handle: unknown) => void) | undefined
}

export function createHeartbeat(deps: HeartbeatDeps) {
  const setIntervalImpl =
    deps.setIntervalImpl ?? ((task: () => void, ms: number) => setInterval(task, ms))
  const clearIntervalImpl =
    deps.clearIntervalImpl ?? ((handle: unknown) => clearInterval(handle as never))

  let handle: unknown = null

  const tick = (): void => {
    if (deps.document.visibilityState === 'hidden' || deps.idle()) return
    deps.send()
  }

  return {
    start(): void {
      if (handle !== null) return
      handle = setIntervalImpl(tick, deps.intervalSeconds() * 1_000)
      tick()
    },
    ping(): void {
      if (handle === null) return
      tick()
    },
    stop(): void {
      if (handle === null) return
      clearIntervalImpl(handle)
      handle = null
    },
    restart(): void {
      this.stop()
      this.start()
    },
  }
}
