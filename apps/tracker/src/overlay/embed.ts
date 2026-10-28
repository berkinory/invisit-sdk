import type { ViewState } from './toolbar.ts'

const SOURCE = 'invisit-heatmap'

export interface EmbedCommand {
  readonly window: { readonly from: string; readonly to: string } | undefined
  readonly scroll: boolean | undefined
}

// Messages pass only between this page and the dashboard origin the token was handed to.
export function createEmbed(
  win: Window,
  origin: string,
  onCommand: (command: EmbedCommand) => void,
) {
  const parent = win.parent
  const onMessage = (event: MessageEvent): void => {
    if (event.origin !== origin || event.source !== parent) return
    const data = event.data as Record<string, unknown> | null
    if (data === null || typeof data !== 'object' || data['source'] !== SOURCE) return
    const { from, to, scroll } = data
    onCommand({
      window: typeof from === 'string' && typeof to === 'string' ? { from, to } : undefined,
      scroll: typeof scroll === 'boolean' ? scroll : undefined,
    })
  }
  const post = (message: Record<string, unknown>): void =>
    parent.postMessage({ source: SOURCE, ...message }, origin)

  win.addEventListener('message', onMessage)
  return {
    hello: (): void => post({ type: 'hello' }),
    send(state: ViewState): void {
      post({
        type: 'state',
        status: state.status,
        path: win.location.pathname,
        totals: state.data?.totals ?? null,
        missing: state.missing,
        truncated: state.data?.truncated ?? false,
      })
    },
    stop: (): void => win.removeEventListener('message', onMessage),
  }
}
