import { INGEST_CONTENT_TYPE } from './transport.ts'

/* The core passes these through unread; they are validated here. */
export interface FeedbackConfig {
  readonly button?: unknown
  readonly position?: unknown
  readonly label?: unknown
  readonly prompt?: unknown
  readonly color?: unknown
}

interface FeedbackDeps {
  readonly doc: Document
  readonly feedbackCollector: string
  readonly feedbackSiteId: string
  readonly settings: FeedbackConfig
  /* The visit this message belongs to, or null where it may not be linked to one. */
  readonly session: () => string | null
  /* The page as the tracker reports it: redacted, no fragment. */
  readonly pageUrl: () => string
}

export interface FeedbackMessage {
  readonly message: string
  readonly email?: string
}

const MESSAGE_MAX = 2000

/* --a is the accent and --d the shade its pressed and edged states mix toward. */
const CSS = `:host{all:initial}
*{box-sizing:border-box;margin:0;font:inherit;color:inherit}
.w{--a:#3a33e8;--d:#1c1680;--r:#6f6af5;--k:#18181b;--c:#fff;--g:#f5f5f6;--b:rgba(24,24,27,.12);--i:rgba(24,24,27,.14);--m:#6b6b73;--h:rgba(24,24,27,.05);--ws:inset 0 1px 2px rgba(24,24,27,.05),inset 0 0 0 1px rgba(24,24,27,.035);
position:fixed;bottom:20px;z-index:2147483000;display:flex;flex-direction:column;gap:10px;color:var(--k);font:400 14px/20px "Inter Tight",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
@media (prefers-color-scheme:dark){.w{--a:#8580ff;--d:#0e0a4a;--r:#8580ff;--k:#ececef;--c:#18181b;--g:#101012;--b:rgba(236,236,239,.11);--i:rgba(236,236,239,.16);--m:#a1a1aa;--h:rgba(236,236,239,.07);--ws:inset 0 1px 2px rgba(0,0,0,.45),inset 0 0 0 1px rgba(255,255,255,.03)}}
.r{right:20px;align-items:flex-end}.l{left:20px;align-items:flex-start}
button{cursor:pointer;border:0;background:none;outline:0}
button:focus-visible,textarea:focus,input:focus{outline:2px solid var(--r);outline-offset:-1px}
.o{display:flex;align-items:center;gap:6px;height:36px;padding:0 14px 0 11px;border:1px solid var(--b);border-radius:10px;background:var(--c);font-weight:500;box-shadow:0 1px 2px rgba(0,0,0,.06),0 8px 24px -8px rgba(0,0,0,.18);transition:transform .15s,background .15s}
.o:hover{background:color-mix(in srgb,var(--c) 94%,var(--k))}.o:active{transform:translateY(1px) scale(.98)}.o svg{color:var(--m)}
.p{width:min(360px,calc(100vw - 24px));border:1px solid var(--b);border-radius:22px;padding:3px;background:var(--c);box-shadow:0 1px 2px rgba(0,0,0,.06),0 24px 64px -16px rgba(0,0,0,.28);animation:in .18s cubic-bezier(.2,.8,.2,1)}
@keyframes in{from{opacity:0;transform:translateY(6px) scale(.985)}}
.h{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 6px 8px 14px}
.t{font-weight:500;color:color-mix(in srgb,var(--k) 80%,transparent)}
.x{width:28px;height:28px;border-radius:10px;display:grid;place-items:center;color:var(--m)}.x:hover{background:var(--h);color:var(--k)}
.f{display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:18px;background:var(--g);box-shadow:var(--ws)}
textarea,input{display:block;width:100%;border:1px solid var(--i);border-radius:14px;background:var(--c);padding:8px 12px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
textarea{min-height:104px;resize:none}input{height:36px}
::placeholder{color:color-mix(in srgb,var(--m) 72%,transparent)}
.e{color:#b91c1c;font-size:12px;line-height:16px;padding:0 4px}.e:empty{display:none}
@media (prefers-color-scheme:dark){.e{color:#f87171}}
.n{display:flex;justify-content:flex-end;padding:8px 5px 5px}
.s{height:32px;padding:0 12px;border-radius:10px;border:1px solid color-mix(in srgb,var(--a) 80%,var(--d));background:color-mix(in srgb,var(--a) 90%,var(--d));color:#fff;font-weight:500;box-shadow:inset 0 1px 0 rgba(255,255,255,.22),inset 0 -1px 0 color-mix(in srgb,var(--d) 30%,transparent);transition:transform .15s,opacity .15s}
.s:hover{background:var(--a)}.s:active{transform:translateY(1px) scale(.98)}.s:disabled{opacity:.6;cursor:default}
.d{display:flex;flex-direction:column;align-items:center;gap:4px;padding:28px 12px;text-align:center}
.d svg{color:var(--a);margin-bottom:6px}.d b{font-weight:500}.d span{color:var(--m)}
.k{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
@media (max-width:480px){.w{bottom:12px;left:12px;right:12px}.p{width:100%}textarea,input{font-size:16px}}
@media (prefers-reduced-motion:reduce){.p{animation:none}.o,.s{transition:none}}`

