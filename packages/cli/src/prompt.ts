import { createInterface, type Interface } from 'node:readline'
import { bold, cyan, dim } from './ui.ts'

// Prompts only where a person can answer; agents and CI get a message and exit code instead.
export const interactive: boolean = Boolean(process.stdin.isTTY && process.stdout.isTTY)

/* One reader for the whole run, with a queue, so lines typed (or pasted) ahead of a question are
   kept for it rather than dropped between prompts. */
let reader: Interface | null = null
const lines: string[] = []
const waiting: ((line: string | null) => void)[] = []
let ended = false

function open(): Interface {
  if (reader) return reader
  reader = createInterface({ input: process.stdin, output: process.stdout })
  reader.on('line', (line) => {
    const next = waiting.shift()
    if (next) next(line)
    else lines.push(line)
  })
  reader.on('close', () => {
    ended = true
    for (const next of waiting.splice(0)) next(null)
  })
  return reader
}

/** The answer, or null when input ended (Ctrl+D, Ctrl+C), which callers treat as cancel. */
export function ask(question: string): Promise<string | null> {
  const rl = open()
  rl.setPrompt(question)
  rl.prompt()
  const queued = lines.shift()
  if (queued !== undefined) {
    process.stdout.write('\n')
    return Promise.resolve(queued.trim())
  }
  if (ended) return Promise.resolve(null)
  return new Promise((resolve) => waiting.push((line) => resolve(line?.trim() ?? null)))
}

export function closePrompts(): void {
  reader?.close()
  reader = null
}

export async function confirm(question: string): Promise<boolean> {
  const answer = (await ask(`${cyan('?')} ${bold(question)} ${dim('[Y/n]')} `))?.toLowerCase()
  return answer === '' || answer === 'y' || answer === 'yes'
}

/** The index picked, or -1 when no valid choice was made. */
export async function choose(question: string, options: readonly string[]): Promise<number> {
  process.stdout.write(`${cyan('?')} ${bold(question)}\n`)
  options.forEach((option, i) => process.stdout.write(`  ${cyan(`${i + 1})`)} ${option}\n`))
  for (let attempt = 0; attempt < 3; attempt++) {
    const answer = await ask(`${dim('Number:')} `)
    if (answer === null) return -1
    const n = Number(answer)
    if (Number.isInteger(n) && n >= 1 && n <= options.length) return n - 1
  }
  return -1
}
