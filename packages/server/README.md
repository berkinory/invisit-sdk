# @invisitdev/server

invisit on your own server, with no dependencies. It does three things:

- **First-party proxy.** Serves the tracker and its endpoints from your own domain (`/_i/invisit.js`, `/_i/v1/events`…), so blockers that match on third-party hosts leave it alone. Each request is forwarded with your site's API key, which lets the collector use the visitor's real address for identity, rate limits and location instead of your server's.
- **Crawler reads.** Records requests from search engines, AI crawlers and link previews, which never run JavaScript.
- **Server-side events.** `track()` from a route handler or webhook, counted for the visitor who caused it.

It is built on `Request`, `Response` and `fetch`, so it runs unchanged in Next.js, Remix and React Router, SvelteKit, Nuxt, Astro, SolidStart, Hono, Elysia, Bun, Deno, Cloudflare Workers and Vercel or Netlify Edge. Where no edge in front of your server puts the visitor's address in a header (a bare Bun, Deno or framework Node server), pass it with the `ip` option; the examples below show where each framework exposes it. `@invisitdev/server/node` adapts it to Node `http` servers (Express, Fastify, Koa, NestJS, `node:http`) and takes the address from the socket.

## Install

```sh
npm install @invisitdev/server
```

Node 20 or later, or any runtime with `fetch` and Web Crypto.

## Set it up

```ts
// lib/invisit.ts
import { createInvisit } from '@invisitdev/server'

export const invisit = createInvisit({ key: process.env.INVISIT_API_KEY! })
```

`key` is an **API key with the ingest scope** (`invisit_sk_…`, Site settings → API keys). It is a secret: keep it in a server-side environment variable (`INVISIT_API_KEY` below), never in client code or a `PUBLIC_`/`NEXT_PUBLIC_` variable. `createInvisit` throws if it gets anything else, such as the public site id, and says so when the key is missing or empty: most often the variable is not set where the code runs (a build step, a new deploy). Give it only the ingest scope: it needs nothing else, and a leaked ingest-only key can send events but never read them.

| Option     | Default                   | Meaning                                                                                                                                                                 |
| ---------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `key`      | required                  | An API key of the site with the ingest scope.                                                                                                                           |
| `baseUrl`  | `https://api.invisit.dev` | The collector. Leave it unless invisit support gives you another address.                                                                                               |
| `clientIp` | `clientIp`                | Reads the visitor's address from a request. See [Visitor address](#visitor-address).                                                                                    |
| `fetch`    | global `fetch`            | The fetch used to reach the collector.                                                                                                                                  |
| `onError`  | `console.error`           | Told about failures that are not thrown: proxy 502s, crawler hits not taken, and once per client `CLIENT_IP_UNRESOLVED` when a proxied visitor came without an address. |

## The browser side

Load the tracker through the proxy path, and point it at that path too:

```html
<script defer src="/_i/invisit.js" data-site="<site id>" data-collector="/_i"></script>
```

