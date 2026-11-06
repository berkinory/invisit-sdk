import { h, icon } from './overlay/dom.ts'
import { HOST_STYLE } from './overlay/styles.ts'
import { MARK } from './overlay/toolbar.ts'
import type { TrackerEvent } from './types.ts'

const ROWS_KEPT = 30
const QUIET_NOTICE_MS = 5_000
const ENDED = 'debug_session_ended'

const SANDBOXED = 'Nothing here reaches your reports.'
const QUIET = 'Nothing sent yet. Consent, Do Not Track, GPC or an excluded path can hold it back.'
const LEFT = 'This session has ended. Start a new one from Settings, Debug.'

const ICONS = { fold: 'M6 9l6 6 6-6', unfold: 'M6 15l6-6 6 6', close: 'M6 6l12 12|M18 6L6 18' }

const PROBLEMS: Record<string, string> = {
  origin_not_allowed: 'This host is not an allowed domain',
  origin_local: 'Local hosts are not allowed on this site',
  origin_missing: 'The request had no origin',
  origin_sandboxed: 'Sent from a sandboxed frame',
  rate_limited: 'Rate limited, retrying',
  bot_known: 'Seen as a bot',
  bot_headless: 'Seen as a headless browser',
  bot_missing_user_agent: 'Sent without a user agent',
  bot_automation_hint: 'Seen as automation',
  fetch_metadata_mismatch: 'Browser signals look automated',
  prefetch_request: 'Sent as a prefetch',
  gpc_opt_out: 'Global Privacy Control is on',
  quota_paused: 'The workspace is over its quota',
  malformed_payload: 'The event is not valid',
  referrer_spam: 'The referrer is on the spam list',
  network_error: 'Never reached the collector: ad blocker or network',
  beacon_refused: 'The browser refused to send it',
  [ENDED]: 'Session ended, not recorded',
}

/* The heatmap overlay's glass and marks, with the dashboard's frame around a well. */
const CSS = `
:host{all:initial}
.panel{--ink:#ececef;--muted:#a1a1aa;--faint:#71717a;--accent:#8580ff;--line:rgba(255,255,255,.08);--hover:rgba(255,255,255,.07);
position:fixed;right:16px;bottom:16px;width:min(340px,calc(100vw - 24px));padding:3px;border-radius:18px;pointer-events:auto;color:var(--ink);
background:rgba(24,24,27,.88);border:1px solid var(--line);
box-shadow:0 18px 40px -12px rgba(0,0,0,.55),0 2px 6px -2px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.06);
-webkit-backdrop-filter:blur(18px) saturate(1.5);backdrop-filter:blur(18px) saturate(1.5);
font:500 12.5px/1.35 "Inter Tight",Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
font-feature-settings:"tnum" 1,"cv11" 1;-webkit-font-smoothing:antialiased;letter-spacing:-.005em}
.panel *{box-sizing:border-box}
.head{display:flex;align-items:center;gap:7px;height:34px;padding:0 3px 0 9px}
.brand{flex:1;min-width:0;display:flex;align-items:center;gap:7px;font-weight:600}
.brand svg{flex:none}.brand svg path{fill:var(--accent);stroke:none}
.chip{display:inline-flex;align-items:center;gap:5px;height:18px;padding:0 7px;border-radius:999px;background:var(--hover);color:var(--muted);font-size:11px;font-weight:500}
.live{width:6px;height:6px;border-radius:50%;background:var(--accent);animation:b 2s ease-in-out infinite}
.ended .live{background:var(--faint);animation:none}
@keyframes b{50%{opacity:.35}}
@media (prefers-reduced-motion:reduce){.live{animation:none}}
button{all:unset;cursor:pointer;display:inline-grid;place-items:center;width:26px;height:26px;border-radius:9px;color:var(--muted);transition:background .15s ease,color .15s ease}
button:hover{background:var(--hover);color:var(--ink)}
button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
button path{fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
.well{display:flex;flex-direction:column;border-radius:15px;background:rgba(255,255,255,.045);box-shadow:inset 0 0 0 1px rgba(255,255,255,.03);overflow:hidden}
.rows{margin:0;padding:4px;list-style:none;max-height:236px;overflow:auto;scrollbar-width:thin}
.rows:empty{display:none}
.row{display:grid;grid-template-columns:6px minmax(0,1fr);gap:1px 9px;align-items:baseline;padding:5px 8px;border-radius:9px}
.row:hover{background:rgba(255,255,255,.04)}
.mark{width:6px;height:6px;border-radius:50%;background:#34d399;align-self:center}
.bad .mark{background:#fbbf24}
.what{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.what span{margin-left:5px;color:var(--faint);font:500 11.5px ui-monospace,SFMono-Regular,Menlo,monospace}
.why{grid-column:2;color:#fbbf24;font-size:11.5px}
.note{padding:8px 12px;color:var(--faint);font-size:11.5px}
.rows:not(:empty)+.note{border-top:1px solid var(--line)}
.note.warn{color:#fbbf24}
.closed{width:auto}.closed .well,.closed .chip{display:none}
.tally{display:none;color:var(--muted);font-weight:500}
.closed .tally{display:inline}
`

