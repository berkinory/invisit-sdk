import { createFile, editFile, notFound, type Op, type Plan } from '../ops.ts'
import type { Project } from '../project.ts'
import {
  addImports,
  detectStyle,
  hasBinding,
  insertAtAnchor,
  quoted,
  reindent,
  Unsafe,
  type Style,
} from '../source.ts'
import { envKey, siteEnv, siteInline, siteValue, type SiteSource } from './site.ts'

/* React frameworks: a small component that calls init() in an effect, rendered once by the root
   layout. The component file is new; the layout only gains an import and one element. */

const CHILDREN = /\{children\}(?=[ \t]*<|[ \t]*\)|[ \t]*$)/m
const SCRIPTS = /<Scripts\b[^>]*\/>/

interface Component {
  readonly file: string
  readonly name: string
  readonly specifier: string
  readonly content: string
}

/** The component, named and placed so it collides with nothing already in the project. */
function component(
  project: Project,
  next: string,
  dir: string,
  specifierBase: string,
  site: SiteSource,
  client: boolean,
): Component {
  const source = project.read(next) ?? ''
  const style = detectStyle(source)
  const ext = /\.(jsx|js)$/.exec(next)?.[0] ?? '.tsx'
  const base = project.exists(`${dir}/analytics${ext}`) ? 'invisit-analytics' : 'analytics'
  const name = hasBinding(source, 'Analytics') ? 'InvisitAnalytics' : 'Analytics'
  const typed = ext === '.tsx' && site.kind === 'env' && site.expression.startsWith('process.env')
  return {
    file: `${dir}/${base}${ext}`,
    name,
    specifier: `${specifierBase}${base}`,
    content: componentSource(style, name, `${siteValue(site, style)}${typed ? '!' : ''}`, client),
  }
}

function componentSource(style: Style, name: string, site: string, client: boolean): string {
  const s = style.semi
  const lines = [
    ...(client ? [`${quoted(style, 'use client')}${s}`] : []),
    `import { useEffect } from ${quoted(style, 'react')}${s}`,
    `import { init } from ${quoted(style, '@invisitdev/web')}${s}`,
    '',
    `export function ${name}() {`,
    '  useEffect(() => {',
    `    init({ site: ${site} })${s}`,
    `  }, [])${s}`,
    `  return null${s}`,
    '}',
    '',
  ]
  return reindent(lines.join('\n'), style.indent)
}

/** Creates the component and renders it next to an anchor in the layout. */
function renderBeside(
  project: Project,
  label: string,
  layout: string,
  made: Component,
  anchor: RegExp,
  anchorLabel: string,
  where: 'before' | 'after',
  site: SiteSource,
): Plan {
  const style = detectStyle(project.read(layout) ?? '')
  const importLine = `import { ${made.name} } from ${quoted(style, made.specifier)}${style.semi}`
  const element = `<${made.name} />`
  const ops: Op[] = [
    createFile(project, made.file, made.content),
    editFile(
      project,
      layout,
      `In ${layout}, import the component and render it ${where} ${anchorLabel}:`,
      `${importLine}\n\n${element}`,
      (source) =>
        addImports(insertAtAnchor(source, anchor, anchorLabel, element, where), [importLine]),
    ),
  ]
  return { label, ops, usesPackage: true, ...withEnv(site) }
}

function withEnv(site: SiteSource): { envKey?: string } {
  const key = envKey(site)
  return key ? { envKey: key } : {}
}

const exts = (base: string, list: readonly string[]): string[] => list.map((ext) => `${base}${ext}`)

export function planNext(project: Project): Plan {
  const site = siteEnv('NEXT_PUBLIC_INVISIT_SITE', 'process.env.NEXT_PUBLIC_INVISIT_SITE')
  const layout = project.first(
    ...exts('app/layout', ['.tsx', '.jsx', '.js']),
    ...exts('src/app/layout', ['.tsx', '.jsx', '.js']),
  )
  if (layout) {
    const dir = layout.slice(0, layout.lastIndexOf('/'))
    const made = component(project, layout, dir, './', site, true)
    return renderBeside(
      project,
      'Next.js (App Router)',
      layout,
      made,
      CHILDREN,
      '{children}',
      'after',
      site,
    )
  }
  const pages = project.isDir('src/pages') ? 'src/pages' : project.isDir('pages') ? 'pages' : null
  if (pages) return planPagesRouter(project, pages, site)
  return notFound('Next.js', 'the root layout', 'app/layout.tsx', 'nextjs')
}

