import { readdir, rm } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { join } from 'node:path'
import { isolatedDeclarationSync } from 'oxc-transform'

// Left unminified: it runs on servers, where readable stack traces beat a few saved bytes.
const PACKAGE_DIR = join(import.meta.dir, '..', 'packages', 'server')
const SRC_DIR = join(PACKAGE_DIR, 'src')
const OUT_DIR = join(PACKAGE_DIR, 'dist')
const ENTRIES = ['index.ts', 'node.ts']

await rm(OUT_DIR, { recursive: true, force: true })

for (const file of await readdir(SRC_DIR)) {
  if (!file.endsWith('.ts')) continue
  const path = join(SRC_DIR, file)
  const declarations = isolatedDeclarationSync(path, await Bun.file(path).text())
  if (declarations.errors.length > 0) {
    throw new AggregateError(declarations.errors, `${file} declarations did not emit`)
  }
  const code = declarations.code.replace(/(from\s+['"]\.\/[\w-]+)\.ts(['"])/g, '$1.js$2')
  await Bun.write(join(OUT_DIR, file.replace(/\.ts$/, '.d.ts')), code)
}

const result = await Bun.build({
  entrypoints: ENTRIES.map((entry) => join(SRC_DIR, entry)),
  outdir: OUT_DIR,
  target: 'browser',
  format: 'esm',
  splitting: true,
  // A dependency, not inlined: sites dedupe it and get its crawler patterns as they update.
  external: ['isbot'],
  naming: { entry: '[name].js', chunk: 'chunk-[hash].js' },
})
if (!result.success) throw new AggregateError(result.logs, '@invisitdev/server did not build')

for (const output of result.outputs) {
  const code = await output.text()
  const name = output.path.slice(OUT_DIR.length + 1)
  // The main entry must load where there is no node: module at all (edge runtimes).
  if (/\bfrom\s*["']node:|import\(\s*["']node:|require\(\s*["']node:/.test(code)) {
    throw new Error(`${name} imports a node: module`)
  }
  const bytes = new TextEncoder().encode(code)
  console.log(
    `[server-sdk] ${name.padEnd(22)} ${String(bytes.byteLength).padStart(6)} B raw  ${String(gzipSync(bytes, { level: 9 }).byteLength).padStart(6)} B gzip`,
  )
}
console.log('[server-sdk] declarations written')