interface Row {
  readonly what: string
  readonly where: string
  readonly problem: string | null
}

const pathOf = (url: string | undefined): string => {
  try {
    return url ? new URL(url).pathname : ''
  } catch {
    return ''
  }
}

const rowOf = (event: TrackerEvent, problem: string | null): Row => {
  const sent = event as { readonly name?: string; readonly page?: { readonly url?: string } }
  return {
    what: sent.name ?? event.type.replace('_', ' '),
    where: pathOf(sent.page?.url),
    problem,
  }
}

export interface DebugPanelOptions {
  readonly doc: Document
  readonly end: () => void
}

export type DebugReport = (events: readonly TrackerEvent[], problem: string | null) => void

function openDebug({ doc, end }: DebugPanelOptions): DebugReport {
  const host = doc.createElement('invisit-debug')
  host.setAttribute('style', HOST_STYLE)
  const shadow = host.attachShadow({ mode: 'closed' })

  const rows = new Map<string, Row>()
  const list = h(doc, 'ul', { class: 'rows' })
  const note = h(doc, 'div', { class: 'note' }, ['Waiting for the first event.'])
  const tally = h(doc, 'span', { class: 'tally' })
  const button = (label: string, path: string): HTMLElement =>
    h(doc, 'button', { type: 'button', title: label, 'aria-label': label }, [icon(doc, path, 15)])
  const fold = button('Hide', ICONS.fold)
  const finish = button('End session', ICONS.close)
  const mark = icon(doc, MARK, 16, '0 0 512 512')
  mark.querySelector('path')?.setAttribute('fill-rule', 'evenodd')
  const panel = h(doc, 'div', { class: 'panel', role: 'status' }, [
    h(doc, 'div', { class: 'head' }, [
      h(doc, 'span', { class: 'brand' }, [
        mark,
        'Debug',
        h(doc, 'span', { class: 'chip' }, [h(doc, 'i', { class: 'live' }), 'Sandbox']),
        tally,
      ]),
      fold,
      finish,
    ]),
    h(doc, 'div', { class: 'well' }, [list, note]),
  ])
  shadow.append(h(doc, 'style', {}, [CSS]), panel)
  ;(doc.body ?? doc.documentElement).append(host)

  fold.onclick = () => {
    const closed = panel.classList.toggle('closed')
    const label = closed ? 'Show' : 'Hide'
    fold.replaceChildren(icon(doc, closed ? ICONS.unfold : ICONS.fold, 15))
    fold.title = label
    fold.setAttribute('aria-label', label)
  }
  finish.onclick = end

  const say = (text: string, warn: boolean): void => {
    note.textContent = text
    note.className = warn ? 'note warn' : 'note'
  }

  setTimeout(() => {
    if (rows.size === 0) say(QUIET, true)
  }, QUIET_NOTICE_MS)

  const paint = (): void => {
    tally.textContent = `${rows.size}`
    list.replaceChildren(
      ...[...rows.values()]
        .reverse()
        .map(({ what, where, problem }) =>
          h(doc, 'li', { class: problem ? 'row bad' : 'row' }, [
            h(doc, 'i', { class: 'mark' }),
            h(doc, 'div', { class: 'what' }, [what, where && h(doc, 'span', {}, [where])]),
            problem && h(doc, 'div', { class: 'why' }, [PROBLEMS[problem] ?? problem]),
          ]),
        ),
    )
  }

  return (events, problem) => {
    for (const event of events) {
      rows.delete(event.event_id)
      rows.set(event.event_id, rowOf(event, problem))
    }
    for (const id of [...rows.keys()].slice(0, Math.max(0, rows.size - ROWS_KEPT))) rows.delete(id)
    if (problem === ENDED) panel.classList.add('ended')
    if (panel.classList.contains('ended')) say(LEFT, true)
    else say(SANDBOXED, false)
    paint()
  }
}

export const TRACKER_DEBUG = { openDebug }
export type TrackerDebug = typeof TRACKER_DEBUG
