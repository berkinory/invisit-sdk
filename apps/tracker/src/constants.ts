export const TRACKER_SCHEMA_VERSION = 1
export const TRACKER_SDK = 'web'
export const TRACKER_NPM_SDK = 'web-npm'
export const TRACKER_VERSION = '0.1.0'

export const EVENT_NAME_MAX_LENGTH = 64
export const PROPERTY_KEY_MAX_LENGTH = 40
export const PROPERTY_VALUE_MAX_LENGTH = 256
export const MAX_PROPERTIES_PER_EVENT = 32
export const URL_MAX_LENGTH = 1024
export const REFERRER_MAX_LENGTH = 1024
export const PAGE_TITLE_MAX_LENGTH = 256
/* How long a client-side page view waits for the router to set the new page's title. */
export const TITLE_WAIT_MS = 2_000
/* How long events wait for the site's settings before they go out regardless. */
export const CONFIG_WAIT_MS = 3_000
const SELECTOR_MAX_LENGTH = 256
export const ELEMENT_TEXT_MAX_LENGTH = 128
export const EXTERNAL_USER_ID_MAX_LENGTH = 128
const CLIENT_SESSION_ID_MAX_LENGTH = 64
export const ACTION_ID_MAX_LENGTH = 64
export const MAX_EVENTS_PER_BATCH = 100
const MAX_BATCH_BYTES = 262_144

export const LIMITS = {
  eventNameMaxLength: EVENT_NAME_MAX_LENGTH,
  propertyKeyMaxLength: PROPERTY_KEY_MAX_LENGTH,
  propertyValueMaxLength: PROPERTY_VALUE_MAX_LENGTH,
  maxPropertiesPerEvent: MAX_PROPERTIES_PER_EVENT,
  urlMaxLength: URL_MAX_LENGTH,
  referrerMaxLength: REFERRER_MAX_LENGTH,
  pageTitleMaxLength: PAGE_TITLE_MAX_LENGTH,
  selectorMaxLength: SELECTOR_MAX_LENGTH,
  elementTextMaxLength: ELEMENT_TEXT_MAX_LENGTH,
  externalUserIdMaxLength: EXTERNAL_USER_ID_MAX_LENGTH,
  clientSessionIdMaxLength: CLIENT_SESSION_ID_MAX_LENGTH,
  actionIdMaxLength: ACTION_ID_MAX_LENGTH,
  maxEventsPerBatch: MAX_EVENTS_PER_BATCH,
  maxBatchBytes: MAX_BATCH_BYTES,
} as const

export const RETRY_TTL_MS = 24 * 60 * 60 * 1000 - 5 * 60 * 1000

export const MAX_SEND_BYTES = 60_000

export const BACKOFF_BASE_MS = 2_000
export const BACKOFF_MAX_MS = 5 * 60 * 1000
export const BACKOFF_MAX_ATTEMPTS = 8

export const RETRY_MAX_EVENTS = 200

export const SESSION_INACTIVITY_MS = 30 * 60 * 1000

export const BATCH_DELAY_MS = 1_000

export const HEARTBEAT_INTERVAL_SECONDS = 15

export const ACTIVITY_WINDOW_MS = 5_000

export type TrackerChunk =
  | 'extras'
  | 'notices'
  | 'rules'
  | 'interactions'
  | 'overlay'
  | 'feedback'
  | 'debug'

export const chunkGlobal = (name: TrackerChunk): string => `__invisit_${name}`

export const OVERLAY_KEY = 'invisit.overlay'
export const OVERLAY_HASH = 'invisit-heatmap='
export const DEBUG_KEY = 'invisit.debug'

/* The short-link click a redirect appends to a landing page; the collector reads and drops it. */
export const LINK_CLICK_PARAM = 'ivc'
