/* Text edits that insert lines into a file and leave everything else in it byte for byte. Each
   helper either finds exactly one place for the insertion or throws Unsafe, and the caller then
   prints the snippet for a person to paste instead of guessing. */

export class Unsafe extends Error {}

export interface Style {
  readonly quote: "'" | '"'
  readonly semi: '' | ';'
  readonly indent: string
}

/** Quotes, semicolons and indentation as the file already writes them, so insertions blend in. */
export function detectStyle(source: string): Style {
  const statement = /^[ \t]*import\b[^\n]*?(['"])[^'"\n]+\1(;?)[ \t]*$/m.exec(source)
  const quote = statement?.[1] === '"' ? '"' : "'"
  const semi = statement?.[2] === ';' ? ';' : ''
  return { quote, semi, indent: detectIndent(source) }
}

function detectIndent(source: string): string {
  let tabs = 0
  let spaces = Infinity
  for (const match of source.matchAll(/^([ \t]+)\S/gm)) {
    const lead = match[1] ?? ''
    if (lead.startsWith('\t')) tabs++
    else spaces = Math.min(spaces, lead.length)
  }
  if (tabs > 0 && spaces === Infinity) return '\t'
  if (spaces === 4) return '    '
  return tabs > 0 ? '\t' : '  '
}

/** Rewrites a snippet written with two-space indentation in the file's own indentation. */
export function reindent(text: string, unit: string): string {
  if (unit === '  ') return text
  return text.replace(/^((?: {2})+)/gm, (lead) => unit.repeat(lead.length / 2))
}

export function quoted(style: Style, value: string): string {
  return `${style.quote}${value}${style.quote}`
}

const IMPORT_START = /^import[\s{'"*]/
const IMPORT_END = /['"][^'"\n]*['"][ \t]*(?:with[ \t]*\{[^}]*\}[ \t]*)?;?[ \t]*(?:\/\/.*)?$/
const DIRECTIVE = /^['"]use [\w ]+['"];?$/

/** The line after the file's leading imports (and directives like 'use client'). */
function importBlockEnd(
  lines: readonly string[],
  from = 0,
  to = lines.length,
): { end: number; imports: boolean } {
  let end = from
  let imports = false
  let inComment = false
  for (let i = from; i < to; i++) {
    const line = (lines[i] ?? '').trim()
    if (inComment) {
      if (line.includes('*/')) inComment = false
      continue
    }
    if (line === '' || line.startsWith('//')) continue
    if (line.startsWith('/*')) {
      inComment = !line.includes('*/')
      continue
    }
    if (DIRECTIVE.test(line) && !imports) {
      end = i + 1
      continue
    }
    if (!IMPORT_START.test(line)) break
    let j = i
    while (j < to && !IMPORT_END.test(lines[j] ?? '')) j++
    if (j >= to) throw new Unsafe('an import statement there does not end')
    end = j + 1
    imports = true
    i = j
  }
  return { end, imports }
}

/**
 * Adds import lines after the existing imports, and optionally statements right after them, in
 * the line range given (a whole module, or the content of a <script> block).
 */
export function addImports(
  source: string,
  importLines: readonly string[],
  statements: readonly string[] = [],
  range?: { readonly from: number; readonly to: number },
): string {
  const lines = source.split('\n')
  const { end, imports } = importBlockEnd(lines, range?.from, range?.to)
  const block = [...importLines]
  if (!imports && end > (range?.from ?? 0)) block.unshift('')
  if (statements.length > 0) block.push('', ...statements)
  const next = lines[end]
  if (next !== undefined && next.trim() !== '' && (!imports || statements.length > 0)) {
    block.push('')
  }
  lines.splice(end, 0, ...block)
  return lines.join('\n')
}

export function lineIndent(line: string): string {
  return /^[ \t]*/.exec(line)?.[0] ?? ''
}

/**
 * Inserts text before or after the one match of an anchor: on its own line with the anchor's
 * indentation when the anchor has a line to itself, otherwise right next to it on the same line.
 */
export function insertAtAnchor(
  source: string,
  anchor: RegExp,
  label: string,
  text: string,
  where: 'before' | 'after',
  /** Added to each line of text when it goes on lines of its own, to nest it under the anchor. */
  nest = '',
): string {
  const matches = [
    ...source.matchAll(new RegExp(anchor.source, `${anchor.flags.replace('g', '')}g`)),
  ]
  if (matches.length === 0) throw new Unsafe(`${label} was not found`)
  if (matches.length > 1) throw new Unsafe(`${label} appears ${matches.length} times`)
  const match = matches[0]!
  const start = match.index
  const stop = start + match[0].length
  const lineStart = source.lastIndexOf('\n', start - 1) + 1
  const lineEndAt = source.indexOf('\n', stop)
  const lineEnd = lineEndAt === -1 ? source.length : lineEndAt
  const line = source.slice(lineStart, lineEnd)
  if (line.trim() === match[0].trim()) {
    const indent = lineIndent(line)
    const block = text
      .split('\n')
      .map((part) => (part ? indent + nest + part : part))
      .join('\n')
    return where === 'before'
      ? `${source.slice(0, lineStart)}${block}\n${source.slice(lineStart)}`
      : `${source.slice(0, lineEnd)}\n${block}${source.slice(lineEnd)}`
  }
  if (text.includes('\n')) throw new Unsafe(`${label} shares its line with other code`)
  return where === 'before'
    ? `${source.slice(0, start)}${text}${source.slice(start)}`
    : `${source.slice(0, stop)}${text}${source.slice(stop)}`
}

/** Whether a top-level name is already bound, so an insertion would redeclare it. */
export function hasBinding(source: string, name: string): boolean {
  return new RegExp(
    `\\bimport\\s+${name}\\b|\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\b|\\bimport\\s*\\*\\s*as\\s+${name}\\b|\\b(?:const|let|var|function|class)\\s+${name}\\b`,
  ).test(source)
}

/** The init import, renamed when the file already has something called init. */
export function initImport(source: string, style: Style): { line: string; call: string } {
  const from = `from ${quoted(style, '@invisitdev/web')}${style.semi}`
  return hasBinding(source, 'init')
    ? { line: `import { init as initInvisit } ${from}`, call: 'initInvisit' }
    : { line: `import { init } ${from}`, call: 'init' }
}
