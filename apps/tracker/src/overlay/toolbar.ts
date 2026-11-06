import {
  DEVICES,
  INTERVALS,
  type Device,
  type Interval,
  type OverlayData,
  type TimeWindow,
  windowFor,
} from './data.ts'
import { formatCount, h, icon, plural } from './dom.ts'

export type Status = 'loading' | 'ready' | 'error' | 'expired'

export interface ViewState {
  interval: Interval
  window: TimeWindow | null
  device: Device
  collapsed: boolean
  status: Status
  scroll: boolean
  data: OverlayData | null
  missing: number
}

export interface ToolbarActions {
  readonly set: (patch: Partial<ViewState>) => void
  readonly retry: () => void
  readonly close: () => void
  readonly viewportDevice: () => Device
}

export const MARK =
  'M213.12 39.25A43.7 43.7 0 0 1 298.88 39.25A30 30 0 0 0 348.71 55.45A43.7 43.7 0 0 1 418.09 105.85A30 30 0 0 0 448.89 148.24A43.7 43.7 0 0 1 475.39 229.8A30 30 0 0 0 475.39 282.2A43.7 43.7 0 0 1 448.89 363.76A30 30 0 0 0 418.09 406.15A43.7 43.7 0 0 1 348.71 456.55A30 30 0 0 0 298.88 472.75A43.7 43.7 0 0 1 213.12 472.75A30 30 0 0 0 163.29 456.55A43.7 43.7 0 0 1 93.91 406.15A30 30 0 0 0 63.11 363.76A43.7 43.7 0 0 1 36.61 282.2A30 30 0 0 0 36.61 229.8A43.7 43.7 0 0 1 63.11 148.24A30 30 0 0 0 93.91 105.85A43.7 43.7 0 0 1 163.29 55.45A30 30 0 0 0 213.12 39.25ZM342 114a54 54 0 1 0 0 108a54 54 0 1 0 0 -108Z'

const ICONS = {
  desktop: 'M3 5h18v11H3z|M8 20h8|M12 16v4',
  mobile: 'M8 3h8v18H8z|M11 18h2',
  down: 'M6 9l6 6 6-6',
  up: 'M6 15l6-6 6 6',
  close: 'M6 6l12 12|M18 6L6 18',
}

const DEVICE_LABEL: Record<Device, string> = {
  desktop: 'Desktop',
  mobile: 'Mobile',
}

