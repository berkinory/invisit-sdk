export const INTERNAL_PROPS = [
  'redactQueryKeys',
  'heartbeatIntervalSeconds',
  'noCodeRules',
  'siteId',
  'collectorUrl',
  'storage',
  'privacyPolicy',
  'respectGpc',
  'respectDnt',
  'requireConsent',
  'outboundLinks',
  'fileDownloads',
  'excludePaths',
  'maySend',
  'cancelPending',
  'onVitalsReady',
  'update',
  'deferWebVitalsUntilConfig',
  'loadExtras',
  'loadRules',
  'loadInteractions',
  'loadFeedback',
  'fetchImpl',
  'beaconImpl',
  'setIntervalImpl',
  'clearIntervalImpl',
  'schedule',
  'onError',
  'onRouteChange',
  'onUnknownSite',
  'onNavigate',
  'onBeforeNavigate',
  'ownDomains',
  'measureScroll',
  'intervalSeconds',
  'mayCollect',
  'setConsent',
  'setPolicy',
  'sendHeartbeat',
  'enqueue',
  'immediate',
  'beacon',
  'pageHref',
  'outbound',
  'downloads',
  'namespace',
  'outcome',
  'ignored',
  'changed',
]

export const TARGET = ['chrome91', 'safari15', 'firefox90', 'edge91']

// These names cross bundle boundaries and must keep the same spelling in every chunk. Append only:
// a spelling is the name's position, and a page may pair an hour-old cached main script with new chunks.
export const SHARED_PROPS = [
  'allowedDomains',
  'redactKeys',
  'newActionId',
  'ruleId',
  'onPageView',
  'onRulesChanged',
  'createRules',
  'createWebVitals',
  'showIgnoreNotice',
  'unallowedHostMessage',
  'report',
  'collect',
  'restart',
  'ping',
  'signals',
  'policy',
  'emit',
  'since',
  'createInteractions',
  'openOverlay',
  'sync',
  'doc',
  'settings',
  'session',
  'pageUrl',
  'feedbackCollector',
  'feedbackSiteId',
  'submit',
]

type PropertyMangling = { readonly include: RegExp; readonly cache: Record<string, string> }

const pattern = (names: readonly string[]): RegExp => new RegExp(`^(?:${names.join('|')})$`)
const spellings = (names: readonly string[]): Record<string, string> =>
  Object.fromEntries(names.map((name, index) => [name, `$${index.toString(36)}`]))

// The script: each bundle is one file, so only names that cross into a chunk need a fixed spelling.
export const SCRIPT_MANGLE_PROPS: PropertyMangling = {
  include: pattern([...INTERNAL_PROPS, ...SHARED_PROPS]),
  cache: spellings(SHARED_PROPS),
}

// The package: its code is split across chunks Bun chooses, so every shortened name gets one
// fixed spelling. Names the site passes in or calls (those in its declarations) are kept.
export function packageMangleProps(declarations: string): PropertyMangling {
  const names = [...SHARED_PROPS, ...INTERNAL_PROPS].filter(
    (name) => !new RegExp(`\\b${name}\\b`).test(declarations),
  )
  return { include: pattern(names), cache: spellings(names) }
}
