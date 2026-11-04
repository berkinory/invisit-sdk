import type { SafeStorage } from './storage.ts'

export type ConsentState = 'granted' | 'denied' | 'unknown'

export interface PrivacySignals {
  readonly gpc: boolean
  readonly dnt: boolean
  readonly consent: ConsentState
}

export interface PrivacyPolicy {
  readonly respectGpc: boolean
  readonly respectDnt: boolean
  readonly requireConsent: boolean
}

/* Global Privacy Control and Do Not Track are the site's to honour: off unless it turns them on. */
export const DEFAULT_PRIVACY_POLICY: PrivacyPolicy = {
  respectGpc: false,
  respectDnt: false,
  requireConsent: false,
}

const CONSENT_KEY = 'invisit.consent'

interface PrivacyHost {
  readonly navigator?: {
    globalPrivacyControl?: boolean
    doNotTrack?: string | null
    msDoNotTrack?: string | null
  }
  readonly doNotTrack?: string | null
}

export function readGpc(host: PrivacyHost): boolean {
  return host.navigator?.globalPrivacyControl === true
}

export function readDnt(host: PrivacyHost): boolean {
  const values = [host.navigator?.doNotTrack, host.navigator?.msDoNotTrack, host.doNotTrack]
  return values.some((value) => value === '1' || value === 'yes')
}

export function createPrivacyGate(host: PrivacyHost, storage: SafeStorage, policy: PrivacyPolicy) {
  let current: PrivacyPolicy = policy

  const readConsent = (): ConsentState => {
    const stored = storage.get(CONSENT_KEY)
    return stored === 'granted' || stored === 'denied' ? stored : 'unknown'
  }

  return {
    signals(): PrivacySignals {
      return { gpc: readGpc(host), dnt: readDnt(host), consent: readConsent() }
    },

    setConsent(state: ConsentState): void {
      if (state === 'unknown') storage.remove(CONSENT_KEY)
      else storage.set(CONSENT_KEY, state)
    },

    setPolicy(next: PrivacyPolicy): void {
      current = next
    },

    policy(): PrivacyPolicy {
      return current
    },

    mayCollect(): boolean {
      const signals = this.signals()

      if (signals.consent === 'denied') return false
      if (current.respectGpc && signals.gpc) return false
      if (current.respectDnt && signals.dnt) return false
      if (current.requireConsent && signals.consent !== 'granted') return false
      return true
    },
  }
}
