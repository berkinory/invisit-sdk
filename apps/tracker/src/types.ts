import type { PropertyValue } from './sanitize.ts'

export type TrackerEventType =
  | 'page_view'
  | 'custom_event'
  | 'conversion'
  | 'identify'
  | 'engagement'
  | 'web_vital'
  | 'clicks'

export interface TrackerPage {
  readonly url: string
  readonly title?: string
}

export interface EngagementPayload {
  readonly active_ms: number
  readonly visible_ms: number
  readonly scroll_depth?: number
}

type WebVitalMetric = 'LCP' | 'CLS' | 'INP' | 'FCP' | 'TTFB'

export interface WebVitalPayload {
  readonly metric: WebVitalMetric
  readonly value: number
  readonly rating?: 'good' | 'needs-improvement' | 'poor'
}

// x/y locate the click inside the target's bounding box on a 32x32 grid.
export interface ClickPoint {
  readonly selector: string
  readonly x: number
  readonly y: number
  readonly rage?: true
  readonly dead?: true
}

export interface TrackerEvent {
  readonly event_id: string
  readonly type: TrackerEventType
  readonly occurred_at: string
  readonly client_session_id?: string
  readonly action_id?: string
  readonly page?: TrackerPage
  readonly referrer?: string
  readonly properties?: Record<string, PropertyValue>
  readonly name?: string
  readonly rule_id?: string
  readonly external_user_id?: string
  readonly engagement?: EngagementPayload
  readonly web_vital?: WebVitalPayload
  readonly clicks?: readonly ClickPoint[]
}

export interface TrackerContext {
  readonly sdk: 'web' | 'web-npm'
  readonly sdk_version: string
}

export interface EventBatchBody {
  readonly schema_version: number
  readonly site_id: string
  readonly sent_at: string
  readonly context: TrackerContext
  readonly events: readonly TrackerEvent[]
  readonly debug_token?: string
}

export interface HeartbeatBody {
  readonly schema_version: number
  readonly site_id: string
  readonly sent_at: string
  readonly context: TrackerContext
  readonly client_session_id?: string
  readonly page?: TrackerPage
}
