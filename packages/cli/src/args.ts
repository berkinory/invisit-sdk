export interface InitArgs {
  readonly site: string | undefined
  readonly dir: string | undefined
  readonly dryRun: boolean
  readonly install: boolean
  readonly scriptTag: boolean
  readonly yes: boolean
}

export type Command =
  | { readonly kind: 'init'; readonly args: InitArgs }
  | { readonly kind: 'help'; readonly asked: boolean }
  | { readonly kind: 'version' }
  | { readonly kind: 'invalid'; readonly message: string }

export const USAGE = `Usage: npx invisit init [options]

Installs the invisit tracker in the web project in the current directory.

Options:
  --site <id>     the site id, from app.invisit.dev, Settings, Installation
                  (or set INVISIT_SITE)
  --dir <path>    the project to install into (default: current directory)
  --dry-run       print the changes as a diff and change nothing
  --no-install    do not install @invisitdev/web
  --script-tag    add the script tag to the HTML head instead of the npm package
  --yes, -y       do not ask for confirmation
  --help, -h      show this help
  --version, -v   show the version
`

const VALUE_FLAGS = new Set(['--site', '--dir'])

export function parseArgs(argv: readonly string[]): Command {
  if (argv.includes('--help') || argv.includes('-h')) return { kind: 'help', asked: true }
  if (argv.includes('--version') || argv.includes('-v')) return { kind: 'version' }
  const [command, ...rest] = argv
  if (command === undefined) return { kind: 'help', asked: false }
  if (command !== 'init') return { kind: 'invalid', message: `unknown command "${command}"` }

  const values = new Map<string, string>()
  const flags = new Set<string>()
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i] ?? ''
    const eq = token.indexOf('=')
    const name = eq === -1 ? token : token.slice(0, eq)
    if (VALUE_FLAGS.has(name)) {
      const value = eq === -1 ? rest[++i] : token.slice(eq + 1)
      if (!value || value.startsWith('--')) {
        return { kind: 'invalid', message: `${name} needs a value` }
      }
      values.set(name, value)
    } else if (['--dry-run', '--no-install', '--script-tag', '--yes', '-y'].includes(token)) {
      flags.add(token === '-y' ? '--yes' : token)
    } else {
      return { kind: 'invalid', message: `unknown option "${token}"` }
    }
  }
  return {
    kind: 'init',
    args: {
      site: values.get('--site'),
      dir: values.get('--dir'),
      dryRun: flags.has('--dry-run'),
      install: !flags.has('--no-install'),
      scriptTag: flags.has('--script-tag'),
      yes: flags.has('--yes'),
    },
  }
}
