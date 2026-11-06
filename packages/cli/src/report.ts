import { APP_URL } from './constants.ts'
import type { Step } from './ops.ts'

export function say(text = ''): void {
  process.stdout.write(`${text}\n`)
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
    all.push(step.snippet ? `${step.how}\n\n${indented(step.snippet)}\n` : step.how)
  if (env) all.push(env)
  all.forEach((text, i) => say(`${i + 1}. ${text}`))
}

export function printFinish(id: string, envKey: string | undefined, scriptTag: boolean): void {
  say()
  if (envKey) say(`Production: set ${envKey}=${id} wherever the site is built or deployed.`)
  say(
    `Verify: run the site and open a page, then open Realtime for this site at ${APP_URL}. The visit shows up within seconds.`,
  )
  say('To test without counting, start a debug session from Settings → Debug.')
  say(
    scriptTag
      ? 'A browser driven by automation is only counted when the tag has data-debug="true".'
      : 'A browser driven by automation is only counted when init() gets debug: true.',
  )
}
