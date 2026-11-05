import { DOCS_URL } from '../constants.ts'
import { editFile, manual, notFound, type Plan } from '../ops.ts'
import type { Project } from '../project.ts'
import {
  addImports,
  detectStyle,
  initImport,
  quoted,
  reindent,
  Unsafe,
  type Style,
} from '../source.ts'
import { scriptTagOps } from './html.ts'

/* Angular 19+: an app initializer beside the providers the CLI generated, guarded to run only in
   the browser so SSR stays untouched. Missing names are imported on their own lines, so the
   CLI's import lines are never rewritten. */

const CONFIG = 'src/app/app.config.ts'
const PROVIDERS = /providers:\s*\[/

function namedImports(source: string, module: string): Set<string> {
  const names = new Set<string>()
  const pattern = new RegExp(
    `import\\s*\\{([^}]*)\\}\\s*from\\s*['"]${module.replace('/', '\\/')}['"]`,
    'g',
  )
  for (const match of source.matchAll(pattern)) {
    for (const part of (match[1] ?? '').split(',')) {
      const name = part
        .trim()
        .split(/\s+as\s+/)
        .pop()
      if (name) names.add(name)
    }
  }
  return names
}

function missingImport(
  source: string,
  style: Style,
  module: string,
  names: readonly string[],
): string[] {
  const have = namedImports(source, module)
  const missing = names.filter((name) => !have.has(name))
  return missing.length === 0
    ? []
    : [`import { ${missing.join(', ')} } from ${quoted(style, module)}${style.semi}`]
}

export function planAngular(project: Project, id: string, tag: boolean): Plan {
  const label = 'Angular'
  if (tag && project.exists('src/index.html')) {
    return { label, ops: scriptTagOps(project, ['src/index.html'], id), usesPackage: false }
  }
  if (!project.exists(CONFIG)) return notFound(label, 'the application config', CONFIG, 'angular')
  const source = project.read(CONFIG) ?? ''
  const style = detectStyle(source)
  const { line, call } = initImport(source, style)
  const provider = reindent(
    [
      'provideAppInitializer(() => {',
      `  if (isPlatformBrowser(inject(PLATFORM_ID))) ${call}({ site: ${quoted(style, id)} })${style.semi}`,
      '}),',
    ].join('\n'),
    style.indent,
  )
  const imports = [
    ...missingImport(source, style, '@angular/core', [
      'PLATFORM_ID',
      'inject',
      'provideAppInitializer',
    ]),
    ...missingImport(source, style, '@angular/common', ['isPlatformBrowser']),
    line,
  ]
  const how = `In ${CONFIG}, add the imports and put the initializer first in providers:`
  const snippet = `${imports.join('\n')}\n\n${provider}`
  const major = project.major('@angular/core')
  if (major !== null && major < 19) {
    return {
      label,
      ops: [
        manual(
          CONFIG,
          `Register init({ site: '${id}' }) as an APP_INITIALIZER provider, guarded by isPlatformBrowser; ${DOCS_URL}#angular shows the Angular 19 form.`,
          '',
          `provideAppInitializer needs Angular 19 or later, and this is Angular ${major}`,
        ),
      ],
      usesPackage: true,
    }
  }
  const op = editFile(project, CONFIG, how, snippet, (text) => {
    const found = text.match(new RegExp(PROVIDERS.source, 'g')) ?? []
    if (found.length !== 1) throw new Unsafe(`providers: [ appears ${found.length} times`)
    const lines = text.split('\n')
    const at = lines.findIndex((l) => PROVIDERS.test(l))
    const current = lines[at] ?? ''
    if (!/providers:\s*\[\s*$/.test(current))
      throw new Unsafe('providers: [ is followed by code on its line')
    const next = lines[at + 1] ?? ''
    const indent =
      next.trim() && !next.trim().startsWith(']')
        ? (/^[ \t]*/.exec(next)?.[0] ?? '')
        : `${/^[ \t]*/.exec(current)?.[0] ?? ''}${style.indent}`
    lines.splice(at + 1, 0, ...provider.split('\n').map((l) => indent + l))
    return addImports(lines.join('\n'), imports)
  })
  return { label, ops: [op], usesPackage: true }
}
