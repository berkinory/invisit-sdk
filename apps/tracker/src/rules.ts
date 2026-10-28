import { PROPERTY_VALUE_MAX_LENGTH, ELEMENT_TEXT_MAX_LENGTH } from './constants.ts'
import type { PropertyValue } from './sanitize.ts'
import { redactQueryKeyValues, redactText, sanitizeUrl, truncate } from './sanitize.ts'

export const RULE_BUDGET_MS = 2

const RULE_BUDGET_WINDOW = 8

const RULE_SAMPLE_CAP_MS = RULE_BUDGET_MS * 4

export type RuleTrigger = 'click' | 'submit' | 'url_pattern'

interface RuleProperty {
  readonly key: string
  readonly source: string
  readonly argument?: string
}

export interface NoCodeRule {
  readonly rule_id: string
  readonly name: string
  readonly version: number
  readonly trigger: RuleTrigger
  readonly selector?: string
  readonly url_pattern?: string
  readonly properties?: readonly RuleProperty[]
}

export interface RuleMatch {
  readonly ruleId?: string
  readonly name: string
  readonly properties?: Record<string, PropertyValue>
}

export function matchesPattern(pattern: string, path: string): boolean {
  const p = pattern.split('/')
  const t = path.split('/')
  let i = 0
  for (; i < p.length; i += 1) {
    if (p[i] === '**') return true
    if (i >= t.length) return false
    if (p[i] !== '*' && p[i] !== t[i]) return false
  }
  return i === t.length
}

const USER_INPUT = 'input,textarea,select,option,[contenteditable]:not([contenteditable="false"])'

const INTERACTIVE = 'a,button,[role=button],summary,label'

const TEXT_SCAN_CHARS = ELEMENT_TEXT_MAX_LENGTH * 4

export function controlText(element: Element, extraKeys: readonly string[]): string | undefined {
  if ((element as HTMLElement).isContentEditable === true || element.closest(USER_INPUT)) {
    return undefined
  }
  const control = element.closest(INTERACTIVE)
  if (!control || control.querySelector(USER_INPUT)) return undefined

  const content = control.textContent ?? ''
  let raw = content.slice(0, TEXT_SCAN_CHARS)
  if (content.length > TEXT_SCAN_CHARS) raw = raw.replace(/\S*$/, '')
  raw = raw.replace(/\s+/g, ' ').trim()
  if (raw === '') return undefined
  const text = truncate(redactText(redactQueryKeyValues(raw, extraKeys)), ELEMENT_TEXT_MAX_LENGTH)
  return text === '' ? undefined : text
}

const ATTRIBUTE_ALLOWED = /^(?:data-[a-z0-9-]+|id|class|name|type|role|aria-label|href|title|alt)$/

export interface ExtractContext {
  readonly path: string
  readonly url: string
  readonly title: string
  readonly search: URLSearchParams | null
  readonly redactQueryKeys: readonly string[]
}

function extract(
  rule: RuleProperty,
  element: Element | null,
  context: ExtractContext,
): string | undefined {
  switch (rule.source) {
    case 'text':
      return element ? controlText(element, context.redactQueryKeys) : undefined
    case 'element_tag':
      return element ? element.tagName.toLowerCase() : undefined
    case 'page_path':
      return context.path
    case 'page_url':
      return context.url === '' ? undefined : context.url
    case 'page_title':
      return context.title === '' ? undefined : context.title
    case 'attribute': {
      const name = rule.argument ?? ''
      if (!element || !ATTRIBUTE_ALLOWED.test(name)) return undefined
      const value = element.getAttribute(name)
      return value === null ? undefined : truncate(redactText(value), PROPERTY_VALUE_MAX_LENGTH)
    }
    case 'url_param': {
      const value = context.search?.get(rule.argument ?? '')
      return value == null ? undefined : truncate(redactText(value), PROPERTY_VALUE_MAX_LENGTH)
    }
    case 'constant':
      return rule.argument === undefined
        ? undefined
        : truncate(rule.argument, PROPERTY_VALUE_MAX_LENGTH)
    default:
      return undefined
  }
}