export function createToolbar(doc: Document, actions: ToolbarActions) {
  const pressed: [HTMLElement, () => boolean][] = []

  const toggle = (
    label: string,
    content: (Node | string)[],
    isOn: () => boolean,
    onPress: () => void,
    className = '',
  ): HTMLElement => {
    const button = h(
      doc,
      'button',
      { type: 'button', 'aria-label': label, title: label, class: className },
      content,
    )
    button.addEventListener('click', onPress)
    pressed.push([button, isOn])
    return button
  }

  let view: ViewState
  const segment = <K extends 'device'>(
    key: K,
    group: string,
    options: readonly [ViewState[K], string, (Node | string)[]][],
    className = '',
  ): HTMLElement =>
    h(
      doc,
      'div',
      { class: `seg ${className}`, role: 'group', 'aria-label': group },
      options.map(([value, label, content]) =>
        toggle(
          label,
          content,
          () => view[key] === value,
          () => actions.set({ [key]: value } as Partial<ViewState>),
          content.length === 1 && typeof content[0] !== 'string' ? 'icon' : '',
        ),
      ),
    )

  const brand = (): HTMLElement => {
    const mark = icon(doc, MARK, 18, '0 0 512 512')
    mark.querySelector('path')?.setAttribute('fill-rule', 'evenodd')
    return h(doc, 'span', { class: 'brand' }, [mark, 'Heatmap'])
  }

  const intervals = h(doc, 'select', { 'aria-label': 'Date range', class: 'select' }, [
    ...INTERVALS.map(([value, label]) => h(doc, 'option', { value }, [label])),
  ]) as HTMLSelectElement
  const custom = h(doc, 'option', { value: 'custom', disabled: '' }, ['Custom range'])
  intervals.addEventListener('change', () => {
    const interval = intervals.value as Interval
    if (interval !== 'custom') actions.set({ interval, window: windowFor(interval, new Date()) })
  })

  const scrollToggle = h(doc, 'button', { type: 'button', role: 'switch', class: 'switch' }, [
    h(doc, 'span', { class: 'track', 'aria-hidden': 'true' }),
    'Scroll depth',
  ])
  scrollToggle.addEventListener('click', () => actions.set({ scroll: !view.scroll }))
  const closeButton = (): HTMLElement => {
    const button = h(
      doc,
      'button',
      {
        type: 'button',
        class: 'icon',
        'aria-label': 'Close heatmap (Esc)',
        title: 'Close heatmap (Esc)',
      },
      [icon(doc, ICONS.close)],
    )
    button.addEventListener('click', actions.close)
    return button
  }
  const collapse = h(
    doc,
    'button',
    { type: 'button', class: 'icon', 'aria-label': 'Collapse toolbar', title: 'Collapse toolbar' },
    [icon(doc, ICONS.down)],
  )
  collapse.addEventListener('click', () => actions.set({ collapsed: true }))
  const expand = h(
    doc,
    'button',
    { type: 'button', class: 'icon', 'aria-label': 'Expand toolbar', title: 'Expand toolbar' },
    [icon(doc, ICONS.up)],
  )
  expand.addEventListener('click', () => actions.set({ collapsed: false }))

  const sep = (): HTMLElement => h(doc, 'span', { class: 'sep', 'aria-hidden': 'true' })
  const bar = h(
    doc,
    'div',
    { class: 'bar glass', role: 'toolbar', 'aria-label': 'invisit heatmap' },
    [
      brand(),
      sep(),
      intervals,
      segment(
        'device',
        'Device',
        DEVICES.map(
          (device) => [device, DEVICE_LABEL[device], [icon(doc, ICONS[device])]] as const,
        ),
      ),
      scrollToggle,
      sep(),
      collapse,
      closeButton(),
    ],
  )
  const pill = h(
    doc,
    'div',
    { class: 'bar pill glass', role: 'toolbar', 'aria-label': 'invisit heatmap' },
    [brand(), expand, closeButton()],
  )
  const status = h(doc, 'div', { class: 'status glass', role: 'status', 'aria-live': 'polite' })
  const el = h(doc, 'div', { class: 'dock' }, [status, bar, pill])

  const line = (className: string, text: string): HTMLElement =>
    h(doc, 'span', { class: className }, [text])
  const dot = (): HTMLElement => h(doc, 'span', { class: 'dot', 'aria-hidden': 'true' })
  const stat = (value: string, label: string): HTMLElement =>
    h(doc, 'span', {}, [h(doc, 'b', {}, [value]), label])

  const statusContent = (state: ViewState): Node[] => {
    if (state.status === 'loading')
      return [h(doc, 'span', { class: 'skeleton', 'aria-label': 'Loading heatmap' })]
    if (state.status === 'expired')
      return [line('err', 'Session expired — reopen from your dashboard')]
    if (state.status === 'error') {
      const retry = h(doc, 'button', { type: 'button' }, ['Retry'])
      retry.addEventListener('click', actions.retry)
      return [line('err', 'Couldn’t load heatmap data'), retry]
    }
    const data = state.data!
    const scope = `on this page for ${state.device} in this range`
    const nodes: Node[] = []
    const { clicks } = data.totals
    const scroll = data.scroll && data.scroll.samples > 0 ? data.scroll : null
    if (clicks === 0 && !scroll) {
      nodes.push(line('', `Nothing recorded ${scope}`))
    } else {
      nodes.push(stat(formatCount(clicks), ` click${clicks === 1 ? '' : 's'}`))
      const { rage_clicks: rage, dead_clicks: dead } = data.totals
      if (rage > 0)
        nodes.push(dot(), stat(formatCount(rage), ` rage click${rage === 1 ? '' : 's'}`))
      if (dead > 0)
        nodes.push(dot(), stat(formatCount(dead), ` dead click${dead === 1 ? '' : 's'}`))
      if (scroll)
        nodes.push(dot(), stat(`${Math.round(scroll.average_percent)}%`, ' average depth'))
      if (state.missing > 0)
        nodes.push(
          line('note', `${plural(state.missing, 'click')} on elements no longer on this page`),
        )
      if (data.truncated) nodes.push(line('note', 'Showing the busiest spots'))
    }
    const actual = actions.viewportDevice()
    if (actual !== state.device) {
      nodes.push(line('warn', `Resize to ${state.device} width for accurate positions`))
    }
    return nodes
  }

  return {
    el,
    render(state: ViewState): void {
      view = state
      for (const [button, isOn] of pressed) button.setAttribute('aria-pressed', `${isOn()}`)
      if (state.interval === 'custom' && !custom.isConnected) intervals.prepend(custom)
      intervals.value = state.interval
      scrollToggle.setAttribute('aria-checked', `${state.scroll}`)
      bar.hidden = state.collapsed
      pill.hidden = !state.collapsed
      status.hidden = state.collapsed
      status.replaceChildren(...statusContent(state))
    },
  }
}
