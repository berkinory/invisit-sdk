import { chunkGlobal } from './constants.ts'
import { optionsFromScript, runningTracker } from './install.ts'
import { startTracker, type TrackerChunks } from './start.ts'

export function bootTracker(): void {
  const win = globalThis as unknown as Window & typeof globalThis
  const doc = win.document
  if (!doc || runningTracker(win)) return

  const script =
    doc.currentScript ??
    doc.querySelector('script[data-site]') ??
    doc.querySelector('script[src*="invisit.js"]')

  const options = optionsFromScript(script, win.location?.origin ?? '')

  startTracker(win, options, (name, ready) => {
    const chunk = doc.createElement('script')
    const base =
      (script as HTMLScriptElement | null)?.src || `${options.collectorUrl.replace(/\/+$/, '')}/`
    chunk.async = true
    try {
      chunk.src = new URL(`invisit-${name}.js`, base).href
    } catch {
      return
    }
    const nonce = (script as HTMLScriptElement | null)?.nonce || script?.getAttribute('nonce')
    if (nonce) chunk.setAttribute('nonce', nonce)
    const integrity = script?.getAttribute(`data-sri-${name}`)
    if (integrity) {
      chunk.integrity = integrity
      chunk.crossOrigin = 'anonymous'
    }
    chunk.onload = () => {
      const published = (win as unknown as Record<string, TrackerChunks[typeof name] | undefined>)[
        chunkGlobal(name)
      ]
      if (published) ready(published)
    }
    ;(doc.head ?? doc.documentElement).appendChild(chunk)
  })
}
