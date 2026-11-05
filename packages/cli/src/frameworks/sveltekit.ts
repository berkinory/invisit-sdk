import { createFile, editFile, type Plan } from '../ops.ts'
import type { Project } from '../project.ts'
import {
  addImports,
  detectStyle,
  hasBinding,
  initImport,
  quoted,
  reindent,
  Unsafe,
} from '../source.ts'

/* SvelteKit: init() in the root layout's script, guarded by `browser` as the docs show; `browser`
   comes from $app/env on SvelteKit 3 and from $app/environment before it. The id is written inline: $env/static/public fails the build wherever the variable is unset, and the
   id is public anyway. */

const LAYOUT = 'src/routes/+layout.svelte'
const SCRIPT_OPEN = /^[ \t]*<script\b([^>]*)>[ \t]*$/
const SCRIPT_CLOSE = /^[ \t]*<\/script>[ \t]*$/

export function planSvelteKit(project: Project, id: string): Plan {
  const existing = project.read(LAYOUT)
  const style = detectStyle(existing ?? project.read('src/app.html') ?? '')
  const s = style.semi
  const envModule = (project.major('@sveltejs/kit') ?? 3) >= 3 ? '$app/env' : '$app/environment'
  const browserImport = `import { browser } from ${quoted(style, envModule)}${s}`
  const plan = (op: Plan['ops'][number]): Plan => ({
    label: 'SvelteKit',
    ops: [op],
    usesPackage: true,
  })

  if (existing === null) {
    const { line, call } = initImport('', style)
    const runes = (project.major('svelte') ?? 5) >= 5
    const lang = project.exists('tsconfig.json') ? ' lang="ts"' : ''
    const content = [
      `<script${lang}>`,
      `  ${browserImport}`,
      `  ${line}`,
      '',
      ...(runes ? [`  let { children } = $props()${s}`, ''] : []),
      `  if (browser) ${call}({ site: ${quoted(style, id)} })${s}`,
      '</script>',
      '',
      runes ? '{@render children()}' : '<slot />',
      '',
    ]
    return plan(createFile(project, LAYOUT, reindent(content.join('\n'), style.indent)))
  }

  const { line, call } = initImport(existing, style)
  const statement = `if (browser) ${call}({ site: ${quoted(style, id)} })${s}`
  return plan(
    editFile(
      project,
      LAYOUT,
      `In ${LAYOUT}, add this to the <script> block:`,
      `${browserImport}\n${line}\n\n${statement}`,
      (source) => {
        const lines = source.split('\n')
        const opens = lines.flatMap((text, i) => {
          const match = SCRIPT_OPEN.exec(text)
          return match && !/\bcontext=["']module["']|\bmodule\b/.test(match[1] ?? '') ? [i] : []
        })
        if (opens.length !== 1) {
          throw new Unsafe(
            opens.length === 0
              ? 'no <script> block has a line to itself'
              : 'it has more than one <script> block',
          )
        }
        const open = opens[0]!
        const close = lines.findIndex((text, i) => i > open && SCRIPT_CLOSE.test(text))
        if (close === -1) throw new Unsafe('the <script> block has no </script> on its own line')
        const imported =
          /import\s*\{[^}]*\bbrowser\b[^}]*\}\s*from\s*['"]\$app\/env(?:ironment)?['"]/.test(source)
        if (!imported && hasBinding(source, 'browser'))
          throw new Unsafe('it already has something named browser')
        const inner = lines.slice(open + 1, close).find((text) => text.trim() !== '')
        const indent = inner ? (/^[ \t]*/.exec(inner)?.[0] ?? '') : style.indent
        // The statement goes last in the script, so it runs after the layout's own setup.
        const gap = (lines[close - 1] ?? '').trim() === '' || close === open + 1 ? [] : ['']
        lines.splice(close, 0, ...gap, `${indent}${statement}`)
        const withStatement = lines.join('\n')
        const imports = [...(imported ? [] : [browserImport]), line].map(
          (text) => `${indent}${text}`,
        )
        return addImports(withStatement, imports, [], { from: open + 1, to: close })
      },
    ),
  )
}
