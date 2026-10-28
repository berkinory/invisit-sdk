type Child = Node | string | null | undefined | false

export function h(
  doc: Document,
  tag: string,
  attributes: Record<string, string> = {},
  children: readonly Child[] = [],
): HTMLElement {
  const el = doc.createElement(tag)
  for (const name in attributes) el.setAttribute(name, attributes[name]!)
  for (const child of children) {
    if (child) el.append(child)
  }
  return el
}

const SVG_NS = 'http://www.w3.org/2000/svg'

export function icon(doc: Document, paths: string, size = 16, viewBox = '0 0 24 24'): SVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', viewBox)
  svg.setAttribute('width', `${size}`)
  svg.setAttribute('height', `${size}`)
  svg.setAttribute('aria-hidden', 'true')
  for (const d of paths.split('|')) {
    const path = doc.createElementNS(SVG_NS, 'path')
    path.setAttribute('d', d)
    svg.append(path)
  }
  return svg
}

export const formatCount = (value: number): string => Math.round(value).toLocaleString('en-US')

export const plural = (value: number, word: string): string =>
  `${formatCount(value)} ${word}${value === 1 ? '' : 's'}`
