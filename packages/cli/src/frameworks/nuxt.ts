import { createFile, editFile, type Plan } from '../ops.ts'
import type { Project } from '../project.ts'
import { detectStyle, lineIndent, quoted, reindent, Unsafe } from '../source.ts'

/* Nuxt: a client-only plugin, and the public runtime config key it reads, which Nuxt fills from
   NUXT_PUBLIC_INVISIT_SITE. Nuxt only maps that variable onto a key nuxt.config declares. */

const DEFINE = /defineNuxtConfig\(\{/

export function planNuxt(project: Project): Plan {
  const config =
    project.first('nuxt.config.ts', 'nuxt.config.js', 'nuxt.config.mjs') ?? 'nuxt.config.ts'
  const style = detectStyle(project.read(config) ?? '')
  const s = style.semi
  // Nuxt 4 keeps the app in app/; Nuxt 3 keeps it at the root unless it opted into the new layout.
  const srcDir =
    project.exists('app/app.vue') ||
    (!project.exists('app.vue') && (project.major('nuxt') ?? 4) >= 4)
      ? 'app/'
      : ''
  const plugin = `${srcDir}plugins/invisit.client.ts`
  const pluginSource = reindent(
    [
      `import { init } from ${quoted(style, '@invisitdev/web')}${s}`,
      '',
      'export default defineNuxtPlugin(() => {',
      `  init({ site: useRuntimeConfig().public.invisitSite })${s}`,
      `})${s}`,
      '',
    ].join('\n'),
    style.indent,
  )
  const entry = `runtimeConfig: { public: { invisitSite: ${quoted(style, '')} } },`
  return {
    label: 'Nuxt',
    usesPackage: true,
    envKey: 'NUXT_PUBLIC_INVISIT_SITE',
    envFiles: ['.env'],
    ops: [
      createFile(project, plugin, pluginSource),
      editFile(
        project,
        config,
        `In ${config}, add this inside defineNuxtConfig({ … }):`,
        entry,
        (source) => {
          if (/\bruntimeConfig\b/.test(source)) {
            throw new Unsafe(
              'runtimeConfig is already set, so add invisitSite under its public key',
            )
          }
          const found = source.match(new RegExp(DEFINE.source, 'g')) ?? []
          if (found.length !== 1)
            throw new Unsafe(`defineNuxtConfig({ appears ${found.length} times`)
          const at = source.search(DEFINE) + 'defineNuxtConfig({'.length
          const rest = source.slice(at)
          const lineStart = source.lastIndexOf('\n', at - 1) + 1
          const indent = lineIndent(source.slice(lineStart)) + style.indent
          // An empty config written on one line, the way `nuxi init` sometimes leaves it.
          if (/^\s*\}\)/.test(rest)) {
            return `${source.slice(0, at)}\n${indent}${entry}\n${rest.replace(/^\s*/, '')}`
          }
          if (!/^[ \t]*\r?\n/.test(rest))
            throw new Unsafe('defineNuxtConfig({ is followed by code on its line')
          const newline = rest.indexOf('\n') + 1
          return `${source.slice(0, at)}${rest.slice(0, newline)}${indent}${entry}\n${rest.slice(newline)}`
        },
      ),
    ],
  }
}
