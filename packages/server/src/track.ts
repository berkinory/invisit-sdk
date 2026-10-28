import { authorization, type Context } from './context.ts'
import { errorFromResponse, InvisitError } from './errors.ts'

/* The collector's own Accept-Language bound; only the first tag matters to it. */
const LANGUAGE_MAX_LENGTH = 256

/** A custom event property value. */
export type PropertyValue = string | number | boolean | null

export interface TrackOptions {
  /** The visitor's request: their address, user agent, language and Sec-GPC come from it. */
  readonly request: Request
  /** The page the event belongs to, when there is one. */
  readonly url?: string
  readonly properties?: Readonly<Record<string, PropertyValue>>
  /** Your own id for the signed-in user; stored hashed, as with identify. */
  readonly userId?: string
  /** A UUID v7. Reuse it when retrying, so the event is counted once. Minted when absent. */
  readonly eventId?: string
  /** The visitor's address when the request carries none in a header; see ProxyOptions.ip. */
  readonly ip?: string | null
}

export interface TrackResult {
  readonly accepted: number
  readonly duplicate: number
}

const hex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

function uuidV7(now: number = Date.now()): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  for (let index = 0; index < 6; index += 1) {
    bytes[index] = Math.floor(now / 2 ** (8 * (5 - index))) & 0xff
  }
  bytes[6] = 0x70 | ((bytes[6] ?? 0) & 0x0f)
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f)
  const value = hex(bytes)
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

function visitorOf(context: Context, request: Request) {
  const ip = context.clientIp(request)
  if (ip === null) {
    throw new InvisitError(
      'CLIENT_IP_UNRESOLVED',
      'The visitor address could not be read from the request; pass `ip`, or clientIp to createInvisit.',
    )
  }
  // The collector needs one to tell people from bots; an event without it is refused whole.
  const userAgent = request.headers.get('user-agent')?.trim()
  if (!userAgent) {
    throw new InvisitError('USER_AGENT_MISSING', 'The request carries no User-Agent.')
  }
  const language = request.headers.get('accept-language')
  return {
    ip,
    user_agent: userAgent,
    ...(language ? { language: language.slice(0, LANGUAGE_MAX_LENGTH) } : {}),
    ...(request.headers.get('sec-gpc')?.trim() === '1' ? { gpc: true } : {}),
  }
}

export async function trackEvent(
  context: Context,
  name: string,
  options: TrackOptions,
): Promise<TrackResult> {
  const body = {
    schema_version: 1,
    visitor: visitorOf(context, options.request),
    events: [
      {
        event_id: options.eventId ?? uuidV7(),
        name,
        ...(options.url === undefined ? {} : { url: options.url }),
        ...(options.properties === undefined ? {} : { properties: options.properties }),
        ...(options.userId === undefined ? {} : { external_user_id: options.userId }),
      },
    ],
  }

  let response: Response
  try {
    response = await context.fetch(`${context.baseUrl}/v1/server/events`, {
      method: 'POST',
      headers: { authorization: authorization(context), 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (error) {
    throw new InvisitError('NETWORK_ERROR', 'The collector could not be reached.', {
      cause: error,
    })
  }
  if (!response.ok) throw await errorFromResponse(response)
  const result = (await response.json()) as TrackResult
  return { accepted: result.accepted, duplicate: result.duplicate }
}
