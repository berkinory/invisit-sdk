import { APP_URL } from './constants.ts'
import type { FileChange, Step } from './ops.ts'
import { badge, bold, cyan, dim, green, live, red, yellow } from './ui.ts'

export function say(text = ''): void {
  process.stdout.write(`${text}\n`)
}

const marked = (mark: string, text: string) => say(live ? `${mark} ${text}` : text)

export const done = (text: string) => marked(green('✔'), text)
export const warn = (text: string) => marked(yellow('!'), text)
export const fail = (text: string) => marked(red('✖'), text)

/** One finished action, as `created    app/analytics.tsx`. */
export function status(verb: string, detail: string, mark = green('✔')): void {
  marked(mark, `${dim(verb.padEnd(11))}${detail}`)
}

export const skipped = (detail: string) => status('skipped', detail, yellow('–'))

export function printHeader(label: string, where: string): void {
  if (!live) {
    say(`invisit: ${label} ${where}`)
    return
  }
  say()
  say(`${badge(' invisit ')} ${bold(label)} ${dim(where)}`)
  say()
}

/** What a confirmation is about to do. */
export function printPlan(install: string | null, changes: readonly FileChange[]): void {
  const row = (verb: string, detail: string) => say(`  ${cyan(verb.padEnd(8))}${detail}`)
  if (install) row('run', install)
  for (const change of changes) row(change.before === null ? 'create' : 'update', change.path)
  say()
}

function paintDiffLine(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---')) return bold(line)
  if (line.startsWith('@@')) return cyan(line)
  if (line.startsWith('+')) return green(line)
  if (line.startsWith('-')) return red(line)
  return line === '' ? line : dim(line)
}

export function printDiff(diff: string): void {
  process.stdout.write(`\n${diff.split('\n').map(paintDiffLine).join('\n')}`)
}

export function printUsage(usage: string): void {
  process.stdout.write(
    usage
      .replace(/^(Usage:|Options:)/gm, (heading) => bold(heading))
      .replace(/^ {2}(--\S+(?: <\w+>|, -\w)?)/gm, (_, flag: string) => `  ${cyan(flag)}`),
  )
}

function indented(text: string): string {
  return text
    .replace(/\n$/, '')
    .split('\n')
    .map((line) => (line ? `     ${line}` : ''))
    .join('\n')
}

/** The steps a person does by hand when an edit could not be placed safely. */
export function printSteps(
  steps: readonly Step[],
  install: string | null,
  env: string | null,
): void {
  const all: string[] = []
  if (install) all.push(`Install the package: ${install}`)
  for (const step of steps)
    all.push(step.snippet ? `${step.how}\n\n${cyan(indented(step.snippet))}\n` : step.how)
  if (env) all.push(env)
  all.forEach((text, i) => say(`${bold(`${i + 1}.`)} ${text}`))
}

export function printFinish(id: string, envKey: string | undefined, scriptTag: boolean): void {
  const rows: readonly (readonly [string, string])[] = [
    ...(envKey
      ? [['Production', `set ${envKey}=${id} wherever the site is built or deployed.`] as const]
      : []),
    [
      'Verify',
      `run the site and open a page, then open Realtime for this site at ${APP_URL}. The visit shows up within seconds.`,
    ],
    ['Debug', 'to test without counting, start a debug session from Settings → Debug.'],
    [
      'Automation',
      scriptTag
        ? 'a browser driven by automation is only counted when the tag has data-debug="true".'
        : 'a browser driven by automation is only counted when init() gets debug: true.',
    ],
  ]
  say()
  if (live) say(bold('Next steps'))
  for (const [label, text] of rows)
    say(live ? `  ${cyan(label.padEnd(12))}${text}` : `${label}: ${text}`)
}
