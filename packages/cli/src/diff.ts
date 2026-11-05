/* A unified diff for --dry-run. The edits only insert a few lines, so the common head and tail
   are trimmed first and the line LCS runs on the small middle that is left. */

type Line = { readonly kind: ' ' | '-' | '+'; readonly text: string }

const CONTEXT = 3

function lineDiff(a: readonly string[], b: readonly string[]): Line[] {
  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head++
  let tail = 0
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  )
    tail++
  const x = a.slice(head, a.length - tail)
  const y = b.slice(head, b.length - tail)
  // lcs[i][j]: the longest common subsequence of x[i..] and y[j..].
  const lcs = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0))
  for (let i = x.length - 1; i >= 0; i--) {
    for (let j = y.length - 1; j >= 0; j--) {
      lcs[i]![j] =
        x[i] === y[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
    }
  }
  const middle: Line[] = []
  let i = 0
  let j = 0
  while (i < x.length || j < y.length) {
    if (i < x.length && j < y.length && x[i] === y[j]) {
      middle.push({ kind: ' ', text: x[i++]! })
      j++
    } else if (i < x.length && (j === y.length || lcs[i + 1]![j]! >= lcs[i]![j + 1]!)) {
      middle.push({ kind: '-', text: x[i++]! })
    } else {
      middle.push({ kind: '+', text: y[j++]! })
    }
  }
  const same = (lines: readonly string[]) => lines.map((text): Line => ({ kind: ' ', text }))
  return [...same(a.slice(0, head)), ...middle, ...same(a.slice(a.length - tail))]
}

function split(text: string): string[] {
  const lines = text.split('\n')
  if (lines.at(-1) === '') lines.pop()
  return lines
}

export function unifiedDiff(path: string, before: string | null, after: string): string {
  const lines = lineDiff(before === null ? [] : split(before), split(after))
  const out = [`--- ${before === null ? '/dev/null' : `a/${path}`}`, `+++ b/${path}`]
  const changed = lines.flatMap((line, index) => (line.kind === ' ' ? [] : [index]))
  let at = 0
  while (at < changed.length) {
    const start = Math.max(0, changed[at]! - CONTEXT)
    let stop = changed[at]! + CONTEXT + 1
    while (at + 1 < changed.length && changed[at + 1]! - CONTEXT <= stop)
      stop = changed[++at]! + CONTEXT + 1
    at++
    stop = Math.min(stop, lines.length)
    let oldStart = 1
    let newStart = 1
    for (const line of lines.slice(0, start)) {
      if (line.kind !== '+') oldStart++
      if (line.kind !== '-') newStart++
    }
    const hunk = lines.slice(start, stop)
    const oldCount = hunk.filter((line) => line.kind !== '+').length
    const newCount = hunk.filter((line) => line.kind !== '-').length
    out.push(
      `@@ -${oldCount === 0 ? oldStart - 1 : oldStart},${oldCount} +${newCount === 0 ? newStart - 1 : newStart},${newCount} @@`,
    )
    for (const line of hunk) out.push(`${line.kind}${line.text}`)
  }
  return `${out.join('\n')}\n`
}
