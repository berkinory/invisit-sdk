import type { RuleEngine, RuleMatch } from './rules.ts'
import { isValidEventName, sanitizeProperties, type PropertyValue } from './sanitize.ts'

const EVENT_ATTRIBUTE = 'data-invisit-event'

const PROPERTY_ATTRIBUTE = 'data-invisit-prop-'

function attributeProperties(
  element: Element,
  redactQueryKeys: readonly string[],
): Record<string, PropertyValue> | undefined {
  let raw: Record<string, string> | undefined
  for (const name of element.getAttributeNames()) {
    if (name.indexOf(PROPERTY_ATTRIBUTE) !== 0) continue
    if (!raw) raw = {}
    raw[name.slice(PROPERTY_ATTRIBUTE.length)] = element.getAttribute(name) ?? ''
  }
  return raw && sanitizeProperties(raw, redactQueryKeys)
}

export interface ActionsDeps {
  readonly document: Pick<Document, 'addEventListener' | 'removeEventListener'>
  readonly redactQueryKeys: () => readonly string[]
  readonly newActionId: () => string
  readonly rules: () => RuleEngine | undefined
  readonly emit: (match: RuleMatch, actionId: string) => void
}

export function createActions(deps: ActionsDeps) {
  let currentActionId: string | null = null

  const run = (trigger: 'click' | 'submit', target: Element, attributeOnly?: boolean): void => {
    const matches = attributeOnly ? [] : (deps.rules()?.match(trigger, target) ?? [])

    let attribute: RuleMatch | null = null
    const marked = target.closest(`[${EVENT_ATTRIBUTE}]`)
    if (marked && (marked.tagName === 'FORM') === (trigger === 'submit')) {
      const value = marked.getAttribute(EVENT_ATTRIBUTE)
      if (isValidEventName(value) && !matches.some((match) => match.name === value)) {
        const properties = attributeProperties(marked, deps.redactQueryKeys())
        attribute = { name: value, ...(properties ? { properties } : {}) }
      }
    }

    if (matches.length === 0 && attribute === null) return

    const actionId = currentActionId ?? deps.newActionId()
    currentActionId = actionId
    for (const match of matches) deps.emit(match, actionId)
    if (attribute !== null) deps.emit(attribute, actionId)
  }

  const onAction =
    (trigger: 'click' | 'submit', auxiliary?: boolean) =>
    (event: Event): void => {
      const target = event.target
      if (!target || typeof (target as Element).tagName !== 'string') return

      if (
        auxiliary &&
        ((event as MouseEvent).button !== 1 || !(target as Element).closest('a[href]'))
      ) {
        return
      }

      currentActionId = deps.newActionId()
      try {
        run(trigger, target as Element, auxiliary)
      } finally {
        setTimeout(() => {
          currentActionId = null
        }, 0)
      }
    }

  const onClick = onAction('click')
  const onAuxClick = onAction('click', true)
  const onSubmit = onAction('submit')

  return {
    start(): void {
      deps.document.addEventListener('click', onClick, { capture: true, passive: true })
      deps.document.addEventListener('auxclick', onAuxClick, { capture: true, passive: true })
      deps.document.addEventListener('submit', onSubmit, { capture: true })
    },

    stop(): void {
      deps.document.removeEventListener('click', onClick, { capture: true })
      deps.document.removeEventListener('auxclick', onAuxClick, { capture: true })
      deps.document.removeEventListener('submit', onSubmit, { capture: true })
    },

    actionId(): string | null {
      return currentActionId
    },
  }
}

export type Actions = ReturnType<typeof createActions>
