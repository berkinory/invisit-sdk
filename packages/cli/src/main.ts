import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { parseArgs, USAGE, type InitArgs } from './args.ts'
import { DOCS_URL, PACKAGE } from './constants.ts'
import { unifiedDiff } from './diff.ts'
import { planEnv } from './env-file.ts'
import { detectFramework, planFor, type Framework } from './frameworks/index.ts'
import { scriptTag } from './frameworks/html.ts'
import { installCommand, runInstall } from './install.ts'
import type { FileChange } from './ops.ts'
import { detectManager, Project } from './project.ts'
import { choose, closePrompts, confirm, interactive } from './prompt.ts'
import { printFinish, printSteps, say } from './report.ts'
import { existingSetup } from './setup-check.ts'
import { resolveSiteId } from './site-id.ts'
import { workspaceApps } from './workspace.ts'

declare const VERSION: string

/** Exit codes: 0 done or nothing to do, 1 needs input, 2 failed. */
const DONE = 0
const NEEDS_INPUT = 1
const FAILED = 2

const shown = (dir: string) => relative(process.cwd(), dir) || '.'

/** The app to install into: the directory itself, or one app of the workspace it is the root of. */
async function pickProject(
  dir: string,
): Promise<{ project: Project; framework: Framework | null } | number> {
  const project = new Project(dir)
  const framework = detectFramework(project)
  if (framework) return { project, framework }
  const apps = workspaceApps(project)
  if (apps === null) return { project, framework: null }
  if (apps.length === 0) {
    say(
      `${shown(dir)} is a workspace root with no web app this installer knows. Pass --dir <app directory>.`,
    )
    return NEEDS_INPUT
  }
  let index = 0
  if (apps.length > 1) {
    const list = apps.map((app) => `${app.dir} (${app.framework})`)
    if (!interactive) {
      say(`${shown(dir)} is a workspace root with several web apps:`)
      for (const line of list) say(`  ${line}`)
      say(`Run again with --dir <app directory>, for example --dir ${apps[0]?.dir ?? ''}`)
      return NEEDS_INPUT
    }
    index = await choose('Which app should get invisit?', list)
    if (index === -1) return NEEDS_INPUT
  }
  const app = apps[index]!
  say(`Using ${app.dir} (${app.framework}), the web app of this workspace.`)
  const appProject = new Project(resolve(dir, app.dir))
  return { project: appProject, framework: detectFramework(appProject) }
}

function write(project: Project, changes: readonly FileChange[]): void {
  for (const change of changes) {
    const path = project.path(change.path)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, change.after)
  }
}

async function init(args: InitArgs): Promise<number> {
  const dir = resolve(args.dir ?? '.')
  if (!new Project(dir).isDir('')) {
    say(`${dir} is not a directory.`)
    return NEEDS_INPUT
  }
  const picked = await pickProject(dir)
  if (typeof picked === 'number') return picked
  const { project, framework } = picked

  const existing = existingSetup(project)
  if (existing) {
    say(
      `invisit is already set up in ${shown(project.dir)}: ${existing} loads the tracker. Nothing changed.`,
    )
    return DONE
  }

  const site = await resolveSiteId(args.site)
  if ('error' in site) {
    say(site.error)
    return NEEDS_INPUT
  }
  const id = site.id

  const plan = planFor(project, framework, id, args.scriptTag)
  if (!plan) {
    say(
      project.pkg
        ? `No framework this installer knows was found in ${shown(project.dir)}/package.json, and there is no HTML page to put the script tag in.`
        : `No web project was found in ${shown(project.dir)}: no package.json and no HTML page.`,
    )
    say(`Pass --dir <project directory>, or follow ${DOCS_URL}. The script tag works anywhere:`)
    say(`  ${scriptTag(id)}`)
    return NEEDS_INPUT
  }

  const manager = detectManager(project.dir)
  const installArgs =
    plan.usesPackage && !project.has(PACKAGE) ? installCommand(project, manager) : null
  const install = installArgs?.join(' ') ?? null
  const env = plan.envKey ? planEnv(project, plan.envKey, id, plan.envFiles) : null
  say(`invisit: ${plan.label} in ${shown(project.dir)}${plan.usesPackage ? ` (${manager})` : ''}`)
  if (env?.kind === 'present' && env.value !== id) {
    say(
      `Note: ${env.file} already sets ${plan.envKey}=${env.value}, which is kept; the id passed was ${id}.`,
    )
  }

  const blocked = plan.ops.filter((op) => op.step.blocked)
  if (blocked.length > 0) {
    for (const op of blocked) say(`Could not edit safely: ${op.step.blocked}.`)
    say('Nothing was changed. The steps, to do by hand:')
    say()
    printSteps(
      plan.ops.map((op) => op.step),
      install,
      env?.kind === 'write' ? `Add this line to ${env.change.path}: ${plan.envKey}=${id}` : null,
    )
    printFinish(id, plan.envKey, !plan.usesPackage)
    return DONE
  }

  const changes = [
    ...plan.ops.flatMap((op) => (op.change ? [op.change] : [])),
    ...(env?.kind === 'write' ? [env.change] : []),
  ]
  const doInstall = installArgs !== null && args.install
  if (args.dryRun) {
    if (doInstall) say(`Would run: ${install}`)
    for (const change of changes)
      process.stdout.write(`\n${unifiedDiff(change.path, change.before, change.after)}`)
    say()
    say('Dry run: nothing was changed.')
    return DONE
  }
  if (interactive && !args.yes) {
    if (doInstall) say(`Will run: ${install}`)
    for (const change of changes)
      say(`Will ${change.before === null ? 'create' : 'update'} ${change.path}`)
    if (!(await confirm('Go ahead?'))) {
      say('Nothing was changed.')
      return NEEDS_INPUT
    }
  }

  if (doInstall) {
    const result = runInstall(project, installArgs)
    if (!result.ok) {
      say(`Failed: ${install}`)
      say(result.output.trim().split('\n').slice(-20).join('\n'))
      say('Nothing else was changed.')
      return FAILED
    }
    say(`installed  ${PACKAGE} (${install})`)
  } else if (install) {
    say(`skipped    ${install} (--no-install); the code needs ${PACKAGE}`)
  }
  write(project, changes)
  for (const change of changes)
    say(`${change.before === null ? 'created' : 'updated'}    ${change.path}`)
  if (env?.kind === 'present') say(`kept       ${env.file} (${plan.envKey} is already set)`)
  printFinish(id, plan.envKey, !plan.usesPackage)
  return DONE
}

async function main(argv: readonly string[]): Promise<number> {
  const command = parseArgs(argv)
  switch (command.kind) {
    case 'help':
      process.stdout.write(USAGE)
      return command.asked ? DONE : NEEDS_INPUT
    case 'version':
      say(VERSION)
      return DONE
    case 'invalid':
      say(`invisit: ${command.message}`)
      process.stdout.write(`\n${USAGE}`)
      return NEEDS_INPUT
    case 'init':
      return init(command.args)
  }
}

// A reader that stops early (`| head`) must not stop an install halfway through its writes.
process.stdout.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code !== 'EPIPE') throw error
})

main(process.argv.slice(2))
  .then(
    (code) => {
      process.exitCode = code
    },
    (error: unknown) => {
      process.stderr.write(
        `invisit: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
      )
      process.exitCode = FAILED
    },
  )
  .finally(closePrompts)
