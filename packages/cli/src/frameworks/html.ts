import { COLLECTOR_URL } from '../constants.ts'
import { editFile, manual, type Op, type Plan } from '../ops.ts'
import type { Project } from '../project.ts'
import { detectStyle, insertAtAnchor } from '../source.ts'

/* The script tag: no package and no build step. It goes last in <head>, where it loads async. */

const HEAD_END = /<\/head>/i

export function scriptTag(id: string): string {
  return `<script async src="${COLLECTOR_URL}/invisit.js" data-site="${id}" data-collector="${COLLECTOR_URL}"></script>`
}

/** Puts the tag before </head> in each file given. */
export function scriptTagOps(project: Project, files: readonly string[], id: string): Op[] {
  const tag = scriptTag(id)
  return files.map((file) => {
    const indent = detectStyle(project.read(file) ?? '').indent
    return editFile(project, file, `In ${file}, paste this right before </head>:`, tag, (source) =>
      insertAtAnchor(source, HEAD_END, '</head>', tag, 'before', indent),
    )
  })
}

export function scriptTagPlan(
  label: string,
  project: Project,
  files: readonly string[],
  id: string,
): Plan {
  if (files.length === 0) {
    return {
      label,
      ops: [
        manual(
          'the root layout',
          'Paste this into the <head> every page shares:',
          scriptTag(id),
          'no HTML file with a <head> was found',
        ),
      ],
      usesPackage: false,
    }
  }
  return { label, ops: scriptTagOps(project, files, id), usesPackage: false }
}

/** Plain HTML pages: every .html file with a </head>, since each one is its own page. */
export function htmlPages(project: Project): string[] {
  const pages: string[] = []
  for (const file of project.walk(/\.html?$/i)) {
    if (HEAD_END.test(project.read(file) ?? '')) pages.push(file)
  }
  return pages
}
