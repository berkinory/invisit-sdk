import { editFile, manual, type Plan } from '../ops.ts'
import type { Project } from '../project.ts'
import { detectStyle, insertAtAnchor, quoted, reindent } from '../source.ts'
import { scriptTagOps } from './html.ts'

/* Astro: a <script> in the base layout, which Astro bundles and runs in the browser. It goes at
   the end of <head>, so it is on every page that layout renders. */

const HEAD_END = /<\/head>/i

/** The one layout (or, in a layout-less project, the one page) that writes the document head. */
function astroDocument(project: Project): string[] {
  const withHead = (dir: string) =>
    [...project.walk(/\.astro$/, dir, 4)].filter((file) => HEAD_END.test(project.read(file) ?? ''))
  const layouts = withHead('src/layouts')
  return layouts.length > 0 ? layouts : withHead('src/pages')
}

export function planAstro(project: Project, id: string, tag: boolean): Plan {
  const documents = astroDocument(project)
  const label = 'Astro'
  if (tag && documents.length > 0) {
    return { label, ops: scriptTagOps(project, documents, id), usesPackage: false }
  }
  const file = documents.length === 1 ? documents[0]! : 'src/layouts/Layout.astro'
  const style = detectStyle(project.read(file) ?? '')
  const script = reindent(
    [
      '<script>',
      `  import { init } from ${quoted(style, '@invisitdev/web')}${style.semi}`,
      `  init({ site: import.meta.env.PUBLIC_INVISIT_SITE })${style.semi}`,
      '</script>',
    ].join('\n'),
    style.indent,
  )
  const how = `In ${file}, paste this right before </head>:`
  const op =
    documents.length === 1
      ? editFile(project, file, how, script, (source) =>
          insertAtAnchor(source, HEAD_END, '</head>', script, 'before', style.indent),
        )
      : manual(
          file,
          'Paste this before </head> in the layout every page uses:',
          script,
          documents.length === 0
            ? 'no layout with a </head> was found'
            : `${documents.length} layouts write a </head> (${documents.join(', ')}), so the base one is unclear`,
        )
  return { label, ops: [op], usesPackage: true, envKey: 'PUBLIC_INVISIT_SITE' }
}
