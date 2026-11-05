import type { Project } from './project.ts'

const SOURCE = /\.(?:[cm]?[jt]sx?|vue|svelte|astro|html?)$/
// An import of the package, or a script tag loading the tracker (directly or through a proxy).
const TRACKER = /['"]@invisitdev\/web['"]|\/invisit\.js\b/

/** The first file that already loads the tracker, if any: a second install would count twice. */
export function existingSetup(project: Project): string | null {
  for (const file of project.walk(SOURCE)) {
    if (TRACKER.test(project.read(file) ?? '')) return file
  }
  return null
}
