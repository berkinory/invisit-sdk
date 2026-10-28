export interface NavigationDeps {
  readonly window: Pick<Window, 'addEventListener' | 'removeEventListener'> & {
    history?: History
  }
  readonly onNavigate: (pathOnly?: boolean) => void
}

export function createNavigation(deps: NavigationDeps) {
  const win = deps.window
  let original: Pick<History, 'pushState' | 'replaceState'> | null = null
  const onPop = (): void => deps.onNavigate()

  return {
    start(): void {
      const history = win.history
      if (history) {
        original = { pushState: history.pushState, replaceState: history.replaceState }
        const wrap = (method: History['pushState'], pathOnly?: boolean): History['pushState'] =>
          function patched(this: History, ...args: Parameters<History['pushState']>) {
            const result = method.apply(this, args)
            deps.onNavigate(pathOnly)
            return result
          }
        history.pushState = wrap(history.pushState.bind(history))
        history.replaceState = wrap(history.replaceState.bind(history), true)
      }
      win.addEventListener('popstate', onPop)
    },

    stop(): void {
      const history = win.history
      if (history && original) {
        history.pushState = original.pushState
        history.replaceState = original.replaceState
      }
      win.removeEventListener('popstate', onPop)
    },
  }
}
