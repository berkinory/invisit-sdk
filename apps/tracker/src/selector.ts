const MAX_DEPTH = 6
export const CLICK_SELECTOR_MAX_LENGTH = 200

// Ids minted by frameworks or build tools change between deploys and would
// orphan every stored click, so only hand-written-looking ids anchor a path.
const GENERATED_ID = /\d{3}|[:«»]|^_r_|(?=[\da-f]{8})[\da-f]*\d/i

export const isStableId = (id: string): boolean =>
  id !== '' && id.length <= 48 && !GENERATED_ID.test(id)

const anchorOf = (el: Element, doc: Document): string | null => {
  const custom = el.getAttribute('data-invisit-id')
  const anchor = custom
    ? `[data-invisit-id="${CSS.escape(custom)}"]`
    : isStableId(el.id)
      ? `#${CSS.escape(el.id)}`
      : null
  return anchor && doc.querySelector(anchor) === el ? anchor : null
}

const segmentOf = (el: Element): string => {
  let index = 1
  for (let sibling = el.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
    if (sibling.localName === el.localName) index++
  }
  return `${CSS.escape(el.localName)}:nth-of-type(${index})`
}

// A path of tag:nth-of-type steps, never classes or text, so it carries no
// page content and resolves with document.querySelector on the same page.
export function selectorOf(target: Element, doc: Document): string | null {
  const body = doc.body
  if (!body || !body.contains(target)) return null
  const segments: string[] = []
  let el: Element | null = target
  for (let depth = 0; el && depth < MAX_DEPTH; depth++) {
    if (el === body) {
      segments.unshift('body')
      break
    }
    const anchor = anchorOf(el, doc)
    if (anchor) {
      segments.unshift(anchor)
      break
    }
    segments.unshift(segmentOf(el))
    el = el.parentElement
  }
  while (segments.length > 1 && segments.join('>').length > CLICK_SELECTOR_MAX_LENGTH) {
    segments.shift()
  }
  const selector = segments.join('>')
  return selector.length > CLICK_SELECTOR_MAX_LENGTH ? null : selector
}
