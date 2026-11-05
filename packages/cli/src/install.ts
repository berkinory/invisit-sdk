import { spawnSync } from 'node:child_process'
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
): { ok: boolean; output: string } {
  const [bin = 'npm', ...args] = command
  const result = spawnSync(bin, args, {
    cwd: project.dir,
    encoding: 'utf8',
    // npm, pnpm and yarn are .cmd shims on Windows, which only a shell can start.
    shell: process.platform === 'win32',
  })
  if (result.error) return { ok: false, output: result.error.message }
  return { ok: result.status === 0, output: `${result.stdout}${result.stderr}` }
}
