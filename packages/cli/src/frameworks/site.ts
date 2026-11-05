import { quoted, type Style } from '../source.ts'

/** Where the code reads the site id: a public environment variable, or the id written inline. */
export type SiteSource =
  | { readonly kind: 'env'; readonly key: string; readonly expression: string }
  | { readonly kind: 'inline'; readonly id: string }

export function siteEnv(key: string, expression: string): SiteSource {
  return { kind: 'env', key, expression }
}

export function siteInline(id: string): SiteSource {
  return { kind: 'inline', id }
}

/** The `site` value to put inside init({ site: … }). */
export function siteValue(site: SiteSource, style: Style): string {
  return site.kind === 'env' ? site.expression : quoted(style, site.id)
}

export function envKey(site: SiteSource): string | undefined {
  return site.kind === 'env' ? site.key : undefined
}