const APP_COMPONENT = /<Component\s+\{\.\.\.pageProps\}\s*\/>/

function planPagesRouter(project: Project, pages: string, site: SiteSource): Plan {
  const label = 'Next.js (Pages Router)'
  const components = pages === 'src/pages' ? 'src/components' : 'components'
  const app = project.first(...exts(`${pages}/_app`, ['.tsx', '.jsx', '.js']))
  const typed = !app ? project.exists('tsconfig.json') : app.endsWith('.tsx')
  const anchorFile = app ?? `${pages}/_app${typed ? '.tsx' : '.jsx'}`
  const made = component(project, anchorFile, components, '../components/', site, false)
  const style = detectStyle(project.read(anchorFile) ?? '')
  const s = style.semi
  const importLine = `import { ${made.name} } from ${quoted(style, made.specifier)}${s}`
  const ops: Op[] = [createFile(project, made.file, made.content)]
  if (app) {
    ops.push(
      editFile(
        project,
        app,
        `In ${app}, import the component and render it beside <Component {...pageProps} />:`,
        `${importLine}\n\n<><Component {...pageProps} /><${made.name} /></>`,
        (source) => {
          const found = source.match(new RegExp(APP_COMPONENT.source, 'g')) ?? []
          if (found.length !== 1) {
            throw new Unsafe(`<Component {...pageProps} /> appears ${found.length} times`)
          }
          const wrapped = source.replace(APP_COMPONENT, (m) => `<>${m}<${made.name} /></>`)
          return addImports(wrapped, [importLine])
        },
      ),
    )
  } else {
    const lines = [
      ...(typed ? [`import type { AppProps } from ${quoted(style, 'next/app')}${s}`] : []),
      importLine,
      '',
      `export default function App({ Component, pageProps }${typed ? ': AppProps' : ''}) {`,
      '  return (',
      '    <>',
      '      <Component {...pageProps} />',
      `      <${made.name} />`,
      '    </>',
      `  )${s}`,
      '}',
      '',
    ]
    ops.push(createFile(project, anchorFile, reindent(lines.join('\n'), style.indent)))
  }
  return { label, ops, usesPackage: true, ...withEnv(site) }
}

export function planTanStackStart(project: Project): Plan {
  const root = project.first('src/routes/__root.tsx', 'app/routes/__root.tsx')
  if (!root) {
    return notFound('TanStack Start', 'the root route', 'src/routes/__root.tsx', 'tanstack-start')
  }
  const base = root.split('/')[0] ?? 'src'
  const site = siteEnv('VITE_INVISIT_SITE', 'import.meta.env.VITE_INVISIT_SITE')
  const made = component(project, root, `${base}/components`, '../components/', site, false)
  return renderBeside(project, 'TanStack Start', root, made, SCRIPTS, '<Scripts />', 'before', site)
}

export function planReactRouter(project: Project, id: string): Plan {
  const label = project.has('@react-router/dev') ? 'React Router' : 'Remix'
  const root = project.first(...exts('app/root', ['.tsx', '.jsx', '.js']))
  if (!root) return notFound(label, 'the root route', 'app/root.tsx', 'react-router-and-remix')
  const vite = project.first(...exts('vite.config', ['.ts', '.js', '.mts', '.mjs']))
  // The classic Remix compiler has no import.meta.env, so the public id goes in as it is.
  const site = vite
    ? siteEnv('VITE_INVISIT_SITE', 'import.meta.env.VITE_INVISIT_SITE')
    : siteInline(id)
  const made = component(project, root, 'app', './', site, false)
  return renderBeside(project, label, root, made, SCRIPTS, '<Scripts />', 'before', site)
}

export function planWaku(project: Project): Plan {
  const layout = project.first('src/pages/_layout.tsx', 'src/pages/_layout.jsx')
  if (!layout) return notFound('Waku', 'the root layout', 'src/pages/_layout.tsx', 'waku')
  const site = siteEnv('WAKU_PUBLIC_INVISIT_SITE', 'import.meta.env.WAKU_PUBLIC_INVISIT_SITE')
  const made = component(project, layout, 'src/components', '../components/', site, true)
  return renderBeside(project, 'Waku', layout, made, CHILDREN, '{children}', 'after', site)
}
