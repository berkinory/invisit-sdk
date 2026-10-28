const WILDCARD_PREFIX = /^\*\./

export function isHostAllowed(hostname: string, allowedDomains: readonly string[]): boolean {
  if (allowedDomains.length === 0) return true

  const host = hostname.trim().toLowerCase()
  if (host === '') return false

  return allowedDomains.some((configured) => {
    const domain = configured.trim().toLowerCase().replace(WILDCARD_PREFIX, '')
    if (domain === '') return false
    return host === domain || host.endsWith(`.${domain}`)
  })
}
