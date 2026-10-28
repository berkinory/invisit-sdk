export {
  DEFAULT_RUNTIME_CONFIG,
  createTracker,
  type Tracker,
  type TrackerConfigPatch,
  type TrackerOptions,
  type TrackerRuntimeConfig,
} from './core.ts'

export {
  CONFIG_CACHE_TTL_MS,
  SITE_GONE_TTL_MS,
  loadTrackerConfig,
  toRuntimeConfig,
  type ConfigLoaderDeps,
} from './config.ts'

export {
  installTracker,
  isRunningTracker,
  optionsFromScript,
  type InstallOutcome,
  type InstallResult,
} from './install.ts'

export {
  DEFAULT_PRIVACY_POLICY,
  createPrivacyGate,
  readDnt,
  readGpc,
  type ConsentState,
  type PrivacyPolicy,
  type PrivacySignals,
} from './privacy.ts'

export {
  DEFAULT_REDACT_QUERY_KEYS,
  REDACTED,
  isValidEventName,
  redactText,
  sanitizeProperties,
  sanitizeReferrer,
  sanitizeUrl,
  truncate,
} from './sanitize.ts'

export { IGNORE_KEY, resolveIgnore, type IgnoreDecision } from './ignore.ts'
export { isHostAllowed } from './origin.ts'
export { isLocalHost, showIgnoreNotice, unallowedHostMessage } from './notices.ts'
export { createRetryQueue, createSessionTracker, memoryStorage, safeStorage } from './storage.ts'
export { INGEST_CONTENT_TYPE, createTransport } from './transport.ts'
export { createUuidV7, uuidV7 } from './uuid.ts'
export { createEngagement } from './engagement.ts'
export { createWebVitals } from './vitals.ts'
export { TRACKER_EXTRAS, type TrackerExtras } from './extras.ts'
export {
  FILE_DOWNLOAD_EVENT,
  OUTBOUND_LINK_EVENT,
  classifyLink,
  createLinks,
  type LinkMatch,
} from './links.ts'
export {
  RULE_BUDGET_MS,
  controlText,
  createRules,
  matchesPattern,
  type NoCodeRule,
  type RuleEngine,
  type RuleMatch,
  type RuleTrigger,
  type RulesDeps,
} from './rules.ts'
export { createActions, type Actions } from './actions.ts'
export { TRACKER_RULES, type TrackerRules } from './rules-chunk.ts'
export { createHeartbeat } from './heartbeat.ts'

export {
  ACTIVITY_WINDOW_MS,
  BACKOFF_BASE_MS,
  BACKOFF_MAX_ATTEMPTS,
  BACKOFF_MAX_MS,
  HEARTBEAT_INTERVAL_SECONDS,
  LIMITS,
  MAX_SEND_BYTES,
  RETRY_MAX_EVENTS,
  RETRY_TTL_MS,
  SESSION_INACTIVITY_MS,
  TRACKER_SCHEMA_VERSION,
  TRACKER_SDK,
  TRACKER_VERSION,
} from './constants.ts'

export type {
  EngagementPayload,
  EventBatchBody,
  HeartbeatBody,
  TrackerContext,
  TrackerEvent,
  TrackerEventType,
  TrackerPage,
  WebVitalPayload,
} from './types.ts'
