import { rm } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { join } from 'node:path'
import { minifySync } from 'oxc-minify'
import { isolatedDeclarationSync } from 'oxc-transform'
import { TARGET, packageMangleProps } from './tracker-mangle.ts'

// Each chunk stays a dynamic import, so the site's own bundler splits it out instead of the page
// fetching invisit-*.js from the collector.
const PACKAGE_DIR = join(import.meta.dir, '..', 'packages', 'web')
const ENTRY = join(PACKAGE_DIR, 'src', 'index.ts')
const OUT_DIR = join(PACKAGE_DIR, 'dist')

await rm(OUT_DIR, { recursive: true, force: true })

const declarations = isolatedDeclarationSync(ENTRY, await Bun.file(ENTRY).text())
if (declarations.errors.length > 0) {
  throw new AggregateError(declarations.errors, '@invisitdev/web declarations did not emit')
}
await Bun.write(join(OUT_DIR, 'index.d.ts'), declarations.code)
const mangleProps = packageMangleProps(declarations.code)

const result = await Bun.build({
  entrypoints: [ENTRY],
  target: 'browser',
  format: 'esm',
  splitting: true,
  // The site's bundler re-bundles these files, so preload links to their paths would only 404.
  modulePreload: false,
  minify: true,
  naming: { entry: '[name].js', chunk: 'chunk-[hash].js' },
})
if (!result.success) throw new AggregateError(result.logs, '@invisitdev/web did not build')

for (const output of result.outputs) {
  const name = output.path.replace(/^\.\//, '')
  const minified = minifySync(name, await output.text(), {
    module: true,
    compress: { target: TARGET },
    mangleProps,
    codegen: { removeWhitespace: true },
  })
  if (minified.errors.length > 0)
    throw new AggregateError(minified.errors, `${name} did not minify`)
  await Bun.write(join(OUT_DIR, name), minified.code)
  const bytes = new TextEncoder().encode(minified.code)
  console.log(
    `[web-sdk] ${name.padEnd(22)} ${String(bytes.byteLength).padStart(6)} B raw  ${String(gzipSync(bytes, { level: 9 }).byteLength).padStart(6)} B gzip`,
  )
}
console.log('[web-sdk] index.d.ts written')
