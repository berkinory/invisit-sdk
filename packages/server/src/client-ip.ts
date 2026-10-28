/* Set by one platform edge to the client it accepted the connection from, checked in this order.
   The first header present decides: a malformed value yields null rather than a weaker header. */
export const CLIENT_IP_HEADERS = [
  'cf-connecting-ip',
  'x-real-ip',
  'fly-client-ip',
  'true-client-ip',
  'x-vercel-forwarded-for',
  'x-forwarded-for',
] as const

const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/
const IPV4_WITH_PORT = /^([\d.]+):\d{1,5}$/
const BRACKETED_IPV6 = /^\[([^\]]+)\](?::\d{1,5})?$/

function isIpv6(value: string): boolean {
  if (!value.includes(':') || !/^[\da-f:.]+$/i.test(value)) return false
  try {
    new URL(`http://[${value}]/`)
    return true
  } catch {
    return false
  }
}

export function bareAddress(value: string): string | null {
  let address = value.trim()
  const bracketed = BRACKETED_IPV6.exec(address)
  if (bracketed) address = bracketed[1] ?? ''
  else {
    const withPort = IPV4_WITH_PORT.exec(address)
    if (withPort) address = withPort[1] ?? ''
  }
  // A dual-stack socket reports IPv4 peers as ::ffff:a.b.c.d; the same visitor must hash the same.
  address = address.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '')
  if (IPV4.test(address)) return address
  return isIpv6(address) ? address : null
}

/**
 * The visitor's address as the platform in front of your server reports it: `CF-Connecting-IP`,
 * `X-Real-IP`, `Fly-Client-IP`, `True-Client-IP`, `X-Vercel-Forwarded-For`, then the first entry
 * of `X-Forwarded-For`. The first of those headers present decides; a malformed value gives null.
 *
 * These headers are only as trustworthy as the edge that sets them. If nothing in front of your
 * server overwrites `X-Forwarded-For`, a visitor can put any address there: pass your own
 * `clientIp` to `createInvisit` for such setups.
 */
export function clientIp(request: Request): string | null {
  for (const name of CLIENT_IP_HEADERS) {
    const value = request.headers.get(name)
    if (value === null) continue
    const first = value.split(',', 1)[0] ?? ''
    return bareAddress(first)
  }
  return null
}
