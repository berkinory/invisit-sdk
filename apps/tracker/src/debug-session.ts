import { DEBUG_KEY } from './constants.ts'
import type { SafeStorage } from './storage.ts'

/* A dashboard link hands the tab a session token. It leaves the address at once, so it lands in
   no page view, shared link or history entry, and lives on for this tab only. */
export function takeDebugToken(win: Window, tab: SafeStorage): string | null {
  const { hash, pathname, search } = win.location
  const [found, token] = /&?invisit-debug=([\w-]+)/.exec(hash) ?? []
  if (!found || !token) return tab.get(DEBUG_KEY)
  const rest = hash.replace(found, '').replace('#&', '#')
  win.history.replaceState(win.history.state, '', pathname + search + (rest === '#' ? '' : rest))
  tab.set(DEBUG_KEY, token)
  return token
}
