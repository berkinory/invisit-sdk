import { bareAddress } from './client-ip.ts'
import { authorization, type Context } from './context.ts'
import { errorFromResponse, InvisitError } from './errors.ts'

/* The collector's own Accept-Language bound; only the first tag matters to it. */
const LANGUAGE_MAX_LENGTH = 256

/** A custom event property value. */
export type PropertyValue = string | number | boolean | null

interface TrackFields {
  /** The page the event belongs to, when there is one. */
  readonly url?: string
  readonly properties?: Readonly<Record<string, PropertyValue>>
  /** Your own id for the signed-in user; stored hashed, as with identify. */
  readonly userId?: string
  /** A UUID v7. Reuse it when retrying, so the event is counted once. Minted when absent. */
  readonly eventId?: string
}

/**
 * The visitor, when there is no request of theirs to hand over: a Convex action
 * (`ctx.meta.getRequestMetadata()`), a queue consumer or a WebSocket server, that kept the
 * address and user agent of the request that started the work.
 */
export interface TrackVisitor {
  readonly ip: string
  readonly userAgent: string
  /** The visitor's Accept-Language, when known. */
  readonly language?: string
  /** True when the visitor's browser sent Sec-GPC: 1; the event is then not recorded when
     createInvisit has `respectGpc` on. */
  readonly gpc?: boolean
}

export type TrackOptions = TrackFields &
  (
    | {
        /** The visitor's request: their address, user agent, language and Sec-GPC come from it. */
        readonly request: Request
        /** The visitor's address when the request carries none in a header; see ProxyOptions.ip. */
        readonly ip?: string | null
        readonly visitor?: never
      }
    | { readonly visitor: TrackVisitor; readonly request?: never; readonly ip?: never }
  )

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

function visitorOf(context: Context, options: TrackOptions) {
  if (options.visitor) {
    const { ip, userAgent, language, gpc } = options.visitor
    return describeVisitor(
      bareAddress(ip),
      userAgent,
      language ?? null,
      context.respectGpc && gpc === true,
      'The visitor address is not an IP address.',
    )
  }
  const { request } = options
  return describeVisitor(
    context.clientIp(request),
    request.headers.get('user-agent'),
    request.headers.get('accept-language'),
    context.respectGpc && request.headers.get('sec-gpc')?.trim() === '1',
    'The visitor address could not be read from the request; pass `ip`, or clientIp to createInvisit.',
  )
}

function describeVisitor(
  ip: string | null,
  rawUserAgent: string | null,
  language: string | null,
  gpc: boolean,
  missingIp: string,
) {
  if (ip === null) throw new InvisitError('CLIENT_IP_UNRESOLVED', missingIp)
  // The collector needs one to tell people from bots; an event without it is refused whole.
  const userAgent = rawUserAgent?.trim()
  if (!userAgent) {
    throw new InvisitError('USER_AGENT_MISSING', 'The visitor has no User-Agent.')
  }
  return {
    ip,
    user_agent: userAgent,
    ...(language ? { language: language.slice(0, LANGUAGE_MAX_LENGTH) } : {}),
    ...(gpc ? { gpc: true } : {}),
  }
}

export async function trackEvent(
  context: Context,
  name: string,
  options: TrackOptions,
): Promise<TrackResult> {
  const body = {
    schema_version: 1,
    visitor: visitorOf(context, options),
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
