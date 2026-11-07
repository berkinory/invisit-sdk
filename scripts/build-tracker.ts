import { brotliCompressSync, constants as zlib, gzipSync } from 'node:zlib'
import { join } from 'node:path'
import { minifySync } from 'oxc-minify'
import { SCRIPT_MANGLE_PROPS, TARGET } from './tracker-mangle.ts'

const SRC_DIR = join(import.meta.dir, '..', 'apps', 'tracker', 'src')
const OUT_DIR = join(import.meta.dir, '..', 'apps', 'tracker', 'bundle')

type Sizes = { raw: number; gzip: number; brotli: number }

const BUNDLES: { entry: string; file: string; budgets: Sizes }[] = [
  // Raised 2026-11-03 from 20,992 / 8,768 / 7,936 for page views that wait for the router's
  // title, the automation check, the page view sent on consent and own-subdomain links: measured
  // 20,900 / 8,836 / 7,974. Raised 2026-11-04 for pageUrl and handing it to the click chunk:
  // measured 21,028 / 8,901 / 8,050. Raised 2026-11-04 for holding events until the site's
  // settings arrive, so a host they turn away sends nothing: measured 21,181 / 8,960 / 8,090.
  // Raised 2026-11-05 for visitId() (revenue attribution) and dropping a short link's click
  // from the address bar: measured 21,565 / 9,127 / 8,239.
  // Raised 2026-11-06 for debug sessions and naming a refusal in debug output: measured 22,309 / 9,423 / 8,533.
  // Raised 2026-11-07 for the error listeners, which must run before anything else can fail:
  // measured 22,905 / 9,668 / 8,734.
  // Raised 2026-11-07 for idle tabs, which stop counting as online and must not stretch a visit:
  // measured 23,453 / 9,840 / 8,904.
  { entry: 'browser.ts', file: 'invisit.js', budgets: { raw: 23_488, gzip: 9_856, brotli: 8_960 } },
  {
    entry: 'rules-browser.ts',
    file: 'invisit-rules.js',
    budgets: { raw: 3_776, gzip: 1_856, brotli: 1_680 },
  },
  {
    entry: 'extras-browser.ts',
    file: 'invisit-extras.js',
    budgets: { raw: 2_080, gzip: 1_152, brotli: 1_056 },
  },
  {
    entry: 'notices-browser.ts',
    file: 'invisit-notices.js',
    budgets: { raw: 1_280, gzip: 832, brotli: 640 },
  },
  {
    entry: 'interactions-browser.ts',
    file: 'invisit-interactions.js',
    // Raised 2026-11-04 from 2,752 / 1,536 / 1,344 to skip clicks on addresses pageUrl rewrote:
    // measured 2,824 / 1,529 / 1,346.
    budgets: { raw: 2_880, gzip: 1_536, brotli: 1_408 },
  },
  {
    entry: 'feedback-browser.ts',
    file: 'invisit-feedback.js',
    budgets: { raw: 8_448, gzip: 3_712, brotli: 3_200 },
  },
  {
    entry: 'overlay-browser.ts',
    file: 'invisit-overlay.js',
    budgets: { raw: 22_528, gzip: 9_216, brotli: 8_192 },
  },
  {
    entry: 'debug-browser.ts',
    file: 'invisit-debug.js',
    budgets: { raw: 7_424, gzip: 3_456, brotli: 3_008 },
  },
  {
    entry: 'errors-browser.ts',
    file: 'invisit-errors.js',
    budgets: { raw: 4_256, gzip: 2_240, brotli: 2_048 },
  },
]

export const TRACKER_BANNER =
  '/*! Invisit tracker. MIT licensed: github.com/berkinory/invisit-sdk/blob/main/apps/tracker/LICENSE */'

async function bundle(entry: string): Promise<Uint8Array> {
  const result = await Bun.build({
    entrypoints: [join(SRC_DIR, entry)],
    target: 'browser',
    format: 'iife',
    minify: true,
  })
  const [output] = result.outputs
  if (!result.success || !output) throw new AggregateError(result.logs, `${entry} did not build`)
  const minified = minifySync(entry, await output.text(), {
    compress: { target: TARGET },
    mangle: { toplevel: true },
    mangleProps: SCRIPT_MANGLE_PROPS,
    codegen: { removeWhitespace: true },
  })
  if (minified.errors.length > 0) {
    throw new AggregateError(minified.errors, `${entry} did not minify`)
  }
  // Non-ASCII only survives in string and regex literals, where \u escapes are
  // equivalent; escaping keeps the bundles correct on pages not served as UTF-8.
  const ascii = minified.code.replace(
    /[^ -~\t\n\r]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`,
  )
  return new TextEncoder().encode(`${TRACKER_BANNER}\n"use strict";${ascii}`)
}

function measure(bytes: Uint8Array): Sizes {
  return {
    raw: bytes.byteLength,
    gzip: gzipSync(bytes, { level: 9 }).byteLength,
    brotli: brotliCompressSync(bytes, {
      params: {
        [zlib.BROTLI_PARAM_QUALITY]: zlib.BROTLI_MAX_QUALITY,
        [zlib.BROTLI_PARAM_MODE]: zlib.BROTLI_MODE_TEXT,
        [zlib.BROTLI_PARAM_SIZE_HINT]: bytes.byteLength,
      },
    }).byteLength,
  }
}

const format = (bytes: number) => `${(bytes / 1024).toFixed(2)} KiB (${bytes} B)`
const failures: string[] = []

for (const { entry, file, budgets } of BUNDLES) {
  const bytes = await bundle(entry)
  await Bun.write(join(OUT_DIR, file), bytes)
  const sizes = measure(bytes)
  for (const kind of ['raw', 'gzip', 'brotli'] as const) {
    const [used, budget] = [sizes[kind], budgets[kind]]
    const share = `${((used / budget) * 100).toFixed(0)}%`
    console.log(
      `[tracker] ${file.padEnd(13)} ${kind.padEnd(6)} ${format(used)}  of ${format(budget)}  ${share}`,
    )
    if (used > budget) failures.push(`${file} ${kind} is ${format(used)}, over ${format(budget)}`)
  }
}

if (failures.length > 0) {
  console.error(`\n[tracker] size budget exceeded:\n${failures.map((f) => `  - ${f}`).join('\n')}`)
  console.error(
    '\nMake it smaller, or raise the budget here with the measurement that justifies it.',
  )
  process.exit(1)
}
console.log('[tracker] within budget')
