import { chmod, rm } from 'node:fs/promises'
import { join } from 'node:path'

// One file with a shebang, for npx on Node 18 and later. Left unminified: people read what an
// installer does to their project before they run it.
const PACKAGE_DIR = join(import.meta.dir, '..', 'packages', 'cli')
const OUT_DIR = join(PACKAGE_DIR, 'dist')
const OUT = join(OUT_DIR, 'invisit.js')

const { version } = (await Bun.file(join(PACKAGE_DIR, 'package.json')).json()) as {
  version: string
}

await rm(OUT_DIR, { recursive: true, force: true })
const result = await Bun.build({
  entrypoints: [join(PACKAGE_DIR, 'src', 'main.ts')],
  outdir: OUT_DIR,
  target: 'node',
  format: 'esm',
  naming: 'invisit.js',
  banner: '#!/usr/bin/env node',
  define: { VERSION: JSON.stringify(version) },
})
if (!result.success) throw new AggregateError(result.logs, 'invisit CLI did not build')

const code = await Bun.file(OUT).text()
// Zero runtime dependencies: anything but a node: builtin would be missing under npx.
const foreign = [...code.matchAll(/\bfrom\s*["']([^"']+)["']/g)]
  .map((m) => m[1])
  .filter((s) => !s?.startsWith('node:'))
if (foreign.length > 0) throw new Error(`the CLI imports ${foreign.join(', ')}`)
await chmod(OUT, 0o755)
console.log(`[cli] invisit.js ${String(new TextEncoder().encode(code).byteLength).padStart(6)} B`)