const svg = (paths: string, size = 16): string =>
  `<svg width="${String(size)}" height="${String(size)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`
const BUBBLE = svg(
  '<path d="M8 13.5h8M8 9.5h5"/><path d="M12 21a9 9 0 1 0-8.1-5.1L3 21l5.1-.9A9 9 0 0 0 12 21z"/>',
)
const CLOSE = svg('<path d="M18 6 6 18M6 6l12 12"/>')
const DONE = svg('<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>', 28)

const text = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.trim() !== '' ? value.slice(0, 120) : fallback

/* A #rgb or #rrggbb from the config, or nothing: no other value reaches the stylesheet. */
const safeColor = (value: unknown): string | null =>
  typeof value === 'string' && /^#(?:[0-9a-f]{3}){1,2}$/i.test(value) ? value : null

/* Resolves to the collector's status, 0 when it could not be reached. */
async function post(
  deps: FeedbackDeps,
  input: FeedbackMessage,
  extra: Record<string, unknown> = {},
): Promise<number> {
  const email = input.email?.trim()
  const session = deps.session()
  try {
    const response = await fetch(
      `${deps.feedbackCollector.replace(/\/+$/, '')}/v1/feedback?site=${encodeURIComponent(deps.feedbackSiteId)}`,
      {
        method: 'POST',
        credentials: 'omit',
        mode: 'cors',
        keepalive: true,
        headers: { 'Content-Type': INGEST_CONTENT_TYPE },
        body: JSON.stringify({
          message: input.message.trim().slice(0, MESSAGE_MAX),
          ...(email ? { email } : {}),
          url: deps.pageUrl(),
          ...(session ? { client_session_id: session } : {}),
          ...extra,
        }),
      },
    )
    return response.status
  } catch {
    return 0
  }
}

const accepted = (status: number) => status === 202 || status === 201

