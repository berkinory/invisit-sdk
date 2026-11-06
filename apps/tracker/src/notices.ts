// Messages shown only in rare cases, kept out of the code every page loads.

export function unallowedHostMessage(input: {
  readonly host: string
  readonly allowedDomains: readonly string[]
}): string {
  const domains = input.allowedDomains.join(', ')

  return (
    `[invisit] Tag loaded on ${input.host}, which is not on this site's allowed domains ` +
    `(${domains}). Add it under Settings → Collection → Allowed domains, or open the site at ${input.allowedDomains[0] ?? ''}.`
  )
}

export function showIgnoreNotice(doc: Document, changed: 'ignored' | 'unignored'): void {
  const note = doc.createElement('div')
  note.textContent =
    changed === 'ignored'
      ? 'invisit: this browser is now excluded from analytics'
      : 'invisit: this browser is being counted again'
  note.setAttribute(
    'style',
    'position:fixed;bottom:16px;left:16px;z-index:2147483647;background:#111;color:#fff;' +
      'padding:10px 14px;border-radius:6px;font:13px/1.4 system-ui,sans-serif;pointer-events:none',
  )
  const attach = (): void => {
    if (!doc.body) return
    doc.body.appendChild(note)
    doc.defaultView?.setTimeout(() => note.remove(), 4000)
  }
  if (doc.body) attach()
  else doc.addEventListener('DOMContentLoaded', attach, { once: true })
}

export const TRACKER_NOTICES = { showIgnoreNotice, unallowedHostMessage }

export type TrackerNotices = typeof TRACKER_NOTICES
