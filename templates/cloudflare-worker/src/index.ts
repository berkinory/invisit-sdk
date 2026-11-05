import { createInvisit, type Invisit } from '@invisitdev/server'

/* invisit in front of your site. Routed on your domain, it serves the tracker from it (/_i/*,
   past ad blockers) and records every crawler read, AI bots and search engines included, which
   no script tag can see. Every other request goes to your origin untouched, and if the Worker
   ever fails the request falls through as if it weren't there. */

interface Env {
  readonly INVISIT_API_KEY: string
}

let invisit: Invisit | undefined

export default {
  async fetch(request, env, ctx) {
    ctx.passThroughOnException()
    invisit ??= createInvisit({ key: env.INVISIT_API_KEY })
    const proxied = await invisit.proxy(request)
    if (proxied) return proxied
    const response = await fetch(request)
    ctx.waitUntil(invisit.crawlers(request, { status: response.status }))
    return response
  },
} satisfies ExportedHandler<Env>
