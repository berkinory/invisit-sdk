import { createFile, editFile, manual, type Op, type Plan } from '../ops.ts'
import type { Project } from '../project.ts'
import {
  addImports,
  detectStyle,
  initImport,
  lineIndent,
  quoted,
  reindent,
  Unsafe,
} from '../source.ts'

/* Gatsby, Docusaurus and VitePress each have one hook that runs in the browser: a gatsby-browser
   export, a Docusaurus client module, a VitePress theme's enhanceApp. The id is written inline,
   as in the docs. */

export function planGatsby(project: Project, id: string): Plan {
  const label = 'Gatsby'
  const file = project.first(
    'gatsby-browser.tsx',
    'gatsby-browser.ts',
    'gatsby-browser.jsx',
    'gatsby-browser.js',
  )
  const style = detectStyle(
    project.read(file ?? 'gatsby-config.ts') ?? project.read('gatsby-config.js') ?? '',
  )
  const s = style.semi
  const typed = file ? /\.tsx?$/.test(file) : project.exists('tsconfig.json')
  if (!file) {
    const content = reindent(
      [
        ...(typed ? [`import type { GatsbyBrowser } from ${quoted(style, 'gatsby')}${s}`] : []),
        `import { init } from ${quoted(style, '@invisitdev/web')}${s}`,
        '',
        `export const onClientEntry${typed ? ": GatsbyBrowser['onClientEntry']" : ''} = () => {`,
        `  init({ site: ${quoted(style, id)} })${s}`,
        `}${s}`,
        '',
      ].join('\n'),
      style.indent,
    )
    return {
      label,
      ops: [createFile(project, typed ? 'gatsby-browser.ts' : 'gatsby-browser.js', content)],
      usesPackage: true,
    }
  }
  const source = project.read(file) ?? ''
  const { line, call } = initImport(source, style)
  const hook = reindent(
    [
      `export const onClientEntry = () => {`,
      `  ${call}({ site: ${quoted(style, id)} })${s}`,
      `}${s}`,
    ].join('\n'),
    style.indent,
  )
  const op = editFile(project, file, `In ${file}, add:`, `${line}\n\n${hook}`, (text) => {
    if (/\bonClientEntry\b/.test(text))
      throw new Unsafe('onClientEntry is already exported, so call init() inside it')
    return `${addImports(text, [line]).replace(/\s*$/, '')}\n\n${hook}\n`
  })
  return { label, ops: [op], usesPackage: true }
}

const DOCUSAURUS_CONFIG =
  /^[ \t]*(?:const\s+config(?:\s*:\s*Config)?\s*=|export\s+default|module\.exports\s*=)\s*\{[ \t]*$/m

export function planDocusaurus(project: Project, id: string): Plan {
  const label = 'Docusaurus'
  const config =
    project.first('docusaurus.config.ts', 'docusaurus.config.js', 'docusaurus.config.mjs') ??
    'docusaurus.config.ts'
  const style = detectStyle(project.read(config) ?? '')
  const module = config.endsWith('.ts') ? 'src/invisit.ts' : 'src/invisit.js'
  const content = `import { init } from ${quoted(style, '@invisitdev/web')}${style.semi}\n\ninit({ site: ${quoted(style, id)} })${style.semi}\n`
  const entry = `clientModules: [${quoted(style, `./${module}`)}],`
  const ops: Op[] = [
    createFile(project, module, content),
    editFile(
      project,
      config,
      `In ${config}, register the client module in the config object:`,
      entry,
      (text) => {
        if (/\bclientModules\b/.test(text))
          throw new Unsafe(`clientModules is already set, so add ./${module} to it`)
        const found = text.match(new RegExp(DOCUSAURUS_CONFIG.source, 'gm')) ?? []
        if (found.length !== 1) throw new Unsafe('the config object was not found unambiguously')
        return text.replace(
          DOCUSAURUS_CONFIG,
          (open) => `${open}\n${lineIndent(open)}${style.indent}${entry}`,
        )
      },
    ),
  ]
  return { label, ops, usesPackage: true }
}

const ENHANCE_APP = /^[ \t]*enhanceApp\s*\([^)]*\)\s*\{[ \t]*$/m

export function planVitePress(project: Project, id: string): Plan {
  const label = 'VitePress'
  const root = [
    '.vitepress',
    'docs/.vitepress',
    ...project.list('').map((dir) => `${dir}/.vitepress`),
  ].find((dir) => project.isDir(dir))
  if (!root) {
    return {
      label,
      ops: [
        manual(
          '.vitepress/theme/index.ts',
          'Create the theme as the docs show:',
          '',
          'no .vitepress directory was found',
        ),
      ],
      usesPackage: true,
    }
  }
  const theme = project.first(
    ...['index.ts', 'index.mts', 'index.js', 'index.mjs'].map((f) => `${root}/theme/${f}`),
  )
  if (!theme) {
    const style = detectStyle(
      project.read(`${root}/config.mts`) ??
        project.read(`${root}/config.ts`) ??
        project.read(`${root}/config.js`) ??
        '',
    )
    const s = style.semi
    const content = reindent(
      [
        `import DefaultTheme from ${quoted(style, 'vitepress/theme')}${s}`,
        `import { inBrowser, type Theme } from ${quoted(style, 'vitepress')}${s}`,
        `import { init } from ${quoted(style, '@invisitdev/web')}${s}`,
        '',
        'export default {',
        '  extends: DefaultTheme,',
        '  enhanceApp() {',
        `    if (inBrowser) init({ site: ${quoted(style, id)} })${s}`,
        '  },',
        `} satisfies Theme${s}`,
        '',
      ].join('\n'),
      style.indent,
    )
    return {
      label,
      ops: [createFile(project, `${root}/theme/index.ts`, content)],
      usesPackage: true,
    }
  }
  const source = project.read(theme) ?? ''
  const style = detectStyle(source)
  const { line, call } = initImport(source, style)
  const browser = /\binBrowser\b/.test(source)
    ? []
    : [`import { inBrowser } from ${quoted(style, 'vitepress')}${style.semi}`]
  const statement = `if (inBrowser) ${call}({ site: ${quoted(style, id)} })${style.semi}`
  const op = editFile(
    project,
    theme,
    `In ${theme}, add the imports and call init() first in enhanceApp:`,
    [...browser, line, '', statement].join('\n'),
    (text) => {
      const found = text.match(new RegExp(ENHANCE_APP.source, 'gm')) ?? []
      if (found.length !== 1) throw new Unsafe('enhanceApp() { was not found on a line of its own')
      const withCall = text.replace(
        ENHANCE_APP,
        (open) => `${open}\n${lineIndent(open)}${style.indent}${statement}`,
      )
      return addImports(withCall, [...browser, line])
    },
  )
  return { label, ops: [op], usesPackage: true }
}
