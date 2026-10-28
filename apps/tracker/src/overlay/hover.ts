import type { Totals } from './data.ts'
import { h, plural } from './dom.ts'

export function createHover(win: Window) {
  const doc = win.document
  const box = h(doc, 'div', { class: 'box', hidden: '' })
  const tip = h(doc, 'div', { class: 'tip glass', hidden: '' })
  let elements = new Map<Element, Totals>()
  let pageClicks = 0
  let enabled = false
  let frame = 0
  let target: Element | null = null
  let shown: Element | null = null

  const hide = (): void => {
    shown = null
    box.hidden = true
    tip.hidden = true
  }

  const tracked = (from: Element | null): Element | null => {
    for (let el = from; el && el !== doc.body; el = el.parentElement) {
      if (elements.has(el)) return el
    }
    return null
  }

  const paint = (): void => {
    frame = 0
    const el = enabled ? tracked(target) : null
    if (!el) return hide()
    const rect = el.getBoundingClientRect()
    if (!rect.width || !rect.height) return hide()
    if (el !== shown) {
      shown = el
      const totals = elements.get(el)!
      const share = pageClicks > 0 ? Math.round((totals.clicks / pageClicks) * 100) : 0
      tip.replaceChildren(
        h(doc, 'b', {}, [plural(totals.clicks, 'click')]),
        ` · ${share}% of page clicks`,
      )
    }
    box.style.cssText = `left:${rect.left - 3}px;top:${rect.top - 3}px;width:${rect.width + 6}px;height:${rect.height + 6}px`
    box.hidden = false
    tip.hidden = false
    const above = rect.top > 44
    const left = Math.min(Math.max(8, rect.left), win.innerWidth - tip.offsetWidth - 8)
    tip.style.cssText = `left:${left}px;top:${above ? rect.top - 38 : rect.bottom + 8}px`
  }

  const schedule = (): void => {
    if (!frame) frame = win.requestAnimationFrame(paint)
  }

  const onMove = (event: MouseEvent): void => {
    target = event.target as Element | null
    schedule()
  }

  win.addEventListener('mousemove', onMove, { passive: true, capture: true })
  win.addEventListener('scroll', schedule, { passive: true, capture: true })

  return {
    nodes: [box, tip],
    set(next: Map<Element, Totals>, total: number, on: boolean): void {
      elements = next
      pageClicks = total
      enabled = on
      shown = null
      schedule()
    },
    stop(): void {
      win.removeEventListener('mousemove', onMove, { capture: true })
      win.removeEventListener('scroll', schedule, { capture: true })
      if (frame) win.cancelAnimationFrame(frame)
    },
  }
}