function createFeedback() {
  let deps: FeedbackDeps | null = null
  let host: HTMLElement | null = null
  let wrap: HTMLElement | null = null
  let panel: HTMLElement | null = null
  let launcher: HTMLButtonElement | null = null
  let closeTimer: ReturnType<typeof setTimeout> | undefined

  const el = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    attrs: Record<string, string> = {},
    html = '',
  ): HTMLElementTagNameMap[K] => {
    const node = deps!.doc.createElement(tag)
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value)
    if (html) node.innerHTML = html
    return node
  }

  const outside = (event: Event): void => {
    if (host && !event.composedPath().includes(host)) close()
  }

  const close = (): void => {
    clearTimeout(closeTimer)
    deps?.doc.removeEventListener('pointerdown', outside, true)
    if (!panel) return
    panel.remove()
    panel = null
    launcher?.setAttribute('aria-expanded', 'false')
    launcher?.focus()
  }

  const open = (): void => {
    if (!deps || !wrap) return
    if (panel) {
      panel.querySelector('textarea')?.focus()
      return
    }
    const current = deps
    const openedAt = Date.now()
    panel = el('div', { class: 'p', role: 'dialog', 'aria-labelledby': 'ft' })
    const head = el('div', { class: 'h' })
    const title = el('h2', { class: 't', id: 'ft' })
    title.textContent = text(current.settings.prompt, 'Send us feedback')
    const shut = el('button', { class: 'x', type: 'button', 'aria-label': 'Close' }, CLOSE)
    shut.onclick = close
    head.append(title, shut)

    const form = el('form', { novalidate: '' })
    const well = el('div', { class: 'f' })
    const message = el('textarea', {
      maxlength: String(MESSAGE_MAX),
      placeholder: 'What works, what does not, what is missing?',
      'aria-label': 'Your feedback',
      required: '',
    })
    const email = el('input', {
      type: 'email',
      maxlength: '254',
      autocomplete: 'email',
      placeholder: 'Email for a reply (optional)',
      'aria-label': 'Email (optional)',
    })
    /* Left empty by people, filled in by form-stuffing bots. */
    const trap = el('input', {
      class: 'k',
      name: 'website',
      tabindex: '-1',
      autocomplete: 'off',
      'aria-hidden': 'true',
    })
    const error = el('p', { class: 'e', role: 'alert' })
    well.append(message, email, trap, error)
    const foot = el('div', { class: 'n' })
    const submit = el('button', { class: 's', type: 'submit' })
    submit.textContent = 'Send'
    foot.append(submit)
    form.append(well, foot)

    message.onkeydown = (event) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) form.requestSubmit()
    }
    form.onsubmit = (event) => {
      event.preventDefault()
      error.textContent = ''
      if (message.value.trim() === '') {
        error.textContent = 'Write a few words first.'
        message.focus()
        return
      }
      if (email.value !== '' && !email.checkValidity()) {
        error.textContent = 'That email does not look right.'
        email.focus()
        return
      }
      submit.disabled = true
      submit.textContent = 'Sending…'
      void post(
        current,
        { message: message.value, email: email.value },
        { website: trap.value, elapsed_ms: Date.now() - openedAt },
      ).then((status) => {
        submit.disabled = false
        submit.textContent = 'Send'
        if (accepted(status)) return done()
        error.textContent =
          status === 429
            ? 'Too many messages. Try again in a few minutes.'
            : status === 0
              ? 'Could not send. Check your connection.'
              : 'Could not send. Try again.'
      })
    }

    const done = (): void => {
      if (!panel) return
      const thanks = el('div', { class: 'd f', role: 'status' }, DONE)
      const line = el('b')
      line.textContent = 'Thanks, we got it.'
      const sub = el('span')
      sub.textContent = 'Every message is read.'
      thanks.append(line, sub)
      form.replaceWith(thanks)
      closeTimer = setTimeout(close, 2400)
    }

    panel.append(head, form)
    panel.onkeydown = (event) => {
      if (event.key === 'Escape') close()
    }
    wrap.insertBefore(panel, launcher)
    launcher?.setAttribute('aria-expanded', 'true')
    current.doc.addEventListener('pointerdown', outside, true)
    message.focus()
  }

  const unmount = (): void => {
    close()
    host?.remove()
    host = wrap = launcher = null
  }

  const mount = (next: FeedbackDeps): void => {
    unmount()
    deps = next
    const { doc, settings } = next
    host = doc.createElement('invisit-feedback')
    const root = host.attachShadow({ mode: 'closed' })
    const style = el('style')
    style.textContent = CSS
    wrap = el('div', { class: `w ${settings.position === 'left' ? 'l' : 'r'}` })
    const color = safeColor(settings.color)
    if (color) {
      wrap.style.setProperty('--a', color)
      wrap.style.setProperty('--r', color)
      wrap.style.setProperty('--d', `color-mix(in srgb,${color} 35%,#000)`)
    }
    if (settings.button !== false) {
      launcher = el(
        'button',
        { class: 'o', type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' },
        BUBBLE,
      )
      launcher.append(text(settings.label, 'Feedback'))
      launcher.onclick = () => (panel ? close() : open())
      wrap.append(launcher)
    }
    root.append(style, wrap)
    const attach = (): void => {
      if (host) doc.body.append(host)
    }
    if (doc.body) attach()
    else doc.addEventListener('DOMContentLoaded', attach, { once: true })
  }

  /* Mounts again only when the settings changed, so an open form survives navigation; null takes
     the widget down. */
  let shown = ''
  const sync = (next: FeedbackDeps | null | undefined, wantOpen: boolean): void => {
    const key = next ? JSON.stringify(next.settings) : ''
    if (key !== shown) {
      shown = key
      if (next) mount(next)
      else unmount()
    }
    if (next && wantOpen) open()
  }

  const submit = async (next: FeedbackDeps, input: FeedbackMessage): Promise<boolean> => {
    if (typeof input?.message !== 'string' || input.message.trim() === '') return false
    return accepted(await post(next, input))
  }

  return { sync, submit }
}

export const TRACKER_FEEDBACK = createFeedback()

export type TrackerFeedback = typeof TRACKER_FEEDBACK