function propertiesFor(
  rule: NoCodeRule,
  element: Element | null,
  context: ExtractContext,
): Record<string, PropertyValue> | undefined {
  if (!rule.properties || rule.properties.length === 0) return undefined
  const out: Record<string, PropertyValue> = {}
  let any = false
  for (const property of rule.properties) {
    const value = extract(property, element, context)
    if (value !== undefined) {
      out[property.key] = value
      any = true
    }
  }
  return any ? out : undefined
}

export interface RulesDeps {
  readonly document: { title?: string }
  readonly location: () => { href: string; pathname: string; search: string }
  readonly rules: () => readonly NoCodeRule[]
  readonly redactKeys: () => readonly string[]
  readonly now: () => number
  readonly emit: (match: RuleMatch, actionId: string) => void
  readonly newActionId: () => string
}

export function createRules(deps: RulesDeps) {
  let disabled = false
  let samples: number[] = []
  let sampleIndex = 0
  let firedOnPage: string[] = []

  const contextFor = (): ExtractContext => {
    const location = deps.location()
    const redactQueryKeys = deps.redactKeys()
    let search: URLSearchParams | null = null
    try {
      search = new URLSearchParams(location.search)
    } catch {}
    const bound = (value: string): string => truncate(value, PROPERTY_VALUE_MAX_LENGTH)
    return {
      path: bound(location.pathname),
      url: bound(sanitizeUrl(location.href, redactQueryKeys)),
      title: bound(deps.document.title ?? ''),
      search,
      redactQueryKeys,
    }
  }

  const record = (elapsed: number): void => {
    samples[sampleIndex] = Math.min(elapsed, RULE_SAMPLE_CAP_MS)
    sampleIndex = (sampleIndex + 1) % RULE_BUDGET_WINDOW
    let total = 0
    for (const sample of samples) total += sample
    if (total > RULE_BUDGET_MS * RULE_BUDGET_WINDOW) disabled = true
  }

  const evaluateUrlRules = (): void => {
    const rules = deps.rules()
    if (rules.length === 0) return

    let context: ExtractContext | undefined
    for (const rule of rules) {
      if (rule.trigger !== 'url_pattern' || !rule.url_pattern) continue
      if (firedOnPage.indexOf(rule.rule_id) !== -1) continue
      context ??= contextFor()
      if (!matchesPattern(rule.url_pattern, context.path)) continue
      firedOnPage.push(rule.rule_id)
      const properties = propertiesFor(rule, null, context)
      deps.emit(
        { ruleId: rule.rule_id, name: rule.name, ...(properties ? { properties } : {}) },
        deps.newActionId(),
      )
    }
  }

  return {
    match(trigger: 'click' | 'submit', target: Element): RuleMatch[] {
      const rules = disabled ? [] : deps.rules()
      if (rules.length === 0) return []

      const matched: { rule: NoCodeRule; element: Element }[] = []
      const startedAt = deps.now()
      for (const rule of rules) {
        if (rule.trigger !== trigger || !rule.selector) continue
        let element: Element | null = null
        try {
          element = target.closest(rule.selector)
        } catch {
          continue
        }
        if (element) matched.push({ rule, element })
      }
      record(deps.now() - startedAt)
      if (matched.length === 0) return []

      let context: ExtractContext | undefined
      return matched.map(({ rule, element }) => {
        const properties = rule.properties?.length
          ? propertiesFor(rule, element, (context ??= contextFor()))
          : undefined
        return { ruleId: rule.rule_id, name: rule.name, ...(properties ? { properties } : {}) }
      })
    },

    onPageView(): void {
      disabled = false
      samples = []
      sampleIndex = 0
      firedOnPage = []
      evaluateUrlRules()
    },

    onRulesChanged: evaluateUrlRules,
  }
}

export type RuleEngine = ReturnType<typeof createRules>
