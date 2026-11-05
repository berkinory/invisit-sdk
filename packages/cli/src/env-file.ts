import type { FileChange } from './ops.ts'
import type { Project } from './project.ts'

/* The site id goes into the env file the framework already loads. Lines are only ever appended:
   other keys, comments and formatting stay as they were. */

const ENV_FILES = ['.env.local', '.env', '.env.development', '.env.development.local']

export type EnvResult =
  | { readonly kind: 'present'; readonly file: string; readonly value: string }
  | { readonly kind: 'write'; readonly change: FileChange }

function valueOf(source: string, key: string): string | null {
  const match = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=\\s*(.*)$`, 'm').exec(source)
  return match ? (match[1] ?? '').trim().replace(/^(['"])(.*)\1$/, '$2') : null
}

/**
 * Where the key is set already, or the append that sets it. Nuxt reads only .env, so `files`
 * lists the ones the framework loads, the preferred one first.
 */
export function planEnv(
  project: Project,
  key: string,
  id: string,
  files: readonly string[] = ['.env.local', '.env'],
): EnvResult {
  for (const file of ENV_FILES) {
    const value = valueOf(project.read(file) ?? '', key)
    if (value !== null) return { kind: 'present', file, value }
  }
  const file = files.find((name) => project.exists(name)) ?? '.env'
  const before = project.read(file)
  const line = `${key}=${id}\n`
  const after =
    before === null || before === '' ? line : `${before}${before.endsWith('\n') ? '' : '\n'}${line}`
  return { kind: 'write', change: { path: file, before, after } }
}
