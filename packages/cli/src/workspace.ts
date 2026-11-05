import { detectFramework } from './frameworks/index.ts'
import { Project } from './project.ts'

/* A monorepo root holds several apps; the installer goes into one of them, never the root. */

export interface App {
  readonly dir: string
  readonly framework: string
}

function patterns(project: Project): string[] {
  const declared = project.pkg?.workspaces
  const fromPackage: readonly string[] =
    declared === undefined
      ? []
      : 'packages' in declared
        ? (declared.packages ?? [])
        : (declared as readonly string[])
  const yaml = project.read('pnpm-workspace.yaml') ?? ''
  const block = /^packages:\s*\n((?:[ \t]+-.*\n?|[ \t]*#.*\n?|\s*\n)*)/m.exec(yaml)?.[1] ?? ''
  const fromPnpm = [...block.matchAll(/^[ \t]+-[ \t]*['"]?([^'"\n#]+?)['"]?[ \t]*$/gm)].map(
    (m) => m[1] ?? '',
  )
  return [...fromPackage, ...fromPnpm].filter((p) => p && !p.startsWith('!'))
}

function expand(project: Project, pattern: string): string[] {
  const parts = pattern.replace(/\/+$/, '').split('/')
  let dirs = ['']
  for (const part of parts) {
    const join = (dir: string, name: string) => (dir ? `${dir}/${name}` : name)
    if (part === '**') {
      // Workspaces nest two levels at most in practice; deeper globs still find those.
      dirs = dirs.flatMap((dir) => [
        dir,
        ...project
          .list(dir)
          .flatMap((a) => [
            join(dir, a),
            ...project.list(join(dir, a)).map((b) => join(join(dir, a), b)),
          ]),
      ])
    } else if (part.includes('*')) {
      const match = new RegExp(
        `^${part.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`,
      )
      dirs = dirs.flatMap((dir) =>
        project
          .list(dir)
          .filter((name) => match.test(name))
          .map((name) => join(dir, name)),
      )
    } else {
      dirs = dirs.map((dir) => join(dir, part))
    }
    dirs = dirs.filter(
      (dir) => !dir.split('/').some((name) => name === 'node_modules') && project.isDir(dir),
    )
  }
  return dirs
}

/** The web apps of a workspace root, or null when the directory is not one. */
export function workspaceApps(project: Project): App[] | null {
  const globs = patterns(project)
  if (globs.length === 0) return null
  const dirs = [...new Set(globs.flatMap((glob) => expand(project, glob)))].sort()
  return dirs.flatMap((dir) => {
    const framework = detectFramework(new Project(project.path(dir)))
    return framework ? [{ dir, framework: framework.name }] : []
  })
}
