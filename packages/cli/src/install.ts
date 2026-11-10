import { spawn } from 'node:child_process'
import { PACKAGE } from './constants.ts'
import type { Manager, Project } from './project.ts'

export function installCommand(project: Project, manager: Manager): readonly string[] {
  // At a workspace root, pnpm and Yarn 1 refuse to add a dependency unless told it is meant.
  const root = project.exists('pnpm-workspace.yaml') || project.pkg?.workspaces !== undefined
  const flag =
    manager === 'pnpm' && root
      ? ['-w']
      : manager === 'yarn' && root && !project.exists('.yarnrc.yml')
        ? ['-W']
        : []
  return [manager, manager === 'npm' ? 'install' : 'add', PACKAGE, ...flag]
}

/** Runs the install quietly; its output is only worth showing when it fails. */
export function runInstall(
  project: Project,
  command: readonly string[],
): Promise<{ ok: boolean; output: string }> {
  const [bin = 'npm', ...args] = command
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      cwd: project.dir,
      // No stdin: a package manager that asks a question fails instead of hanging behind a spinner.
      stdio: ['ignore', 'pipe', 'pipe'],
      // npm, pnpm and yarn are .cmd shims on Windows, which only a shell can start.
      shell: process.platform === 'win32',
    })
    let output = ''
    for (const stream of [child.stdout, child.stderr]) {
      stream.setEncoding('utf8')
      stream.on('data', (chunk: string) => {
        output += chunk
      })
    }
    child.on('error', (error) => resolve({ ok: false, output: error.message }))
    child.on('close', (code) => resolve({ ok: code === 0, output }))
  })
}
