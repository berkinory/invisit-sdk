import {
  EVENT_NAME_MAX_LENGTH,
  PROPERTY_KEY_MAX_LENGTH,
  PROPERTY_VALUE_MAX_LENGTH,
  MAX_PROPERTIES_PER_EVENT,
  URL_MAX_LENGTH,
  REFERRER_MAX_LENGTH,
} from './constants.ts'

export const REDACTED = '[redacted]'

export const DEFAULT_REDACT_QUERY_KEYS: readonly string[] = [
  'access_token',
  'api_key',
  'apikey',
  'auth',
  'code',
  'email',
  'id_token',
  'invite',
  'jwt',
  'key',
  'otp',
  'password',
  'phone',
  'pwd',
  'reset',
  'secret',
  'session',
  'sid',
  'signature',
  'state',
  'token',
]

const SENSITIVE_KEY_PATTERN = /(pass(word|wd)?|secret|token|auth|session|email|phone|credential)/i
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]{2,}/g
const DIGIT_RUN_PATTERN = /\d[\d\s().+-]{6,}\d/g

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max)
}

export function redactText(value: string): string {
  return value
    .replace(EMAIL_PATTERN, REDACTED)
    .replace(DIGIT_RUN_PATTERN, (match) =>
      match.replace(/\D/g, '').length >= 9 ? REDACTED : match,
    )
}

const REGEX_ESCAPE_PATTERN = /[.*+?^${}()|[\]\\]/g

export function redactQueryKeyValues(value: string, extraKeys: readonly string[] = []): string {
  if (value.indexOf('=') === -1) return value

  const keys = DEFAULT_REDACT_QUERY_KEYS.concat(
    extraKeys.map((key) => key.toLowerCase()).filter((key) => key !== ''),
  )
  const escaped = keys.map((key) => key.replace(REGEX_ESCAPE_PATTERN, '\\$&'))
  const pattern = new RegExp(`\\b(${escaped.join('|')})=[^&#\\s]*`, 'gi')
  return value.replace(pattern, `$1=${REDACTED}`)
}

function isRedactedKey(key: string, extra: readonly string[]): boolean {
  const normalized = key.toLowerCase()
  if (DEFAULT_REDACT_QUERY_KEYS.indexOf(normalized) !== -1) return true
  if (extra.indexOf(normalized) !== -1) return true
  return SENSITIVE_KEY_PATTERN.test(normalized)
}

export function sanitizeUrl(rawUrl: string, redactQueryKeys: readonly string[] = []): string {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return ''
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''

  parsed.hash = ''
  parsed.username = ''
  parsed.password = ''

  if (parsed.search) {
    const kept = new URLSearchParams()
    parsed.searchParams.forEach((value, key) => {
      if (isRedactedKey(key, redactQueryKeys)) return
      kept.append(key, truncate(redactText(value), PROPERTY_VALUE_MAX_LENGTH))
    })
    parsed.search = kept.toString()
  } else {
    // Also remove a bare trailing question mark, whose search getter is empty.
    parsed.search = ''
  }

  return truncate(parsed.toString(), URL_MAX_LENGTH)
}

export function sanitizeReferrer(
  referrer: string,
  redactQueryKeys: readonly string[] = [],
): string {
  if (referrer === '') return ''
  // An Android app opening a link names itself here; only the package is kept, never a deep link.
  return truncate(
    /^android-app:\/\/[^/?#]+/.exec(referrer)?.[0] || sanitizeUrl(referrer, redactQueryKeys),
    REFERRER_MAX_LENGTH,
  )
}

export type PropertyValue = string | number | boolean | null

export function sanitizeProperties(
  properties: Readonly<Record<string, unknown>> | undefined,
  redactQueryKeys: readonly string[] = [],
): Record<string, PropertyValue> | undefined {
  if (!properties) return undefined

  const out: Record<string, PropertyValue> = {}
  let count = 0

  for (const key of Object.keys(properties)) {
    if (count >= MAX_PROPERTIES_PER_EVENT) break
    if (key.length === 0 || key.length > PROPERTY_KEY_MAX_LENGTH) continue
    if (key.toLowerCase().indexOf('invisit_') === 0) continue
    if (!/^[a-zA-Z_][a-zA-Z0-9_.-]*$/.test(key)) continue
    if (isRedactedKey(key, redactQueryKeys)) continue

    const value = properties[key]

    if (typeof value === 'string') {
      out[key] = truncate(redactText(value), PROPERTY_VALUE_MAX_LENGTH)
      count += 1
    } else if (typeof value === 'boolean' || value === null) {
      out[key] = value
      count += 1
    } else if (typeof value === 'number' && isFinite(value)) {
      out[key] = value
      count += 1
    }
  }

  return count === 0 ? undefined : out
}

export function isValidEventName(name: unknown): name is string {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    name.length <= EVENT_NAME_MAX_LENGTH &&
    /^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(name)
  )
}
