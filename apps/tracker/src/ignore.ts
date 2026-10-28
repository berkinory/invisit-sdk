import type { SafeStorage } from './storage.ts'

export const IGNORE_KEY = 'invisit_ignore'

export interface IgnoreDecision {
  readonly ignored: boolean
  readonly changed: 'ignored' | 'unignored' | null
}

export function resolveIgnore(storage: SafeStorage, hash: string): IgnoreDecision {
  if (hash === '#invisit-ignore') {
    storage.set(IGNORE_KEY, '1')
    return { ignored: true, changed: 'ignored' }
  }
  if (hash === '#invisit-unignore') {
    storage.remove(IGNORE_KEY)
    return { ignored: false, changed: 'unignored' }
  }
  return { ignored: storage.get(IGNORE_KEY) === '1', changed: null }
}
