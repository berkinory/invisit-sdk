import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'

export interface PackageJson {
  readonly name?: string
  readonly packageManager?: string
  readonly workspaces?: readonly string[] | { readonly packages?: readonly string[] }
  readonly dependencies?: Readonly<Record<string, string>>
  readonly devDependencies?: Readonly<Record<string, string>>
}

export type Manager = 'bun' | 'pnpm' | 'yarn' | 'npm'

// Build output, caches and installs: never source, never ours to edit.
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', 'vendor', 'cache'])
// Dot directories are tooling, except these, which hold a framework's own source.
const SOURCE_DOT_DIRS = new Set(['.vitepress'])
const WALK_LIMIT = 5000

/** A read-only view of one project directory, with paths relative to it in '/' form. */
export class Project {
  readonly dir: string
  readonly pkg: PackageJson | null
  readonly deps: Readonly<Record<string, string>>

  constructor(dir: string) {
    this.dir = dir
    this.pkg = readJson(join(dir, 'package.json'))
    this.deps = { ...this.pkg?.devDependencies, ...this.pkg?.dependencies }
  }

  has(dep: string): boolean {
    return dep in this.deps
  }

  /** The major version a dependency range asks for, when the range says. */
  major(dep: string): number | null {
    const match = /(\d+)/.exec(this.deps[dep] ?? '')
    return match ? Number(match[1]) : null
  }

  path(rel: string): string {
    return join(this.dir, rel)
  }

  exists(rel: string): boolean {
    return existsSync(this.path(rel))
  }

  isDir(rel: string): boolean {
    try {
      return statSync(this.path(rel)).isDirectory()
    } catch {
      return false
    }
  }

  read(rel: string): string | null {
    try {
      return readFileSync(this.path(rel), 'utf8')
    } catch {
      return null
    }
  }

  first(...rels: readonly string[]): string | undefined {
    return rels.find((rel) => this.exists(rel))
  }

  list(rel: string): string[] {
    try {
      return readdirSync(this.path(rel)).sort()
    } catch {
      return []
    }
  }

  /** Source files under the project, skipping dot directories, installs and build output. */
  *walk(pattern: RegExp, from = '', depth = 8): Generator<string> {
    let seen = 0
    const visit = function* (this: Project, rel: string, left: number): Generator<string> {
      for (const name of this.list(rel)) {
        if (seen >= WALK_LIMIT) return
        const child = rel ? `${rel}/${name}` : name
        if (this.isDir(child)) {
          if (
            left > 0 &&
            (!name.startsWith('.') || SOURCE_DOT_DIRS.has(name)) &&
            !SKIP_DIRS.has(name)
          ) {
            yield* visit.call(this, child, left - 1)
          }
        } else if (pattern.test(name)) {
          seen++
          yield child
        }
      }
    }
    yield* visit.call(this, from, depth)
  }

  rel(absolute: string): string {
    return relative(this.dir, absolute).split(sep).join('/')
  }
}

function readJson(path: string): PackageJson | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as PackageJson
  } catch {
    return null
  }
}

const LOCKFILES: readonly (readonly [string, Manager])[] = [
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['package-lock.json', 'npm'],
]

/** The package manager the project uses: its lockfile or packageManager field, up to the repo root. */
export function detectManager(dir: string): Manager {
  for (let at = dir; ; at = dirname(at)) {
    for (const [file, manager] of LOCKFILES) if (existsSync(join(at, file))) return manager
    const declared = readJson(join(at, 'package.json'))?.packageManager?.split('@')[0]
    if (declared === 'bun' || declared === 'pnpm' || declared === 'yarn' || declared === 'npm') {
      return declared
    }
    if (existsSync(join(at, '.git')) || dirname(at) === at) return 'npm'
  }
}
