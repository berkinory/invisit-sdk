import { editFile, notFound, type Plan } from '../ops.ts'
import type { Project } from '../project.ts'
import { addImports, detectStyle, initImport, Unsafe } from '../source.ts'
import { siteEnv, siteInline, siteValue, type SiteSource } from './site.ts'

/* Single-page apps start in one entry module: init() goes right after its imports, before the
   first render. */

const ENTRIES = [
  'src/main.tsx',
  'src/main.ts',
  'src/main.jsx',
  'src/main.js',
  'src/index.tsx',
  'src/index.ts',
  'src/index.jsx',
  'src/index.js',
]
const MODULE_SCRIPT = /<script\b[^>]*\bsrc=["']\/?([^"']+)["'][^>]*>/gi

/** The entry index.html loads as a module, or the conventional src/main file. */
function viteEntry(project: Project): string | undefined {
  const html = project.read('index.html')
  if (html) {
    for (const match of html.matchAll(MODULE_SCRIPT)) {
      const src = match[1] ?? ''
      if (/\btype=["']module["']/.test(match[0]) && !/^https?:/.test(src) && project.exists(src)) {
        return src
      }
    }
  }
  return project.first(...ENTRIES)
}

/** Adds the import and the init() call to the top of an entry module. */
function initInEntry(project: Project, label: string, entry: string, site: SiteSource): Plan {
  const style = detectStyle(project.read(entry) ?? '')
  const { line, call } = initImport(project.read(entry) ?? '', style)
  const statement = `${call}({ site: ${siteValue(site, style)} })${style.semi}`
  const op = editFile(
    project,
    entry,
    `In ${entry}, add this after the imports, before the app renders:`,
    `${line}\n\n${statement}`,
    (source) => {
      if (!/^\S/m.test(source)) throw new Unsafe('the file is empty')
      return addImports(source, [line], [statement])
    },
  )
  return {
    label,
    ops: [op],
    usesPackage: true,
    ...(site.kind === 'env' ? { envKey: site.key } : {}),
  }
}

export function planVite(project: Project): Plan {
  const entry = viteEntry(project)
  if (!entry) return notFound('Vite', 'the entry module', 'src/main.ts', 'vite')
  return initInEntry(
    project,
    'Vite',
    entry,
    siteEnv('VITE_INVISIT_SITE', 'import.meta.env.VITE_INVISIT_SITE'),
  )
}

export function planSolidStart(project: Project, id: string): Plan {
  const entry = project.first('src/entry-client.tsx', 'src/entry-client.jsx')
  if (!entry)
    return notFound('SolidStart', 'the client entry', 'src/entry-client.tsx', 'solidstart')
  return initInEntry(project, 'SolidStart', entry, siteInline(id))
}
