export const OUTBOUND_LINK_EVENT = 'outbound_link'
export const FILE_DOWNLOAD_EVENT = 'file_download'

const DOWNLOAD_PATH =
  /\.(?:pdf|zip|rar|7z|gz|tgz|tar|dmg|exe|msi|pkg|deb|rpm|apk|iso|csv|xlsx?|docx?|pptx?|txt|rtf|epub|mp3|wav|mp4|mov|avi)$/i

const CLICK_EVENTS = ['click', 'auxclick'] as const

export interface LinkMatch {
  readonly name: typeof OUTBOUND_LINK_EVENT | typeof FILE_DOWNLOAD_EVENT
  readonly url: string
}

export function classifyLink(
  href: string,
  pageHref: string,
  enabled: { readonly outbound: boolean; readonly downloads: boolean },
): LinkMatch | null {
  let target: URL
  let page: URL
  try {
    page = new URL(pageHref)
    target = new URL(href, page)
  } catch {
    return null
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') return null

  const url = target.origin + target.pathname
  if (enabled.downloads && DOWNLOAD_PATH.test(target.pathname)) {
    return { name: FILE_DOWNLOAD_EVENT, url }
  }
  if (enabled.outbound && target.origin !== page.origin) {
    return { name: OUTBOUND_LINK_EVENT, url }
  }
  return null
}

export interface LinksDeps {
  readonly document: Pick<Document, 'addEventListener' | 'removeEventListener'>
  readonly pageHref: () => string
  readonly outbound: boolean
  readonly downloads: boolean
  readonly emit: (match: LinkMatch) => void
}

export function createLinks(deps: LinksDeps) {
  const onClick = (event: Event): void => {
    if (event.type === 'auxclick' && (event as MouseEvent).button !== 1) return
    const href = (event.target as Element | null)?.closest?.<HTMLAnchorElement>('a[href]')?.href
    if (typeof href !== 'string') return
    const match = classifyLink(href, deps.pageHref(), deps)
    if (match) deps.emit(match)
  }

  return {
    start(): void {
      if (!deps.outbound && !deps.downloads) return
      for (const type of CLICK_EVENTS) {
        deps.document.addEventListener(type, onClick, { capture: true, passive: true })
      }
    },
    stop(): void {
      for (const type of CLICK_EVENTS) {
        deps.document.removeEventListener(type, onClick, { capture: true })
      }
    },
  }
}
