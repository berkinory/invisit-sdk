import { depthReaching, reachedShares, type Scroll } from './data.ts'
import { h } from './dom.ts'

const RAMP: [number, number, number][] = [
  [42, 36, 160],
  [58, 51, 232],
  [34, 190, 238],
  [250, 214, 60],
  [249, 115, 22],
  [239, 52, 68],
]

const colorAt = (share: number): string => {
  const position = Math.min(1, Math.max(0, share)) * (RAMP.length - 1)
  const index = Math.min(RAMP.length - 2, Math.floor(position))
  const t = position - index
  const [a, b] = [RAMP[index]!, RAMP[index + 1]!]
  const mix = (k: number): number => Math.round(a[k]! + (b[k]! - a[k]!) * t)
  return `rgb(${mix(0)},${mix(1)},${mix(2)})`
}

const MARKERS = [0.75, 0.5, 0.25]

export function createScrollLayer(doc: Document) {
  const el = h(doc, 'div', { class: 'scroll layer' })
  const rail = h(doc, 'div', { class: 'rail' })

  return {
    el,
    // Depth is measured as (scrollY + innerHeight) / scrollHeight, so depth d%
    // sits d% down the document.
    draw(scroll: Scroll | null, width: number, height: number): void {
      el.style.width = `${width}px`
      el.style.height = `${height}px`
      if (!scroll || scroll.samples === 0) {
        el.replaceChildren()
        return
      }
      const reached = reachedShares(scroll)
      rail.style.background = `linear-gradient(to bottom,${reached
        .map((share, step) => `${colorAt(share)} ${step * 5}%`)
        .join(',')})`

      const lines = MARKERS.flatMap((share) => {
        const depth = depthReaching(reached, share)
        return depth === null
          ? []
          : [
              h(doc, 'div', { class: 'mark-line', style: `top:${(depth / 100) * height}px` }, [
                h(doc, 'span', {}, [`${share * 100}% of visits read this far`]),
              ]),
            ]
      })
      const average = Math.min(100, Math.max(0, scroll.average_percent))
      lines.push(
        h(doc, 'div', { class: 'mark-line fold', style: `top:${(average / 100) * height}px` }, [
          h(doc, 'span', {}, [`Average depth · ${Math.round(average)}%`]),
        ]),
      )
      el.replaceChildren(rail, ...lines)
    },
  }
}
