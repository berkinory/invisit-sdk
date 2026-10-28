import type { TrackerConfigPatch, TrackerRuntimeConfig } from './core.ts'
import type { FeedbackConfig } from './feedback.ts'
import type { SafeStorage } from './storage.ts'

const CONFIG_KEY = 'invisit.config'

export const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000

export const SITE_GONE_TTL_MS = 60 * 60 * 1000

const DISABLED_PATCH: TrackerConfigPatch = { disabled: true }

interface TrackerConfigResponse {
  config_version?: number
  allowed_domains?: string[]
  redact_query_keys?: string[]
  heartbeat_interval_seconds?: number
  features?: Partial<TrackerRuntimeConfig['features']>
  no_code_rules?: TrackerRuntimeConfig['noCodeRules']
  feedback?: FeedbackConfig | null
}

interface CachedConfig {
  k: string
  etag: string | null
  at: number
  body: TrackerConfigResponse
  gone?: true
}

export function toRuntimeConfig(response: TrackerConfigResponse): TrackerConfigPatch {
  const runtime: {
    allowedDomains?: readonly string[]
    redactQueryKeys?: readonly string[]
    heartbeatIntervalSeconds?: number
    features?: TrackerRuntimeConfig['features']
    noCodeRules?: TrackerRuntimeConfig['noCodeRules']
    feedback?: FeedbackConfig | null
  } = {}

  if (Array.isArray(response.allowed_domains)) {
    runtime.allowedDomains = response.allowed_domains.filter(
      (domain): domain is string => typeof domain === 'string',
    )
  }
  if (Array.isArray(response.redact_query_keys)) {
    runtime.redactQueryKeys = response.redact_query_keys
      .filter((key): key is string => typeof key === 'string')
      .map((key) => key.toLowerCase())
  }
  if (typeof response.heartbeat_interval_seconds === 'number') {
    runtime.heartbeatIntervalSeconds = Math.min(
      300,
      Math.max(5, Math.round(response.heartbeat_interval_seconds)),
    )
  }
  if (Array.isArray(response.no_code_rules)) {
    runtime.noCodeRules = response.no_code_rules
  }
  /* Passed through as sent; the widget chunk reads it, so the core stays small. */
  if ('feedback' in response) runtime.feedback = response.feedback ?? null
  if (response.features) {
    runtime.features = {
      web_vitals: response.features.web_vitals !== false,
      engagement: response.features.engagement !== false,
      heartbeat: response.features.heartbeat !== false,
      heatmaps: response.features.heatmaps === true,
    }
  }

  return {
    ...runtime,
    disabled: false,
  } as TrackerConfigPatch
}

export interface ConfigLoaderDeps {
  readonly collectorUrl: string
  readonly siteId: string
  readonly storage: SafeStorage
  readonly now: () => number
  readonly fetchImpl?: (url: string, init: RequestInit) => Promise<Response>
  readonly onUnknownSite?: () => void
}

function readCache(storage: SafeStorage, siteId: string): CachedConfig | null {
  const raw = storage.get(CONFIG_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as CachedConfig | null
    if (parsed && parsed.k === siteId && typeof parsed.at === 'number') return parsed
  } catch {}
  return null
}

export async function loadTrackerConfig(
  deps: ConfigLoaderDeps,
): Promise<TrackerConfigPatch | null> {
  const cached = readCache(deps.storage, deps.siteId)

  if (cached?.gone === true) {
    if (deps.now() - cached.at < SITE_GONE_TTL_MS) return DISABLED_PATCH
  } else if (cached && deps.now() - cached.at < CONFIG_CACHE_TTL_MS) {
    return toRuntimeConfig(cached.body)
  }

  const fetchImpl = deps.fetchImpl
  if (!fetchImpl) return cached ? toRuntimeConfig(cached.body) : null

  const url = `${deps.collectorUrl.replace(/\/+$/, '')}/v1/tracker/config?site=${encodeURIComponent(
    deps.siteId,
  )}`

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      credentials: 'omit',
      mode: 'cors',
      ...(cached?.etag ? { headers: { 'If-None-Match': cached.etag } } : {}),
    })

    if (response.status === 304 && cached) {
      deps.storage.set(CONFIG_KEY, JSON.stringify({ ...cached, at: deps.now() }))
      return toRuntimeConfig(cached.body)
    }

    if (response.status === 404) {
      deps.storage.set(
        CONFIG_KEY,
        JSON.stringify({
          k: deps.siteId,
          etag: null,
          at: deps.now(),
          body: {},
          gone: true,
        } satisfies CachedConfig),
      )
      deps.onUnknownSite?.()
      return DISABLED_PATCH
    }

    if (!response.ok) return cached ? toRuntimeConfig(cached.body) : null

    const body = (await response.json()) as TrackerConfigResponse
    deps.storage.set(
      CONFIG_KEY,
      JSON.stringify({
        k: deps.siteId,
        etag: response.headers.get('etag'),
        at: deps.now(),
        body,
      } satisfies CachedConfig),
    )
    return toRuntimeConfig(body)
  } catch {
    return cached ? toRuntimeConfig(cached.body) : null
  }
}