Or with [`@invisitdev/web`](https://www.npmjs.com/package/@invisitdev/web):

```ts
import { init } from '@invisitdev/web'

init({ site: '<site id>', baseUrl: '/_i' })
```

The site id is public. The API key never leaves your server.

## Middleware, per framework

`invisit.handle(request)` is the one-liner: it answers tracker requests under `/_i` and resolves to `null` for everything else, recording crawler reads in the background. Pass `waitUntil` where the platform has one, so a serverless function is not frozen before the hit is sent. Use another path with `{ prefix: '/stats' }` (then load `/stats/invisit.js` with `data-collector="/stats"`).

Where the framework lets the middleware run after the page, use `invisit.proxy(request)` and then `invisit.crawlers(request, { status })` instead, so crawler reads carry the status the page really got. `proxy`, `handle` and `track` all take `ip`: the visitor's address for this request, overriding `clientIp`.

### Next.js

```ts
// proxy.ts (Next.js 16; middleware.ts with `export async function middleware` before that)
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server'
import { invisit } from './lib/invisit'

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const response = await invisit.handle(request, { waitUntil: (p) => event.waitUntil(p) })
  return response ?? NextResponse.next()
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }
```

If you already have a proxy (middleware) file, call `invisit.handle` at its top and return its response when there is one. The proxy runs before the page renders, so crawler reads are recorded as 200 whatever the page answered.

### Hono

```ts
import { Hono } from 'hono'
import { getConnInfo } from 'hono/bun' // Node: '@hono/node-server/conninfo', Deno: 'hono/deno'
import { invisit } from './lib/invisit'

const app = new Hono()

app.use(async (c, next) => {
  const proxied = await invisit.proxy(c.req.raw, { ip: getConnInfo(c).remote.address })
  if (proxied) return proxied
  await next()
  void invisit.crawlers(c.req.raw, { status: c.res.status })
})
```

On Deno, import `getConnInfo` from `hono/deno`, import the client with its extension (`./lib/invisit.ts`) and read the key with `Deno.env.get('INVISIT_API_KEY')!`.

On Cloudflare Workers, the client reads the key from the Worker's bindings:

```ts
// src/lib/invisit.ts
import { env } from 'cloudflare:workers'
import { createInvisit } from '@invisitdev/server'

export const invisit = createInvisit({ key: env.INVISIT_API_KEY })
```

Then drop `getConnInfo` and `ip` (`CF-Connecting-IP` carries the visitor) and send the crawler read with `c.executionCtx.waitUntil(invisit.crawlers(c.req.raw, { status: c.res.status }))`; `c.executionCtx` only exists there.

### Elysia

```ts
import { Elysia } from 'elysia'
import { invisit } from './lib/invisit'

new Elysia()
  .onRequest(
    async ({ request, server }) =>
      (await invisit.handle(request, { ip: server?.requestIP(request)?.address })) ?? undefined,
  )
  .post('/checkout', async ({ request, server }) => {
    // … the purchase
    await invisit
      .track('purchase', {
        request,
        ip: server?.requestIP(request)?.address,
        properties: { plan: 'pro' },
      })
      .catch(console.error)
    return { ok: true }
  })
  .listen(3000)
```

`onRequest` runs before the route, so crawler reads are recorded as 200.

### SvelteKit

Written for SvelteKit 3. The key is declared in `src/env.ts` and imported from `$app/env/private`:

```ts
// src/env.ts
import { defineEnvVars } from '@sveltejs/kit/env'

export const variables = defineEnvVars({
  INVISIT_API_KEY: { description: 'An invisit API key with the ingest scope (invisit_sk_…)' },
})
```

```ts
// src/lib/server/invisit.ts
import { INVISIT_API_KEY } from '$app/env/private'
import { createInvisit } from '@invisitdev/server'

export const invisit = createInvisit({ key: INVISIT_API_KEY })
```

```ts
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit/hooks'
import { invisit } from '#lib/server/invisit.ts'

export const handle: Handle = async ({ event, resolve }) => {
  const proxied = await invisit.proxy(event.request, { ip: event.getClientAddress() })
  if (proxied) return proxied
  const response = await resolve(event)
  if (!event.isDataRequest) void invisit.crawlers(event.request, { status: response.status })
  return response
}
```

The variable must be set when you build too: the build validates it. On SvelteKit 2, import the key from `$env/static/private` (no `src/env.ts`), `Handle` from `@sveltejs/kit` and the client from `$lib/server/invisit`. adapter-node takes the origin as `https://<Host>`: over plain HTTP, or behind a proxy that changes `Host`, set `kit.paths.origin` (SvelteKit 3; on SvelteKit 2 the `ORIGIN` environment variable), or `PROTOCOL_HEADER` and `HOST_HEADER`, or SvelteKit's CSRF check answers the tracker's POSTs with a 403.

### Nuxt (Nitro)

```ts
// nuxt.config.ts: filled from NUXT_INVISIT_API_KEY when the server starts
export default defineNuxtConfig({ runtimeConfig: { invisitApiKey: '' } })
```

```ts
// server/utils/invisit.ts
import { createInvisit } from '@invisitdev/server'

export const invisit = createInvisit({ key: useRuntimeConfig().invisitApiKey })
```

```ts
// server/middleware/invisit.ts
import { invisit } from '../utils/invisit'

export default defineEventHandler(async (event) => {
  if (event.path.startsWith('/_i/')) {
    const ip = getRequestIP(event, { xForwardedFor: true })
    return (await invisit.proxy(toWebRequest(event), { ip })) ?? undefined
  }
  // Nuxt's own asset and island requests are not page reads.
  if (event.method === 'GET' && !/^\/_{1,2}nuxt/.test(event.path)) {
    event.waitUntil(invisit.crawlers(toWebRequest(event)))
  }
})
```

The path check keeps `toWebRequest` away from your own routes' request bodies. The middleware runs before the page renders, so crawler reads are recorded as 200. `getRequestIP(event, { xForwardedFor: true })` trusts `X-Forwarded-For`, which is only right behind a proxy that overwrites it; if visitors can reach the server directly, drop the option.

### Astro

Needs on-demand rendering: an adapter, and `output: 'server'` (or `prerender = false` on the pages it covers).

```js
// astro.config.mjs
import { defineConfig } from 'astro/config'
import node from '@astrojs/node'

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  security: { allowedDomains: [{ hostname: 'example.com', protocol: 'https' }] },
})
```

Without `security.allowedDomains` naming your public host, Astro's Node server builds every request URL on `localhost`, and POSTs whose `Origin` is your real domain (from browsers without `Sec-Fetch-Site`) get a CSRF 403.

```ts
// src/lib/invisit.ts
import { getSecret } from 'astro:env/server'
import { createInvisit } from '@invisitdev/server'

export const invisit = createInvisit({ key: getSecret('INVISIT_API_KEY')! })
```

```ts
// src/middleware.ts
import { defineMiddleware } from 'astro:middleware'
import { invisit } from './lib/invisit'

export const onRequest = defineMiddleware(async (context, next) => {
  if (context.isPrerendered) return next()
  const proxied = await invisit.proxy(context.request, { ip: context.clientAddress })
  if (proxied) return proxied
  const response = await next()
  void invisit.crawlers(context.request, { status: response.status })
  return response
})
```

### Remix and React Router

A splat resource route, registered in `app/routes.ts`:

```ts
// app/routes.ts
import { type RouteConfig, index, route } from '@react-router/dev/routes'

export default [
  index('routes/home.tsx'),
  // … your other routes
  route('_i/*', 'routes/[_i].$.ts'),
] satisfies RouteConfig
```

```ts
// app/routes/[_i].$.ts
import { invisit } from '~/lib/invisit.server'

const proxy = async ({ request }: { request: Request }) =>
  (await invisit.proxy(request)) ?? new Response(null, { status: 404 })

export const loader = proxy
export const action = proxy
```

With `flatRoutes()` (file-system routes) the file name alone registers it; the brackets keep the leading underscore literal. `react-router-serve` passes on no socket address: put a proxy in front that sets `X-Forwarded-For` or `X-Real-IP`, or serve the app from your own Express server with `middleware(invisit)` from `@invisitdev/server/node`.

Crawler reads, with the status the page got: run `npx react-router reveal entry.server` (`npx remix reveal entry.server` on Remix v2), then in `app/entry.server.tsx`:

```ts
export default function handleRequest(request: Request, responseStatusCode: number /* , … */) {
  void invisit.crawlers(request, { status: responseStatusCode })
  // … the existing rendering code
}
```

### SolidStart

```ts
// src/middleware.ts, registered with solidStart({ middleware: 'src/middleware.ts' }) in
// vite.config.ts (app.config.ts on SolidStart 1)
import { createMiddleware } from '@solidjs/start/middleware'
import { invisit } from './lib/invisit'

export default createMiddleware([
  async (event, next) => {
    const proxied = await invisit.proxy(event.req, { ip: event.req.ip })
    if (proxied) return proxied
    const response = await next()
    // SolidStart's own /_build and /_server requests are not page reads.
    if (!event.url.pathname.startsWith('/_')) {
      void invisit.crawlers(event.req, { status: event.res.status ?? 200 })
    }
    return response
  },
])
```

Page renders resolve `next()` without a `Response`, so the status comes from `event.res.status`. In API routes the visitor's address is `clientAddress` on the `APIEvent`.

### Cloudflare Workers

```ts
import { createInvisit } from '@invisitdev/server'

export default {
  async fetch(request, env, ctx) {
    const invisit = createInvisit({ key: env.INVISIT_API_KEY })
    const proxied = await invisit.proxy(request)
    if (proxied) return proxied
    const response = await fetch(request) // your origin, or your app's own handler
    ctx.waitUntil(invisit.crawlers(request, { status: response.status }))
    return response
  },
} satisfies ExportedHandler<{ INVISIT_API_KEY: string }>
```

Set the key with `wrangler secret put INVISIT_API_KEY`.

### Express (and Connect, NestJS)

```ts
import express from 'express'
import { middleware } from '@invisitdev/server/node'
import { invisit } from './lib/invisit.js'

const app = express()
app.use(middleware(invisit)) // before body parsers: it reads tracker request bodies itself
app.use(express.json())
```

Tracker requests are answered from the collector; every other request goes on to your app, and crawler reads are recorded once its response is finished, with the real status. If a body parser ran first there is nothing left to forward: the middleware refuses the request with a 500 (`next(error)` with code `BODY_CONSUMED`) rather than let the tracker's data vanish. In NestJS, `app.use(middleware(invisit))` in `main.ts`, before any `app.useBodyParser()`, not in a module's `configure()`. `next` is awaited, so a `next` that returns a promise works too. (The `.js` on the import is what TypeScript's `NodeNext` resolution wants for ESM.)

### Fastify

```ts
import Fastify from 'fastify'
import { middleware } from '@invisitdev/server/node'
import { invisit } from './lib/invisit.js'

const fastify = Fastify({ logger: true })
const invisitMiddleware = middleware(invisit)

fastify.addHook('onRequest', async (request, reply) => {
  await invisitMiddleware(request.raw, reply.raw)
  if (reply.raw.headersSent) reply.hijack()
})
```

Without `next`, the middleware answers tracker requests itself and lets everything else through; `headersSent` tells the hook which happened.

### Koa

Koa's `next` is not a Connect `next`, so the middleware runs without one, wrapped:

```ts
import Koa from 'koa'
import { bodyParser } from '@koa/bodyparser'
import { middleware } from '@invisitdev/server/node'
import { invisit } from './lib/invisit.js'

const app = new Koa()
const invisitMiddleware = middleware(invisit)

app.use(async (ctx, next) => {
  await invisitMiddleware(ctx.req, ctx.res)
  if (ctx.res.headersSent) {
    ctx.respond = false // it answered a tracker request; Koa must not write over it
    return
  }
  await next()
})
app.use(bodyParser())
```

### Plain Node and anything else

`toRequest(req)` turns an `IncomingMessage` into a `Request` and `sendResponse(res, response)` writes a `Response` back. `toRequest` reads the body of POST requests, so only call it for requests you hand to invisit:

```ts
import { createServer } from 'node:http'
import { sendResponse, toRequest } from '@invisitdev/server/node'

createServer(async (req, res) => {
  if (req.url?.startsWith('/_i/')) {
    const response = await invisit.proxy(await toRequest(req))
    if (response) return sendResponse(res, response)
  }
  // … your app
})
```

## Server-side events

```ts
// app/api/checkout/route.ts (Next.js); any handler with the visitor's Request works
import { invisit } from '@/lib/invisit'

export async function POST(request: Request) {
  // … the purchase
  await invisit
    .track('purchase', {
      request,
      url: 'https://shop.example.com/checkout',
      properties: { plan: 'pro', amount: 49 },
      userId: user.id,
    })
    .catch(console.error) // a lost event must not fail the purchase
  return Response.json({ ok: true })
}
```

The visitor's address, user agent, `Accept-Language` and `Sec-GPC` come from `request`, so the event joins the visit their browser started. The request must be the visitor's own (from their browser, through your server), not a webhook from a payment provider. Where the address is not in a header, pass it as `ip`, as for the proxy: `context.clientAddress` (Astro), `event.getClientAddress()` (SvelteKit), `getRequestIP(event, { xForwardedFor: true })` (Nuxt), `getConnInfo(c).remote.address` (Hono), `server?.requestIP(request)?.address` (Elysia), `clientAddress` (SolidStart). In Express, Fastify and Koa, `toRequest(req)` reads it from the socket. With Fastify, `Fastify({ logger: true })` and `.catch((error) => request.log.error(error))` keep failures visible.

`track` resolves to `{ accepted, duplicate }`. Each event gets a UUID v7 `event_id`; pass your own `eventId` to make retries safe (the same id again counts as a duplicate). Names, properties and URLs follow the tracker's rules. A bot user agent or `Sec-GPC: 1` is answered with nothing accepted, as in the browser. It rejects with an `InvisitError` whose `code` is the collector's (`VALIDATION_FAILED`, `RATE_LIMITED`, `UNAUTHENTICATED`…), `NETWORK_ERROR`, `CLIENT_IP_UNRESOLVED` when no address could be read, or `USER_AGENT_MISSING` when the request has no `User-Agent`. Catch it where you call `track`, so an analytics failure never fails your route.

## Visitor address

`clientIp(request)` reads `CF-Connecting-IP`, `X-Real-IP`, `Fly-Client-IP`, `True-Client-IP`, `X-Vercel-Forwarded-For`, then the first entry of `X-Forwarded-For`. The first header present wins; a malformed value gives `null`, and the proxied request then counts as coming from your server: `onError` is told once (`CLIENT_IP_UNRESOLVED`) so the setup gap does not go unnoticed. An `ip` passed to `proxy`, `handle` or `track` wins over the reader; IPv4-mapped IPv6 (`::ffff:203.0.113.7`) is reduced to the IPv4 address.

Those headers are only trustworthy when the platform in front of you sets or overwrites them, as Cloudflare, Vercel, Netlify and Fly do. If your server is reachable directly, or sits behind a proxy that appends to `X-Forwarded-For` instead, a visitor can write any address there. Pass your own reader then:

```ts
createInvisit({
  key: process.env.INVISIT_API_KEY!,
  clientIp: (request) => request.headers.get('x-my-edge-client-ip'),
})
```

`toRequest` and `middleware` from `@invisitdev/server/node` default to the socket's peer address and drop the address headers. Pass `{ trustProxy: true }` when a proxy you run sets them (also for `X-Forwarded-Proto` and `X-Forwarded-Host`, which are otherwise dropped too).

## Crawler reads

`crawlers` (and `handle`, and the Node `middleware`) record GET and HEAD requests whose user agent looks like a crawler, leaving out a page's static files (`.css`, `.js`, images, fonts, source maps); `robots.txt` and sitemaps are kept. The hostname is the one in `request.url`; only when that is a bind address (`localhost`, `127.x`, `::1`, `0.0.0.0`, `::`) is the `Host` header used. `X-Forwarded-Host` is never read there, since a visitor can write it: an adapter that trusts your proxy has already put it into `request.url`.

## Security

- The API key is secret. It authenticates your server to the collector; anyone holding an ingest-scoped key can send events for your site. Never ship it to the browser.
- The proxy forwards only the headers the collector reads (user agent, language, origin, referer, Sec-GPC, client hints…). Cookies, `Authorization` and `Host` stay on your side; `Set-Cookie` from upstream is dropped; the key is never in a response.
- Only tracker paths under the prefix are forwarded, with GET, HEAD and POST; everything else is left to your app.

## License

MIT
