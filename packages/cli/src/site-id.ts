import { APP_URL, SITE_ID } from './constants.ts'
import { ask, interactive } from './prompt.ts'
import { bold, cyan, dim, red } from './ui.ts'

const WHERE_TO_GET_IT = `Get it at ${APP_URL}: open the site, then Settings, Installation. An MCP client connected to invisit can also list or create sites (list_sites, create_site).`

export type SiteIdResult = { readonly id: string } | { readonly error: string }

function check(raw: string): SiteIdResult {
  const id = raw.trim().toLowerCase()
  return SITE_ID.test(id)
    ? { id }
    : { error: `"${raw.trim()}" is not a site id. ${WHERE_TO_GET_IT}` }
}

/** The site id from --site, then INVISIT_SITE, then a prompt; never made up. */
export async function resolveSiteId(flag: string | undefined): Promise<SiteIdResult> {
  const given = flag ?? process.env['INVISIT_SITE']
  if (given) return check(given)
  if (!interactive) {
    return {
      error: `A site id is needed: pass --site <id> or set INVISIT_SITE. ${WHERE_TO_GET_IT}`,
    }
  }
  process.stdout.write(`${dim(WHERE_TO_GET_IT)}\n`)
  let last: SiteIdResult = { error: 'No site id was given.' }
  for (let attempt = 0; attempt < 3; attempt++) {
    const answer = await ask(`${cyan('?')} ${bold('Site id:')} `)
    if (answer === null) break
    if (!answer) continue
    last = check(answer)
    if ('id' in last) return last
    process.stdout.write(`${red(last.error)}\n`)
  }
  return last
}
